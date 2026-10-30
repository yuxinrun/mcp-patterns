# MCP Patterns｜MCP Server 工程模式与实战手册

写给后端与 AI 开发者的 MCP 落地指南。少讲协议八股，多给能跑的代码、能抄的模板、能避开的坑。

- 站点：https://yuxinrun.github.io/mcp-patterns/
- 姊妹站：[如何构建更好的 Agent](https://how-to-build-better-agents.yuxin.run/)
- 协议基线：MCP 2026-07-28 修订，Python / TypeScript SDK v2

## 这个仓库有什么

| 板块 | 内容 |
| --- | --- |
| MCP 基础 | 协议、三大原语、Host / Client / Server 分工、和 Skill / Agent 的边界 |
| Server 开发 | 标准项目模板，stdio 与 Streamable HTTP 两套实现，工具粒度设计 |
| 工程模式 | OAuth 2.1、scope、多租户、参数校验、错误契约、日志与 trace |
| 实战案例 | 文件服务、数据库查询、API 代理、本地 CLI 封装 |
| 调试排坑 | 连接、握手、401/403、代理缓冲、超时、序列化、大内容 |
| Skill Hub | 私有 Skill 仓库、MCP Server 注册发现、版本、签名、灰度 |
| 框架对接 | LangGraph / LangChain、CrewAI、Dify |
| 生态地图 | Claude、OpenAI、Cursor、Dify 等客户端的支持差异 |

中文与英文内容并行，浅色 / 深色主题，PC 与移动端自适应，内置本地搜索。

## 本地运行

需要 Node.js >= 20。

```bash
npm install
npm run dev       # http://localhost:5173
npm run build     # 产物在 docs/.vitepress/dist
npm run preview   # 预览生产构建
```

## 可运行 Demo

`examples/` 下有四份最小实现，文档中的代码都能在这里找到完整版本。

```bash
# Python stdio
cd examples/python-stdio
python -m venv .venv
source .venv/bin/activate        # Windows: .venv\Scripts\activate
pip install -r requirements.txt
python client.py

# TypeScript stdio
cd examples/typescript
npm install
npm run client:stdio

# Python Streamable HTTP
cd examples/python-http
pip install -r requirements.txt
python server.py                 # 终端 A
python client.py                 # 终端 B
```

更多说明见 [examples/README](./examples/README.md)。

## 目录结构

```text
docs/
  index.md                 中文首页
  guide/                   MCP 基础
  server/                   Server 开发与传输
  engineering/             鉴权、多租户、校验、可观测
  recipes/                 四类实战案例
  debugging/               排查手册
  hub/                     Skill Hub
  integrations/            LangGraph / CrewAI / Dify
  en/                      英文站（与中文结构对齐）
  .vitepress/
    config.mts             导航、侧边栏、i18n
    theme/                 设计系统与图表组件
examples/
  python-stdio/            Python stdio Server + Client
  python-http/             Python Streamable HTTP / 旧版 SSE
  typescript/              TypeScript stdio + Streamable HTTP
```

## 部署

推送到 `main` 后由 GitHub Actions 构建并发布到 GitHub Pages，见
[.github/workflows/deploy.yml](./.github/workflows/deploy.yml)。

仓库名部署（`https://<user>.github.io/mcp-patterns/`）通过 `BASE=/mcp-patterns/` 设置资源前缀；
绑定自定义域名时改为 `BASE=/`。

## 参与贡献

- 事实错误或 API 过时：开 Issue，附版本与复现步骤。
- 新案例：用「真实踩坑 + 最小复现 + 修复」的结构。
- 翻译：英文内容在 `docs/en/`，保持与中文结构一致。
- 写作约定：代码块标注语言；安全内容给出错误 / 正确写法对照；不引入无法验证的数据。

## 姊妹站

**[如何构建更好的 Agent](https://how-to-build-better-agents.yuxin.run/)** 讲 Agent 的循环、上下文、评估与产品化；
本站讲能力怎么接进来。建议先理解 Agent，再落地工具层。
