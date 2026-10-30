---
title: 本地工具封装
description: 把 git、docker、kubectl 等 CLI 包成 MCP 工具：参数数组、白名单、超时、输出截断与确认。
---

# 本地工具封装

很多能力已经有成熟的 CLI：`git`、`docker`、`kubectl`、`terraform`、`ffmpeg`。与其重新实现，不如用 MCP 把 CLI 安全地包一层。

难点不在「怎么执行命令」，而在**如何不让模型执行任意命令**。

## 危险与安全写法

```python
# 危险：shell=True + 字符串拼接
os.system(f"git log {user_input}")

# 危险：仍然可以注入
subprocess.run(f"git log {user_input}", shell=True)

# 安全：参数数组，不经过 shell
subprocess.run(["git", "log", "--oneline", "-n", "20"], shell=False)
```

但只要参数来自模型，就还需要白名单。例如 `git log --output=/etc/passwd`、`git -c core.pager=...` 都能做坏事。

## 一层：子命令白名单

不要暴露「执行任意 git 命令」，而是拆成明确动作：

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

工具层只接受枚举参数：

```python
from typing import Literal

@mcp.tool()
def git_log(limit: int = 20) -> dict[str, object]:
    """Show recent commits in the workspace repository."""
    limit = max(1, min(limit, 100))
    result = run(["git", "log", "--oneline", "-n", str(limit)])
    return {"output": result.stdout, "truncated": result.truncated}
```

对于需要「自由参数」的场景（例如 `git diff <ref>`），用严格格式校验：

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

`--` 分隔符也能防止参数被当成选项：

```python
run(["git", "diff", "--", validate_path(path)])
```

## 执行封装

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

要点：

- **`shell=False`**，参数数组。
- **干净的环境变量**，不把宿主的密钥传给子进程。
- **固定 `cwd`**，不让模型决定工作目录。
- **超时**，防止命令挂死。
- **截断输出**，避免日志刷爆上下文。

超时后要确保子进程树被清理：

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

对会派生子进程的命令（`docker build`、`npm install`），使用进程组并在超时时杀整组。

## Docker / kubectl

这两类工具权限极大，必须额外限制：

| 工具 | 禁止 | 建议 |
| --- | --- | --- |
| docker | `--privileged`、挂载宿主根目录、`--network=host` | 只允许 `ps` / `logs` / 指定镜像的 `run` |
| kubectl | `delete namespace`、`exec` 到生产 Pod | 只读 `get` / `describe` / `logs`，限定 namespace |
| terraform | `apply` / `destroy` | 只允许 `plan`，apply 走人工审批 |

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

不要把 kubeconfig 的 `cluster-admin` 直接给 MCP Server。用最小权限的 ServiceAccount，并开启审计。

## 破坏性操作

删除、清空、重启这类操作需要：

1. **独立工具名**：`delete_branch`，不要藏在 `git` 通用工具里。
2. **确认参数**：要求传入资源名两次，或 `confirm: true`。
3. **dry-run 优先**：先展示将发生什么。
4. **权限检查**：独立 scope，例如 `repo:delete`。
5. **审计**：记录操作者、目标、结果。

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

::: warning 二次确认不是万能
模型可能连续调用两次。高危险操作应该走**人工审批**（Host 的 tool approval、工单系统、双人复核），而不是只依赖一个布尔参数。
:::

## TypeScript 版本

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

## 输出处理

CLI 输出通常不适合直接喂给模型：

| 问题 | 处理 |
| --- | --- |
| 带 ANSI 颜色 | 去掉转义序列 |
| 进度条 / 覆盖行 | 只保留最后状态 |
| 几百 MB 日志 | 截断 + 返回 `truncated` |
| 绝对路径 | 替换为相对路径 |
| 时间戳时区 | 统一 UTC |

```python
ANSI = re.compile(r"\x1b\[[0-9;]*[A-Za-z]")

def clean_output(text: str) -> str:
    return ANSI.sub("", text).replace("\r", "")
```

## 沙箱

如果工具会执行不可信代码（构建脚本、测试），至少做到：

- 独立容器 / 虚拟机。
- 只读挂载源码，临时目录可写。
- 禁止访问宿主 Docker socket。
- 网络默认关闭，按需放行。
- CPU / 内存 / 磁盘配额。
- 非 root 用户运行。

::: danger 不要在生产宿主机上跑模型生成的命令
本地工具封装的默认前提是「命令集合固定、参数受控」。一旦允许模型自由构造命令，就必须按不可信代码来隔离。
:::

## 测试

| 用例 | 期望 |
| --- | --- |
| 注入 `; rm -rf /` | 作为普通参数，不执行 |
| `--help` 等选项注入 | 被拒绝或转义 |
| 超时命令 | 被杀掉，返回 `timeout` |
| 超大输出 | 截断并标记 |
| 非白名单子命令 | 拒绝 |
| 破坏性操作未确认 | 只返回 dry-run |
| 退出码非 0 | 返回 stderr 摘要，不抛堆栈 |

## 检查清单

- [ ] 全部使用参数数组，`shell=False`。
- [ ] 子命令与参数格式白名单。
- [ ] 固定工作目录与干净环境变量。
- [ ] 每个命令有超时，超时杀进程组。
- [ ] 输出截断、去 ANSI、去绝对路径。
- [ ] 破坏性操作独立工具 + 确认 + 审计。
- [ ] 高危命令在沙箱中执行。
- [ ] 退出码与 stderr 转成结构化错误。

## 下一步

- [文件服务](/recipes/filesystem)
- [参数校验与错误处理](/engineering/validation-errors)
- [调试排坑](/debugging/troubleshooting)
