---
title: stdio Server Demo
description: 从零跑通一个 stdio MCP Server：完整代码、客户端、调试方式与 stdout 铁律。
---

# stdio Server Demo

stdio 是最容易上手的传输方式：Host 把你的 Server 当子进程启动，双方用 **stdin / stdout 按行传输 JSON-RPC**。不需要端口、证书、反向代理，特别适合本地工具和 IDE 插件。

这一页的完整代码在 `examples/python-stdio` 与 `examples/typescript`，都已实际跑通。

## 它是怎么工作的

```text
Host (Claude Code / Cursor)
   │  spawn: python server.py
   ├──────── stdin  ────────▶  Server
   │   {"jsonrpc":"2.0",...}\n
   │
   ◀──────── stdout ────────
       {"jsonrpc":"2.0",...}\n
```

规则只有三条，但每条都很重要：

1. **一行一条消息**，消息内部不能有裸换行。
2. **stdout 只输出协议消息**，日志、进度、调试信息一律写 stderr。
3. **stdin 关闭时进程应尽快退出**，不要挂后台线程。

::: danger 最常见的翻车
在工具里写了一句 `print("debug")`，整条 JSON-RPC 流立刻解析失败。Host 通常只会报「连接断开」，很难定位。用 `logging.basicConfig(stream=sys.stderr)`，或者干脆用 stderr 专用的 logger。
:::

## Python 版

目录：

```text
python-stdio/
├── server.py
├── client.py
├── requirements.txt
└── notes/
    ├── welcome.md
    └── transport.md
```

`requirements.txt`：

```text
mcp>=2.3,<3
```

### Server

```python
"""Minimal MCP server over stdio."""

from pathlib import Path

from mcp.server import MCPServer

NOTES_DIR = Path(__file__).parent / "notes"

mcp = MCPServer(
    "notes",
    version="0.1.0",
    instructions=(
        "A tiny notes server for learning MCP. "
        "Use search_notes to find relevant notes before reading one."
    ),
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

    Returns at most `limit` matches with a short snippet, not the full file.
    """
    limit = max(1, min(limit, 20))
    query_lower = query.lower()
    hits: list[dict[str, str]] = []

    for path in sorted(NOTES_DIR.glob("*.md")):
        text = path.read_text(encoding="utf-8")
        index = text.lower().find(query_lower)
        if index == -1:
            continue
        start = max(0, index - 60)
        snippet = " ".join(text[start : index + 140].split())
        hits.append({"name": path.stem, "snippet": snippet})
        if len(hits) >= limit:
            break

    return {"count": len(hits), "matches": hits}

@mcp.tool()
def read_note(name: str) -> str:
    """Read one note by name. Prefer search_notes first on large collections."""
    return _note_path(name).read_text(encoding="utf-8")

@mcp.resource("note://{name}")
def note_resource(name: str) -> str:
    """Expose a note as a readable MCP resource."""
    return _note_path(name).read_text(encoding="utf-8")

@mcp.prompt()
def summarize_note(name: str) -> str:
    """Build a reusable prompt that summarizes a note."""
    return (
        "Summarize the following engineering note in three bullets. "
        "Keep code identifiers unchanged.\n\n"
        + _note_path(name).read_text(encoding="utf-8")
    )

if __name__ == "__main__":
    mcp.run()  # stdio is the default transport
```

几个值得注意的设计：

- **返回 dict 而不是裸 float**：`add` 返回 `{"sum": 5.0}`，客户端拿到的 `structuredContent` 更稳定，也方便以后加字段。
- **`search_notes` 只返回片段**，不返回整篇内容，控制上下文预算。
- **`limit` 在服务端夹紧**，不信任模型传入的数值。
- **resource 与 tool 复用同一个路径校验函数**，避免漏掉一处。

### Client

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

        result = await client.call_tool("search_notes", {"query": "transport"})
        print("search:", result.structured_content)

asyncio.run(main())
```

实际输出：

```text
tools: ['add', 'search_notes', 'read_note']
add: {'sum': 5.0}
search: {'count': 1, 'matches': [{'name': 'transport', 'snippet': '# Choosing a transport ...'}]}
```

## TypeScript 版

TypeScript 示例把工具定义放在 `server.ts`，传输层单独一个文件，便于和 HTTP 版本共用。

`src/server.ts` 的注册部分：

```ts
import { McpServer } from '@modelcontextprotocol/server'
import { z } from 'zod'
import { readNote, searchNotes } from './notes.js'

export function createNotesServer(): McpServer {
  const server = new McpServer(
    { name: 'notes', version: '0.1.0' },
    { instructions: 'Local markdown notes. Search before reading.' }
  )

  server.registerTool(
    'add',
    {
      title: 'Add numbers',
      description: 'Add two numbers. Use this for quick arithmetic checks.',
      inputSchema: z.object({ a: z.number(), b: z.number() }),
      outputSchema: z.object({ sum: z.number() }),
      annotations: { readOnlyHint: true }
    },
    async ({ a, b }) => {
      const output = { sum: a + b }
      return {
        content: [{ type: 'text', text: JSON.stringify(output) }],
        structuredContent: output
      }
    }
  )

  server.registerTool(
    'search_notes',
    {
      title: 'Search notes',
      description: 'Search local markdown notes for a keyword.',
      inputSchema: z.object({
        query: z.string().min(1),
        limit: z.number().int().min(1).max(20).default(5)
      }),
      outputSchema: z.object({
        count: z.number(),
        matches: z.array(z.object({ name: z.string(), snippet: z.string() }))
      })
    },
    async ({ query, limit }) => {
      const matches = await searchNotes(query, limit)
      const output = { count: matches.length, matches }
      return {
        content: [{ type: 'text', text: JSON.stringify(output) }],
        structuredContent: output
      }
    }
  )

  return server
}
```

`src/stdio.ts` 只有三行：

```ts
import { serveStdio } from '@modelcontextprotocol/server/stdio'
import { createNotesServer } from './server.js'

serveStdio(() => createNotesServer())
```

启动客户端：

```bash
npm run client:stdio
```

输出：

```text
tools: add, search_notes, read_note
add: { sum: 5 }
notes://index: transport
welcome
```

::: tip v2 API 变化
TypeScript SDK v2 的入口拆成 `@modelcontextprotocol/server` 与 `@modelcontextprotocol/client`，stdio 服务端用 `serveStdio(factory)`，不再手动 `new StdioServerTransport()`。老教程里的写法在新版本里会缺少版本协商与旧客户端兼容处理。
:::

## 接到 Host 里

Claude Code：

```bash
claude mcp add notes -- python /abs/path/examples/python-stdio/server.py
claude mcp add --scope project notes -- npx -y tsx /abs/path/src/stdio.ts
```

Cursor（`.cursor/mcp.json`）：

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

Claude Desktop（`claude_desktop_config.json`）：

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

配置里的路径必须是**绝对路径**，Host 的工作目录不可预测。

## 手工调试

```bash
npx @modelcontextprotocol/inspector python examples/python-stdio/server.py
```

Inspector 会显示所有工具、schema、调用结果与原始 JSON-RPC。排查顺序：

1. Server 能否单独启动且不输出任何内容。
2. Inspector 能否完成 `initialize`。
3. `tools/list` 的结果是否符合预期。
4. 调用工具时错误是协议错误还是工具错误（`isError: true`）。

也可以直接喂一行 JSON：

```bash
echo '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-06-18","capabilities":{},"clientInfo":{"name":"probe","version":"0"}}}' \
  | python examples/python-stdio/server.py
```

## 何时不该用 stdio

- 需要被多个用户 / 多台机器共享。
- 需要 OAuth 登录、按租户隔离数据。
- 需要水平扩容、灰度、集中审计。
- 运行环境不允许启动子进程（部分 Serverless 平台）。

这些场景直接用 [Streamable HTTP](/server/http-sse)。

## 检查清单

- [ ] 日志全部写 stderr，stdout 无杂音。
- [ ] 工具输入有类型与范围校验。
- [ ] 文件路径经过根目录白名单校验。
- [ ] 大结果有上限或分页。
- [ ] `stdin` 关闭后进程能退出。
- [ ] 在 Inspector 与至少一个真实 Host 中验证过。
