---
title: Validation and errors
description: Separate protocol errors from tool errors, and design errors the model can act on and code can retry.
---

# Validation and errors

Two different error layers get mixed up constantly:

| Type | Layer | Shape | Fixed by |
| --- | --- | --- | --- |
| Protocol error | JSON-RPC | Top-level `error` with a code | Client / developer |
| Tool error | Tool result | `result.isError: true` | Model / user |

Rules:

- The request itself is invalid (unknown method, bad JSON, unsupported version) → protocol error.
- The tool failed (missing file, SQL syntax, upstream 500) → tool error.

## Protocol errors

```json
{
  "jsonrpc": "2.0",
  "id": 7,
  "error": {
    "code": -32602,
    "message": "Invalid params",
    "data": {"field": "limit", "reason": "must be between 1 and 20"}
  }
}
```

| Code | Meaning |
| --- | --- |
| -32700 | Parse error |
| -32600 | Invalid request |
| -32601 | Method not found |
| -32602 | Invalid params |
| -32603 | Internal error |
| -32002 | Resource not found |

The SDKs generate most protocol errors. Your job is to avoid using them for business failures, because the model usually cannot see your recovery advice.

## Tool errors

```python
from mcp.server import MCPServer
from mcp.types import CallToolResult, TextContent

mcp = MCPServer("notes", version="0.1.0")

@mcp.tool()
def read_note(name: str) -> CallToolResult:
    """Read one note by name."""
    try:
        text = load_note(name)
    except NoteNotFound:
        return CallToolResult(
            isError=True,
            content=[TextContent(
                type="text",
                text='{"error":"note_not_found","message":"No note named '
                     + name + '. Call search_notes to find the right name.","retryable":false}',
            )],
        )
    return CallToolResult(content=[TextContent(type="text", text=text)])
```

::: tip SDK defaults
Most SDKs convert a raised exception into `isError: true` with the exception text in `content`. That is convenient, but the text is uncontrolled: it may contain paths, SQL, or internal hostnames. Catch and return a structured error in production.
:::

```ts
server.registerTool(
  'read_note',
  { inputSchema: z.object({ name: z.string().min(1) }) },
  async ({ name }) => {
    try {
      const text = await readNote(name)
      return { content: [{ type: 'text', text }] }
    } catch (error) {
      const notFound = (error as NodeJS.ErrnoException).code === 'ENOENT'
      return {
        isError: true,
        content: [{
          type: 'text',
          text: JSON.stringify({
            error: notFound ? 'note_not_found' : 'internal_error',
            message: notFound
              ? `No note named "${name}". Call search_notes first.`
              : 'Failed to read the note. Retry once, then report the issue.',
            retryable: !notFound
          })
        }]
      }
    }
  }
)
```

## One error envelope

```json
{
  "error": "rate_limited",
  "message": "Tenant acme exceeded 60 requests/min. Retry after 12s.",
  "retryable": true,
  "retry_after_ms": 12000,
  "details": {"limit": 60, "window": "1m"}
}
```

| Field | Purpose |
| --- | --- |
| `error` | Stable machine-readable code |
| `message` | Explanation plus next step for the model |
| `retryable` | Whether retrying can help |
| `retry_after_ms` | Suggested backoff |
| `details` | Non-sensitive structured context |

Keep the code set small:

| Code | Retryable | Meaning |
| --- | --- | --- |
| `invalid_argument` | ❌ | Fix the input |
| `not_found` | ❌ | Resource missing |
| `permission_denied` | ❌ | Missing scope or tenant mismatch |
| `rate_limited` | ✅ | Back off |
| `upstream_unavailable` | ✅ | Dependency down |
| `timeout` | ✅ | Bounded retry |
| `conflict` | ⚠️ | Re-read and retry |
| `internal_error` | ⚠️ | Report with trace ID |

## Input validation

Three layers:

```text
Host/model → schema hints → server validation → business constraints
```

```python
def search_notes(query: str, limit: int = 5) -> dict[str, object]:
    if not query.strip():
        raise ValueError("query must not be empty")
    limit = max(1, min(limit, 20))
    ...
```

```ts
inputSchema: z.object({
  query: z.string().trim().min(1).max(200),
  limit: z.number().int().min(1).max(20).default(5)
})
```

Validate strings (length, charset, empty), numbers (integer/float, bounds, NaN), enums, paths (resolve and jail), URLs (https, host, resolved IP), SQL (parameterized, statement type), and arrays (element caps).

## Timeouts and cancellation

```python
import asyncio

async def run_query(sql: str) -> dict:
    try:
        async with asyncio.timeout(10):
            return await db.fetch(sql)
    except TimeoutError:
        return error("timeout", "Query exceeded 10s. Add filters or a LIMIT.", retryable=True)
```

On `notifications/cancelled`, stop work and release resources promptly. Long tasks should check cancellation instead of running to completion.

## Output limits

| Limit | Suggested | On exceed |
| --- | --- | --- |
| Tool result | 256 KB – 1 MB | Truncate + `truncated: true` |
| Log line | 8 KB | Truncate |
| List items | 100 | Paginate |
| Request body | 4 MiB | 413 |

```python
MAX_BYTES = 256 * 1024

def clamp(text: str) -> tuple[str, bool]:
    data = text.encode("utf-8")
    if len(data) <= MAX_BYTES:
        return text, False
    return data[:MAX_BYTES].decode("utf-8", errors="ignore"), True
```

The protocol limit is larger (stdio defaults to about 10 MB), but the real constraint is the model's context window.

## Never leak

Do not include stack traces, source paths, connection strings, hostnames, IPs, tokens, cookies, API keys, other tenants' resources, or full SQL.

Return a trace ID instead:

```json
{"error":"internal_error","message":"Unexpected failure.","trace_id":"4bf92f35..."}
```

## Retries

```python
async def call_with_retry(tool, args, attempts=3):
    for i in range(attempts):
        result = await client.call_tool(tool, args)
        if not result.is_error:
            return result
        payload = json.loads(result.content[0].text)
        if not payload.get("retryable"):
            return result
        await asyncio.sleep(payload.get("retry_after_ms", 500 * 2**i) / 1000)
    return result
```

Server side: retry only idempotent operations, use exponential backoff with jitter, set a total budget, and log every retry.

## Test matrix

| Case | Expected |
| --- | --- |
| Missing required param | `-32602` or `invalid_argument` |
| Out-of-range param | Tool error, no side effect |
| Missing resource | `isError` + `not_found` |
| Upstream timeout | `timeout`, `retryable: true` |
| Missing scope | `permission_denied`, no resource details |
| Huge result | Truncated + flag |
| Internal exception | `internal_error` + trace ID, no stack |

## Next

- [Tool design](/en/server/tool-design)
- [Troubleshooting](/en/debugging/troubleshooting)
- [Observability](/en/engineering/observability)
