---
title: MCP vs Skills vs Agents
description: "Tools, playbooks, and executors — a three-layer capability model and when to build which."
---

# MCP vs Skills vs Agents

These three terms describe different layers, not competing products.

| Concept | What it is | Who executes | Shape |
| --- | --- | --- | --- |
| MCP Server | **Capability interface**: functions, data, prompts | External process / service | `tools/call`, `resources/read` |
| Agent Skill | **Playbook**: when and how to do something | Model plus existing tools | `SKILL.md` + scripts |
| Agent | **Executor**: plans, calls tools, keeps state | The loop inside a host | Claude Code, LangGraph graph |

An analogy:

> **MCP is the hands, a Skill is the playbook, and the Agent is the worker.**
> Hands can turn a screw. “Power off, open the case, measure the voltage” lives in the playbook.

## The three layers

```text
┌─────────────────────────────────────────────┐
│ Agent (planning / memory / loop)            │
│  ┌───────────────────────────────────────┐  │
│  │ Skill (process / checklist / scripts) │  │
│  │  ┌─────────────────────────────────┐  │  │
│  │  │ MCP tools (atomic capabilities) │  │  │
│  │  └─────────────────────────────────┘  │  │
│  └───────────────────────────────────────┘  │
└─────────────────────────────────────────────┘
```

- **MCP answers where capabilities come from.**
- **Skills answer how to use them correctly.**
- **Agents decide what to do and when.**

## When to build an MCP server

Signals:

- The capability is reused by multiple hosts (Claude Code, Cursor, Dify, custom agents).
- You need centralized auth, audit, and rate limiting instead of scattering keys.
- The data lives in a remote service and needs tenant isolation.
- You want a stable schema and version instead of prompt-based conventions.

Do not build MCP for:

- A one-off script only the current agent uses.
- Pure domain knowledge (use a Skill or prompt).
- An interface that changes every day.

## When to write a Skill

Skills hold **procedural knowledge**:

- Release: test → build → tag → changelog.
- Review: security, error handling, performance red lines.
- Company conventions: branch names, commit format, rollout policy.
- How to combine a fixed set of scripts.

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

The host loads only `name` and `description` at startup, then reads the body on demand. That is progressive disclosure, and it is why dozens of skills can coexist without flooding the context window.

## How they combine

| Scenario | MCP provides | Skill provides |
| --- | --- | --- |
| Releases | `deploy_service`, `get_release_status` | Pre-flight checklist, rollback steps |
| Analytics | `run_sql`, `list_tables` | Metric definitions, query templates |
| Support | `search_tickets`, `update_ticket` | Escalation paths, reply templates |
| Codebase | `read_file`, `run_tests` | Refactor workflow, commit rules |

**Skills over MCP** goes one step further: skills themselves become MCP resources, distributed and versioned by the server. It is still a draft (SEP-2640), but the direction is clear: capabilities and process both come from a central registry.

## Context budget

Anthropic’s “Code execution with MCP” gives a useful number: putting many tool definitions directly into context can cost **150k tokens**; discovering tools on demand and executing code drops it to about **2k**, a **98.7%** reduction.

Implications:

1. Layer tools: common ones directly, long-tail ones behind `search_tools`.
2. Keep descriptions short.
3. Put workflow in Skills, not in every tool description.
4. Return summaries plus a handle, not raw megabytes.

## Decision table

| Need | Choose |
| --- | --- |
| Read and write files | MCP tool + path allowlist |
| “Always run tests before release” | Skill |
| Automate the whole release | Agent + Skill + deploy MCP |
| Attach read-only docs | MCP resource |
| One-click code review | MCP prompt + Skill |
| Background knowledge only | System prompt / RAG |

## Next

- [What is MCP](/en/guide/what-is-mcp)
- [Private Skill Hub](/en/hub/skill-hub)
- [Tool design patterns](/en/server/tool-design)
