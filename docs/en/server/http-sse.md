---
title: HTTP / SSE server demo
description: A working Streamable HTTP server, legacy SSE compatibility, and production deployment notes.
---

# HTTP / SSE server demo

The default transport for remote MCP is **Streamable HTTP**: one `/mcp` endpoint. Clients POST JSON-RPC; the server returns a single JSON response or upgrades to an SSE stream for progress and notifications.

Legacy **HTTP+SSE** (`/sse` + `/messages`) is deprecated. Start new projects with Streamable HTTP.

## The difference

| Dimension | Streamable HTTP | Legacy HTTP+SSE |
| --- | --- | --- |
| Endpoints | One `/mcp` | `/sse` (long-lived) + `/messages` |
| Session | Optional; stateless is common | Session ID required |
| Scaling | Stateless replicas | Sticky sessions or shared state |
| Resume | Event IDs | SSE reconnect |
| Recommendation | ✅ Default | ⚠️ Compatibility only |

```http
POST /mcp HTTP/1.1
Content-Type: application/json
Accept: application/json, text/event-stream

{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"add","arguments":{"a":1,"b":2}}}
```

The response may be `application/json` or `text/event-stream`. Clients must accept both; this is the most common interoperability bug.

## Python server

```python
import os
import sys
from datetime import UTC, datetime

from mcp.server import MCPServer
from starlette.requests import Request
from starlette.responses import JSONResponse

mcp = MCPServer(
    "ops-tools",
    version="0.1.0",
    instructions="Small operational tools exposed over Streamable HTTP.",
)

STARTED_AT = datetime.now(UTC)

@mcp.tool()
def add(a: float, b: float) -> dict[str, float]:
    """Add two numbers."""
    return {"sum": a + b}

@mcp.tool()
def service_status() -> dict[str, str]:
    """Return a tiny health snapshot."""
    return {
        "status": "ok",
        "started_at": STARTED_AT.isoformat(),
        "region": os.getenv("REGION", "local"),
    }

@mcp.custom_route("/healthz", methods=["GET"])
async def healthz(request: Request) -> JSONResponse:
    # Custom routes bypass MCP auth. Keep them boring.
    return JSONResponse({
        "ok": True,
        "uptime_seconds": int((datetime.now(UTC) - STARTED_AT).total_seconds()),
    })

if __name__ == "__main__":
    if "--sse" in sys.argv:
        mcp.run(transport="sse", host="127.0.0.1", port=8001)
    else:
        mcp.run(
            transport="streamable-http",
            host="127.0.0.1",
            port=8000,
            stateless_http=True,
        )
```

```bash
python server.py
curl -s http://127.0.0.1:8000/healthz
# {"ok":true,"uptime_seconds":3}
```

Client:

```python
import asyncio
from mcp import Client

async def main() -> None:
    async with Client("http://127.0.0.1:8000/mcp") as client:
        tools = await client.list_tools()
        print([tool.name for tool in tools.tools])
        result = await client.call_tool("add", {"a": 20, "b": 22})
        print(result.structured_content)

asyncio.run(main())
```

```text
['add', 'service_status']
{'sum': 42.0}
```

### Stateless or stateful

| Mode | Pros | Costs | Use |
| --- | --- | --- | --- |
| stateless | No shared state, easy scaling and canaries | No in-process session state | Most remote tools |
| stateful | Subscriptions, long-task context | Sticky sessions or external storage | Progress and subscriptions |

If tool calls do not need shared memory, use stateless.

## TypeScript server

```ts
import http from 'node:http'
import { createMcpHandler } from '@modelcontextprotocol/server'
import { localhostHostValidation, localhostOriginValidation, toNodeHandler } from '@modelcontextprotocol/node'
import { createNotesServer } from './server.js'

const handler = createMcpHandler(() => createNotesServer())
const mcp = toNodeHandler(handler)
const validateHost = localhostHostValidation()
const validateOrigin = localhostOriginValidation()

const server = http.createServer((req, res) => {
  const { pathname } = new URL(req.url ?? '/', 'http://localhost')

  if (pathname === '/healthz') {
    res.writeHead(200, { 'content-type': 'application/json' })
    res.end(JSON.stringify({ ok: true }))
    return
  }

  if (pathname === '/mcp') {
    // DNS-rebinding protection
    if (!validateHost(req, res) || !validateOrigin(req, res)) return
    void mcp(req, res)
    return
  }

  res.writeHead(404).end()
})

server.listen(8000, '127.0.0.1', () => {
  console.error('notes MCP server on http://127.0.0.1:8000/mcp')
})
```

::: warning Do not skip Host / Origin validation
Binding to `127.0.0.1` is not enough; a malicious page can still issue browser requests. `localhostHostValidation()` and `localhostOriginValidation()` are the cheapest DNS-rebinding defense. Configure your production domain allowlist explicitly.
:::

## Legacy SSE

```bash
python server.py --sse   # http://127.0.0.1:8001/sse
```

| Legacy | Streamable HTTP |
| --- | --- |
| `GET /sse` returns an `endpoint` event | POST directly to `/mcp` |
| Upstream posts to `/messages?sessionId=...` | Everything goes to `/mcp` |
| Long-lived connection | No connection in stateless mode |
| 404 on expired session | No session concept |

Keep legacy endpoints read-only and announce a sunset date at the gateway.

## Deployment

```nginx
location /mcp {
    proxy_pass http://127.0.0.1:8000;
    proxy_http_version 1.1;

    proxy_buffering off;
    proxy_cache off;

    proxy_read_timeout 3600s;
    proxy_send_timeout 3600s;

    proxy_set_header Host $host;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
}
```

If the client spins forever while the inspector works locally, suspect proxy buffering or timeouts.

### Security baseline

- [ ] HTTPS in production.
- [ ] Validate `Origin`; reject unknown browser origins.
- [ ] Cap request body size.
- [ ] Authenticate at the MCP layer, not by network isolation.
- [ ] Per-tenant credentials; never pass user tokens through.
- [ ] Per-tool timeouts.
- [ ] Log trace ID, tenant, tool, duration, and status.

### Scaling

Stateless replicas sit behind a load balancer; shared state lives in a database or external store. Apply rate limits at the gateway and per-tool limits for expensive operations.

## Choosing between stdio and HTTP

| Question | stdio | Streamable HTTP |
| --- | --- | --- |
| Local files or processes | ✅ | ❌ |
| Multiple users | ❌ | ✅ |
| OAuth and tenancy | Hard | ✅ |
| Operational complexity | Lowest | Medium |
| Horizontal scaling | N/A | ✅ |

Many teams expose both: stdio for local development, HTTP for production, sharing one tool factory.

## Next

- [Tool design patterns](/en/server/tool-design)
- [Auth and permissions](/en/engineering/auth)
- [Troubleshooting](/en/debugging/troubleshooting)
