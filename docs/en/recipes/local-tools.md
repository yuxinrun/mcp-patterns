---
title: Local tools
description: Wrap git, docker, kubectl and friends as MCP tools — argv arrays, allowlists, timeouts, output truncation and confirmations.
---

# Local tools

A lot of capability already ships as a CLI: `git`, `docker`, `kubectl`, `terraform`, `ffmpeg`. Rather than reimplement them, wrap them safely behind MCP.

The hard part is not "how to run a command". It's **how to stop the model from running any command**.

## Unsafe vs. safe

```python
# Danger: shell=True + string interpolation
os.system(f"git log {user_input}")

# Danger: still injectable
subprocess.run(f"git log {user_input}", shell=True)

# Safe: argument array, no shell
subprocess.run(["git", "log", "--oneline", "-n", "20"], shell=False)
```

Even with an argument array, model-supplied flags need an allowlist. `git log --output=/etc/passwd` and `git -c core.pager=...` are both ways to cause trouble.

## Layer one: subcommand allowlist

Don't expose "run any git command". Split it into explicit actions:

```python
from dataclasses import dataclass

@dataclass(frozen=True)
class GitCommand:
    args: tuple[str, ...]
    mutates: bool = False

GIT_COMMANDS = {
    "status": GitCommand(("status", "--short", "--branch")),
    "log": GitCommand(("log", "--oneline", "-n", "{limit}")),
    "diff": GitCommand(("diff", "--stat", "{ref}")),
    "show": GitCommand(("show", "--stat", "--oneline", "{ref}")),
}
```

The tool layer accepts only enumerated parameters:

```python
@mcp.tool()
def git_log(limit: int = 20) -> dict[str, object]:
    """Show recent commits in the workspace repository."""
    limit = max(1, min(limit, 100))
    result = run(["git", "log", "--oneline", "-n", str(limit)])
    return {"output": result.stdout, "truncated": result.truncated}
```

When you genuinely need a free-form argument (such as `git diff <ref>`), validate the format strictly:

```python
import re

REF_PATTERN = re.compile(r"^[A-Za-z0-9._/-]{1,200}$")

def validate_ref(ref: str) -> str:
    if not REF_PATTERN.fullmatch(ref):
        raise ValueError("invalid git ref")
    if ref.startswith("-"):
        raise ValueError("ref must not start with '-'")
    return ref
```

The `--` separator also stops a value from being parsed as an option:

```python
run(["git", "diff", "--", validate_path(path)])
```

## Execution wrapper

```python
import os
import subprocess
from dataclasses import dataclass

MAX_OUTPUT = 64 * 1024
DEFAULT_TIMEOUT = 20

@dataclass
class CommandResult:
    code: int
    stdout: str
    stderr: str
    truncated: bool

def run(args: list[str], cwd: str | None = None, timeout: int = DEFAULT_TIMEOUT) -> CommandResult:
    env = {
        "PATH": os.environ.get("PATH", ""),
        "HOME": os.environ.get("HOME", ""),
        "LANG": "C.UTF-8",
        "LC_ALL": "C.UTF-8",
    }
    completed = subprocess.run(
        args,
        cwd=cwd or WORKSPACE,
        env=env,
        capture_output=True,
        text=True,
        timeout=timeout,
        shell=False,
        check=False,
    )
    stdout = completed.stdout[:MAX_OUTPUT]
    stderr = completed.stderr[:MAX_OUTPUT]
    return CommandResult(
        code=completed.returncode,
        stdout=stdout,
        stderr=stderr,
        truncated=len(completed.stdout) > MAX_OUTPUT or len(completed.stderr) > MAX_OUTPUT,
    )
```

- **`shell=False`** with an argument array.
- **A clean environment**; don't leak host secrets into child processes.
- **A fixed `cwd`**; the model doesn't choose the directory.
- **A timeout** so a command can't hang forever.
- **Truncated output** so logs don't flood the context.

On timeout, make sure the process tree is cleaned up:

```python
import signal

def run(args, **kwargs):
    process = subprocess.Popen(args, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
    try:
        stdout, stderr = process.communicate(timeout=DEFAULT_TIMEOUT)
    except subprocess.TimeoutExpired:
        process.kill()
        stdout, stderr = process.communicate()
        raise TimeoutError("command timed out")
```

For commands that spawn children (`docker build`, `npm install`), use a process group and kill the whole group on timeout.

## Docker / kubectl

These carry enormous privileges and need extra restraint:

| Tool | Never | Prefer |
| --- | --- | --- |
| docker | `--privileged`, host root mounts, `--network=host` | `ps` / `logs`, `run` with pinned images |
| kubectl | `delete namespace`, `exec` into prod pods | Read-only `get` / `describe` / `logs`, namespace-scoped |
| terraform | `apply` / `destroy` | `plan` only; apply goes through human approval |

```python
ALLOWED_KUBECTL = {"get", "describe", "logs"}
ALLOWED_NAMESPACES = {"staging", "dev"}

def kubectl(verb: str, resource: str, name: str, namespace: str = "dev") -> CommandResult:
    if verb not in ALLOWED_KUBECTL:
        raise ValueError("kubectl verb not allowed")
    if namespace not in ALLOWED_NAMESPACES:
        raise ValueError("namespace not allowed")
    if not NAME_PATTERN.fullmatch(name):
        raise ValueError("invalid resource name")
    return run(["kubectl", "-n", namespace, verb, resource, name])
```

Don't hand the MCP server a `cluster-admin` kubeconfig. Use a least-privilege ServiceAccount and turn on audit logging.

## Destructive operations

Deleting, wiping, and restarting need:

1. **A dedicated tool name**: `delete_branch`, not buried inside a generic `git` tool.
2. **A confirmation parameter**: the resource name twice, or `confirm: true`.
3. **Dry-run first**: show what would happen.
4. **A separate scope**: for example `repo:delete`.
5. **Audit**: actor, target, outcome.

```python
@mcp.tool()
def delete_branch(name: str, confirm: bool = False) -> dict[str, object]:
    """Delete a local git branch.

    This is destructive. Call with confirm=false first to preview, then
    confirm=true to execute.
    """
    validate_branch_name(name)
    if not confirm:
        return {
            "dry_run": True,
            "branch": name,
            "message": "Re-run with confirm=true to delete this branch.",
        }
    result = run(["git", "branch", "-d", "--", name])
    return {"dry_run": False, "code": result.code, "output": result.stdout}
```

::: warning Confirmation is not a guarantee
The model can call the tool twice in a row. High-risk operations should go through **human approval** (host tool approval, a ticket, two-person review), not just a boolean.
:::

## TypeScript version

```ts
import { spawn } from 'node:child_process'

const MAX_OUTPUT = 64 * 1024

export function run(args: string[], cwd: string, timeoutMs = 20_000): Promise<{ code: number; stdout: string }> {
  return new Promise((resolve, reject) => {
    const child = spawn(args[0], args.slice(1), {
      cwd,
      shell: false,
      env: { PATH: process.env.PATH ?? '', LANG: 'C.UTF-8' }
    })

    let stdout = ''
    let stderr = ''
    const timer = setTimeout(() => {
      child.kill('SIGKILL')
      reject(new Error('command timed out'))
    }, timeoutMs)

    child.stdout.on('data', chunk => {
      if (stdout.length < MAX_OUTPUT) stdout += chunk.toString()
    })
    child.stderr.on('data', chunk => {
      if (stderr.length < MAX_OUTPUT) stderr += chunk.toString()
    })
    child.on('error', reject)
    child.on('close', code => {
      clearTimeout(timer)
      resolve({ code: code ?? -1, stdout })
    })
  })
}
```

## Output handling

CLI output usually isn't fit to feed a model directly:

| Problem | Handling |
| --- | --- |
| ANSI colors | Strip escape sequences |
| Progress bars / overwritten lines | Keep only the final state |
| Hundreds of MB of logs | Truncate + return `truncated` |
| Absolute paths | Replace with relative paths |
| Timezone in timestamps | Normalize to UTC |

```python
ANSI = re.compile(r"\x1b\[[0-9;]*[A-Za-z]")

def clean_output(text: str) -> str:
    return ANSI.sub("", text).replace("\r", "")
```

## Sandboxing

If the tool runs untrusted code (build scripts, tests), at minimum:

- A separate container or VM.
- Source mounted read-only; temp dirs writable.
- No access to the host Docker socket.
- Network off by default, allowlisted on demand.
- CPU, memory, and disk quotas.
- Run as a non-root user.

::: danger Don't run model-generated commands on the production host
The default premise of a local tool is "fixed command set, controlled parameters". The moment the model can construct commands freely, treat it as untrusted code and isolate it accordingly.
:::

## Test matrix

| Case | Expected |
| --- | --- |
| Injected `; rm -rf /` | Treated as a plain argument, not executed |
| `--help` style option injection | Rejected or escaped |
| Timeout | Killed, returns `timeout` |
| Oversized output | Truncated and flagged |
| Non-allowlisted subcommand | Rejected |
| Destructive op without confirmation | Dry-run only |
| Non-zero exit code | stderr summary, no stack trace |

## Checklist

- [ ] Always argv arrays, `shell=False`.
- [ ] Subcommand and argument-format allowlists.
- [ ] Fixed workdir and clean environment.
- [ ] Per-command timeout; kill the process group.
- [ ] Output truncated, ANSI stripped, absolute paths removed.
- [ ] Destructive operations: dedicated tool + confirmation + audit.
- [ ] High-risk commands run in a sandbox.
- [ ] Exit codes and stderr mapped to structured errors.

## Next

- [Filesystem](/en/recipes/filesystem)
- [Validation & errors](/en/engineering/validation-errors)
- [Troubleshooting](/en/debugging/troubleshooting)
