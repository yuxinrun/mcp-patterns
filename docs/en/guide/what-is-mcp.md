---
title: What is MCP
description: "Model Context Protocol from a backend engineer's perspective — roles, messages, primitives, and transports."
---

# What is MCP

MCP (Model Context Protocol) is an open protocol that lets AI applications call external capabilities. It standardizes how tools, data, and prompt templates are exposed, so a host such as Claude Code, Cursor, or Dify does not need a custom plugin for every data source.

One sentence:

> **MCP is USB-C for AI capabilities.** The host is the computer, the server is the peripheral, and the client is the cable that speaks the protocol.

## Three roles

<McpArch />

| Role | Responsibility | Examples |
| --- | --- | --- |
| Host | User-facing AI app; decides when to call tools and how to show results | Claude Code, Cursor, Claude Desktop, Dify |
| Client | Protocol implementation; handshake, routing, transport management | Built into SDKs |
| Server | Exposes tools, resources, and prompts | The code you write |

One host can connect to many servers. Each connection has its own client. **Put permissions, quotas, and audit on the server side**, because you do not control the host.

## Messages

MCP uses JSON-RPC 2.0 with requests, responses, and notifications:

```json
{"jsonrpc":"2.0","id":1,"method":"tools/list","params":{}}
```

```json
{"jsonrpc":"2.0","id":2,"method":"tools/call","params":{"name":"add","arguments":{"a":1,"b":2}}}
```

Messages without an `id` are notifications and must not be answered, for example `notifications/initialized`.

### Versions

Older revisions use an `initialize` handshake. The 2026-07-28 revision adds a stateless mode: clients can carry the protocol version and capabilities in per-request `_meta`, and servers describe themselves via `server/discover` instead of relying on a long-lived session.

<SpecTimeline />

Practical consequences:

- Implement the current stable revision for new servers, not a tutorial from two years ago.
- Keep the `initialize` path only for older clients.
- Validate versions explicitly; never assume the peer supports a field.

## Three primitives

| Primitive | Controlled by | Use | Example |
| --- | --- | --- | --- |
| Tools | The model | Actions and queries | `search_notes`, `run_query` |
| Resources | The application | Context data | `notes://index`, `file:///README.md` |
| Prompts | The user | Reusable prompt templates | `summarize_note` |

Rules of thumb:

- Side effects or parameters → tool.
- Read-only data the app can attach → resource.
- Something the user triggers with one click → prompt.

They compose. A notes server can expose a `read_note` tool, a `notes://` resource, and a `summarize_note` prompt at the same time.

## Transports

| Transport | Shape | Use | Status |
| --- | --- | --- | --- |
| stdio | Child process, line-delimited JSON-RPC on stdin/stdout | Local tools, IDE integrations | Stable |
| Streamable HTTP | One `/mcp` endpoint, POST plus optional SSE stream | Remote services, multiple clients | Recommended |
| HTTP+SSE (legacy) | `/sse` + `/messages` | Compatibility with 2024 clients | Deprecated |

Ask three questions:

1. Does the tool need files or processes on the user's machine? → stdio
2. Does it need login, tenancy, and horizontal scaling? → Streamable HTTP
3. Must it support a client that only speaks legacy SSE? → keep a compatibility endpoint, not the main path

See [stdio demo](/en/server/stdio) and [HTTP/SSE demo](/en/server/http-sse).

## One full call

```text
Host/Client                      Server (python server.py)
    |  initialize                    |
    |------------------------------->|
    |  initialized                   |
    |------------------------------->|
    |  tools/list                    |
    |------------------------------->|
    |  tools/call {search_notes}     |
    |------------------------------->|
    |        result (structuredContent)
    |<-------------------------------|
```

The server only registers capabilities; the SDK handles handshakes, pagination, cancellation, and progress:

```python
from mcp.server import MCPServer

mcp = MCPServer("notes", version="0.1.0")

@mcp.tool()
def search_notes(query: str, limit: int = 5) -> dict[str, object]:
    """Search local markdown notes for a keyword."""
    ...

if __name__ == "__main__":
    mcp.run()  # stdio by default
```

## Misconceptions

::: warning Three common traps
1. **MCP is not a model protocol.** It does not train models or decide how they reason.
2. **An MCP server is not a generic web API.** Tool descriptions and schemas enter the model context; design it like a CLI for the model.
3. **stdout is not a log channel.** A single `print` can break the JSON-RPC stream. Logs go to stderr.
:::

## Next

- [MCP vs Skills vs Agents](/en/guide/mcp-vs-skill-agent)
- [stdio server demo](/en/server/stdio)
- [Ecosystem 2026](/en/ecosystem/landscape)
