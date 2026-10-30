---
title: 标准项目模板
description: 一个可持续维护的 MCP Server 项目骨架：目录、依赖、配置、测试与发布。
---

# 标准项目模板

MCP Server 看起来只是一个进程，但要长期维护，最好从第一天就按「服务端项目」组织：**传输层与业务逻辑分离、schema 与实现同源、日志走 stderr、配置来自环境变量**。

## 目录结构

```text
my-mcp-server/
├── pyproject.toml            # 或 package.json
├── README.md
├── .env.example
├── src/
│   └── my_mcp/
│       ├── __init__.py
│       ├── server.py         # 组装：注册工具 / 资源 / 提示
│       ├── config.py         # 环境变量与默认值
│       ├── tools/
│       │   ├── __init__.py
│       │   ├── search.py
│       │   └── read.py
│       └── infra/
│           ├── db.py
│           └── logging.py
├── tests/
│   ├── test_tools.py
│   └── test_protocol.py
└── scripts/
    └── smoke.sh
```

原则：

1. **server.py 只做组装**，不写业务逻辑。
2. **工具函数保持纯函数风格**：输入明确、输出可序列化、错误可分类。
3. **每个工具一个模块**，超过 5 个工具后差异会非常明显。
4. **测试直接调用函数**，协议层用 SDK 客户端做冒烟。

## Python 模板

`pyproject.toml`：

```toml
[project]
name = "my-mcp-server"
version = "0.1.0"
requires-python = ">=3.11"
dependencies = ["mcp>=2.3,<3"]

[project.scripts]
my-mcp = "my_mcp.server:main"

[build-system]
requires = ["hatchling"]
build-backend = "hatchling.build"
```

`src/my_mcp/config.py`：

```python
from dataclasses import dataclass
from os import environ

@dataclass(frozen=True)
class Settings:
    notes_dir: str = environ.get("NOTES_DIR", "./notes")
    max_results: int = int(environ.get("MAX_RESULTS", "20"))
    log_level: str = environ.get("LOG_LEVEL", "INFO")

settings = Settings()
```

`src/my_mcp/server.py`：

```python
import logging
import sys

from mcp.server import MCPServer

from .config import settings
from .tools.search import search_notes
from .tools.read import read_note

# stdio 模式下 stdout 属于协议，日志只能走 stderr
logging.basicConfig(stream=sys.stderr, level=settings.log_level)

mcp = MCPServer(
    "my-mcp-server",
    version="0.1.0",
    instructions="Search notes before reading. Prefer small, focused calls.",
)

mcp.tool()(search_notes)
mcp.tool()(read_note)


def main() -> None:
    mcp.run()  # 默认 stdio；HTTP 见下一节


if __name__ == "__main__":
    main()
```

## TypeScript 模板

`package.json`：

```json
{
  "name": "my-mcp-server",
  "type": "module",
  "bin": { "my-mcp": "dist/stdio.js" },
  "scripts": {
    "build": "tsc -p tsconfig.json",
    "dev": "tsx src/stdio.ts",
    "typecheck": "tsc --noEmit"
  },
  "dependencies": {
    "@modelcontextprotocol/server": "^2.4.0",
    "zod": "^4.2.0"
  },
  "devDependencies": {
    "tsx": "^4.20.0",
    "typescript": "^5.9.0",
    "@types/node": "^24.0.0"
  }
}
```

`src/config.ts`：

```ts
export const config = {
  port: Number(process.env.PORT ?? 8000),
  maxResults: Number(process.env.MAX_RESULTS ?? 20),
  logLevel: process.env.LOG_LEVEL ?? 'info'
}
```

`src/stdio.ts`：

```ts
import { serveStdio } from '@modelcontextprotocol/server/stdio'
import { createServer } from './server.js'

serveStdio(() => createServer())
```

## 同一套工具，两种传输

把「创建 Server」抽成工厂函数，是模板里最重要的设计：

```python
# Python
def build_server() -> MCPServer:
    mcp = MCPServer("notes", version="0.1.0")
    mcp.tool()(search_notes)
    mcp.tool()(read_note)
    return mcp

if __name__ == "__main__":
    import sys
    if "--http" in sys.argv:
        build_server().run(transport="streamable-http", host="127.0.0.1", port=8000)
    else:
        build_server().run()
```

```ts
// TypeScript
export function createServer(): McpServer { /* register tools */ }

// stdio.ts
serveStdio(() => createServer())

// http.ts
const handler = createMcpHandler(() => createServer())
```

这样传输层的差异不会污染业务代码，也方便测试时直接 `build_server()` 后连接内存传输。

## 配置与环境变量

| 变量 | 用途 | 默认 |
| --- | --- | --- |
| `NOTES_DIR` | 数据根目录 | `./notes` |
| `MAX_RESULTS` | 单次查询上限 | `20` |
| `LOG_LEVEL` | 日志级别 | `INFO` |
| `MCP_TRANSPORT` | `stdio` / `http` | `stdio` |
| `PORT` | HTTP 端口 | `8000` |
| `OAUTH_ISSUER` | 授权服务器地址 | 无 |

不要把密钥写进代码或提交到仓库。stdio Server 的环境变量由 Host 传入；HTTP Server 用部署平台的 Secret 管理。

## 本地验证

```bash
# 1. 直接跑进程，确认能启动且 stdout 干净
python -m my_mcp.server
# 应该没有任何输出（stdio 模式下没有请求就不该有字节）

# 2. 用 Inspector 连接
npx @modelcontextprotocol/inspector python -m my_mcp.server

# 3. 跑协议冒烟测试
pytest tests/test_protocol.py
```

一个最小的协议测试：

```python
import pytest
from mcp import Client, StdioServerParameters
import sys

@pytest.mark.asyncio
async def test_lists_tools():
    params = StdioServerParameters(command=sys.executable, args=["-m", "my_mcp.server"])
    async with Client(params) as client:
        tools = await client.list_tools()
        assert {tool.name for tool in tools.tools} >= {"search_notes", "read_note"}
```

## 发布前检查

- [ ] stdout 没有任何调试输出，日志全部在 stderr。
- [ ] 所有工具都有 description 和输入 schema。
- [ ] 文件 / SQL / URL 参数有白名单或参数化。
- [ ] 错误信息不包含堆栈、凭据、绝对路径。
- [ ] 大结果有分页或截断。
- [ ] `--help` / `--version` 能正常运行。
- [ ] 有 `server.json` 或内部注册信息。
- [ ] CI 跑 typecheck + 单元测试 + 协议冒烟。

## 下一步

- [stdio Server Demo](/server/stdio)：完整可运行版本
- [HTTP / SSE Server Demo](/server/http-sse)：远程部署版本
- [工具设计模式](/server/tool-design)：让模型少犯错
