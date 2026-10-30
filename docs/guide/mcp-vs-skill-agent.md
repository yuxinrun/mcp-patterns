---
title: MCP vs Skill vs Agent
description: 工具、操作手册与执行者：三层能力模型，以及什么时候该写 MCP、什么时候该写 Skill。
---

# MCP vs Skill vs Agent

这三个词经常被混着用，但它们解决的不是同一个问题。

| 概念 | 是什么 | 谁在执行 | 典型形态 |
| --- | --- | --- | --- |
| MCP Server | **能力接口**：函数、数据、提示模板 | 外部进程 / 服务 | `tools/call`、`resources/read` |
| Agent Skill | **操作手册**：告诉 Agent 何时、按什么步骤做事 | 模型 + 已有工具 | `SKILL.md` + 脚本 |
| Agent | **执行者**：规划、调用工具、维护状态 | Host 内的循环 | Claude Code、LangGraph 图 |

一个类比：

> **MCP 是手，Skill 是操作手册，Agent 是干活的人。**
> 手能拧螺丝，但「先断电、再拆壳、最后测电压」写在手册里。

## 三层模型

```text
┌─────────────────────────────────────────────┐
│ Agent（规划 / 记忆 / 循环）                  │
│  ┌───────────────────────────────────────┐  │
│  │ Skill（流程知识 / 检查清单 / 脚本）     │  │
│  │  ┌─────────────────────────────────┐  │  │
│  │  │ MCP Tools（原子能力）            │  │  │
│  │  └─────────────────────────────────┘  │  │
│  └───────────────────────────────────────┘  │
└─────────────────────────────────────────────┘
```

- **MCP 解决「能力从哪来」**：把文件系统、数据库、SaaS API 变成统一接口。
- **Skill 解决「怎么用才对」**：把团队经验、步骤、边界条件写下来。
- **Agent 解决「什么时候做什么」**：根据目标选择 Skill 和 Tool，处理失败与回退。

## 什么时候写 MCP

写 MCP Server 的信号：

- 某个能力会被**多个 Host**（Claude Code、Cursor、Dify、自研 Agent）复用。
- 需要**统一鉴权、审计、限流**，不能把密钥散落在每个 Agent 里。
- 数据在**远程服务**，需要多租户隔离。
- 希望能力有**稳定的 schema 和版本**，而不是靠提示词约定。

不适合写 MCP 的情况：

- 一次性脚本，只有当前 Agent 会用。
- 只是给模型补充领域知识（用 Skill 或直接放 prompt）。
- 没有稳定接口，需求每天都在变。

## 什么时候写 Skill

Skill 适合承载「**程序性知识**」：

- 发布流程：跑测试 → 构建 → 打 tag → 写 changelog。
- 代码审查清单：安全检查、错误处理、性能红线。
- 公司规范：分支命名、提交格式、灰度策略。
- 一组固定脚本的组合调用方式。

Skill 的核心是 `SKILL.md`：

```markdown
---
name: release-checklist
description: Run the release checklist for this repository.
---

# Release checklist

1. Run `pnpm test` and `pnpm build`.
2. Check `git status` is clean.
3. Bump the version with `npm version patch`.
4. Push the tag and wait for CI.
5. Verify the deployed health endpoint.

Do not skip step 2. If tests fail, stop and report the failing test.
```

Agent 启动时只加载 `name` 与 `description`（渐进披露），真正需要时才读全文。这让几十个 Skill 共存也不会撑爆上下文。

## 两者怎么配合

最常见的组合：

| 场景 | MCP 提供 | Skill 提供 |
| --- | --- | --- |
| 发布系统 | `deploy_service`、`get_release_status` | 发布前检查清单、回滚步骤 |
| 数据分析 | `run_sql`、`list_tables` | 指标口径、常用查询模板 |
| 客服工单 | `search_tickets`、`update_ticket` | 升级路径、回复话术 |
| 代码库维护 | `read_file`、`run_tests` | 重构流程、提交规范 |

**Skills over MCP** 是这两层的进一步融合：把 Skill 也作为一种 MCP 资源暴露，由服务端统一分发和版本管理。目前仍是草案（SEP-2640），但方向很明确——能力与流程都从中心化注册表下发。

## 上下文预算：为什么不能把所有工具都塞给模型

Anthropic 在「Code execution with MCP」中给过一个数字：把大量工具定义直接放进上下文，可能占用 **150k tokens**；改成「按需发现 + 代码执行」后降到 **约 2k tokens**，减少 **98.7%**。

工程启示：

1. **工具要分层**：常用工具直接暴露，长尾工具通过 `search_tools` 发现。
2. **描述要短**：一句话说清用途、边界、返回结构。
3. **Skill 负责流程**，不要把流程写进每个工具描述里。
4. **大结果不要回传原文**，返回摘要 + 可继续查询的句柄。

## 一张决策表

| 你的需求 | 选择 |
| --- | --- |
| 让模型读写文件 | MCP Tool + 路径白名单 |
| 告诉模型「发布前必须跑测试」 | Skill |
| 让模型自动完成发布 | Agent + Skill + 部署 MCP |
| 给模型一份只读文档 | MCP Resource |
| 让用户一键触发代码审查 | MCP Prompt + Skill |
| 只是补充背景知识 | 系统提示词 / RAG，不必上 MCP |

## 下一步

- 协议细节：[什么是 MCP](/guide/what-is-mcp)
- Skill 的工程化落地：[私有 Skill Hub](/hub/skill-hub)
- 写一个能用的工具：[工具设计模式](/server/tool-design)
