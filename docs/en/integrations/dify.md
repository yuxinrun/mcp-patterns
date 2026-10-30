---
title: Dify
description: Bidirectional integration — call MCP tools from Dify workflows, or publish a Dify app as an MCP server.
---

# Dify

Dify and MCP work in **both directions**:

| Direction | Dify's role | Use it for |
| --- | --- | --- |
| Outbound | MCP client | Call external MCP tools in workflows / agents |
| Inbound | MCP server | Expose a Dify app to Claude, Cursor, and other hosts |

These solve different problems and can be used at the same time.

## Direction 1: Dify calls MCP

### Setup

1. Add an MCP service under **Tools** in Dify.
2. Fill in the endpoint and transport:
   - Remote: `https://mcp.example.com/mcp` with Streamable HTTP.
   - Local: stdio command + args (the Dify runtime must be able to spawn processes).
3. Configure auth: static headers, API key, or OAuth, depending on your Dify version and deployment.
4. Save, then drag the MCP tool node into a workflow.

### Workflow example

```text
[Start]
   ↓
[MCP tool: search_tickets]
   ↓ params: query={{start.query}}, status="open"
[LLM: summarize tickets]
   ↓
[End]
```

When referencing tool output in an LLM node, trim it first:

```text
Here are the ticket search results (JSON):
{{#mcp_search_tickets.result#}}

Extract the three most urgent tickets and output:
- ticket id
- one-line problem description
- suggested owner
```

The model doesn't need the full JSON, only key fields. If a tool returns too much, shape it on the MCP server instead of asking the model to ignore parts.

### Authentication

| Scenario | Method |
| --- | --- |
| Internal service | Static header + network isolation |
| SaaS | OAuth 2.1 (Dify acts as the MCP client) |
| Machine-to-machine | API key with a short TTL |

Don't put long-lived tokens into workflow nodes. Use Dify's environment variables / credential store and rotate regularly.

## Direction 2: publish a Dify app as an MCP server

Dify can expose an app as an MCP server:

1. Open the app → **Access Point**.
2. Find the **MCP Service** card.
3. Enable it; Dify generates a unique URL.
4. Put that URL into your host's MCP config.

Cursor example:

```json
{
  "mcpServers": {
    "dify-research": {
      "url": "https://<your-dify-app-mcp-url>"
    }
  }
}
```

Claude Desktop adds the same URL through Integrations.

::: danger The URL is the credential
The MCP URL Dify generates embeds authentication and is equivalent to an API key:

- Never commit it or paste it into tickets.
- If leaked, regenerate it in Dify; the old URL stops working immediately.
- Restrict source IPs / networks in production where supported.
:::

### Which apps fit

| App type | Fit | Why |
| --- | --- | --- |
| Knowledge-base Q&A | ✅ | Stable input/output, naturally tool-shaped |
| Fixed workflow | ✅ | Clear parameters, predictable results |
| Open-ended agent | ⚠️ | Non-deterministic; limit tools and timeouts |
| High-risk operations | ❌ | Needs human approval and fine-grained permissions |

Design the app like a public API before publishing:

- Define input parameters and types.
- Cap execution time.
- Return structured results, not long prose.
- Use stable error codes.
- Log calls and usage.

## Bidirectional architecture

```text
Claude / Cursor
      │  MCP (Streamable HTTP)
      ▼
Dify App (as MCP server)
      │  inside the workflow
      ▼
MCP client node ──▶ internal MCP server (database / tickets / deploy)
```

This fits when:

- Dify orchestrates the business process.
- You need existing MCP capabilities inside that process.
- You want the whole process exposed as one tool to an IDE.

The chain is longer, so propagate timeouts and errors at every layer. Don't let the outermost caller see only "unknown error".

## Timeouts and streaming

| Layer | Recommendation |
| --- | --- |
| Host → Dify | 60s or more, adjusted to the task |
| Dify workflow | Per-node timeout plus a global cap |
| Dify → MCP server | 10–30s; progress for long tasks |
| MCP server → downstream | Separate connect / read timeouts |

If the host supports SSE, keep streaming through the middle layers; otherwise long tasks get buffered or time out at the gateway.

## Observability

Correlate logs across three layers:

```text
Host request id
  └─ Dify workflow run id
       └─ MCP trace_id
            └─ downstream request id
```

You should be able to answer:

- Which app and version was called?
- Which node was slowest?
- Was the failure inside Dify, the MCP transport, or a downstream API?
- Which tenant or user triggered it?

## Common issues

| Symptom | Cause | Fix |
| --- | --- | --- |
| Empty tool list | Wrong URL / transport | Verify the endpoint with Inspector |
| 401 | Header / OAuth misconfigured | Check token and audience |
| Workflow times out | Slow sequential nodes | Split nodes, cache, raise timeouts |
| Host gets no result | An intermediary buffers SSE | Disable proxy buffering |
| Published URL stops working | It was regenerated | Update host config |
| Truncated results | Payload too large | Paginate / shape on the server |

## Security checklist

- [ ] The MCP URL is managed as a secret, never in the repo.
- [ ] Outbound MCP uses dedicated least-privilege credentials.
- [ ] Workflow inputs are validated; user input is never concatenated into tool params.
- [ ] High-risk actions have a human approval node.
- [ ] Per-execution time and result size are capped.
- [ ] Calls are logged and searchable by tenant.
- [ ] Credentials rotate, and can be revoked quickly after a leak.

## Next

- [LangGraph](/en/integrations/langgraph)
- [CrewAI](/en/integrations/crewai)
- [Auth & permissions](/en/engineering/auth)
