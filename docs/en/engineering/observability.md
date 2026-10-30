# Logging & Observability

An MCP server that fails silently is worse than one that fails loudly. The model gets `Internal error`, the user gets a spinner, and you get a bug report with no trace. This page is about making one tool call traceable end to end.

## Four planes, four questions

| Plane | Question it answers | Where it lives |
| --- | --- | --- |
| Logs | What exactly happened, in order? | stderr / your log backend |
| Traces | Which steps did this call pass through? | OpenTelemetry or equivalent |
| Metrics | Is it slow or failing, and for whom? | counters + histograms |
| Audit | Who did what, and when? | append-only store |

Don't try to answer all four with one `print()`. Logs are the baseline; traces and metrics are what you add when someone asks "why is it slow only for tenant A".

## stdio: stderr is the only safe channel

stdout is the JSON-RPC wire. Any stray text breaks the frame. In stdio mode:

- Logs go to **stderr**.
- Never call a library that prints to stdout on import.
- If you use structured logging, keep the handler pointed at stderr explicitly.

```python
import logging, sys

logging.basicConfig(
    stream=sys.stderr,
    level=logging.INFO,
    format="%(asctime)s %(levelname)s %(name)s %(message)s",
)
log = logging.getLogger("mcp.notes")
```

In HTTP mode you can log to stdout if your platform expects it, but keeping the same stderr configuration everywhere avoids surprises when you switch transports.

## Log the fields you'll actually filter on

A log line that says `tool failed` is noise. The useful minimum:

```python
log.info(
    "tool.call",
    extra={
        "tool": tool_name,
        "request_id": request_id,
        "tenant_id": tenant_id,
        "trace_id": trace_id,
        "duration_ms": duration_ms,
        "ok": ok,
        "error_code": error_code,   # only on failure
        "result_bytes": result_bytes,
    },
)
```

Why these:

- `request_id` ties a tool call to the client's `_meta` id and to your gateway logs.
- `tenant_id` comes from the token, never from tool arguments.
- `trace_id` lets you follow the call into a database or downstream API.
- `duration_ms` and `result_bytes` are the two numbers that explain most incidents.

## One span per tool call

A tool is a natural trace boundary. Wrap it once, not in every tool.

```python
import time, uuid
from contextlib import contextmanager

@contextmanager
def tool_span(name: str, tenant_id: str):
    trace_id = uuid.uuid4().hex[:16]
    started = time.perf_counter()
    try:
        yield trace_id
    finally:
        log.info(
            "tool.call",
            extra={
                "tool": name,
                "trace_id": trace_id,
                "tenant_id": tenant_id,
                "duration_ms": round((time.perf_counter() - started) * 1000, 2),
            },
        )

@mcp.tool()
def search_notes(query: str, limit: int = 5) -> dict:
    with tool_span("search_notes", current_tenant()):
        ...
```

If you already run OpenTelemetry, replace the context manager with `tracer.start_as_current_span(name)` and add the same attributes. The shape is identical.

## Metrics worth having on day one

| Metric | Type | Labels | Why |
| --- | --- | --- | --- |
| `mcp_tool_calls_total` | counter | tool, status | volume + error rate |
| `mcp_tool_duration_ms` | histogram | tool | p50/p95/p99 latency |
| `mcp_result_bytes` | histogram | tool | context pressure |
| `mcp_auth_failures_total` | counter | reason | 401 vs 403 vs expired |
| `mcp_active_requests` | gauge | — | saturation |

Keep label cardinality low. Never put `tenant_id` or `query` in a metric label — that's what logs and traces are for.

## Redaction is not optional

Tool arguments and results routinely contain secrets, PII, or full documents. Log the shape, not the content.

```python
SENSITIVE = {"token", "password", "authorization", "cookie", "secret"}

def safe_args(args: dict) -> dict:
    return {
        k: ("***" if k.lower() in SENSITIVE else str(v)[:80])
        for k, v in args.items()
    }
```

Rules that hold up in review:

- Truncate every string field; never log a full document or SQL result.
- Strip `Authorization` before any structured log.
- For files, log the path and byte count, not the bytes.
- For database tools, log the query **spec name**, not the rendered SQL with parameters.

## Audit is a different store

Logs rotate. Audit records don't. Anything that answers "who deleted this" belongs in an append-only table or bucket:

```json
{
  "ts": "2026-10-30T10:12:44Z",
  "actor": "user:u_8812",
  "tenant": "acme",
  "tool": "write_note",
  "target": "notes/roadmap.md",
  "outcome": "ok",
  "request_id": "req_7f3a",
  "ip": "203.0.113.7"
}
```

Write the audit entry regardless of success. A failed write is exactly the event you'll need later.

## Dashboards that pay for themselves

Three panels cover most of what you need in the first month:

1. **Error rate by tool** (5-minute window) — catches a broken schema or downstream outage.
2. **p95 latency by tool** — catches a missing index or an unbounded query before users do.
3. **Result size p95 by tool** — catches the day a tool starts returning a full table.

Add a fourth once you have tenants: **calls per tenant**, to spot a runaway client.

## Anti-patterns

- **`print()` in stdio mode.** It breaks the wire. This is the single most common cause of "works locally, broken in the IDE".
- **Logging the whole result.** You'll blow up your log bill and leak data in one move.
- **Only logging failures.** Success timings are how you find slow tools before they fail.
- **One trace id per process.** It must be per request; otherwise every call looks like the same one.
- **Trusting the client's request id as your trace id.** Correlate, don't substitute.

## Checklist

- [ ] All stdio logging goes to stderr.
- [ ] Every tool call emits `tool`, `request_id`, `tenant_id`, `duration_ms`, `ok`.
- [ ] Failures include `error_code`, never a raw stack trace sent to the client.
- [ ] Secrets are redacted before logging.
- [ ] Metrics use low-cardinality labels only.
- [ ] Destructive tools write an audit record on both success and failure.
- [ ] There's a dashboard for error rate and p95 latency per tool.

Related: [Validation & errors](/en/engineering/validation-errors), [Troubleshooting](/en/debugging/troubleshooting).
