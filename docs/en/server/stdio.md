---
title: stdio server demo
description: "Build a working stdio MCP server — full code, a client, host configuration, and debugging."
---

# stdio server demo

stdio is the easiest transport: the host starts your server as a child process and exchanges **line-delimited JSON-RPC over stdin and stdout**. No ports, certificates, or reverse proxies.

The complete, tested code lives in `examples/python-stdio` and `examples/typescript`.

## How it works

```text
Host (Claude Code / Cursor)
   │  spawn: python server.py
   ├──────── stdin  ────────▶  Server
   │   {"jsonrpc":"2.0",...}\n
   │
   ◀──────── stdout ────────
       {"jsonrpc":"2.0",...}\n
```

Three rules:

1. **One message per line**, no bare newlines inside a message.
2. **stdout carries protocol messages only.** Logs and debug output go to stderr.
3. **Exit when stdin closes.** Do not keep background threads alive.

::: danger The most common failure
A single `print("debug")` corrupts the stream. The host usually reports “connection closed”, which is hard to trace. Use `logging.basicConfig(stream=sys.stderr)`.
:::

## Python server

```python
"""Minimal MCP server over stdio."""

from pathlib import Path

from mcp.server import MCPServer

NOTES_DIR = Path(__file__).parent / "notes"

mcp = MCPServer(
    "notes",
    version="0.1.0",
    instructions="Search before reading. Prefer small, focused calls.",
)

def _note_path(name: str) -> Path:
    clean = name.strip().removesuffix(".md")
    if not clean or any(char in clean for char in "/\\") or ".." in clean:
        raise ValueError("name must be a simple note name, e.g. 'welcome'")
    path = (NOTES_DIR / f"{clean}.md").resolve()
    if NOTES_DIR.resolve() not in path.parents:
        raise ValueError("path escapes the notes directory")
    if not path.is_file():
        raise ValueError(f"note not found: {clean}")
    return path

@mcp.tool()
def add(a: float, b: float) -> dict[str, float]:
    """Add two numbers. Use this for quick arithmetic checks."""
    return {"sum": a + b}

@mcp.tool()
def search_notes(query: str, limit: int = 5) -> dict[str, object]:
    """Search local markdown notes for a keyword.

    Returns at most `limit` matches with name and snippet, not full content.
    """
    limit = max(1, min(limit, 20))
    hits: list[dict[str, str]] = []

    for path in sorted(NOTES_DIR.glob("*.md")):
        text = path.read_text(encoding="utf-8")
        index = text.lower().find(query.lower())
        if index == -1:
            continue
        start = max(0, index - 60)
        hits.append({
            "name": path.stem,
            "snippet": " ".join(text[start : index + 140].split()),
        })
        if len(hits) >= limit:
            break

    return {"count": len(hits), "matches": hits}

@mcp.tool()
def read_note(name: str) -> str:
    """Read one note by name. Prefer search_notes first."""
    return _note_path(name).read_text(encoding="utf-8")

@mcp.resource("note://{name}")
def note_resource(name: str) -> str:
    """Expose a note as a readable MCP resource."""
    return _note_path(name).read_text(encoding="utf-8")

@mcp.prompt()
def summarize_note(name: str) -> str:
    """Build a reusable prompt that summarizes a note."""
    return "Summarize this note in three bullets:\n\n" + _note_path(name).read_text(encoding="utf-8")

if __name__ == "__main__":
    mcp.run()  # stdio is the default transport
```

Design notes:

- Return a dict (`{"sum": 5.0}`) so `structuredContent` stays stable as fields are added.
- `search_notes` returns snippets, not whole files, to protect the context budget.
- Clamp `limit` server-side; never trust the model.
- Tool and resource share one path validator so no call site can skip it.

## Python client

```python
import asyncio
import sys
from pathlib import Path

from mcp import Client, StdioServerParameters

SERVER = Path(__file__).parent / "server.py"

async def main() -> None:
    params = StdioServerParameters(
        command=sys.executable,
        args=[str(SERVER)],
        cwd=str(SERVER.parent),
    )
    async with Client(params) as client:
        tools = await client.list_tools()
        print("tools:", [tool.name for tool in tools.tools])

        result = await client.call_tool("add", {"a": 2, "b": 3})
        print("add:", result.structured_content)

asyncio.run(main())
```

Output:

```text
tools: ['add', 'search_notes', 'read_note']
add: {'sum': 5.0}
```

## TypeScript server

```ts
import { McpServer } from '@modelcontextprotocol/server'
import { serveStdio } from '@modelcontextprotocol/server/stdio'
import { z } from 'zod'

function createServer(): McpServer {
  const server = new McpServer({ name: 'notes', version: '0.1.0' })

  server.registerTool(
    'add',
    {
      title: 'Add numbers',
      description: 'Add two numbers.',
      inputSchema: z.object({ a: z.number(), b: z.number() }),
      outputSchema: z.object({ sum: z.number() })
    },
    async ({ a, b }) => {
      const output = { sum: a + b }
      return {
        content: [{ type: 'text', text: JSON.stringify(output) }],
        structuredContent: output
      }
    }
  )

  return server
}

serveStdio(() => createServer())
```

```bash
npm run client:stdio
```

```text
tools: add, search_notes, read_note
add: { sum: 5 }
```

::: tip SDK v2
TypeScript SDK v2 splits entry points: `@modelcontextprotocol/server`, `/stdio`, and `@modelcontextprotocol/client`. `serveStdio(factory)` replaces the manual `new StdioServerTransport()` wiring in older tutorials.
:::

## Connecting a host

Claude Code:

```bash
claude mcp add notes -- python /abs/path/examples/python-stdio/server.py
```

Cursor (`.cursor/mcp.json`):

```json
{
  "mcpServers": {
    "notes": {
      "command": "python",
      "args": ["/abs/path/examples/python-stdio/server.py"]
    }
  }
}
```

Claude Desktop:

```json
{
  "mcpServers": {
    "notes": {
      "command": "python",
      "args": ["/abs/path/server.py"],
      "env": { "NOTES_DIR": "/abs/path/notes" }
    }
  }
}
```

Always use absolute paths. The host's working directory is not predictable.

## Debugging

```bash
npx @modelcontextprotocol/inspector python examples/python-stdio/server.py
```

Check in order:

1. Does the server start silently on its own?
2. Can the inspector complete `initialize`?
3. Does `tools/list` return the expected tools?
4. Is a failure a protocol error or a tool error (`isError: true`)?

Feed a raw request:

```bash
echo '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-06-18","capabilities":{},"clientInfo":{"name":"probe","version":"0"}}}' \
  | python examples/python-stdio/server.py
```

## When not to use stdio

- Multiple users or machines must share the server.
- You need OAuth, tenant isolation, or centralized audit.
- You need horizontal scaling and canary releases.
- The runtime forbids child processes.

Use [Streamable HTTP](/en/server/http-sse) instead.

## Checklist

- [ ] Logs to stderr only; stdout clean.
- [ ] Input types and ranges validated.
- [ ] File paths stay inside a root allowlist.
- [ ] Large results are capped or paginated.
- [ ] The process exits when stdin closes.
- [ ] Tested in the inspector and at least one real host.
