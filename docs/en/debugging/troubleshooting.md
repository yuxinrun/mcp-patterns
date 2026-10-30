---
title: Troubleshooting
description: From "won't connect" to "result too large" — symptoms, root causes and fixes for MCP servers.
---

# Troubleshooting

MCP errors are vague by default. The host says "connection failed" or "tool call error". This page is organized by **symptom**: locate the layer first, then fix the cause.

## Three-step triage

```text
1. Does the server start on its own?   → process / dependencies / config
2. Does Inspector finish the handshake? → protocol / transport / version
3. Does the tool work in isolation?     → business logic / auth / timeout
```

```bash
# stdio
npx @modelcontextprotocol/inspector python /abs/path/server.py

# HTTP
npx @modelcontextprotocol/inspector --url http://127.0.0.1:8000/mcp

# Host-side connection status (Claude Code)
claude mcp list
```

If Inspector works but the host doesn't, the problem is **host configuration** (path, env vars, scope). If Inspector also fails, the problem is the **server or transport**.

## Symptom table

| Symptom | Most likely cause | Check first |
| --- | --- | --- |
| Host says server failed / connection closed | Process failed, stdout polluted | Run manually, read stderr |
| `initialize` times out | Version mismatch, process stuck | Protocol version, startup logs |
| Empty tool list | Registration failed, capability missing | Raw `tools/list` response |
| 401 Unauthorized | Missing token, wrong audience | `WWW-Authenticate` |
| 403 Forbidden | Insufficient scope, tenant mismatch | Token claims |
| 404 / session not found | Expired stateful session | Whether you run stateful |
| 405 Method Not Allowed | Wrong endpoint or method | Request method and path |
| Call hangs forever | Proxy buffering, long task without progress | Proxy config, timeouts |
| Garbled output / parse error | Encoding, log noise on stdout | Raw byte stream |
| Result truncated | Buffer or output limit | Message size |
| Argument validation fails | Schema doesn't match implementation | Schema JSON |
| Intermittent failures | Concurrency, pool, rate limit | Metrics and logs |

## 1. stdout pollution

**Symptom**: the host reports a closed connection or JSON parse error; Inspector disconnects immediately.

**Cause**: a `print()` in a tool, a library banner, or a progress bar wrote to stdout.

**Fix**:

```python
import logging, sys
logging.basicConfig(stream=sys.stderr, level=logging.INFO)
```

```ts
console.error('debug')  // never console.log
```

Self-check:

```bash
python server.py < /dev/null | head -c 100
# There should be no output. Any output is pollution.
```

## 2. Process fails to start

**Symptom**: the host shows `spawn ... ENOENT` or `command not found`.

**Causes**:

- The host's working directory is unpredictable, so relative paths break.
- The virtualenv isn't active; `python` resolves to the system interpreter.
- A Windows path with spaces isn't quoted.
- Node is older than 20.

**Fix**:

```json
{
  "mcpServers": {
    "notes": {
      "command": "/abs/path/.venv/bin/python",
      "args": ["/abs/path/server.py"],
      "cwd": "/abs/path"
    }
  }
}
```

Windows:

```json
{
  "command": "C:\\path\\.venv\\Scripts\\python.exe",
  "args": ["C:\\path\\server.py"]
}
```

Run the exact same command manually first and check the exit code and stderr.

## 3. Handshake failure / version mismatch

**Symptom**: `initialize` returns an error, or the connection drops right after opening.

**Causes**:

- Client and server support no common protocol version.
- An old SDK doesn't understand newer fields.
- The server sends notifications before `initialize` completes.

**Fixes**:

- Upgrade to a current SDK.
- Log the negotiated result explicitly:

```python
@mcp.tool()
def server_info() -> dict[str, str]:
    """Return the negotiated protocol version and server version."""
    return {"protocol": "negotiated", "server": "0.1.0"}
```

- Use Inspector to inspect the raw `initialize` request and response, and confirm `protocolVersion`.

## 4. 401 / 403

**401** means there's no valid identity:

```bash
curl -i https://mcp.example.com/mcp \
  -H 'content-type: application/json' \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}'
```

Look at the response headers:

```http
WWW-Authenticate: Bearer resource_metadata="..."
```

Check, in order:

- Is the token expired?
- Is `iss` in the trusted list?
- Does `aud` equal the current resource?
- Is the clock skewed?
- Did the JWKS fetch fail (network / cache)?

**403** means the identity is valid but lacks permission: check scopes, tenant binding, and the tool permission table. Don't hide 403 as 404 unless you specifically want to prevent resource enumeration.

## 5. Session / endpoint errors

| Error | Cause | Fix |
| --- | --- | --- |
| 404 session not found | Stateful session expired | Re-initialize, or switch to stateless |
| 405 Method Not Allowed | GET/DELETE sent to `/mcp`, unsupported | POST only; confirm the endpoint |
| 415 Unsupported Media Type | Missing `Content-Type: application/json` | Add the header |
| 406 Not Acceptable | `Accept` doesn't include `text/event-stream` | Accept both JSON and SSE |

A Streamable HTTP client should send:

```http
Accept: application/json, text/event-stream
```

## 6. Proxy / gateway hangs

**Symptom**: local `curl` works, but through Nginx or ALB the request never returns.

**Causes**:

- The proxy buffers the SSE stream.
- `proxy_read_timeout` is too short.
- The gateway doesn't support chunked transfer.
- HTTP/2 and SSE compatibility issues.

**Fix**:

```nginx
proxy_buffering off;
proxy_cache off;
proxy_read_timeout 3600s;
proxy_set_header Connection '';
proxy_http_version 1.1;
```

Also check the cloud idle timeout (ALB defaults to 60s and usually needs raising).

## 7. Timeouts

| Layer | Typical default | Adjustment |
| --- | --- | --- |
| Client request | 30–60s | SDK config |
| Proxy | 60s | Gateway config |
| Inside the tool | None | Explicit `asyncio.timeout` |
| Database | None | `statement_timeout` |
| Downstream API | None | Separate connect / read timeouts |

Long tasks need progress notifications, or the client times out first:

```python
@mcp.tool()
async def reindex(ctx) -> dict:
    """Rebuild the search index. May take several minutes."""
    for i, batch in enumerate(batches):
        await process(batch)
        await ctx.report_progress(i + 1, len(batches))
    return {"ok": True}
```

Exact API names vary by SDK version. The point is **to let the client know the call is alive**.

## 8. Serialization errors

Usually caused by returning a non-JSON-serializable object:

| Type | Wrong | Fix |
| --- | --- | --- |
| `datetime` | Return directly | `.isoformat()` |
| `Decimal` | Return directly | String or integer cents |
| `bytes` | Return directly | Base64, or reject |
| `NaN` / `Infinity` | Return directly | `null` or a string |
| ORM object | Return directly | `dict(row)` / `.model_dump()` |
| Circular reference | Return directly | Pick fields manually |

```python
def jsonable(value):
    if isinstance(value, (datetime, date)):
        return value.isoformat()
    if isinstance(value, Decimal):
        return str(value)
    if isinstance(value, float) and (value != value or value in (float("inf"), float("-inf"))):
        return None
    raise TypeError(f"not JSON serializable: {type(value)}")
```

## 9. Large payloads

**Symptom**: truncated results, dropped connections, or a frozen host.

**Causes**:

- A single JSON-RPC message exceeds the buffer (stdio defaults around 10 MB).
- The model context can't hold it.
- The proxy caps response size.

**Fixes**:

- Paginate and return `next_cursor`.
- Truncate and set `truncated: true`.
- Return a summary plus a resource URI the model can fetch on demand.
- Base64 for binary, with a size cap.
- Never put a whole log file or table into one result.

## 10. Schema and implementation diverge

**Symptom**: the model's arguments are always rejected, or the tool doesn't appear at all.

**Causes**:

- The schema marks a field required but the implementation has a default.
- Type mismatch (`string` vs `number`).
- Tool registration throws and is silently ignored.
- Duplicate names; the later one wins.

**Fix**:

```bash
# Inspect the raw tools/list
npx @modelcontextprotocol/inspector ...
```

Compare:

- `name` is unique.
- `inputSchema.required` matches the function signature.
- Enum values match implementation branches.
- Output conforms to `outputSchema`.

## 11. Encoding

- Read files as UTF-8, with `errors="replace"`.
- Windows consoles default to GBK; set `PYTHONIOENCODING=utf-8` explicitly.
- HTTP responses should declare `charset=utf-8`.
- When truncating, don't cut a multi-byte character (slice bytes, then `decode(errors="ignore")`).

## 12. Intermittent failures

| Pattern | Likely cause |
| --- | --- |
| Error rate rises at peak | Pool exhaustion, downstream rate limit |
| One tenant fails | Quota, expired credentials, abnormal data volume |
| One instance fails | Memory leak, file descriptor exhaustion |
| Succeeds after retry | Transient network, downstream jitter |

Watch error rate, p95 latency, pool usage, and 429 count. Without metrics you're guessing.

## Minimal reproduction template

When you can't locate a problem, write a minimal server:

```python
from mcp.server import MCPServer

mcp = MCPServer("repro", version="0.0.1")

@mcp.tool()
def echo(text: str) -> dict[str, str]:
    """Echo the input back."""
    return {"text": text}

if __name__ == "__main__":
    mcp.run()
```

If the minimal server works, add your code back piece by piece until the problem reappears. Most issues surface when you add "logging", "a third-party library", or "custom middleware".

## What to collect for a bug report

- Host and version, SDK and version, OS.
- Transport and endpoint.
- Full error message (redacted).
- `trace_id`.
- Minimal reproduction steps.
- Relevant logs (stderr, not stdout).

## Checklist

- [ ] It starts manually and stdout is clean.
- [ ] Inspector can handshake and call tools.
- [ ] Host config uses absolute paths and the right interpreter.
- [ ] Protocol version negotiation succeeds.
- [ ] 401 responses include `WWW-Authenticate`.
- [ ] Proxy buffering is off and timeouts are long enough.
- [ ] Returned objects are JSON-serializable.
- [ ] Large results are paginated or truncated.
- [ ] There's a `trace_id` and structured logs.

## Next

- [stdio server demo](/en/server/stdio)
- [HTTP / SSE server demo](/en/server/http-sse)
- [Logging & observability](/en/engineering/observability)
