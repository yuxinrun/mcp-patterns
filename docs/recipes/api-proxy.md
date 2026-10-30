---
title: API 代理
description: 用 MCP 包装第三方 API：域名白名单、凭据注入、SSRF 防护、重试与响应裁剪。
---

# API 代理

大多数团队真正想接的不是文件系统，而是内部服务和 SaaS API：工单、CRM、监控、发布系统。把 API 包成 MCP 工具，能让模型用统一的 schema 调用，同时把凭据、限流、审计收口到服务端。

## 为什么不直接让 Agent 调 HTTP

| 直接 HTTP | 通过 MCP 代理 |
| --- | --- |
| 每个 Agent 都要拿 API key | 凭据只在 Server 侧 |
| 无统一审计 | 每次调用可记录 |
| 限流分散 | 集中限流 |
| 模型要理解完整 API | 只暴露需要的动作 |
| 返回值可能巨大 | 服务端裁剪 |

代价是多了一层服务。只要 API 会被两个以上 Agent 使用，这笔账通常划算。

## 基本结构

```text
Agent → MCP tools/call → 你的代理 → 白名单域名 → 第三方 API
                              │
                              ├─ 注入凭据
                              ├─ 参数校验
                              ├─ 限流 / 重试
                              └─ 裁剪响应
```

## 域名白名单

永远不要接受任意 URL：

```python
from urllib.parse import urlparse

ALLOWED_HOSTS = {
    "api.github.com",
    "api.stripe.com",
    "internal.crm.example.com",
}

def validate_url(url: str) -> str:
    parsed = urlparse(url)
    if parsed.scheme != "https":
        raise ValueError("only https is allowed")
    if parsed.hostname not in ALLOWED_HOSTS:
        raise ValueError(f"host not allowed: {parsed.hostname}")
    if parsed.username or parsed.password:
        raise ValueError("credentials in URL are not allowed")
    return url
```

::: danger SSRF
只校验字符串还不够。攻击者可以用 DNS 把白名单域名解析到内网 IP，或用重定向跳到 `169.254.169.254`（云元数据）。生产环境必须：

1. DNS 解析后校验 IP，拒绝私有网段与保留地址。
2. 禁止或手动处理重定向，每一跳都重新校验。
3. 出站流量走统一代理，代理侧再做一次白名单。
:::

```python
import ipaddress
import socket

BLOCKED = [
    ipaddress.ip_network("10.0.0.0/8"),
    ipaddress.ip_network("172.16.0.0/12"),
    ipaddress.ip_network("192.168.0.0/16"),
    ipaddress.ip_network("127.0.0.0/8"),
    ipaddress.ip_network("169.254.0.0/16"),
    ipaddress.ip_network("::1/128"),
    ipaddress.ip_network("fc00::/7"),
]

def assert_public_host(host: str) -> None:
    for info in socket.getaddrinfo(host, 443):
        ip = ipaddress.ip_address(info[4][0])
        if any(ip in net for net in BLOCKED):
            raise ValueError(f"resolved to a blocked address: {ip}")
```

注意：DNS 校验与实际连接之间仍有 TOCTOU 窗口。高安全场景使用固定出口代理或 HTTP 客户端自带的 `allowed_hosts` 能力。

## 凭据注入

```python
import os
import httpx

def upstream_headers(tenant: str) -> dict[str, str]:
    # 每个租户独立凭据，从 Secret Manager 读取
    token = secrets.get(f"tenant/{tenant}/crm_token")
    return {
        "authorization": f"Bearer {token}",
        "accept": "application/json",
        "user-agent": "mcp-patterns/0.1",
    }
```

原则：

- **不接受客户端传入的 Authorization**，除非你明确做 token exchange。
- 凭据不落日志、不进错误信息、不进缓存 key。
- 支持轮换：短 TTL + 缓存，失败时刷新一次。
- 每个租户独立凭据，禁止共享高权限账号。

## 一个完整的工具

```python
@mcp.tool()
async def search_tickets(query: str, status: str = "open", limit: int = 10) -> dict:
    """Search support tickets in the CRM.

    Returns id, subject, status, updated_at. At most 20 tickets.
    """
    if status not in {"open", "pending", "closed"}:
        raise ValueError("status must be open, pending or closed")
    limit = max(1, min(limit, 20))

    url = "https://internal.crm.example.com/v1/tickets"
    params = {"q": query, "status": status, "limit": limit}
    tenant = current_tenant()

    async with httpx.AsyncClient(timeout=httpx.Timeout(8.0, connect=3.0)) as client:
        response = await client.get(url, params=params, headers=upstream_headers(tenant))

    if response.status_code == 429:
        retry_after = int(response.headers.get("retry-after", "5"))
        raise RateLimited(retry_after)
    if response.status_code >= 500:
        raise UpstreamError("CRM is unavailable")
    if response.status_code >= 400:
        raise ValueError(f"CRM rejected the request: {response.status_code}")

    data = response.json()
    tickets = [
        {
            "id": item["id"],
            "subject": item["subject"][:200],
            "status": item["status"],
            "updated_at": item["updated_at"],
        }
        for item in data.get("results", [])[:limit]
    ]
    return {"count": len(tickets), "tickets": tickets}
```

要点：

- **只暴露需要的字段**，不要把上游整个 JSON 回传。
- **显式处理 429 / 5xx / 4xx**，映射成统一错误码。
- **连接超时与读取超时分开**。
- **参数范围在服务端夹紧**。

## 重试

只对幂等请求重试：

```python
import asyncio, random

async def request_with_retry(client, method: str, url: str, **kwargs):
    for attempt in range(3):
        try:
            response = await client.request(method, url, **kwargs)
            if response.status_code < 500 and response.status_code != 429:
                return response
        except (httpx.ConnectError, httpx.ReadTimeout):
            if attempt == 2:
                raise
        delay = min(2**attempt + random.random(), 5)
        await asyncio.sleep(delay)
    return response
```

规则：

- `POST` 重试必须带幂等键。
- 最多 3 次，总预算不超过工具超时。
- 尊重 `Retry-After`。
- 记录重试次数，指标里可见。

## 限流

两层：

1. **入站**：按租户 / token 限制 MCP 调用频率。
2. **出站**：按上游配额限制请求，避免把第三方打挂。

```python
from collections import deque
import time

class SlidingWindow:
    def __init__(self, limit: int, window: float = 60.0):
        self.limit = limit
        self.window = window
        self.hits: dict[str, deque[float]] = {}

    def allow(self, key: str) -> bool:
        now = time.monotonic()
        bucket = self.hits.setdefault(key, deque())
        while bucket and now - bucket[0] > self.window:
            bucket.popleft()
        if len(bucket) >= self.limit:
            return False
        bucket.append(now)
        return True
```

超限返回 `429` 或工具错误 `rate_limited`，带 `retry_after_ms`。不要静默排队到超时。

## 缓存

适合缓存：

- 变化慢的元数据（用户、项目、配置）。
- 相同参数的只读查询。
- 上游明确返回 `Cache-Control` 的响应。

不适合：

- 权限相关的结果。
- 包含个人隐私的数据。
- 写操作后的即时读（除非做失效）。

缓存 key 必须包含租户与凭据版本：

```text
{tenant}:{credential_version}:{method}:{url}:{sorted_params_hash}
```

## 响应裁剪

| 上游问题 | 处理 |
| --- | --- |
| 返回 1 MB JSON | 只取需要的字段 |
| 深层嵌套 | 扁平化成模型易读的结构 |
| 字段名不一致 | 统一命名（snake_case） |
| 时间格式混乱 | 统一 ISO 8601 UTC |
| 分页 token | 返回 `next_cursor`，不要一次拉全 |

```python
def shape_ticket(item: dict) -> dict:
    return {
        "id": item["id"],
        "subject": item.get("subject", "")[:200],
        "status": item.get("status"),
        "assignee": (item.get("assignee") or {}).get("name"),
        "updated_at": item.get("updated_at"),
    }
```

## TypeScript 版本

```ts
const ALLOWED_HOSTS = new Set(['api.github.com', 'internal.crm.example.com'])

async function callUpstream(path: string, init: RequestInit) {
  const url = new URL(path, 'https://internal.crm.example.com')
  if (url.protocol !== 'https:' || !ALLOWED_HOSTS.has(url.hostname)) {
    throw new Error('host not allowed')
  }

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 8000)
  try {
    const response = await fetch(url, {
      ...init,
      redirect: 'manual',
      signal: controller.signal,
      headers: {
        ...init.headers,
        authorization: `Bearer ${await tenantToken()}`
      }
    })
    if (!response.ok) throw new Error(`upstream ${response.status}`)
    return response
  } finally {
    clearTimeout(timer)
  }
}
```

`redirect: 'manual'` 很关键：自动跟随重定向会绕过你的白名单。

## 监控

每个上游调用记录：

- 上游域名、路径模板（不含查询参数）。
- 状态码、耗时、重试次数。
- 响应大小。
- 租户。
- 熔断状态。

按域名做熔断：连续失败达到阈值后，短时间内直接返回 `upstream_unavailable`，避免雪崩。

## 检查清单

- [ ] 只允许 `https` 和白名单域名。
- [ ] DNS 解析后校验 IP，拒绝私网与元数据地址。
- [ ] 禁止自动重定向，或逐跳校验。
- [ ] 凭据服务端注入，不接受客户端 token 透传。
- [ ] 每租户独立凭据，可轮换。
- [ ] 连接 / 读取超时分开设置。
- [ ] 只对幂等请求重试，尊重 `Retry-After`。
- [ ] 入站与出站都有限流。
- [ ] 响应裁剪到需要的字段。
- [ ] 日志脱敏，不记录 Authorization。

## 下一步

- [数据库查询](/recipes/database)
- [鉴权与权限控制](/engineering/auth)
- [调试排坑](/debugging/troubleshooting)
