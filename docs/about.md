---
title: 关于本站
description: MCP Patterns 的定位、作者、技术栈与贡献方式。
---

# 关于本站

**MCP Patterns** 是一份写给后端与 AI 开发者的 MCP 工程手册。它不追求把协议讲全，而是回答一个问题：

> **怎么把 MCP Server 做成一个能上线、能排障、能长期维护的服务？**

## 为什么做这个站

2024 年 MCP 刚出现时，资料大多集中在「怎么跑一个 demo」。到了 2026 年，真正的难点已经变成：

- 远程部署后怎么做 OAuth 与多租户？
- 工具怎么设计，模型才不容易用错？
- 调用失败时，怎么在 5 分钟内定位？
- Skill、MCP、Agent 三者怎么分工？
- 团队几十个 Server，怎么注册、发现、治理？

这些问题的答案分散在协议规范、SDK 源码、各家文档和踩坑记录里。本站把它们整理成可执行的模式与清单。

## 和「构建更好的 Agent」的关系

本站是姊妹站 [构建更好的 Agent](https://how-to-build-better-agents.yuxin.run/) 的配套工程手册：

| 站点 | 关注 |
| --- | --- |
| [构建更好的 Agent](https://how-to-build-better-agents.yuxin.run/) | Agent 的设计、上下文、评估、产品化 |
| MCP Patterns（本站） | 能力怎么接进来：协议、传输、鉴权、调试 |

建议阅读顺序：先在姊妹站理解 Agent 的整体设计，再回到本站落地工具层。

## 内容原则

1. **代码优先**：能跑的代码比架构图更有说服力。
2. **工程视角**：关注权限、隔离、超时、观测，而不是只讲协议字段。
3. **可复制**：示例尽量单文件、少依赖，复制后能直接跑。
4. **标注时效**：协议与 SDK 迭代快，过时的地方会明确说明。
5. **不堆术语**：能用一句话说清，就不写三段。

## 技术栈

- [VitePress](https://vitepress.dev/)：静态站点与本地搜索。
- Markdown + Vue 组件：图表与交互式说明。
- Python / TypeScript 示例：均可本地运行。
- GitHub Pages：静态部署，无后端依赖。

设计语言与姊妹站保持一致：暖白 / 深海的底色，teal / coral 强调色，Manrope + JetBrains Mono 字体，支持浅色 / 深色与中英文切换。

## 示例代码

所有示例在仓库 `examples/` 下：

| 目录 | 内容 |
| --- | --- |
| `python-stdio/` | Python stdio Server + Client |
| `python-http/` | Python Streamable HTTP / 旧版 SSE |
| `typescript/` | TypeScript stdio + Streamable HTTP |

运行方式见 [examples/README](https://github.com/yuxinrun/mcp-patterns/tree/main/examples)。

## 贡献

欢迎提交 Issue 与 PR：

- 发现事实错误、API 过时：直接开 Issue，附上版本与复现步骤。
- 新增案例：优先「真实踩坑 + 最小复现 + 修复」的结构。
- 翻译：英文内容在 `docs/en/`，保持与中文结构一致。
- 图表组件：在 `docs/.vitepress/theme/components/`。

写作约定：

- 代码块标注语言，能运行的要实际跑过。
- 命令使用绝对路径示例时，明确提示替换。
- 安全相关内容必须给出「错误写法 / 正确写法」对照。
- 不引入无法验证的第三方数据。

## 免责声明

本站内容基于公开资料与本地实测，尽量保证准确，但不构成任何形式的生产环境保证。协议与 SDK 变化较快，上线前请以官方文档和你自己的测试为准。

## 联系

- GitHub：[yuxinrun/mcp-patterns](https://github.com/yuxinrun/mcp-patterns)
- 姊妹站：[构建更好的 Agent](https://how-to-build-better-agents.yuxin.run/)

---

如果这个站帮你少踩了一个坑，欢迎点个 Star，或者把踩坑经历写成 PR。
