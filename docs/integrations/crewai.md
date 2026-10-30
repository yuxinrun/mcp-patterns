---
title: CrewAI 对接
description: 用 MCPServerAdapter 把 MCP 工具加载进 CrewAI 的 Agent 与 Crew。
---

# CrewAI 对接

CrewAI 通过 `crewai_tools` 里的 `MCPServerAdapter` 接入 MCP。适配器是一个上下文管理器：进入时连接 Server、拉取工具，退出时释放连接。

## 安装

```bash
pip install -U crewai crewai-tools mcp
```

## 最小示例（stdio）

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

要点：

- **`tools` 必须在 `with` 块内使用**，退出后连接已关闭。
- 工具名、描述、schema 直接来自 MCP Server，CrewAI 不做二次包装。
- 工具越多，提示词越长；按 Agent 职责裁剪。

## 远程 Server

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

字段名随版本可能略有差异：

- `url`：MCP 端点。
- `transport`：`streamable-http` / `sse`。
- `headers`：静态请求头，适合内部 token。

生产环境不要把长期凭据写进代码。用环境变量或 Secret Manager 注入，并优先使用 OAuth。

## 多 Agent 分工

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

按角色分配工具，比给每个 Agent 全量工具更安全，也更省上下文。

## 任务编排

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

MCP 工具在任务执行时按需调用，CrewAI 负责把结果回填到任务上下文。

## 凭据与租户

CrewAI 常在服务端批量运行，必须显式处理租户：

```python
def adapter_for(tenant: str) -> MCPServerAdapter:
    return MCPServerAdapter({
        "url": "https://mcp.example.com/mcp",
        "transport": "streamable-http",
        "headers": {"Authorization": f"Bearer {token_for(tenant)}"},
    })
```

注意：

- **不要**把租户 ID 放在自定义 header 里让 Server 直接信任；Server 应从 token claim 取。
- 每个 Crew 运行使用独立适配器，避免跨任务复用连接导致上下文串号。
- 记录每次运行使用的租户、Server 版本、工具列表。

## 超时与失败

CrewAI 的默认重试不适合所有工具。建议：

- 在 MCP Server 侧设置工具级超时。
- 对只读工具配置有限重试，对写操作要求幂等键。
- 工具返回 `isError` 时，让 Agent 看到结构化错误，而不是整段堆栈。
- 任务级设置最大执行时间，避免 Crew 卡死。

```python
task = Task(
    description="...",
    expected_output="...",
    agent=reader,
    max_execution_time=120,
)
```

## 观测

至少记录：

- Crew 运行 id 与 MCP `trace_id` 的映射。
- 每个 Agent 调用了哪些工具、耗时、结果大小。
- 工具错误码分布。
- 每次运行使用的 Server 版本。

CrewAI 的 verbose 输出适合开发，不适合生产审计；生产要走结构化日志。

## 常见问题

| 现象 | 原因 | 修复 |
| --- | --- | --- |
| `tools` 为空 | Server 启动失败 | 用 Inspector 验证 |
| 退出 `with` 后调用报错 | 工具绑定已关闭的连接 | 所有调用放进 `with` 内 |
| 远程 401 | 缺少 Bearer token | 配置 headers / OAuth |
| Agent 选错工具 | 描述重叠 | 改工具描述，减少数量 |
| 任务超时 | 工具无超时或结果过大 | 服务端超时 + 分页 |

## 生产建议

- 锁定 `crewai` / `crewai-tools` / `mcp` 版本。
- 为每个 Crew 建立独立的工具白名单。
- 高风险工具不要交给无人值守的 Crew。
- 在 Server 侧做真正的权限与租户校验，客户端过滤只是辅助。
- 把 MCP 错误映射成 Crew 能理解的提示，避免 Agent 反复重试。

## 下一步

- [LangGraph 对接](/integrations/langgraph)
- [Dify 对接](/integrations/dify)
- [多租户隔离](/engineering/multi-tenant)
