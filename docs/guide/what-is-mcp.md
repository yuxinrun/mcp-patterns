---
title: 什么是 MCP
description: 用后端工程师的视角理解 Model Context Protocol：角色、消息、原语与传输层。
---

# 什么是 MCP

MCP（Model Context Protocol）是一个让 **AI 应用调用外部能力** 的开放协议。它把「模型要用的工具、数据、提示模板」抽象成标准接口，让 Host（Claude Code、Cursor、Dify 等）不必为每个数据源写一套私有插件。

一句话理解：

> **MCP 是 AI 世界的 USB-C 接口。** Host 是电脑，Server 是外设，Client 是那根协议转换线。

## 三个角色

<McpArch />

| 角色 | 职责 | 典型实现 |
| --- | --- | --- |
| Host | 面向用户的 AI 应用，决定何时调用工具、如何展示结果 | Claude Code、Cursor、Claude Desktop、Dify |
| Client | 协议实现，负责握手、请求路由、传输管理 | SDK 内置，一般不用自己写 |
| Server | 暴露 tools / resources / prompts 的服务端 | 你写的代码 |

一个 Host 可以同时连接多个 Server。每个连接由一个 Client 负责，彼此隔离。**权限、配额、审计都应该在 Server 侧做**，因为 Host 不受你控制。

## 消息长什么样

MCP 使用 JSON-RPC 2.0。所有交互都是请求、响应、通知三种消息：

```json
{"jsonrpc":"2.0","id":1,"method":"tools/list","params":{}}
```

```json
{"jsonrpc":"2.0","id":1,"result":{"tools":[{"name":"add","inputSchema":{"type":"object"}}]}}
```

调用工具：

```json
{"jsonrpc":"2.0","id":2,"method":"tools/call","params":{"name":"add","arguments":{"a":1,"b":2}}}
```

没有 `id` 的是通知（notification），不需要响应，例如 `notifications/initialized`。

### 握手与版本

传统流程是 `initialize` → `initialized` 通知。2026-07-28 修订版引入了无状态模式：客户端可以在每个请求的 `_meta` 中携带协议版本与能力，服务端通过 `server/discover` 暴露自己的能力，不再依赖长连接会话。

<SpecTimeline />

工程上的含义很直接：

- **新项目按当前稳定规范实现**，不要照抄几年前的教程。
- 需要兼容老客户端时，保留 `initialize` 路径，但把新路径作为默认。
- 客户端与服务端要显式校验版本，不要假设对方支持某个字段。

## 三种原语

| 原语 | 谁控制 | 用途 | 例子 |
| --- | --- | --- | --- |
| Tools | 模型决定调用 | 执行动作、查询数据 | `search_notes`、`run_query` |
| Resources | 应用决定加载 | 提供上下文数据 | `notes://index`、`file:///README.md` |
| Prompts | 用户主动选择 | 预置提示模板 | `summarize_note`、`review_code` |

选择原则：

- **会产生副作用或需要参数** → Tool
- **只读、可被应用直接挂载** → Resource
- **希望用户点一下就用** → Prompt

三者不是互斥的。同一个笔记系统可以同时提供 `read_note` 工具、`notes://` 资源和 `summarize_note` 提示。

## 传输层

| 传输 | 形态 | 适用场景 | 状态 |
| --- | --- | --- | --- |
| stdio | 子进程 stdin/stdout，按行 JSON-RPC | 本地工具、IDE 插件 | 稳定 |
| Streamable HTTP | 单个 `/mcp` 端点，POST + 可选 SSE 流 | 远程服务、多客户端 | 推荐 |
| HTTP+SSE（旧） | `/sse` + `/messages` 两个端点 | 兼容 2024 年老客户端 | 已弃用 |

选型只需要问三个问题：

1. 工具是否需要访问用户本机文件或进程？→ stdio
2. 是否需要登录、多租户、水平扩容？→ Streamable HTTP
3. 是否必须兼容只支持旧 SSE 的客户端？→ 单独保留兼容端点，不要作为主路径

更细的对比见 [stdio Server Demo](/server/stdio) 与 [HTTP / SSE Server Demo](/server/http-sse)。

## 一次完整调用

以本项目 `examples/python-stdio` 为例：

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

Server 侧只需要注册能力，剩下的握手、分页、取消、进度都由 SDK 处理：

```python
from mcp.server import MCPServer

mcp = MCPServer("notes", version="0.1.0")

@mcp.tool()
def search_notes(query: str, limit: int = 5) -> dict[str, object]:
    """Search local markdown notes for a keyword."""
    ...

if __name__ == "__main__":
    mcp.run()  # 默认 stdio
```

## 常见误解

::: warning 三个容易踩的坑
1. **MCP 不是模型协议。** 它不训练模型，也不决定模型怎么推理；它只负责把能力以标准方式暴露给 Host。
2. **MCP Server 不是 Web API。** 工具描述、输入 schema、错误语义都会直接进入模型上下文，设计方式更像「给模型看的 CLI」。
3. **stdio 的 stdout 不是日志通道。** 任何 `print` 都可能破坏 JSON-RPC 流，日志必须写 stderr。
:::

## 下一步

- 分不清 MCP、Skill、Agent？看 [MCP vs Skill vs Agent](/guide/mcp-vs-skill-agent)
- 想立刻跑起来？看 [stdio Server Demo](/server/stdio)
- 想了解各家支持情况？看 [生态地图 2026](/ecosystem/landscape)
