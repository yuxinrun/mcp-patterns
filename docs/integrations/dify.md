---
title: Dify 对接
description: 双向互通：在 Dify 工作流里调用 MCP 工具，或把 Dify 应用发布成 MCP Server。
---

# Dify 对接

Dify 与 MCP 是**双向**的：

| 方向 | Dify 的角色 | 用途 |
| --- | --- | --- |
| 出站 | MCP Client | 在工作流 / Agent 中调用外部 MCP 工具 |
| 入站 | MCP Server | 把 Dify 应用暴露给 Claude、Cursor 等 Host |

这两条路径解决不同问题，可以同时使用。

## 方向一：Dify 调用 MCP

### 配置步骤

1. 在 Dify 的「工具」里添加 MCP 服务。
2. 填写端点与传输方式：
   - 远程：`https://mcp.example.com/mcp`，传输选 Streamable HTTP。
   - 本地：stdio 命令 + 参数（需要 Dify 运行环境能启动子进程）。
3. 配置认证：静态 header、API key 或 OAuth（取决于 Dify 版本与部署方式）。
4. 保存后，在工作流中拖入 MCP 工具节点。

### 工作流示例

```text
[开始]
   ↓
[MCP 工具：search_tickets]
   ↓ 参数：query={{start.query}}, status="open"
[LLM：总结工单]
   ↓
[结束]
```

在 LLM 节点里引用工具输出时，建议先做一次裁剪：

```text
以下是工单搜索结果（JSON）：
{{#mcp_search_tickets.result#}}

请提取最紧急的 3 个工单，输出：
- 工单号
- 一句话问题描述
- 建议负责人
```

模型不需要看到完整 JSON，只需要关键字段。如果工具返回很大，优先在 MCP Server 侧裁剪，而不是靠提示词要求模型忽略。

### 认证

| 场景 | 方式 |
| --- | --- |
| 内网服务 | 静态 header + 网络隔离 |
| SaaS | OAuth 2.1（Dify 作为 MCP Client 完成授权） |
| 机器对机器 | API key + 短 TTL |

不要把长期 token 写进工作流节点。使用 Dify 的环境变量 / 凭据管理，并定期轮换。

## 方向二：把 Dify 应用发布成 MCP Server

Dify 支持把应用作为 MCP Server 暴露：

1. 打开应用 → **访问点（Access Point）**。
2. 找到 **MCP 服务** 卡片。
3. 启用后，Dify 生成一个唯一 URL。
4. 把这个 URL 填进 Host 的 MCP 配置。

Cursor 示例：

```json
{
  "mcpServers": {
    "dify-research": {
      "url": "https://<your-dify-app-mcp-url>"
    }
  }
}
```

Claude Desktop 通过 Integrations 添加同一个 URL。

::: danger URL 就是凭据
Dify 生成的 MCP URL 内含身份验证信息，等同于 API key：

- 不要提交到 Git、不要贴进工单。
- 泄露后立即在 Dify 中重新生成，旧 URL 会立刻失效。
- 生产环境限制可访问的 IP / 网络范围（如果部署支持）。
:::

### 适合发布成 MCP 的应用

| 应用类型 | 适合度 | 原因 |
| --- | --- | --- |
| 知识库问答 | ✅ | 输入输出稳定，天然适合工具化 |
| 固定流程工作流 | ✅ | 参数明确，结果可预期 |
| 开放式 Agent | ⚠️ | 行为不确定，需限制工具与超时 |
| 高风险操作 | ❌ | 需要人工审批与细粒度权限 |

发布前把应用当成「对外 API」来设计：

- 明确输入参数与类型。
- 限制单次执行时间。
- 返回结构化结果，而不是大段自然语言。
- 对失败给出稳定错误码。
- 记录调用日志与用量。

## 双向组合的架构

```text
Claude / Cursor
      │  MCP (Streamable HTTP)
      ▼
Dify App（作为 MCP Server）
      │  工作流内部
      ▼
MCP Client 节点 ──▶ 内部 MCP Server（数据库 / 工单 / 发布）
```

这种结构适合：

- 用 Dify 编排业务流程。
- 把已有 MCP 能力接进流程。
- 再把整个流程作为一个工具暴露给 IDE。

注意链路会变长，超时与错误要逐层传递，不要让最外层只看到「未知错误」。

## 超时与流式

| 层级 | 建议 |
| --- | --- |
| Host → Dify | 60s 以上，按业务调整 |
| Dify 工作流 | 节点级超时 + 全局上限 |
| Dify → MCP Server | 10–30s，长任务用进度 |
| MCP Server → 下游 | connect / read 分开设置 |

如果 Host 支持 SSE，尽量让中间层保持流式；否则长任务会被网关缓冲或超时。

## 观测

需要串联三层日志：

```text
Host request id
  └─ Dify workflow run id
       └─ MCP trace_id
            └─ 下游 request id
```

至少要能回答：

- 哪个应用、哪个版本被调用？
- 哪个节点最慢？
- 失败是 Dify 内部、MCP 传输，还是下游 API？
- 哪个租户 / 用户触发了调用？

## 常见问题

| 现象 | 原因 | 修复 |
| --- | --- | --- |
| 工具列表为空 | URL / 传输方式错误 | 用 Inspector 验证端点 |
| 401 | header / OAuth 配置错误 | 检查 token 与 audience |
| 工作流超时 | 节点串行太慢 | 拆节点、加缓存、调超时 |
| Host 收不到结果 | 中间层缓冲了 SSE | 关闭代理缓冲 |
| 发布后 URL 失效 | 重新生成过 | 更新 Host 配置 |
| 结果被截断 | 返回内容过大 | Server 侧分页 / 裁剪 |

## 安全清单

- [ ] MCP URL 按密钥管理，不进入代码仓库。
- [ ] 出站 MCP 使用独立凭据，最小权限。
- [ ] 工作流对输入做校验，不直接把用户输入拼进工具参数。
- [ ] 高风险操作有人工确认节点。
- [ ] 限制单次执行时间与结果大小。
- [ ] 记录调用日志，可按租户检索。
- [ ] 定期轮换凭据，泄露时可快速吊销。

## 下一步

- [LangGraph 对接](/integrations/langgraph)
- [CrewAI 对接](/integrations/crewai)
- [鉴权与权限控制](/engineering/auth)
