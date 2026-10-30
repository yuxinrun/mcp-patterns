---
title: LangGraph / LangChain
description: Wire MCP tools into LangChain agents and LangGraph graphs with MCPAdapter.
---

# LangGraph / LangChain

Since 1.4, LangChain ships MCP support: `langchain[mcp]` provides `MCPAdapter`, replacing the old standalone `langchain-mcp-adapters` package and `MultiServerMCPClient`. The adapter converts MCP tools into LangChain tools that you can pass to `create_agent` or plug into a LangGraph graph.

::: warning Beta
`MCPAdapter` is still marked beta, and the API may shift slightly. Pin versions in production and keep a thin wrapper.
:::

## Install

```bash
pip install -U "langchain[mcp]"
```

## Minimal example

```python
import asyncio

from langchain.agents import create_agent
from langchain.mcp import MCPAdapter


async def main() -> None:
    config = {
        "mcpServers": {
            "notes": {
                "command": "python",
                "args": ["/abs/path/examples/python-stdio/server.py"],
            }
        }
    }

    async with MCPAdapter(config) as adapter:
        tools = await adapter.list_tools()
        print("tools:", [tool.name for tool in tools])

        agent = create_agent(
            "openai:gpt-5",
            tools,
            system_prompt="You are a notes assistant. Search before reading.",
        )
        result = await agent.ainvoke(
            {"messages": [{"role": "user", "content": "Find notes about transports."}]}
        )
        print(result["messages"][-1].content)


asyncio.run(main())
```

- `MCPAdapter` is an **async context manager**; it closes connections on exit.
- `list_tools()` returns LangChain tools, ready for `tools=`.
- The connection lives for the `async with` block. Don't use the tools after exit.

## Remote servers

```python
async with MCPAdapter("https://mcp.example.com/mcp") as adapter:
    tools = await adapter.list_tools()
    agent = create_agent("openai:gpt-5", tools)
```

For static headers or custom OAuth, construct the underlying client and hand it to the adapter:

```python
from fastmcp.client import Client
from httpx import Auth

client = Client(
    "https://mcp.example.com/mcp",
    headers={"X-Client": "analytics-agent"},
    auth=Auth(),
)

async with MCPAdapter(client) as adapter:
    tools = await adapter.list_tools()
```

Prefer OAuth in production. Don't put long-lived tokens in code or config files.

## Combining multiple servers

```python
config = {
    "mcpServers": {
        "notes": {
            "command": "python",
            "args": ["/abs/path/notes/server.py"],
        },
        "ops": {
            "url": "https://mcp.example.com/mcp",
        },
    }
}

async with MCPAdapter(config) as adapter:
    tools = await adapter.list_tools()
```

Tools are merged into one list. Watch out for:

- Duplicate tool names across servers; behavior depends on the adapter. Prefix names on the server side.
- More tools means more context. Load only the servers an agent needs.
- Each server's auth is configured independently; never share one high-privilege credential.

## Into LangGraph

`create_agent` already compiles to a LangGraph graph. For custom flows, use the agent as a node:

```python
from typing import TypedDict

from langchain.agents import create_agent
from langchain.mcp import MCPAdapter
from langgraph.graph import END, START, StateGraph


class State(TypedDict):
    messages: list
    tenant: str


async def build_graph(adapter: MCPAdapter):
    tools = await adapter.list_tools()
    agent = create_agent("openai:gpt-5", tools)

    async def guard(state: State) -> State:
        # Tenant checks, quota, audit go here.
        if not state.get("tenant"):
            raise ValueError("tenant is required")
        return state

    async def run_agent(state: State) -> State:
        result = await agent.ainvoke({"messages": state["messages"]})
        return {"messages": result["messages"]}

    graph = StateGraph(State)
    graph.add_node("guard", guard)
    graph.add_node("agent", run_agent)
    graph.add_edge(START, "guard")
    graph.add_edge("guard", "agent")
    graph.add_edge("agent", END)
    return graph.compile()


async def main() -> None:
    async with MCPAdapter("https://mcp.example.com/mcp") as adapter:
        graph = await build_graph(adapter)
        result = await graph.ainvoke({
            "tenant": "acme",
            "messages": [{"role": "user", "content": "Summarize open tickets."}],
        })
        print(result["messages"][-1].content)
```

Useful graph nodes:

| Node | Purpose |
| --- | --- |
| `guard` | Tenant, quota, permission pre-checks |
| `load_context` | Read skills / docs, trim context |
| `agent` | Model + tools |
| `review` | Second pass for high-risk results |
| `audit` | Audit logs and metrics |

## Tool filtering

Don't hand every tool to the model. Filter by role:

```python
READ_ONLY = {"search_notes", "read_note", "list_tables", "describe_table"}

async def tools_for(adapter: MCPAdapter, role: str):
    tools = await adapter.list_tools()
    if role == "viewer":
        return [tool for tool in tools if tool.name in READ_ONLY]
    return tools
```

A stronger approach is to hide tools by scope on the MCP server. Client-side filtering is UX, not a security boundary.

## Middleware

LangChain's `@wrap_tool_call` intercepts every tool call. Good for:

- Unified timeout and retry.
- Logging duration, argument summaries, result size.
- Human approval for high-risk tools.
- Turning `isError` into something the model can react to.

```python
from langchain.agents.middleware import wrap_tool_call

@wrap_tool_call
async def audit_tool_call(request, handler):
    start = time.monotonic()
    try:
        response = await handler(request)
        return response
    finally:
        log.info("tool_call", extra={
            "tool": request.name,
            "duration_ms": int((time.monotonic() - start) * 1000),
        })
```

Import paths depend on the LangChain version. The point is that **every tool call goes through one entry point**.

## Common issues

| Symptom | Cause | Fix |
| --- | --- | --- |
| Empty tool list | Server failed to start / stdio pollution | Verify with Inspector first |
| Call times out | Default timeout too short | Configure tool timeout or paginate server-side |
| Auth failure | Remote server needs OAuth | Use an OAuth-capable client |
| Context too large | Too many tools / large results | Filter tools, shape results |
| Connection errors after exit | Tools used outside `async with` | Keep agent calls inside the block |

## Production notes

- **Pin versions**: `langchain[mcp]` is still evolving.
- **Keep a thin wrapper**: wrap `MCPAdapter` in your own factory so replacement is cheap.
- **Split servers per agent**: don't connect every MCP server to every agent.
- **Timeouts and retries at the tool layer**, not just LangChain defaults.
- **Correlate traces**: link the MCP `trace_id` with the LangGraph run id.
- **Human approval for high-risk tools**, not just prompt instructions.

## Next

- [CrewAI](/en/integrations/crewai)
- [Dify](/en/integrations/dify)
- [Tool design patterns](/en/server/tool-design)
