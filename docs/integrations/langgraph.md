---
title: LangGraph / LangChain 对接
description: 用 MCPAdapter 把 MCP 工具接进 LangChain Agent 与 LangGraph 图。
---

# LangGraph / LangChain 对接

LangChain 从 1.4 起内置了 MCP 支持：`langchain[mcp]` 提供 `MCPAdapter`，替代了旧的独立包 `langchain-mcp-adapters` 与 `MultiServerMCPClient`。适配器把 MCP 工具转换成 LangChain Tool，可以直接交给 `create_agent` 或挂进 LangGraph 图。

::: warning Beta
`MCPAdapter` 仍标记为 beta，API 可能小幅调整。生产环境请锁定版本，并保留一层薄封装。
:::

## 安装

```bash
pip install -U "langchain[mcp]"
```

## 最小示例

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

要点：

- `MCPAdapter` 是**异步上下文管理器**，退出时会关闭连接。
- `list_tools()` 返回 LangChain 工具，可直接放进 `tools=`。
- 连接在 `async with` 期间保持；不要在退出后继续使用工具。

## 连接远程 Server

```python
async with MCPAdapter("https://mcp.example.com/mcp") as adapter:
    tools = await adapter.list_tools()
    agent = create_agent("openai:gpt-5", tools)
```

需要静态 header 或自定义 OAuth 时，可以先构造底层客户端再交给适配器：

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

生产环境优先使用 OAuth，不要把长期 token 写进代码或配置文件。

## 多 Server 组合

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

工具会合并成一个列表。注意：

- 不同 Server 的工具重名时，行为取决于适配器；最好在 Server 侧加领域前缀。
- 工具越多，上下文越大。按 Agent 职责只加载需要的 Server。
- 每个 Server 的鉴权独立配置，不要共用一套高权限凭据。

## 接进 LangGraph

`create_agent` 本身就是编译后的 LangGraph 图。如果需要自定义流程，可以把 Agent 作为一个节点：

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
        # 在这里做租户校验、配额检查、审计
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

适合放进图的环节：

| 节点 | 作用 |
| --- | --- |
| `guard` | 租户、配额、权限前置检查 |
| `load_context` | 读取 Skill / 文档，裁剪上下文 |
| `agent` | 调用模型与工具 |
| `review` | 对高风险结果做二次校验 |
| `audit` | 写审计日志、指标 |

## 工具过滤

不要把所有工具都交给模型。按角色裁剪：

```python
READ_ONLY = {"search_notes", "read_note", "list_tables", "describe_table"}

async def tools_for(adapter: MCPAdapter, role: str):
    tools = await adapter.list_tools()
    if role == "viewer":
        return [tool for tool in tools if tool.name in READ_ONLY]
    return tools
```

更彻底的做法是在 MCP Server 侧按 scope 隐藏工具，而不是只在客户端过滤。客户端过滤只是体验优化，不是安全边界。

## 中间件

LangChain 的 `@wrap_tool_call` 可以拦截每一次工具调用，适合做：

- 统一超时与重试。
- 记录耗时、参数摘要、结果大小。
- 高危工具人工确认。
- 把 `isError` 转成模型能理解的提示。

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

具体导入路径以当前 LangChain 版本为准；核心是「所有工具调用都经过同一个入口」。

## 常见问题

| 现象 | 原因 | 修复 |
| --- | --- | --- |
| 工具列表为空 | Server 启动失败 / stdio 污染 | 用 Inspector 先验证 |
| 调用超时 | 默认超时太短 | 配置工具超时或 Server 侧分页 |
| 认证失败 | 远程 Server 需要 OAuth | 使用支持 OAuth 的客户端配置 |
| 上下文过大 | 工具太多 / 返回太大 | 过滤工具、裁剪结果 |
| 退出后仍报连接错误 | 在 `async with` 外使用工具 | 把 Agent 调用放进上下文内 |

## 生产建议

- **锁定版本**：`langchain[mcp]` 仍在演进。
- **一层薄封装**：把 `MCPAdapter` 包在自己的工厂函数里，未来替换成本低。
- **按 Agent 拆分 Server**：不要一个 Agent 连接所有 MCP。
- **超时与重试在工具层做**，不要只依赖 LangChain 默认值。
- **记录 trace**：把 MCP 的 `trace_id` 与 LangGraph 的 run id 关联。
- **高危工具加人工确认**，不要只靠提示词约束。

## 下一步

- [CrewAI 对接](/integrations/crewai)
- [Dify 对接](/integrations/dify)
- [工具设计模式](/server/tool-design)
