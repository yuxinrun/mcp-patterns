---
title: Project template
description: "A maintainable MCP server skeleton — layout, dependencies, configuration, and tests."
---

# Project template

An MCP server is a process, but it should be organized like a service from day one: **transport separate from business logic, schemas next to implementations, logs to stderr, configuration from the environment**.

## Layout

```text
my-mcp-server/
├── pyproject.toml            # or package.json
├── README.md
├── .env.example
├── src/
│   └── my_mcp/
│       ├── __init__.py
│       ├── server.py         # assembly: tools / resources / prompts
│       ├── config.py         # env + defaults
│       ├── tools/
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

Rules:

1. `server.py` only assembles; no business logic.
2. Tool functions are predictable: explicit inputs, serializable outputs, classified errors.
3. One module per tool once you pass five tools.
4. Unit-test functions directly; smoke-test the protocol with an SDK client.

## Python template

`pyproject.toml`:

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

`src/my_mcp/config.py`:

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

`src/my_mcp/server.py`:

```python
import logging
import sys

from mcp.server import MCPServer

from .config import settings
from .tools.search import search_notes
from .tools.read import read_note

logging.basicConfig(stream=sys.stderr, level=settings.log_level)

mcp = MCPServer(
    "my-mcp-server",
    version="0.1.0",
    instructions="Search notes before reading. Prefer small, focused calls.",
)

mcp.tool()(search_notes)
mcp.tool()(read_note)


def main() -> None:
    mcp.run()


if __name__ == "__main__":
    main()
```

## TypeScript template

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

```ts
// src/stdio.ts
import { serveStdio } from '@modelcontextprotocol/server/stdio'
import { createServer } from './server.js'

serveStdio(() => createServer())
```

## One toolset, two transports

The most important design decision is a server factory:

```python
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
export function createServer(): McpServer { /* register tools */ }

// stdio.ts
serveStdio(() => createServer())

// http.ts
const handler = createMcpHandler(() => createServer())
```

Business code never knows which transport is in use, and tests can build a server without spawning a process.

## Configuration

| Variable | Purpose | Default |
| --- | --- | --- |
| `NOTES_DIR` | Data root | `./notes` |
| `MAX_RESULTS` | Query limit | `20` |
| `LOG_LEVEL` | Log level | `INFO` |
| `MCP_TRANSPORT` | `stdio` / `http` | `stdio` |
| `PORT` | HTTP port | `8000` |
| `OAUTH_ISSUER` | Authorization server | none |

Never commit secrets. stdio servers receive env vars from the host; HTTP servers use the platform secret manager.

## Local verification

```bash
python -m my_mcp.server
# Expected: no output. stdio mode must stay silent until a request arrives.

npx @modelcontextprotocol/inspector python -m my_mcp.server
pytest tests/test_protocol.py
```

Minimal protocol test:

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

## Pre-release checklist

- [ ] stdout is clean; logs go to stderr.
- [ ] Every tool has a description and an input schema.
- [ ] File, SQL, and URL inputs are allowlisted or parameterized.
- [ ] Errors omit stack traces, credentials, and absolute paths.
- [ ] Large results are paginated or truncated.
- [ ] `--help` and `--version` work.
- [ ] `server.json` or internal metadata exists.
- [ ] CI runs typecheck, unit tests, and a protocol smoke test.

## Next

- [stdio demo](/en/server/stdio)
- [HTTP/SSE demo](/en/server/http-sse)
- [Tool design](/en/server/tool-design)
