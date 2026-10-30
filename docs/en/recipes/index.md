---
title: Recipes
description: Four production-shaped MCP server skeletons — filesystem, database, API proxy and local tools.
---

# Recipes

Four skeletons that cover most first MCP servers. Each one is written to be copied, then trimmed — not a full framework, but the boundary checks and failure handling you'd otherwise forget.

## What's here

| Recipe | Use it for | Hard problem |
| --- | --- | --- |
| [Filesystem](/en/recipes/filesystem) | Notes, repos, documents | Path escape and size limits |
| [Database queries](/en/recipes/database) | Business data, analytics | Read-only, SQL injection, tenant rows |
| [API proxy](/en/recipes/api-proxy) | Internal services, SaaS | SSRF, credentials, response size |
| [Local tools](/en/recipes/local-tools) | git, docker, kubectl | Command injection, destructive actions |

## The shape they share

Every recipe follows the same five-step flow:

```text
1. validate input      → schema + explicit checks
2. check authorization → tenant / scope / path
3. execute with limits → timeout + size cap
4. shape output        → only the fields the model needs
5. log and audit       → request id, tenant, duration, outcome
```

If a tool is missing one of these steps, it will eventually show up as an incident rather than a bug.

## Choosing the first one

- **Building local dev tooling?** Start with [filesystem](/en/recipes/filesystem). It teaches the path-jail pattern you'll reuse everywhere.
- **Connecting business data?** Start with [database](/en/recipes/database) and use predefined queries. Resist `run_sql`.
- **Wrapping an internal service?** Start with [API proxy](/en/recipes/api-proxy). The allowlist and shaping sections do most of the work.
- **Exposing a CLI?** Start with [local tools](/en/recipes/local-tools), then keep the command surface as small as possible.

## Common mistakes across all four

| Mistake | Why it hurts | Fix |
| --- | --- | --- |
| Trusting tool arguments for identity | Tenant or user spoofing | Derive from the token |
| Returning the raw upstream payload | Context blowup, data leak | Explicit output schema |
| No timeout | Hung calls, exhausted workers | Per-call deadline |
| Logging full inputs | Secrets and PII in logs | Redact, truncate |
| Only testing the happy path | Failures surface in production | Test the matrix at the end of each recipe |

## Read next

- [Tool design patterns](/en/server/tool-design) — naming, schemas, granularity.
- [Validation & errors](/en/engineering/validation-errors) — a consistent error envelope.
- [Logging & observability](/en/engineering/observability) — make failures traceable.
