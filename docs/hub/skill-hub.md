---
title: 私有 Skill Hub 与注册发现
description: 把团队经验变成可分发的 Skill，并搭建带权限、版本与发现的内部 Hub。
---

# 私有 Skill Hub 与注册发现

当团队有 20 个 Agent、50 个 MCP Server、上百条「怎么做才对」的经验时，真正的问题不再是「有没有工具」，而是**去哪找、用哪个版本、谁维护**。

私有 Skill Hub 解决三件事：

1. **分发**：Skill 与 MCP Server 的统一目录。
2. **治理**：版本、负责人、评审、权限。
3. **发现**：Agent 启动时按需加载，而不是把一切塞进上下文。

## Skill 是什么

一个 Skill 就是一个目录，核心是 `SKILL.md`：

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

关键设计是**渐进披露**：

| 阶段 | 加载内容 | 成本 |
| --- | --- | --- |
| 启动 | `name` + `description` | 几十 token |
| 触发 | `SKILL.md` 全文 | 几百到几千 token |
| 执行 | `scripts/`、`references/` 按需读取 | 按实际使用 |

这就是为什么 50 个 Skill 可以共存，而 50 个工具定义会撑爆上下文。

## 为什么需要私有 Hub

| 公开市场 | 私有 Hub |
| --- | --- |
| 通用能力 | 公司流程、内部系统 |
| 质量参差 | 评审后发布 |
| 无内部权限 | 按团队 / 项目授权 |
| 版本不可控 | 固定版本、灰度 |
| 无审计 | 谁发布、谁使用可追溯 |

私有 Hub 的典型用户：

- 平台团队：维护公共 Skill 与 MCP Server。
- 业务团队：发布领域 Skill。
- Agent 开发者：按项目声明依赖。
- 安全 / 合规：审批与审计。

## 架构

```text
┌──────────────┐      ┌───────────────────────────┐
│ Agent / Host │─────▶│ Skill Hub API             │
└──────────────┘      │  ├─ 目录与搜索             │
                      │  ├─ 版本与下载             │
                      │  ├─ 权限（OIDC / token）    │
                      │  └─ 审计                   │
                      └──────────┬────────────────┘
                                 │
                 ┌───────────────┼────────────────┐
                 ▼               ▼                ▼
           对象存储        元数据库          CI / 签名服务
         (tar.gz)       (Postgres)        (构建、扫描、签名)
```

最小实现可以只有：

- 一个 Git 仓库（Skill 源文件）。
- 一个静态索引（`index.json`）。
- 一个带 OIDC 的反向代理。

规模上来后再加数据库、搜索、审批流。

## 目录与索引

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

`index.json`：

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

索引要能被机器读取，也要能被搜索。字段至少包含：名称、描述、最新版本、负责人、标签、校验和、下载地址。

## MCP Server 的注册信息

沿用官方 Registry 的 `server.json` 结构，便于以后同步：

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

企业 Hub 可以在官方 schema 上扩展：

| 扩展字段 | 用途 |
| --- | --- |
| `owner` | 负责团队 |
| `visibility` | `public` / `internal` / `restricted` |
| `scopes` | 需要的权限 |
| `data_classification` | 可访问的数据级别 |
| `sla` | 可用性与支持时间 |
| `deprecated_at` | 计划下线时间 |

## 用 MCP 分发 Skill

目前有两条路线：

### 路线 A：Skill 作为普通资源

把 Skill 目录挂成 MCP Resource：

```text
skill://release-checklist/SKILL.md
skill://release-checklist/references/rollback.md
```

Agent 先 `resources/list` 看到名称与描述，需要时再 `resources/read`。实现简单，兼容所有客户端。

### 路线 B：Skills over MCP（草案）

社区提案 SEP-2640 尝试把 Skill 作为一等公民：

- 服务端声明 skills 能力。
- 客户端可以列出、搜索、读取 Skill。
- 支持版本与依赖。
- 与 `SKILL.md` 格式兼容。

草案仍在演进，生产环境建议先用路线 A，把接口抽象成「list / get」，未来替换成本更低。

## 注册与发现

### 客户端视角

```text
1. 读取 Hub 索引（带缓存与 ETag）
2. 按项目声明过滤（tags / owner / visibility）
3. 只加载 name + description
4. 需要时下载并校验 checksum
5. 记录使用的版本，便于复现
```

项目声明示例：

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

固定版本比 `latest` 更重要。Agent 的行为应该可复现，而不是每天漂移。

### 服务端视角

发布流程：

```text
提交 → CI 校验 → 安全扫描 → 人工评审 → 签名 → 发布 → 更新索引
```

CI 至少要检查：

- `SKILL.md` frontmatter 完整（`name`、`description`）。
- 名称唯一、描述长度合理。
- 脚本无硬编码密钥。
- 依赖版本锁定。
- 包大小上限。
- 校验和写入索引。

## 权限模型

| 资源 | 读 | 写 | 管理 |
| --- | --- | --- | --- |
| public Skill | 所有人 | owner | 平台团队 |
| internal Skill | 公司员工 | owner | 平台团队 |
| restricted Skill | 指定组 | owner | 安全团队 |
| MCP Server 凭据 | 运行时注入 | 安全团队 | 安全团队 |

Skill 本身不应该包含密钥。需要凭据的 Skill 应该调用 MCP Server，由 Server 侧完成鉴权。

## 版本与灰度

- 语义化版本：`MAJOR.MINOR.PATCH`。
- 破坏性变更升 `MAJOR`，并保留旧版本至少一个季度。
- 支持按项目 / 团队灰度：

```json
{
  "name": "release-checklist",
  "channel": "beta",
  "allowed_groups": ["platform-team"],
  "rollout_percent": 10
}
```

- 记录每次加载的版本与 checksum，出问题能回滚。
- 废弃时先标记 `deprecated_at`，再下线。

## 安全

| 风险 | 防御 |
| --- | --- |
| 恶意 Skill 执行命令 | 评审 + 沙箱 + 脚本白名单 |
| 供应链投毒 | 签名 + checksum + 锁定依赖 |
| 权限过大 | Skill 只声明需要的 scope |
| 数据外泄 | 数据分级 + 出站管控 |
| 仿冒名称 | 命名空间 + owner 校验 |
| 过期 Skill | 自动过期提醒 + 强制升级 |

::: danger Skill 就是代码
`SKILL.md` 会指导 Agent 执行脚本。把它当成可执行代码来管理：评审、签名、最小权限、可回滚，一个都不能少。
:::

## 最小落地路径

如果不想一开始就建平台：

1. **第 1 周**：一个 Git 仓库 + `skills/` 目录 + `index.json`。
2. **第 2 周**：CI 校验 frontmatter、跑 secret 扫描、生成索引。
3. **第 3 周**：用 MCP Resource 暴露 `index.json` 与 `SKILL.md`。
4. **第 4 周**：加 OIDC 鉴权与按组授权。
5. **之后**：按需加搜索、灰度、签名、审计。

## 检查清单

- [ ] 每个 Skill 有 `name`、`description`、owner。
- [ ] 项目锁定版本，不使用浮动 `latest`。
- [ ] 索引可机器读取，带 checksum。
- [ ] 发布经过 CI 与人工评审。
- [ ] Skill 不含密钥，凭据由 MCP Server 注入。
- [ ] 有权限分级与审计。
- [ ] 支持灰度与回滚。
- [ ] 废弃流程明确。

## 下一步

- [MCP vs Skill vs Agent](/guide/mcp-vs-skill-agent)
- [鉴权与权限控制](/engineering/auth)
- [生态地图 2026](/ecosystem/landscape)
