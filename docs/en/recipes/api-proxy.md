---
title: API proxy
description: Wrap third-party APIs with MCP — host allowlists, credential injection, SSRF defense, retries and response shaping.
---

# API proxy

Most teams don't actually need a filesystem tool first. They need their internal services and SaaS APIs: tickets, CRM, monitoring, deploys. Wrapping an API as MCP tools gives the model one consistent schema, while credentials, rate limits, and audit live on the server.

## Why not call HTTP directly?

| Direct HTTP from the agent | Through an MCP proxy |
| --- | --- |
| Every agent needs the API key | Credentials stay server-side |
| No unified audit | Every call can be recorded |
| Rate limiting is scattered | Centralized |
| Model must understand the whole API | Only the needed actions are exposed |
| Responses can be huge | Server shapes them |

The cost is one more service. Once two or more agents use the API, the trade is usually worth it.

## Shape

```text
Agent → MCP tools/call → your proxy → allowlisted host → third-party API
                              │
                              ├─ inject credentials
                              ├─ validate parameters
                              ├─ rate limit / retry
                              └─ shape the response
```

## Host allowlist

Never accept an arbitrary URL:

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
String validation is not enough. An attacker can point an allowlisted hostname at an internal IP via DNS, or redirect to `169.254.169.254` (cloud metadata). In production you must:

1. Resolve DNS and validate the IP; reject private and reserved ranges.
2. Disable automatic redirects, or re-validate on every hop.
3. Route outbound traffic through a proxy that enforces the allowlist again.
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

There is still a TOCTOU window between DNS validation and the actual connection. For high-security cases, use a fixed egress proxy or an HTTP client with a native `allowed_hosts` control.

## Credential injection

```python
import httpx

def upstream_headers(tenant: str) -> dict[str, str]:
    # Per-tenant credentials from a secret manager.
    token = secrets.get(f"tenant/{tenant}/crm_token")
    return {
        "authorization": f"Bearer {token}",
        "accept": "application/json",
        "user-agent": "mcp-patterns/0.1",
    }
```

Principles:

- **Never accept a client-supplied `Authorization`** unless you implement an explicit token exchange.
- Credentials never appear in logs, error messages, or cache keys.
- Support rotation: short TTL + cache, refresh once on failure.
- Per-tenant credentials; no shared high-privilege account.

## A complete tool

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

- **Expose only the fields you need**; don't echo the whole upstream JSON.
- **Handle 429 / 5xx / 4xx explicitly** and map them to stable error codes.
- **Separate connect and read timeouts.**
- **Clamp parameter ranges server-side.**

## Retries

Only retry idempotent requests:

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

Rules:

- `POST` retries need an idempotency key.
- At most 3 attempts, total budget below the tool timeout.
- Respect `Retry-After`.
- Count retries and expose the metric.

## Rate limiting

Two layers:

1. **Inbound**: limit MCP calls per tenant / token.
2. **Outbound**: respect upstream quotas so you don't take the vendor down.

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

Return `429` or a `rate_limited` tool error with `retry_after_ms`. Don't silently queue until timeout.

## Caching

Good candidates:

- Slow-changing metadata (users, projects, config).
- Read-only queries with identical parameters.
- Responses that carry `Cache-Control`.

Bad candidates:

- Anything permission-dependent.
- Personal data.
- Read-after-write without invalidation.

Cache keys must include tenant and credential version:

```text
{tenant}:{credential_version}:{method}:{url}:{sorted_params_hash}
```

## Response shaping

| Upstream problem | Handling |
| --- | --- |
| 1 MB JSON | Select only the needed fields |
| Deep nesting | Flatten into a model-friendly shape |
| Inconsistent names | Normalize to snake_case |
| Mixed timestamp formats | Normalize to ISO 8601 UTC |
| Pagination tokens | Return `next_cursor` instead of fetching everything |

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

## TypeScript version

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

`redirect: 'manual'` matters: automatic redirects can bypass your allowlist.

## Monitoring

For every upstream call, record:

- Upstream host and path template (no query parameters).
- Status code, latency, retry count.
- Response size.
- Tenant.
- Circuit breaker state.

Break circuits per host: after consecutive failures, return `upstream_unavailable` immediately for a short period instead of cascading.

## Checklist

- [ ] Only `https` and allowlisted hosts.
- [ ] Resolve DNS and reject private / metadata IPs.
- [ ] Automatic redirects disabled or re-validated per hop.
- [ ] Credentials injected server-side; no client token passthrough.
- [ ] Per-tenant credentials with rotation.
- [ ] Connect and read timeouts set separately.
- [ ] Retries only for idempotent requests, respecting `Retry-After`.
- [ ] Inbound and outbound rate limits.
- [ ] Responses shaped to the needed fields.
- [ ] Logs redacted; no `Authorization` values.

## Next

- [Database queries](/en/recipes/database)
- [Auth & permissions](/en/engineering/auth)
- [Troubleshooting](/en/debugging/troubleshooting)
