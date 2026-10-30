---
layout: home

hero:
  name: MCP Patterns
  text: MCP Server 工程模式与实战手册
  tagline: 写给后端与 AI 开发者的落地指南。少讲协议八股，多给能跑的代码、能抄的模板、能避开的坑。从 stdio 到 Streamable HTTP，从鉴权、多租户到 Skill Hub。
  actions:
    - theme: brand
      text: 开始阅读
      link: /guide/what-is-mcp
    - theme: alt
      text: 跑通第一个 Server
      link: /server/stdio
    - theme: alt
      text: GitHub
      link: https://github.com/yuxinrun/mcp-patterns
---

<div class="mp-wrap">

<section class="mp-section" style="border-top:0;padding-top:20px">

<div class="mp-eyebrow">MCP Patterns · 工程实战手册</div>

## 一句话：把 MCP 当“服务端工程”来做，而不是当“提示词技巧”

<p class="mp-lead">MCP 把工具接入标准化了，但标准化不等于能上线。真正决定一个 MCP Server 能不能用的，是鉴权怎么做、租户怎么隔离、超时怎么处理、日志能不能回放、模型一次看到多少工具定义。</p>

<div class="mp-stats">
  <div class="mp-stat"><strong>7</strong><span>大板块 · 从协议到上线</span></div>
  <div class="mp-stat"><strong>4</strong><span>个可运行 Demo · Py + TS</span></div>
  <div class="mp-stat"><strong>3</strong><span>种传输 · stdio / HTTP / SSE</span></div>
  <div class="mp-stat"><strong>2026</strong><span>对齐 07-28 协议修订</span></div>
</div>

<div class="mp-tags">
  <span>MCP 2026-07-28</span><span>Python SDK v2</span><span>TypeScript SDK v2</span><span>OAuth 2.1</span><span>Skills over MCP</span><span>LangGraph</span><span>CrewAI</span><span>Dify</span>
</div>

</section>

<section class="mp-section">

<div class="mp-eyebrow">Quickstart · 15 分钟</div>

## 先跑通，再理解

<p class="mp-lead">不先背协议。先启动一个 Server，用客户端列出工具、调一次、看一次真实 JSON-RPC 往返。理解会快很多。</p>

<div class="mp-split">
<div>

<div class="mp-steps">
  <div class="mp-step"><b>01</b><div><strong>启动 stdio Server</strong><p>本地进程，stdin/stdout 走 JSON-RPC。最适合本地工具和开发期。</p></div></div>
  <div class="mp-step"><b>02</b><div><strong>用客户端调一次工具</strong><p>列出 tools，调用 add(2, 3)，观察 content 与 structuredContent。</p></div></div>
  <div class="mp-step"><b>03</b><div><strong>换成 HTTP 部署</strong><p>单端点 /mcp，加鉴权、租户与日志，再接到 Claude Code 或 Dify。</p></div></div>
</div>

<div class="mp-quote">stdio 的第一条铁律：stdout 只准出现 JSON-RPC。任何 print / 日志都必须去 stderr，否则协议帧会当场碎裂。</div>

<a class="mp-go" style="display:inline-block;margin-top:18px;color:var(--accent);font-weight:650" href="./server/stdio.html">看 stdio 完整 Demo →</a>

</div>
<div>

::: code-group

```bash [Python]
git clone https://github.com/yuxinrun/mcp-patterns.git
cd mcp-patterns/examples/python-stdio

python -m venv .venv
source .venv/bin/activate        # Windows: .venv\Scripts\activate
pip install -r requirements.txt

python client.py
```

```bash [TypeScript]
git clone https://github.com/yuxinrun/mcp-patterns.git
cd mcp-patterns/examples/typescript

npm install
npm run client:stdio
```

:::

</div>
</div>

</section>

<section class="mp-section">

<div class="mp-eyebrow">Map · 七个板块</div>

## 按工程问题组织，而不是按协议章节

<p class="mp-lead">每个板块都围绕一个你迟早会问的问题展开。可以顺序读，也可以直接跳到当前卡住的地方。</p>

<div class="mp-grid">
  <a class="mp-card" href="./guide/what-is-mcp.html">
    <span class="mp-num">01</span>
    <h3>MCP 基础</h3>
    <p>协议、三大原语、Host / Client / Server 的分工，以及它和 Skill、Agent 的边界。</p>
    <span class="mp-go">从零建立心智模型</span>
  </a>
  <a class="mp-card tone-coral" href="./server/quickstart.html">
    <span class="mp-num">02</span>
    <h3>Server 开发</h3>
    <p>标准项目模板、stdio 与 Streamable HTTP 两套最小实现，工具怎么切粒度。</p>
    <span class="mp-go">跑通并上线第一个服务</span>
  </a>
  <a class="mp-card tone-blue" href="./engineering/auth.html">
    <span class="mp-num">03</span>
    <h3>工程模式</h3>
    <p>OAuth 2.1、scope、租户隔离、参数校验、错误契约、日志与 trace。</p>
    <span class="mp-go">让服务敢接真实流量</span>
  </a>
  <a class="mp-card tone-lime" href="./recipes/filesystem.html">
    <span class="mp-num">04</span>
    <h3>实战案例</h3>
    <p>文件服务、数据库查询、API 代理、本地命令封装，每个都有边界检查。</p>
    <span class="mp-go">复制可用的业务骨架</span>
  </a>
  <a class="mp-card" href="./debugging/troubleshooting.html">
    <span class="mp-num">05</span>
    <h3>调试排坑</h3>
    <p>连不上、超时、序列化炸裂、大内容传输、协议版本不匹配的排查顺序。</p>
    <span class="mp-go">按症状直接定位</span>
  </a>
  <a class="mp-card tone-coral" href="./hub/skill-hub.html">
    <span class="mp-num">06</span>
    <h3>Skill Hub</h3>
    <p>私有 Skill 仓库、MCP Server 注册与发现、版本、签名、灰度与权限。</p>
    <span class="mp-go">做团队内部的能力市场</span>
  </a>
</div>

</section>

<section class="mp-section">

<div class="mp-eyebrow coral">Transport · 怎么选</div>

## stdio、Streamable HTTP、Legacy SSE

<p class="mp-lead">“用哪种传输”不是偏好问题，而是部署边界问题。本地进程、远程服务、存量兼容，答案完全不同。</p>

<RatingBars />

<p class="mp-lead" style="margin-top:8px">结论：新项目默认 <strong>Streamable HTTP</strong>；本地工具和 IDE 集成优先 <strong>stdio</strong>；<strong>Legacy SSE</strong> 只用于兼容旧客户端。2026-07-28 修订进一步移除了协议层会话，HTTP 侧更适合无状态部署。</p>

<a class="mp-go" style="display:inline-block;margin-top:18px;color:var(--accent);font-weight:650" href="./server/http-sse.html">看两种传输的完整实现 →</a>

</section>

<section class="mp-section">

<div class="mp-eyebrow">Ecosystem · 2026</div>

## 谁在支持 MCP，支持到什么程度

<p class="mp-lead">同样是“支持 MCP”，客户端、Agent 框架和平台的能力边界差别很大。下面这张表只记最影响接入方式的差异。</p>

| 客户端 / 框架 | 支持的传输 | 接入方式 | 工程注意点 |
| --- | --- | --- | --- |
| [Claude Code](https://code.claude.com/docs/en/mcp) | stdio、HTTP、SSE（弃用）、WS | `claude mcp add` / `.mcp.json` | Local / Project / User 三级配置；OAuth 用 `/mcp` 登录 |
| [Claude API](https://docs.claude.com/) | MCP Connector（远程） | API `mcp_servers` | 服务端远程连接，注意工具授权与数据边界 |
| [OpenAI Responses API](https://platform.openai.com/docs/guides/tools-connectors-mcp) | Streamable HTTP / SSE | `tools: [{ type: "mcp", server_url }]` | 默认需人工审批；可用 `require_approval` 精细放行 |
| [OpenAI Agents SDK](https://openai.github.io/openai-agents-python/mcp/) | stdio、SSE、Streamable HTTP | `MCPServerStdio` / `MCPServerSse` / `MCPServerStreamableHttp` | 支持工具过滤、列表缓存、`require_approval` |
| [LangChain / LangGraph](https://docs.langchain.com/oss/python/langchain/mcp) | stdio、HTTP、进程内 | `langchain[mcp]` 的 `MCPAdapter` | 1.4+ 内置，Beta；旧项目仍可用 `MultiServerMCPClient` |
| [CrewAI](https://docs.crewai.com/en/mcp/overview) | stdio、SSE、Streamable HTTP | `crewai_tools.MCPServerAdapter` | 用上下文管理器确保连接关闭 |
| [Dify](https://docs.dify.ai/zh/cloud/use-dify/publish/publish-mcp) | HTTP；本地 stdio | 应用“访问点”发布 MCP / 工具里添加 MCP | 双向：Dify 既做 Server 也做 Client |
| Cursor / VS Code | stdio、HTTP | `.cursor/mcp.json` / `mcp.json` | 远程服务优先 HTTP，本地命令注意工作目录 |

<div class="mp-quote">别把“支持 MCP”当成同一种能力。有的客户端只能当 Host，有的平台既能当 Server 又能当 Client，还有的只支持远程 HTTP。接入前先画清楚方向。</div>

<a class="mp-go" style="display:inline-block;margin-top:18px;color:var(--accent);font-weight:650" href="./ecosystem/landscape.html">看完整生态地图与选型建议 →</a>

</section>

<section class="mp-section">

<div class="mp-band">
  <div class="mp-eyebrow coral">Skill vs MCP</div>
  <h2 class="mp-h2">工具是手，Skill 是操作手册</h2>
  <p class="mp-lead">MCP 解决“能调用什么”，Skill 解决“应该怎么做”。把两者对立起来，通常会做出又贵又难维护的 Agent。</p>

  <div class="mp-band-grid">
    <div>
      <div class="mp-band-card">
        <h3>MCP Server</h3>
        <p>运行时能力：查询数据库、读文件、调 API。强项是标准化、跨客户端复用、权限收口。弱项是工具定义会占用上下文。</p>
        <a href="./guide/mcp-vs-skill-agent.html">读边界与组合方式 →</a>
      </div>
      <div class="mp-band-card" style="margin-top:14px">
        <h3>Agent Skill</h3>
        <p>过程知识：步骤、判断规则、常见坑、脚本与模板。用 <code>SKILL.md</code> 渐进披露，只在相关时加载，节省上下文。</p>
        <a href="./hub/skill-hub.html">搭私有 Skill Hub →</a>
      </div>
    </div>
    <div>
      <div class="mp-band-card">
        <h3>Skills over MCP</h3>
        <p>2026 年的新趋势：Server 不只发布工具，还发布“怎么用这些工具”的知识。MCP 的 skills 扩展把 Skill 目录作为资源暴露，客户端按需读取。</p>
        <p style="margin-top:10px">一句话：从“能力市场”升级为“能力 + 用法市场”。</p>
        <a href="./hub/skill-hub.html">看私有 Hub 架构 →</a>
      </div>
      <div class="mp-band-card" style="margin-top:14px">
        <h3>上下文预算</h3>
        <p>工具不是越多越好。Anthropic 的 code execution 实践把工具变成文件树、按需加载，示例中 token 从 150k 降到 2k。关键不是数字，而是“渐进披露”。</p>
        <a href="./server/tool-design.html">学工具粒度设计 →</a>
      </div>
    </div>
  </div>
</div>

</section>

<section class="mp-section">

<div class="mp-eyebrow">Field notes · 避坑</div>

## 上线前最常翻车的 6 件事

<p class="mp-lead">这些问题和协议无关，和工程习惯有关。每一条都能在后面的章节里找到修复方式。</p>

<div class="mp-grid">
  <div class="mp-card tone-coral"><span class="mp-num">A</span><h3>把日志打到 stdout</h3><p>stdio 模式下直接破坏 JSON-RPC 帧。日志统一走 stderr，或接入结构化日志。</p><span class="mp-go">排查清单</span></div>
  <div class="mp-card tone-coral"><span class="mp-num">B</span><h3>工具返回整张表</h3><p>一次把 10MB 数据塞进上下文。服务端先分页、裁剪、摘要，再返回。</p><span class="mp-go">结果契约</span></div>
  <div class="mp-card tone-coral"><span class="mp-num">C</span><h3>信任客户端传来的 tenant</h3><p>tenant_id 必须从 token 推导，不能从参数读取。否则越权只差一个字符串。</p><span class="mp-go">多租户</span></div>
  <div class="mp-card tone-coral"><span class="mp-num">D</span><h3>把 token 透传给下游</h3><p>MCP token 的 audience 是当前资源。透传会变成 confused deputy。</p><span class="mp-go">鉴权</span></div>
  <div class="mp-card tone-coral"><span class="mp-num">E</span><h3>没有请求 ID 和 trace</h3><p>模型说“调用失败了”，你只有一句 Internal error。日志里必须能串起一次调用。</p><span class="mp-go">可观测</span></div>
  <div class="mp-card tone-coral"><span class="mp-num">F</span><h3>只测 happy path</h3><p>超时、取消、空结果、大文件、并发租户，才是 MCP Server 的真实世界。</p><span class="mp-go">测试矩阵</span></div>
</div>

</section>

<section class="mp-section">

<div class="mp-eyebrow">Sister site · 姊妹站</div>

## 一个讲“怎么把 Agent 做好”，一个讲“怎么把工具接稳”

<p class="mp-lead">MCP Patterns 和《如何构建更好的 Agent》是一对配套手册。前者关注工具与协议，后者关注 Agent 的循环、上下文、评估与产品化。</p>

<div class="mp-friend">
  <a class="mp-friend-card" href="https://how-to-build-better-agents.yuxin.run/" target="_blank" rel="noopener">
    <span>how-to-build-better-agents.yuxin.run</span>
    <strong>如何构建更好的 Agent</strong>
    <p>写给传统程序员转型 Agent 开发、以及 Agent 工程师进阶的实战手册。10 章结构化内容、双语、明暗主题。</p>
    <em>去读 Agent 手册 →</em>
  </a>
  <a class="mp-friend-card" href="https://github.com/yuxinrun/mcp-patterns" target="_blank" rel="noopener">
    <span>github.com/yuxinrun/mcp-patterns</span>
    <strong>MCP Patterns 开源仓库</strong>
    <p>本站所有文章与 Demo 代码开源。发现问题、想补案例，直接提 Issue 或 PR。</p>
    <em>Star / Fork →</em>
  </a>
</div>

<div class="mp-quote">建议阅读顺序：先用本站跑通一个 MCP Server，再去姊妹站理解 Agent 为什么需要它、什么时候不该用它。</div>

</section>

</div>
