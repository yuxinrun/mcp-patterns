---
title: 多租户隔离
description: 租户从哪来、数据怎么隔离、凭据怎么管、配额怎么做：MCP 服务多租户的完整清单。
---

# 多租户隔离

当你的 MCP Server 服务多个客户时，最大的风险不是性能，而是**串数据**。一次漏掉 `WHERE tenant_id = ?`，就可能把 A 公司的数据返回给 B 公司。

多租户设计要先回答三个问题：

1. **租户身份从哪来？**（可信来源）
2. **数据用什么粒度隔离？**（行 / schema / 库 / 实例）
3. **凭据与配额怎么按租户切分？**

## 租户身份从哪来

| 来源 | 可信度 | 建议 |
| --- | --- | --- |
| token 的 `tenant` claim | 高 | ✅ 默认方案 |
| token 的 `sub` 映射到租户 | 高 | ✅ 单用户单租户场景 |
| API key 绑定租户 | 中 | ✅ 机器对机器，注意轮换 |
| 请求 header `X-Tenant-Id` | 低 | ❌ 必须与 token 交叉校验 |
| 工具参数 `tenant_id` | 很低 | ❌ 仅管理员工具可用，且需审计 |

最稳妥的做法：**租户只从鉴权结果中取**，并在请求入口写入上下文，业务代码不再接受租户参数。

```python
from contextvars import ContextVar

tenant_ctx: ContextVar[str] = ContextVar("tenant_id")

def current_tenant() -> str:
    try:
        return tenant_ctx.get()
    except LookupError:
        raise RuntimeError("tenant context is not set")
```

HTTP 中间件里设置：

```python
claims = verifier.verify(token)
tenant = claims.get("tenant")
if not tenant:
    raise PermissionError("token is not bound to a tenant")
tenant_ctx.set(tenant)
```

::: warning 无状态模式
Streamable HTTP 的 stateless 模式每个请求可能落在不同实例上，**不要用全局变量或单例缓存租户信息**。用请求级上下文（contextvar / AsyncLocalStorage），并在请求结束时清理。
:::

## 隔离级别

| 级别 | 做法 | 隔离性 | 成本 | 适用 |
| --- | --- | --- | --- | --- |
| 行级 | 所有表带 `tenant_id` | 中 | 低 | SaaS 主流 |
| Schema 级 | 每租户一个 schema | 较高 | 中 | 中大型客户 |
| 库级 | 每租户一个数据库 | 高 | 高 | 强合规 |
| 实例级 | 每租户独立部署 | 最高 | 最高 | 金融、政企 |

选择建议：

- **起步用行级 + 强制过滤**，配合审计与测试。
- 有合规要求或大客户时，升级到 schema / 库级。
- 实例级适合「专属部署」产品，不是通用 SaaS 的默认。

### 行级隔离的三个硬约束

1. **所有查询必须带租户条件**，包括 `UPDATE`、`DELETE`、聚合、关联查询。
2. **数据库账号只授予当前 schema 的权限**，禁止跨库。
3. **缓存 key 必须带租户前缀**，否则会命中别人的缓存。

```python
async def list_notes(conn, query: str, limit: int) -> list[dict]:
    tenant = current_tenant()
    rows = await conn.fetch(
        """
        SELECT name, snippet
        FROM notes
        WHERE tenant_id = $1 AND content ILIKE $2
        ORDER BY updated_at DESC
        LIMIT $3
        """,
        tenant,
        f"%{query}%",
        limit,
    )
    return [dict(row) for row in rows]
```

不要拼接 SQL，也不要把 tenant 做成可选条件：

```python
# 危险：忘记传 tenant 就返回全量
where = "WHERE 1=1"
if tenant:
    where += f" AND tenant_id = '{tenant}'"
```

## 凭据管理

每个租户的下游凭据（数据库密码、第三方 API key）必须独立：

| 方案 | 说明 |
| --- | --- |
| Secret Manager | 按 `tenant/{id}/...` 存路径，运行时短时读取 |
| KMS 加密列 | 凭据加密后存库，解密密钥按租户隔离 |
| Vault 动态凭据 | 每次连接生成短期账号，最安全 |
| 环境变量 | 只适合单租户，不要用于多租户 |

禁止：

- 所有租户共用一个高权限数据库账号。
- 把凭据写进日志、错误信息、工具返回值。
- 在缓存中存明文凭据。

## 连接池与资源

每个租户独立连接池会迅速耗尽数据库连接。推荐：

- **按租户分片到固定数量的池**（如 8 个池，租户哈希取模）。
- 设置每租户最大并发与超时。
- 慢查询按租户隔离，避免一个租户拖垮所有人。
- 大结果集强制分页，禁止无 `LIMIT` 查询。

```python
POOLS = [create_pool(dsn) for dsn in DSN_LIST]

def pool_for(tenant: str):
    return POOLS[hash(tenant) % len(POOLS)]
```

## 配额与限流

| 维度 | 示例 | 超限行为 |
| --- | --- | --- |
| 请求数 | 60 rpm / 租户 | 429 + `Retry-After` |
| 并发 | 5 / 租户 | 排队或拒绝 |
| 单次结果 | 1 MB / 调用 | 截断并标记 |
| 昂贵操作 | 全表扫描 10 次/小时 | 拒绝并提示 |
| 存储 | 1 GB / 租户 | 写入失败 |

配额要能**按工具**配置。搜索和全量导出显然不该共享同一个阈值。

## 缓存

缓存 key 至少包含：

```text
{tenant}:{tool}:{normalized_args_hash}:{schema_version}
```

注意：

- 不要缓存包含用户隐私的原始结果，或设置很短 TTL。
- 租户删除时，按前缀清理缓存。
- 负缓存（not found）也要带租户，避免跨租户泄露存在性。
- 分布式缓存要校验实例间时钟与 TTL 一致性。

## 审计

每个工具调用至少记录：

```json
{
  "ts": "2026-10-30T12:00:00Z",
  "trace_id": "4bf92f3577b34da6a3ce929d0e0e4736",
  "tenant": "acme",
  "sub": "user_123",
  "tool": "search_notes",
  "args_hash": "sha256:...",
  "status": "ok",
  "duration_ms": 42,
  "result_bytes": 812
}
```

审计日志与业务日志分开存储，设置保留期与访问控制。**不要记录完整参数**，除非参数本身不含敏感信息。

## 测试跨租户隔离

必须有的自动化测试：

```python
async def test_cannot_read_other_tenant_note(client_acme, note_id_of_globex):
    result = await client_acme.call_tool("read_note", {"name": note_id_of_globex})
    assert result.is_error
    assert "not found" in result.content[0].text.lower()

async def test_list_only_returns_own_tenant(client_acme):
    result = await client_acme.call_tool("search_notes", {"query": ""})
    names = {m["name"] for m in result.structured_content["matches"]}
    assert names.isdisjoint(GLOBEX_NOTE_NAMES)
```

再加两类：

- **越权参数**：显式传别人的 `tenant_id`，应被忽略或拒绝。
- **缓存穿透**：A 租户查询后，B 租户用相同参数查询，不能命中 A 的结果。

## 常见错误

::: danger 多租户翻车现场
1. 从 `X-Tenant-Id` 取租户，却没和 token 校验。
2. 管理工具接受任意 `tenant_id`，普通用户也能调用。
3. 缓存 key 不含租户，A 的结果返回给 B。
4. 全局单例保存 `current_tenant`，并发时串号。
5. 数据库账号权限过大，行级过滤被绕过。
6. 错误信息带出其他租户的资源名。
7. 备份 / 导出脚本忘记按租户过滤。
:::

## 上线检查

- [ ] 租户只来自可信鉴权结果。
- [ ] 所有数据访问路径都带租户条件。
- [ ] 缓存 key 含租户。
- [ ] 每租户凭据独立，可轮换。
- [ ] 有按租户的 QPS / 并发 / 结果大小限制。
- [ ] 审计日志可按租户检索。
- [ ] 跨租户测试进入 CI。
- [ ] 删除租户有完整的数据清理流程。

## 下一步

- [鉴权与权限控制](/engineering/auth)
- [日志与可观测](/engineering/observability)
- [数据库查询案例](/recipes/database)
