---
title: Ecosystem 2026
description: "Hosts, SDKs, frameworks, and registries — a layered view of the MCP ecosystem and how to choose."
---

# Ecosystem 2026

The MCP ecosystem has four layers: **hosts (who connects) → SDKs (how to connect) → frameworks (who orchestrates) → registries (where to find things)**.

::: tip Timeliness
The protocol and SDKs move fast. This page reflects public information from mid-2026; always check the current docs of each project.
:::

## Hosts and clients

| Product | stdio | Streamable HTTP | Legacy SSE | Notes |
| --- | --- | --- | --- | --- |
| Claude Code | ✅ | ✅ | ⚠️ compat | `claude mcp add`; local / project / user scopes |
| Claude Desktop | ✅ | ✅ | ⚠️ compat | Config file; OAuth in the system browser |
| Claude API connectors | — | ✅ | — | Remote MCP initiated by Anthropic |
| OpenAI Responses API | — | ✅ | — | `tools: [{type: "mcp", server_url, ...}]` |
| OpenAI Agents SDK | ✅ | ✅ | ✅ | `MCPServerStdio` / `MCPServerStreamableHttp` / `MCPServerSse` |
| Cursor | ✅ | ✅ | ⚠️ compat | `.cursor/mcp.json` |
| VS Code | ✅ | ✅ | ⚠️ compat | Built-in client for Copilot Chat |
| Dify | ✅ | ✅ | — | Both MCP client and MCP server |

Takeaways:

- **stdio is the de facto standard for local development.**
- **Streamable HTTP is the default for remote access.**
- Legacy SSE should be a compatibility layer only.

### Claude Code quick reference

```bash
claude mcp add notes -- python /abs/path/server.py
claude mcp add --transport http ops https://mcp.example.com/mcp
claude mcp add --scope project notes -- npx -y @your/notes-mcp
/mcp
```

| Scope | Stored in | Good for |
| --- | --- | --- |
| local | User config, current project | Personal experiments |
| project | `.mcp.json` | Team-shared toolchains |
| user | User config, all projects | Personal utilities |

## SDKs

| Language | Package | High-level API | Best for |
| --- | --- | --- | --- |
| Python | `mcp` (v2) | `MCPServer`, `Client` | Data / AI backends |
| TypeScript | `@modelcontextprotocol/server`, `/client`, `/node` | `McpServer`, `serveStdio`, `createMcpHandler` | Web teams, edge runtimes |
| Java | `io.modelcontextprotocol:mcp` | Annotation-based server | Enterprise Java |
| Kotlin | `io.modelcontextprotocol:kotlin-sdk` | DSL | Android / server |
| C# | `ModelContextProtocol` | `McpServerBuilder` | .NET |
| Go / Rust | Community SDKs | Varies | Performance, single binary |

Python v2:

```python
from mcp.server import MCPServer   # successor to FastMCP

mcp = MCPServer("demo", version="0.1.0")

@mcp.tool()
def ping() -> dict[str, str]:
    """Return pong."""
    return {"status": "pong"}

mcp.run(transport="streamable-http", host="127.0.0.1", port=8000, stateless_http=True)
```

TypeScript v2 splits server, client, and Node adapters into separate packages.

## Agent frameworks

| Framework | Integration | Notes |
| --- | --- | --- |
| LangChain / LangGraph | `MCPAdapter` from `langchain[mcp]` (1.4+) | Converts MCP tools into LangChain tools |
| OpenAI Agents SDK | Built-in server classes | Hosted and local servers |
| CrewAI | `MCPServerAdapter` | Context-manager style |
| Dify | MCP client node + publish app as MCP | Low-code, bidirectional |
| Custom agent | SDK `Client` | Most control, most work |

## Registry and discovery

The official MCP Registry is in preview. Its core artifact is `server.json`:

```json
{
  "$schema": "https://static.modelcontextprotocol.io/schemas/2025-12-11/server.schema.json",
  "name": "io.github.yuxinrun/notes-mcp",
  "description": "Local markdown notes over MCP",
  "version": "0.1.0",
  "packages": [
    {
      "registryType": "npm",
      "identifier": "@yuxinrun/notes-mcp",
      "version": "0.1.0",
      "transport": { "type": "stdio" }
    }
  ]
}
```

```bash
mcp-publisher login github
mcp-publisher publish
```

Namespaces usually bind to a GitHub identity (`io.github.<username>/...`). Enterprises often run a private registry instead; see [Private Skill Hub](/en/hub/skill-hub).

## Selection checklist

- [ ] The host supports the target transport and has been tested end to end.
- [ ] Remote services use OAuth 2.1 with audience validation.
- [ ] Tool count is bounded; long-tail tools are discoverable on demand.
- [ ] A single error contract exists.
- [ ] Logs, traces, and audit can identify the tenant and tool call.
- [ ] Registry metadata (name, version, transport, permissions) is machine-readable.

## References

- [MCP documentation](https://modelcontextprotocol.io/)
- [Claude Code MCP](https://docs.anthropic.com/en/docs/claude-code/mcp)
- [OpenAI Agents SDK — MCP](https://openai.github.io/openai-agents-python/mcp/)
- [LangChain MCP](https://docs.langchain.com/oss/python/langchain/mcp)
- [CrewAI MCP](https://docs.crewai.com/en/mcp/overview)
- [Dify MCP](https://docs.dify.ai/)
