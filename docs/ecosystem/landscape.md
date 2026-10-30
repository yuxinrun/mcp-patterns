---
title: 生态地图 2026
description: Host、SDK、框架与注册表：MCP 生态的分层视图和选型建议。
---

# 生态地图 2026

MCP 生态可以按四层看：**Host（谁在连）→ SDK（怎么连）→ 框架（谁在编排）→ 注册表（去哪找）**。这一页只讲工程上真正需要知道的部分，不追求大而全。

::: tip 时效性
协议与 SDK 迭代很快。本文基于 2026 年中的公开资料，代码以各项目当前文档为准。
:::

## 一层：Host / Client

| 产品 | stdio | Streamable HTTP | 旧版 SSE | 备注 |
| --- | --- | --- | --- | --- |
| Claude Code | ✅ | ✅ | ⚠️ 兼容 | `claude mcp add`，支持 local / project / user 三种作用域 |
| Claude Desktop | ✅ | ✅ | ⚠️ 兼容 | 配置文件添加 Server，OAuth 走系统浏览器 |
| Claude API（Connectors） | — | ✅ | — | 远程 MCP，由 Anthropic 侧发起连接 |
| OpenAI Responses API | — | ✅ | — | `tools: [{type: "mcp", server_url, ...}]` |
| OpenAI Agents SDK | ✅ | ✅ | ✅ | `MCPServerStdio` / `MCPServerStreamableHttp` / `MCPServerSse` |
| Cursor | ✅ | ✅ | ⚠️ 兼容 | `.cursor/mcp.json`，适合本地开发工具 |
| VS Code | ✅ | ✅ | ⚠️ 兼容 | 内置 MCP 客户端，Copilot Chat 可调用 |
| Dify | ✅ | ✅ | — | 既能作为 MCP Client，也能把应用发布成 MCP Server |

工程含义：

- **stdio 是本地开发的事实标准**，几乎所有 Host 都支持。
- **Streamable HTTP 是远程接入的默认选择**，新 Host 基本只实现这一条。
- 旧版 SSE 只应作为兼容层存在，不要为新项目增加维护成本。

### Claude Code 速查

```bash
# 本地 stdio server
claude mcp add notes -- python /abs/path/server.py

# 远程 Streamable HTTP
claude mcp add --transport http ops https://mcp.example.com/mcp

# 项目级配置（写入 .mcp.json，可提交到仓库）
claude mcp add --scope project notes -- npx -y @your/notes-mcp

# 在会话里查看连接状态、完成 OAuth
/mcp
```

作用域选择：

| 作用域 | 存储位置 | 适合 |
| --- | --- | --- |
| local | 用户级、仅当前项目 | 个人实验、临时调试 |
| project | `.mcp.json` | 团队共享的工具链 |
| user | 用户级、所有项目 | 个人常用工具 |

## 二层：SDK

| 语言 | 包 | 高层 API | 适合 |
| --- | --- | --- | --- |
| Python | `mcp`（v2） | `MCPServer`、`Client` | 数据 / AI 后端，开发最快 |
| TypeScript | `@modelcontextprotocol/server`、`/client`、`/node` | `McpServer`、`serveStdio`、`createMcpHandler` | Web 团队、边缘运行时 |
| Java | `io.modelcontextprotocol:mcp` | 注解式 Server | 企业 Java 服务 |
| Kotlin | `io.modelcontextprotocol:kotlin-sdk` | DSL | Android / 服务端 |
| C# | `ModelContextProtocol` | `McpServerBuilder` | .NET 生态 |
| Go / Rust | 社区 SDK | 各自风格 | 性能敏感、单二进制分发 |

Python v2 的关键变化：

```python
from mcp.server import MCPServer   # 不再是 FastMCP

mcp = MCPServer("demo", version="0.1.0")

@mcp.tool()
def ping() -> dict[str, str]:
    """Return pong."""
    return {"status": "pong"}

mcp.run(transport="streamable-http", host="127.0.0.1", port=8000, stateless_http=True)
```

TypeScript v2 拆成了多个包，服务端与客户端可以分别安装；Node 适配层单独放在 `@modelcontextprotocol/node`。

## 三层：Agent 框架

| 框架 | 接入方式 | 特点 |
| --- | --- | --- |
| LangChain / LangGraph | `langchain[mcp]` 的 `MCPAdapter`（1.4+） | 把 MCP 工具转成 LangChain Tool，可挂进图 |
| OpenAI Agents SDK | 内置 MCP Server 类 | 托管工具（HostedMCPTool）与本地进程都支持 |
| CrewAI | `MCPServerAdapter` | 上下文管理器式接入，团队 / 任务编排 |
| Dify | MCP Client 节点 + 应用发布为 MCP Server | 低代码工作流，双向互通 |
| 自研 Agent | 直接使用 SDK `Client` | 控制力最强，成本最高 |

选型建议：

- **已经在用 LangGraph** → 用 `MCPAdapter`，不要自己造工具包装层。
- **需要托管执行** → OpenAI Responses API 的远程 MCP。
- **需要可视化编排** → Dify。
- **需要精细控制上下文与重试** → 直接用 `Client`。

具体示例见 [LangGraph](/integrations/langgraph)、[CrewAI](/integrations/crewai)、[Dify](/integrations/dify)。

## 四层：注册与发现

官方 MCP Registry 目前处于预览阶段，核心是一个 `server.json` 清单：

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

发布工具是 `mcp-publisher`：

```bash
mcp-publisher login github
mcp-publisher publish
```

命名空间通常绑定 GitHub 身份（`io.github.<username>/...`），避免抢注。企业内网更适合自建注册表，见 [私有 Skill Hub 与注册发现](/hub/skill-hub)。

## 一张图看清关系

```text
Hosts        Claude Code   Cursor   Dify   OpenAI  自研 Agent
                  \          |       |      /        /
                   \         |       |     /        /
Clients            └──── SDK Client（stdio / Streamable HTTP）────┘
                                     |
Servers              filesystem  database  api-proxy  skill-hub
                                     |
Registry            官方 MCP Registry / 企业私有注册表
```

## 选型清单

上线前建议逐条确认：

- [ ] Host 支持目标传输（stdio / HTTP），版本经过实测。
- [ ] 远程服务已完成 OAuth 2.1 与 audience 校验。
- [ ] 工具数量可控，长尾工具支持按需发现。
- [ ] 有统一的错误结构与重试策略。
- [ ] 日志、trace、审计能定位到具体租户与工具调用。
- [ ] 注册信息（名称、版本、传输、权限）可被机器读取。

## 参考

- [MCP 官方文档](https://modelcontextprotocol.io/)
- [Claude Code MCP 文档](https://docs.anthropic.com/en/docs/claude-code/mcp)
- [OpenAI Agents SDK — MCP](https://openai.github.io/openai-agents-python/mcp/)
- [LangChain MCP 文档](https://docs.langchain.com/oss/python/langchain/mcp)
- [CrewAI MCP 文档](https://docs.crewai.com/en/mcp/overview)
- [Dify MCP 文档](https://docs.dify.ai/)
