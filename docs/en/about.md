---
title: About
description: What MCP Patterns is, who it's for, and how to contribute.
---

# About

**MCP Patterns** is an MCP engineering handbook for backend and AI developers. It doesn't try to cover every protocol field. It answers one question:

> **How do you build an MCP server that can ship, be debugged, and be maintained?**

<BrandMark variant="card" />

## Why this site

When MCP appeared in 2024, most material focused on "how to run a demo". By 2026, the hard problems are:

- How do you do OAuth and multi-tenancy once it's deployed remotely?
- How should tools be designed so models use them correctly?
- When a call fails, how do you locate it in five minutes?
- How do skills, MCP servers, and agents divide the work?
- With dozens of servers, how do you register, discover, and govern them?

Those answers are scattered across specs, SDK source, vendor docs, and incident notes. This site turns them into executable patterns and checklists.

## Relationship to Better Agents

This site is the companion engineering manual to [How to Build Better Agents](https://how-to-build-better-agents.yuxin.run/):

| Site | Focus |
| --- | --- |
| [How to Build Better Agents](https://how-to-build-better-agents.yuxin.run/) | Agent design, context, evaluation, productization |
| MCP Patterns (this site) | How capability gets connected: protocol, transport, auth, debugging |

Suggested order: understand the agent design on the sister site, then come back here to build the tool layer.

## Content principles

1. **Code first**: runnable code beats an architecture diagram.
2. **Engineering lens**: permissions, isolation, timeouts, observability — not just protocol fields.
3. **Copyable**: examples stay close to single-file and low-dependency.
4. **Date-stamped**: protocol and SDKs move fast; outdated parts are called out.
5. **No jargon padding**: if one sentence is enough, don't write three.

## Stack

- [VitePress](https://vitepress.dev/) for the static site and local search.
- Markdown + Vue components for diagrams and interactive explanations.
- Python / TypeScript examples, all runnable locally.
- GitHub Pages for static deployment with no backend.

The design language matches the sister site: warm white / deep sea backgrounds, teal and coral accents, Manrope + JetBrains Mono, light/dark and Chinese/English switching.

## Examples

Everything lives under `examples/` in the repo:

| Directory | Contents |
| --- | --- |
| `python-stdio/` | Python stdio server + client |
| `python-http/` | Python Streamable HTTP / legacy SSE |
| `typescript/` | TypeScript stdio + Streamable HTTP |

See [examples/README](https://github.com/yuxinrun/mcp-patterns/tree/main/examples) for run commands.

## Contributing

Issues and PRs are welcome:

- Factual errors or outdated APIs: open an issue with versions and repro steps.
- New recipes: prefer "real pitfall + minimal repro + fix".
- Translation: English lives in `docs/en/`, kept structurally parallel.
- Diagram components: `docs/.vitepress/theme/components/`.

Writing conventions:

- Tag code blocks by language; run what you claim is runnable.
- When a command uses an absolute path, say so explicitly.
- Security content must show "wrong / right" side by side.
- Don't introduce unverifiable third-party numbers.

## Disclaimer

Content is based on public documentation and local testing. It's as accurate as we can make it, but it is not a production guarantee. Protocols and SDKs change quickly — verify against official docs and your own tests before shipping.

## Contact

- GitHub: [yuxinrun/mcp-patterns](https://github.com/yuxinrun/mcp-patterns)
- Sister site: [How to Build Better Agents](https://how-to-build-better-agents.yuxin.run/)

---

If this site saved you one incident, a star is appreciated — or turn your own incident into a PR.
