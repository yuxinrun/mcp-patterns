---
title: Multi-tenancy
description: Where the tenant comes from, how data is isolated, and how to split credentials and quotas.
---

# Multi-tenancy

Serving multiple customers from one MCP server creates one catastrophic risk: **cross-tenant data leaks**. A single missing `WHERE tenant_id = ?` can return another company's data.

Answer three questions first:

1. **Where does tenant identity come from?** (trusted source)
2. **At what granularity is data isolated?** (row / schema / database / instance)
3. **How are credentials and quotas split?**

## Tenant identity

| Source | Trust | Recommendation |
| --- | --- | --- |
| `tenant` claim in the token | High | ✅ Default |
| `sub` mapped to a tenant | High | ✅ Single-tenant users |
| API key bound to a tenant | Medium | ✅ M2M, rotate keys |
| `X-Tenant-Id` header | Low | ❌ Cross-check with token |
| `tenant_id` tool argument | Very low | ❌ Admin-only, audited |

Take the tenant **only from the authentication result** and store it in request-scoped context. Business code should not accept a tenant parameter.

```python
from contextvars import ContextVar

tenant_ctx: ContextVar[str] = ContextVar("tenant_id")

def current_tenant() -> str:
    try:
        return tenant_ctx.get()
    except LookupError:
        raise RuntimeError("tenant context is not set")
```

```python
claims = verifier.verify(token)
tenant = claims.get("tenant")
if not tenant:
    raise PermissionError("token is not bound to a tenant")
tenant_ctx.set(tenant)
```

::: warning Stateless HTTP
Requests may land on different replicas. Never keep the current tenant in a global or singleton; use contextvars / AsyncLocalStorage and clear them at the end of the request.
:::

## Isolation levels

| Level | Approach | Isolation | Cost | Use |
| --- | --- | --- | --- | --- |
| Row | `tenant_id` on every table | Medium | Low | Mainstream SaaS |
| Schema | One schema per tenant | High | Medium | Larger customers |
| Database | One database per tenant | High | High | Compliance |
| Instance | Dedicated deployment | Highest | Highest | Finance, government |

Start with rows plus mandatory filtering and tests. Move up when compliance or a large customer requires it.

### Three hard rules for row isolation

1. Every query filters by tenant, including updates, deletes, aggregates, and joins.
2. The database role is scoped to the current schema; no cross-database access.
3. Cache keys include the tenant.

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
        tenant, f"%{query}%", limit,
    )
    return [dict(row) for row in rows]
```

Never make the tenant filter optional:

```python
# Dangerous: missing tenant returns everything
where = "WHERE 1=1"
if tenant:
    where += f" AND tenant_id = '{tenant}'"
```

## Credentials

| Approach | Notes |
| --- | --- |
| Secret manager | Path per tenant, read at runtime |
| Encrypted column | Per-tenant KMS key |
| Vault dynamic credentials | Short-lived accounts, strongest |
| Environment variables | Single tenant only |

Never share one high-privilege database account across tenants, log credentials, or cache plaintext secrets.

## Pools and resources

Per-tenant pools exhaust database connections. Shard tenants across a fixed number of pools, cap concurrency per tenant, isolate slow queries, and force pagination.

```python
POOLS = [create_pool(dsn) for dsn in DSN_LIST]

def pool_for(tenant: str):
    return POOLS[hash(tenant) % len(POOLS)]
```

## Quotas

| Dimension | Example | Behavior |
| --- | --- | --- |
| Requests | 60 rpm per tenant | 429 + `Retry-After` |
| Concurrency | 5 per tenant | Queue or reject |
| Result size | 1 MB per call | Truncate and mark |
| Expensive calls | 10 full scans/hour | Reject |
| Storage | 1 GB per tenant | Write fails |

Configure quotas **per tool**; search and export should not share a threshold.

## Caching

Key format:

```text
{tenant}:{tool}:{normalized_args_hash}:{schema_version}
```

Do not cache private raw results without a short TTL. Clear by prefix when a tenant is deleted. Tenant-prefix negative caches too, so “not found” does not leak existence.

## Audit

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

Store audit separately from application logs with retention and access controls. Avoid full arguments unless they are known non-sensitive.

## Cross-tenant tests

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

Also test explicit foreign `tenant_id` arguments and cache collisions between tenants.

## Common failures

::: danger Seen in production
1. Trusting `X-Tenant-Id` without validating it against the token.
2. Admin tools accepting any `tenant_id` from normal users.
3. Cache keys without a tenant, returning A's data to B.
4. A global singleton holding the current tenant, causing cross-talk under concurrency.
5. A database role with permissions broad enough to bypass row filters.
6. Error messages leaking another tenant's resource names.
7. Backup and export scripts forgetting the tenant filter.
:::

## Checklist

- [ ] Tenant comes only from trusted auth.
- [ ] Every data path filters by tenant.
- [ ] Cache keys include the tenant.
- [ ] Credentials are per-tenant and rotatable.
- [ ] Per-tenant QPS, concurrency, and result limits.
- [ ] Audit is searchable by tenant.
- [ ] Cross-tenant tests run in CI.
- [ ] Tenant deletion has a complete cleanup path.

## Next

- [Auth and permissions](/en/engineering/auth)
- [Observability](/en/engineering/observability)
- [Database recipe](/en/recipes/database)
