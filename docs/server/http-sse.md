---
title: HTTP / SSE Server Demo
description: Streamable HTTP 的完整可运行示例、旧版 SSE 的兼容方式，以及生产部署要点。
---

# HTTP / SSE Server Demo

远程 MCP 的默认传输是 **Streamable HTTP**：一个 `/mcp` 端点，客户端 POST JSON-RPC，服务端可以返回单个 JSON，也可以升级成 SSE 流推送进度与通知。

旧版 **HTTP+SSE**（`/sse` + `/messages`）已经弃用。这一页会讲清楚两者差异，但新项目请直接从 Streamable HTTP 开始。

## 两种传输的差别

| 维度 | Streamable HTTP | 旧版 HTTP+SSE |
| --- | --- | --- |
| 端点 | 单个 `/mcp` | `/sse`（长连接）+ `/messages`（上行） |
| 会话 | 可选，无状态更常见 | 强依赖 session id |
| 扩容 | 无状态实例可直接水平扩展 | 需要粘性会话或共享状态 |
| 断线恢复 | 支持通过事件 id 续传 | 依赖 SSE 重连 |
| 推荐度 | ✅ 新项目默认 | ⚠️ 仅兼容老客户端 |

### 请求形态

```http
POST /mcp HTTP/1.1
Content-Type: application/json
Accept: application/json, text/event-stream

{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"add","arguments":{"a":1,"b":2}}}
```

响应可能是：

```http
HTTP/1.1 200 OK
Content-Type: application/json

{"jsonrpc":"2.0","id":1,"result":{"content":[{"type":"text","text":"{\"sum\":3.0}"}],"structuredContent":{"sum":3.0}}}
```

也可能是 `text/event-stream`，逐条推送消息。客户端必须同时接受两种 `Content-Type`，这是 Streamable HTTP 互操作中最常见的坑之一。

## Python 版

完整代码在 `examples/python-http`。

`requirements.txt`：

```text
mcp>=2.3,<3
starlette>=0.47
```

`server.py`：

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
    """Return a tiny health snapshot for demos and smoke tests."""
    return {
        "status": "ok",
        "started_at": STARTED_AT.isoformat(),
        "region": os.getenv("REGION", "local"),
    }

@mcp.custom_route("/healthz", methods=["GET"])
async def healthz(request: Request) -> JSONResponse:
    # Custom routes are not protected by MCP auth. Keep them boring.
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

启动：

```bash
python server.py
curl -s http://127.0.0.1:8000/healthz
# {"ok":true,"uptime_seconds":3}
```

客户端：

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

输出：

```text
['add', 'service_status']
{'sum': 42.0}
```

### stateless 还是 stateful

```python
# 无状态：每次请求新建实例，适合容器水平扩容
mcp.run(transport="streamable-http", host="0.0.0.0", port=8000, stateless_http=True)
```

| 模式 | 优点 | 代价 | 适用 |
| --- | --- | --- | --- |
| stateless | 无共享状态、易扩容、易做灰度 | 不能依赖进程内会话 | 大多数远程工具 |
| stateful | 可以维护订阅、长任务上下文 | 需要粘性会话或外部存储 | 需要进度推送、订阅 |

判断标准：**如果工具调用之间不需要共享内存状态，就用 stateless。**

## TypeScript 版

`examples/typescript/src/http.ts`：

```ts
import http from 'node:http'
import { createMcpHandler } from '@modelcontextprotocol/server'
import { localhostHostValidation, localhostOriginValidation, toNodeHandler } from '@modelcontextprotocol/node'
import { createNotesServer } from './server.js'

const PORT = Number(process.env.PORT ?? 8000)

// 每个请求一个实例；无状态，不需要保存 session
const handler = createMcpHandler(() => createNotesServer())
const mcp = toNodeHandler(handler)
const validateHost = localhostHostValidation()
const validateOrigin = localhostOriginValidation()

const server = http.createServer((req, res) => {
  const { pathname } = new URL(req.url ?? '/', 'http://localhost')

  if (pathname === '/healthz') {
    res.writeHead(200, { 'content-type': 'application/json' })
    res.end(JSON.stringify({ ok: true, server: 'notes' }))
    return
  }

  if (pathname === '/mcp') {
    // DNS rebinding 防护：拒绝陌生 Host 与浏览器 Origin
    if (!validateHost(req, res) || !validateOrigin(req, res)) return
    void mcp(req, res)
    return
  }

  res.writeHead(404, { 'content-type': 'application/json' })
  res.end(JSON.stringify({ error: 'not found' }))
})

server.listen(PORT, '127.0.0.1', () => {
  console.error(`notes MCP server listening on http://127.0.0.1:${PORT}/mcp`)
})
```

运行：

```bash
npm run dev:http    # 终端 A
npm run client:http # 终端 B
```

输出：

```text
tools: add, search_notes, read_note
add: { sum: 42 }
```

::: warning 不要省略 Host / Origin 校验
本地开发服务默认只监听 `127.0.0.1`，但浏览器仍可能通过恶意页面发起请求。`localhostHostValidation()` 与 `localhostOriginValidation()` 是最低成本的 DNS rebinding 防护。生产环境要配置自己的域名白名单。
:::

## 旧版 SSE 兼容

只有必须支持老客户端时才启用：

```bash
python server.py --sse   # http://127.0.0.1:8001/sse
```

迁移时注意：

| 旧版 | 新版 |
| --- | --- |
| 先 `GET /sse` 拿 `endpoint` 事件 | 直接 POST `/mcp` |
| 上行固定发到 `/messages?sessionId=...` | 所有请求都发 `/mcp` |
| 依赖长连接保活 | 无状态模式无长连接 |
| session 失效返回 404 | 无 session 概念 |

推荐做法：**新端点用 Streamable HTTP，旧端点只做只读兼容**，并在网关层标记弃用时间。

## 部署要点

### 反向代理

```nginx
location /mcp {
    proxy_pass http://127.0.0.1:8000;
    proxy_http_version 1.1;

    # SSE 必须关闭缓冲，否则消息会被攒住
    proxy_buffering off;
    proxy_cache off;

    # 长任务与流式响应
    proxy_read_timeout 3600s;
    proxy_send_timeout 3600s;

    proxy_set_header Host $host;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
}
```

常见故障：客户端一直转圈、Inspector 能连但收不到结果——九成是代理缓冲或超时。

### 健康检查

- `/healthz` 只返回进程状态，**不要**在这里调用数据库或下游服务。
- 需要区分 liveness 与 readiness 时，另开 `/readyz`。
- 健康检查端点不属于 MCP，不走 OAuth，不要暴露敏感信息。

### 安全基线

- [ ] 生产环境必须 HTTPS。
- [ ] 校验 `Origin`，拒绝未知来源的浏览器请求。
- [ ] 限制请求体大小（默认 4 MiB 左右，按业务调整）。
- [ ] 鉴权在 MCP 层做，不依赖内网隔离。
- [ ] 每个租户的凭据独立，禁止透传用户 token 给下游。
- [ ] 设置每个工具的独立超时。
- [ ] 记录 trace id、租户、工具名、耗时、结果码。

### 扩展与限流

无状态模式下可以直接加副本：

```text
          ┌─ instance A ─┐
LB ──────▶├─ instance B ─┤──▶ 共享数据库 / 外部状态
          └─ instance C ─┘
```

限流建议放在网关和工具两层：

- 网关：按 IP / token 限制 QPS 与并发。
- 工具：按租户限制昂贵操作（全表扫描、外部 API 调用）。

## 和 stdio 怎么选

| 问题 | stdio | Streamable HTTP |
| --- | --- | --- |
| 访问本机文件 / 进程 | ✅ | ❌ |
| 多用户共享 | ❌ | ✅ |
| OAuth / 多租户 | 困难 | ✅ |
| 部署复杂度 | 最低 | 中 |
| 水平扩容 | 不适用 | ✅ |

很多团队会**同时提供两种入口**：本地开发用 stdio，生产用 HTTP，共用同一套工具工厂函数。

## 下一步

- [工具设计模式](/server/tool-design)
- [鉴权与权限控制](/engineering/auth)
- [调试排坑](/debugging/troubleshooting)
