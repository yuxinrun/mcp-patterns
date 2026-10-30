---
title: CrewAI
description: Load MCP tools into CrewAI agents and crews with MCPServerAdapter.
---

# CrewAI

CrewAI connects to MCP through `MCPServerAdapter` in `crewai_tools`. The adapter is a context manager: it connects and fetches tools on enter, and releases the connection on exit.

## Install

```bash
pip install -U crewai crewai-tools mcp
```

## Minimal example (stdio)

```python
from crewai import Agent, Crew, Process, Task
from crewai_tools import MCPServerAdapter
from mcp import StdioServerParameters

params = StdioServerParameters(
    command="python",
    args=["/abs/path/examples/python-stdio/server.py"],
)

with MCPServerAdapter(params) as tools:
    researcher = Agent(
        role="Notes Researcher",
        goal="Find and summarize relevant engineering notes",
        backstory="You search before reading, and cite note names.",
        tools=tools,
        verbose=True,
    )

    task = Task(
        description="Find notes about MCP transports and summarize them in three bullets.",
        expected_output="Three bullet points, each citing a note name.",
        agent=researcher,
    )

    crew = Crew(agents=[researcher], tasks=[task], process=Process.sequential)
    result = crew.kickoff()
    print(result.raw)
```

- **`tools` must be used inside the `with` block**; the connection is closed after exit.
- Tool names, descriptions, and schemas come straight from the MCP server; CrewAI doesn't wrap them again.
- More tools means a longer prompt. Trim by agent responsibility.

## Remote servers

```python
from crewai_tools import MCPServerAdapter

server = {
    "url": "https://mcp.example.com/mcp",
    "transport": "streamable-http",
    "headers": {"X-Client": "research-crew"},
}

with MCPServerAdapter(server) as tools:
    agent = Agent(
        role="Ops Analyst",
        goal="Answer questions using the ops MCP server",
        backstory="You prefer read-only tools and cite tool outputs.",
        tools=tools,
    )
```

Field names can vary slightly by version:

- `url`: the MCP endpoint.
- `transport`: `streamable-http` / `sse`.
- `headers`: static headers, handy for internal tokens.

Don't hardcode long-lived credentials. Inject via env vars or a secret manager, and prefer OAuth.

## Splitting tools across agents

```python
with MCPServerAdapter(params) as all_tools:
    by_name = {tool.name: tool for tool in all_tools}

    reader = Agent(
        role="Reader",
        goal="Read and summarize notes",
        backstory="You only use read-only tools.",
        tools=[by_name["search_notes"], by_name["read_note"]],
    )

    librarian = Agent(
        role="Librarian",
        goal="Organize and maintain the notes collection",
        backstory="You create notes only when explicitly asked.",
        tools=[by_name["search_notes"], by_name["read_note"]],
    )
```

Assigning tools by role is safer and cheaper than giving every agent the full set.

## Task orchestration

```python
from crewai import Crew, Process, Task

research = Task(
    description="Search for notes about authentication.",
    expected_output="A list of note names with one-line summaries.",
    agent=reader,
)

writeup = Task(
    description="Write a short internal guide based on the research.",
    expected_output="A markdown guide under 400 words.",
    agent=librarian,
    context=[research],
)

crew = Crew(
    agents=[reader, librarian],
    tasks=[research, writeup],
    process=Process.sequential,
    verbose=True,
)
```

MCP tools are called during task execution, and CrewAI feeds results back into task context.

## Credentials and tenants

CrewAI often runs server-side in batches, so tenancy must be explicit:

```python
def adapter_for(tenant: str) -> MCPServerAdapter:
    return MCPServerAdapter({
        "url": "https://mcp.example.com/mcp",
        "transport": "streamable-http",
        "headers": {"Authorization": f"Bearer {token_for(tenant)}"},
    })
```

- **Never** put a tenant id in a custom header and have the server trust it; read the tenant from a token claim.
- One adapter per crew run, so connections don't leak context across tasks.
- Record the tenant, server version, and tool list for every run.

## Timeouts and failures

CrewAI's default retries don't fit every tool. Prefer:

- Tool-level timeouts on the MCP server.
- Bounded retries for read-only tools; idempotency keys for writes.
- Structured `isError` responses instead of raw stack traces.
- A task-level maximum execution time.

```python
task = Task(
    description="...",
    expected_output="...",
    agent=reader,
    max_execution_time=120,
)
```

## Observability

At minimum, record:

- Mapping from crew run id to MCP `trace_id`.
- Which tools each agent called, duration, result size.
- Error code distribution.
- Server versions used per run.

CrewAI's verbose output is fine for development, not for production audit. Use structured logs.

## Common issues

| Symptom | Cause | Fix |
| --- | --- | --- |
| Empty `tools` | Server failed to start | Verify with Inspector |
| Errors after leaving `with` | Tools bound to a closed connection | Keep all calls inside `with` |
| Remote 401 | Missing bearer token | Configure headers / OAuth |
| Agent picks the wrong tool | Overlapping descriptions | Rewrite descriptions, reduce count |
| Task times out | No tool timeout or huge results | Server timeouts + pagination |

## Production notes

- Pin `crewai` / `crewai-tools` / `mcp`.
- Give each crew its own tool allowlist.
- Don't hand high-risk tools to unattended crews.
- Enforce permissions and tenancy on the server; client filtering is only a convenience.
- Map MCP errors to something the crew can act on, so agents don't retry in a loop.

## Next

- [LangGraph](/en/integrations/langgraph)
- [Dify](/en/integrations/dify)
- [Multi-tenancy](/en/engineering/multi-tenant)
