---
layout: home

hero:
  name: MCP Patterns
  text: Engineering patterns for MCP servers
  tagline: A practical field manual for backend and AI engineers. Less protocol theory, more runnable code, reusable templates, and failure modes you can avoid. From stdio to Streamable HTTP, from auth and multi-tenancy to a private Skill Hub.
  actions:
    - theme: brand
      text: Start reading
      link: /en/guide/what-is-mcp
    - theme: alt
      text: Run your first server
      link: /en/server/stdio
    - theme: alt
      text: GitHub
      link: https://github.com/yuxinrun/mcp-patterns
---

<div class="mp-wrap">

<section class="mp-section" style="border-top:0;padding-top:20px">

<div class="mp-eyebrow">MCP Patterns · Field manual</div>

## Treat MCP as server engineering, not prompt tricks

<p class="mp-lead">MCP standardizes tool access. It does not make a service production-ready. What decides whether an MCP server survives real traffic is auth, tenant isolation, timeouts, replayable logs, and how many tool definitions the model sees at once.</p>

<div class="mp-stats">
  <div class="mp-stat"><strong>7</strong><span>sections · protocol to production</span></div>
  <div class="mp-stat"><strong>4</strong><span>runnable demos · Python + TS</span></div>
  <div class="mp-stat"><strong>3</strong><span>transports · stdio / HTTP / SSE</span></div>
  <div class="mp-stat"><strong>2026</strong><span>aligned with the 07-28 revision</span></div>
</div>

<div class="mp-tags">
  <span>MCP 2026-07-28</span><span>Python SDK v2</span><span>TypeScript SDK v2</span><span>OAuth 2.1</span><span>Skills over MCP</span><span>LangGraph</span><span>CrewAI</span><span>Dify</span>
</div>

</section>

<section class="mp-section">

<div class="mp-eyebrow">Quickstart · 15 minutes</div>

## Run it first, understand it second

<p class="mp-lead">Do not memorize the spec first. Start a server, list its tools, make one call, and look at the real JSON-RPC round trip. The mental model lands much faster.</p>

<div class="mp-split">
<div>

<div class="mp-steps">
  <div class="mp-step"><b>01</b><div><strong>Start a stdio server</strong><p>A local process speaking JSON-RPC over stdin/stdout. Best for local tools and development.</p></div></div>
  <div class="mp-step"><b>02</b><div><strong>Call a tool from a client</strong><p>List the tools, call add(2, 3), and inspect content vs structuredContent.</p></div></div>
  <div class="mp-step"><b>03</b><div><strong>Move to HTTP</strong><p>One /mcp endpoint, then add auth, tenancy, and logs before connecting Claude Code or Dify.</p></div></div>
</div>

<div class="mp-quote">The first law of stdio: stdout is for JSON-RPC only. Every print or log line must go to stderr, or the protocol frame breaks immediately.</div>

<a class="mp-go" style="display:inline-block;margin-top:18px;color:var(--accent);font-weight:650" href="./server/stdio.html">See the full stdio demo →</a>

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

<div class="mp-eyebrow">Map · Seven sections</div>

## Organized by engineering problems, not spec chapters

<p class="mp-lead">Each section answers a question you will eventually ask. Read in order, or jump straight to the problem blocking you today.</p>

<div class="mp-grid">
  <a class="mp-card" href="./guide/what-is-mcp.html">
    <span class="mp-num">01</span>
    <h3>MCP basics</h3>
    <p>The protocol, the three primitives, Host / Client / Server roles, and where Skills and Agents fit.</p>
    <span class="mp-go">Build the mental model</span>
  </a>
  <a class="mp-card tone-coral" href="./server/quickstart.html">
    <span class="mp-num">02</span>
    <h3>Server development</h3>
    <p>A project template, minimal stdio and Streamable HTTP servers, and how to choose tool granularity.</p>
    <span class="mp-go">Ship your first server</span>
  </a>
  <a class="mp-card tone-blue" href="./engineering/auth.html">
    <span class="mp-num">03</span>
    <h3>Engineering</h3>
    <p>OAuth 2.1, scopes, tenant isolation, validation, error contracts, logs, and traces.</p>
    <span class="mp-go">Survive real traffic</span>
  </a>
  <a class="mp-card tone-lime" href="./recipes/filesystem.html">
    <span class="mp-num">04</span>
    <h3>Recipes</h3>
    <p>Filesystem, database, API proxy, and local CLI wrappers, each with its safety boundary.</p>
    <span class="mp-go">Copy a working skeleton</span>
  </a>
  <a class="mp-card" href="./debugging/troubleshooting.html">
    <span class="mp-num">05</span>
    <h3>Debugging</h3>
    <p>Connection failures, timeouts, serialization, large payloads, and version mismatches.</p>
    <span class="mp-go">Diagnose by symptom</span>
  </a>
  <a class="mp-card tone-coral" href="./hub/skill-hub.html">
    <span class="mp-num">06</span>
    <h3>Skill Hub</h3>
    <p>Private skill registries, server discovery, versioning, signing, rollout, and permissions.</p>
    <span class="mp-go">Build an internal marketplace</span>
  </a>
</div>

</section>

<section class="mp-section">

<div class="mp-eyebrow coral">Transport · How to choose</div>

## stdio, Streamable HTTP, Legacy SSE

<p class="mp-lead">Transport is a deployment-boundary decision, not a preference. Local process, remote service, and legacy compatibility have different answers.</p>

<RatingBars />

<p class="mp-lead" style="margin-top:8px">Rule of thumb: new services default to <strong>Streamable HTTP</strong>; local tools and IDE integrations prefer <strong>stdio</strong>; <strong>Legacy SSE</strong> exists only for old clients. The 2026-07-28 revision removes protocol-level sessions, making HTTP deployments naturally stateless.</p>

<a class="mp-go" style="display:inline-block;margin-top:18px;color:var(--accent);font-weight:650" href="./server/http-sse.html">See both transports implemented →</a>

</section>

<section class="mp-section">

<div class="mp-eyebrow">Ecosystem · 2026</div>

## Who supports MCP, and how far

<p class="mp-lead">“Supports MCP” means very different things across clients, agent frameworks, and platforms. This table only tracks what changes your integration approach.</p>

| Client / framework | Transports | Integration | Watch out for |
| --- | --- | --- | --- |
| [Claude Code](https://code.claude.com/docs/en/mcp) | stdio, HTTP, SSE (legacy), WS | `claude mcp add` / `.mcp.json` | Local / Project / User scopes; OAuth via `/mcp` |
| [Claude API](https://docs.claude.com/) | Remote MCP connector | API `mcp_servers` | Remote connection; mind tool approvals and data boundaries |
| [OpenAI Responses API](https://platform.openai.com/docs/guides/tools-connectors-mcp) | Streamable HTTP / SSE | `tools: [{ type: "mcp", server_url }]` | Approval required by default; tune with `require_approval` |
| [OpenAI Agents SDK](https://openai.github.io/openai-agents-python/mcp/) | stdio, SSE, Streamable HTTP | `MCPServerStdio` / `MCPServerSse` / `MCPServerStreamableHttp` | Tool filtering, list caching, approvals |
| [LangChain / LangGraph](https://docs.langchain.com/oss/python/langchain/mcp) | stdio, HTTP, in-process | `MCPAdapter` from `langchain[mcp]` | Built in since 1.4, still beta; `MultiServerMCPClient` is legacy |
| [CrewAI](https://docs.crewai.com/en/mcp/overview) | stdio, SSE, Streamable HTTP | `crewai_tools.MCPServerAdapter` | Context manager required to close connections |
| [Dify](https://docs.dify.ai/zh/cloud/use-dify/publish/publish-mcp) | HTTP; local stdio | Publish app as MCP / add MCP tool | Bidirectional: Dify can be server and client |
| Cursor / VS Code | stdio, HTTP | `.cursor/mcp.json` / `mcp.json` | Absolute paths; HTTP for remote servers |

<div class="mp-quote">Do not treat “MCP support” as one capability. Some clients are hosts only, some platforms are both server and client, and some only accept remote HTTP. Draw the direction first.</div>

<a class="mp-go" style="display:inline-block;margin-top:18px;color:var(--accent);font-weight:650" href="./ecosystem/landscape.html">Read the full ecosystem map →</a>

</section>

<section class="mp-section">

<div class="mp-band">
  <div class="mp-eyebrow coral">Skill vs MCP</div>
  <h2 class="mp-h2">Tools are hands. Skills are the playbook.</h2>
  <p class="mp-lead">MCP answers “what can I call”. Skills answer “how should this be done”. Treating them as competitors usually produces expensive, brittle agents.</p>

  <div class="mp-band-grid">
    <div>
      <div class="mp-band-card">
        <h3>MCP Server</h3>
        <p>Runtime capability: query a database, read files, call an API. Strong at standardization, cross-client reuse, and centralized permissions. Weak at context cost.</p>
        <a href="./guide/mcp-vs-skill-agent.html">Read the boundary →</a>
      </div>
      <div class="mp-band-card" style="margin-top:14px">
        <h3>Agent Skill</h3>
        <p>Procedural knowledge: steps, decision rules, pitfalls, scripts. <code>SKILL.md</code> uses progressive disclosure, so it only enters context when relevant.</p>
        <a href="./hub/skill-hub.html">Build a private Skill Hub →</a>
      </div>
    </div>
    <div>
      <div class="mp-band-card">
        <h3>Skills over MCP</h3>
        <p>The 2026 trend: servers publish not only tools, but the knowledge of how to use them. The MCP skills extension exposes skill directories as resources.</p>
        <p style="margin-top:10px">In short: from a capability marketplace to a capability + usage marketplace.</p>
        <a href="./hub/skill-hub.html">See the hub architecture →</a>
      </div>
      <div class="mp-band-card" style="margin-top:14px">
        <h3>Context budget</h3>
        <p>More tools is not better. Anthropic’s code-execution pattern turns tools into a filesystem loaded on demand, cutting the example from 150k to 2k tokens. The lesson is progressive disclosure.</p>
        <a href="./server/tool-design.html">Design better tool granularity →</a>
      </div>
    </div>
  </div>
</div>

</section>

<section class="mp-section">

<div class="mp-eyebrow">Field notes · Failure modes</div>

## Six things that break in production

<p class="mp-lead">None of these are protocol problems. They are engineering habits. Every one has a fix in the chapters ahead.</p>

<div class="mp-grid">
  <div class="mp-card tone-coral"><span class="mp-num">A</span><h3>Logging to stdout</h3><p>In stdio mode this corrupts JSON-RPC frames. Route logs to stderr or a structured logger.</p><span class="mp-go">Checklist</span></div>
  <div class="mp-card tone-coral"><span class="mp-num">B</span><h3>Returning a whole table</h3><p>Ten megabytes land in the context window. Paginate, trim, and summarize server-side.</p><span class="mp-go">Result contract</span></div>
  <div class="mp-card tone-coral"><span class="mp-num">C</span><h3>Trusting client tenant IDs</h3><p>Derive the tenant from the token, never from a request parameter. Otherwise privilege escalation is one string away.</p><span class="mp-go">Multi-tenancy</span></div>
  <div class="mp-card tone-coral"><span class="mp-num">D</span><h3>Passing tokens through</h3><p>The MCP token audience is your resource. Forwarding it downstream creates a confused deputy.</p><span class="mp-go">Auth</span></div>
  <div class="mp-card tone-coral"><span class="mp-num">E</span><h3>No request or trace ID</h3><p>The model says “the call failed” and you have “Internal error”. One call must be reconstructable from logs.</p><span class="mp-go">Observability</span></div>
  <div class="mp-card tone-coral"><span class="mp-num">F</span><h3>Testing only the happy path</h3><p>Timeouts, cancellation, empty results, huge files, and concurrent tenants are the real world.</p><span class="mp-go">Test matrix</span></div>
</div>

</section>

<section class="mp-section">

<div class="mp-eyebrow">Sister site</div>

## One site builds better agents. This one builds stable tools.

<p class="mp-lead">MCP Patterns and “How to Build Better Agents” are companion handbooks. One focuses on tools and protocols; the other on the agent loop, context, evaluation, and productization.</p>

<div class="mp-friend">
  <a class="mp-friend-card" href="https://how-to-build-better-agents.yuxin.run/" target="_blank" rel="noopener">
    <span>how-to-build-better-agents.yuxin.run</span>
    <strong>How to Build Better Agents</strong>
    <p>A practical handbook for engineers moving into agent development and for agent engineers leveling up. Ten chapters, bilingual, light and dark themes.</p>
    <em>Read the agent handbook →</em>
  </a>
  <a class="mp-friend-card" href="https://github.com/yuxinrun/mcp-patterns" target="_blank" rel="noopener">
    <span>github.com/yuxinrun/mcp-patterns</span>
    <strong>MCP Patterns repository</strong>
    <p>All articles and demo code are open source. File an issue or send a PR if something is wrong or missing.</p>
    <em>Star / Fork →</em>
  </a>
</div>

<div class="mp-quote">Suggested order: get one MCP server running here, then read the sister site to understand why an agent needs it — and when it should not use it.</div>

</section>

</div>
