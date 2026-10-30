---
title: Private Skill Hub
description: Turn team knowledge into distributable skills, with a private hub for permissions, versions and discovery.
---

# Private Skill Hub

When a team has 20 agents, 50 MCP servers, and a hundred "this is how we do it" notes, the problem is no longer "do we have tools". It's **where do I find it, which version do I use, and who maintains it**.

A private Skill Hub solves three things:

1. **Distribution**: one catalog for skills and MCP servers.
2. **Governance**: versions, owners, review, permissions.
3. **Discovery**: agents load what they need, instead of stuffing everything into context.

## What a skill is

A skill is a directory whose core is `SKILL.md`:

```text
skills/release-checklist/
├── SKILL.md
├── scripts/
│   ├── preflight.sh
│   └── rollback.sh
└── references/
    └── incident-2025-11.md
```

```markdown
---
name: release-checklist
description: Run the release checklist for this repository.
---

# Release checklist

Use this skill when the user asks to cut a release.

1. Run `scripts/preflight.sh` and stop on any failure.
2. Bump the version with `npm version patch`.
3. Push the tag and wait for CI.
4. Verify `/healthz` on the new deployment.
5. If anything fails, follow `references/rollback.md`.

Do not skip step 1. Do not push tags from a dirty working tree.
```

The key design is **progressive disclosure**:

| Stage | Loaded | Cost |
| --- | --- | --- |
| Startup | `name` + `description` | Tens of tokens |
| Trigger | Full `SKILL.md` | Hundreds to thousands |
| Execution | `scripts/`, `references/` on demand | Actual usage |

That's why 50 skills can coexist while 50 tool definitions blow up the context.

## Why a private hub

| Public marketplace | Private hub |
| --- | --- |
| Generic capability | Company process, internal systems |
| Uneven quality | Reviewed before release |
| No internal permissions | Team / project scoped |
| Version drift | Pinned versions, gradual rollout |
| No audit | Who published, who used it |

Typical users:

- Platform team: maintains shared skills and MCP servers.
- Business teams: publish domain skills.
- Agent developers: declare dependencies per project.
- Security / compliance: approve and audit.

## Architecture

```text
┌──────────────┐      ┌───────────────────────────┐
│ Agent / Host │─────▶│ Skill Hub API             │
└──────────────┘      │  ├─ catalog and search    │
                      │  ├─ versions and download │
                      │  ├─ auth (OIDC / token)   │
                      │  └─ audit                 │
                      └──────────┬────────────────┘
                                 │
                 ┌───────────────┼────────────────┐
                 ▼               ▼                ▼
           object storage   metadata DB      CI / signing
             (tar.gz)       (Postgres)      (build, scan, sign)
```

A minimal version can be:

- One Git repository (skill sources).
- One static index (`index.json`).
- One OIDC-aware reverse proxy.

Add a database, search, and approval flow only when scale demands it.

## Layout and index

```text
hub/
├── index.json
├── skills/
│   ├── release-checklist/
│   │   ├── 0.3.0.tar.gz
│   │   └── 0.4.0.tar.gz
│   └── incident-triage/
│       └── 1.1.0.tar.gz
└── servers/
    ├── notes/
    │   └── server.json
    └── crm-proxy/
        └── server.json
```

`index.json`:

```json
{
  "updated_at": "2026-10-30T12:00:00Z",
  "skills": [
    {
      "name": "release-checklist",
      "description": "Run the release checklist for this repository.",
      "latest": "0.4.0",
      "versions": ["0.3.0", "0.4.0"],
      "owner": "platform-team",
      "tags": ["release", "ci"],
      "checksum": "sha256:...",
      "download": "/skills/release-checklist/0.4.0.tar.gz"
    }
  ]
}
```

The index must be machine-readable and searchable. At minimum: name, description, latest version, owner, tags, checksum, download URL.

## Registering an MCP server

Reuse the official Registry `server.json` shape so you can sync later:

```json
{
  "$schema": "https://static.modelcontextprotocol.io/schemas/2025-12-11/server.schema.json",
  "name": "io.github.yuxinrun/notes-mcp",
  "description": "Local markdown notes over MCP",
  "version": "0.1.0",
  "repository": {
    "url": "https://github.com/yuxinrun/mcp-patterns",
    "source": "github"
  },
  "packages": [
    {
      "registryType": "npm",
      "identifier": "@yuxinrun/notes-mcp",
      "version": "0.1.0",
      "transport": { "type": "stdio" }
    }
  ],
  "remotes": [
    {
      "type": "streamable-http",
      "url": "https://mcp.example.com/mcp"
    }
  ]
}
```

An enterprise hub can extend the official schema:

| Extension | Purpose |
| --- | --- |
| `owner` | Responsible team |
| `visibility` | `public` / `internal` / `restricted` |
| `scopes` | Required permissions |
| `data_classification` | Accessible data level |
| `sla` | Availability and support hours |
| `deprecated_at` | Planned retirement date |

## Distributing skills over MCP

There are two routes today.

### Route A: skills as ordinary resources

Expose the skill directory as MCP resources:

```text
skill://release-checklist/SKILL.md
skill://release-checklist/references/rollback.md
```

The agent calls `resources/list` to see names and descriptions, then `resources/read` when needed. Simple, and compatible with every client.

### Route B: Skills over MCP (draft)

Community proposal SEP-2640 tries to make skills first-class:

- The server declares a skills capability.
- Clients can list, search, and read skills.
- Versions and dependencies are supported.
- Compatible with the `SKILL.md` format.

The draft is still evolving. In production, start with route A and abstract the interface as `list` / `get` so you can swap later.

## Registration and discovery

### Client side

```text
1. Read the hub index (with cache and ETag)
2. Filter by project declaration (tags / owner / visibility)
3. Load only name + description
4. Download on demand and verify the checksum
5. Record the version used, for reproducibility
```

Project declaration:

```yaml
# .agent/skills.yaml
skills:
  - name: release-checklist
    version: "0.4.0"
  - name: incident-triage
    version: ">=1.0,<2.0"
servers:
  - name: notes
    version: "0.1.0"
```

Pinning versions matters more than `latest`. Agent behavior should be reproducible, not drifting daily.

### Server side

Publishing flow:

```text
commit → CI validation → security scan → human review → sign → publish → update index
```

CI should at least check:

- `SKILL.md` frontmatter is complete (`name`, `description`).
- Names are unique; descriptions are a sensible length.
- Scripts contain no hardcoded secrets.
- Dependency versions are locked.
- Package size is capped.
- The checksum is written into the index.

## Permission model

| Resource | Read | Write | Admin |
| --- | --- | --- | --- |
| Public skill | Everyone | Owner | Platform team |
| Internal skill | Employees | Owner | Platform team |
| Restricted skill | Named groups | Owner | Security team |
| MCP server credentials | Injected at runtime | Security team | Security team |

Skills must not contain secrets. A skill that needs credentials should call an MCP server, and the server handles auth.

## Versions and gradual rollout

- Semantic versioning: `MAJOR.MINOR.PATCH`.
- Breaking changes bump `MAJOR`, and the old version stays for at least a quarter.
- Gradual rollout per project or team:

```json
{
  "name": "release-checklist",
  "channel": "beta",
  "allowed_groups": ["platform-team"],
  "rollout_percent": 10
}
```

- Record the version and checksum of every load so you can roll back.
- Mark `deprecated_at` before removing anything.

## Security

| Risk | Defense |
| --- | --- |
| Malicious skill runs commands | Review + sandbox + script allowlist |
| Supply-chain poisoning | Signing + checksums + locked dependencies |
| Excessive permissions | Skills declare only needed scopes |
| Data exfiltration | Data classification + egress control |
| Name impersonation | Namespacing + owner verification |
| Stale skills | Expiry reminders + forced upgrades |

::: danger A skill is code
`SKILL.md` instructs an agent to run scripts. Treat it like executable code: review, sign, least privilege, and rollback are all required.
:::

## Minimum viable path

If you don't want to build a platform on day one:

1. **Week 1**: One Git repository + `skills/` directory + `index.json`.
2. **Week 2**: CI validates frontmatter, runs secret scanning, generates the index.
3. **Week 3**: Expose `index.json` and `SKILL.md` as MCP resources.
4. **Week 4**: Add OIDC auth and group-based access.
5. **Later**: search, gradual rollout, signing, audit.

## Checklist

- [ ] Every skill has `name`, `description`, and an owner.
- [ ] Projects pin versions; no floating `latest`.
- [ ] The index is machine-readable and includes checksums.
- [ ] Publishing goes through CI and human review.
- [ ] Skills contain no secrets; credentials are injected by MCP servers.
- [ ] Permission tiers and audit exist.
- [ ] Gradual rollout and rollback are supported.
- [ ] Deprecation is a defined process.

## Next

- [MCP vs Skills vs Agents](/en/guide/mcp-vs-skill-agent)
- [Auth & permissions](/en/engineering/auth)
- [Ecosystem 2026](/en/ecosystem/landscape)
