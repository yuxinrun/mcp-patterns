---
title: Database queries
description: Expose a database safely — read-only role, query allowlists, parameterization, timeouts and row caps.
---

# Database queries

"Give the model a `run_sql` tool" is the first MCP idea most teams have, and the easiest one to regret. The model will write full table scans, cartesian joins, `DROP TABLE`, or treat production as a playground.

The goal is not "let the model query anything". It's **answer business questions inside a controlled boundary**.

## Three ways to expose data

| Approach | Flexibility | Risk | Recommendation |
| --- | --- | --- | --- |
| Predefined query specs | Low | Low | ✅ For business users |
| Read-only SQL + parser | Medium | Medium | ✅ For analysts, tightly bounded |
| Arbitrary SQL | High | High | ❌ Not in production |

For most agent scenarios, **predefined specs with parameters** are enough:

```text
list_tables()
describe_table(table)
find_orders(customer_email, since)
revenue_by_month(tenant, year)
```

The model doesn't need to write SQL to get the job done.

## Read-only role

Whichever approach you pick, the database account must be constrained:

```sql
CREATE ROLE mcp_reader LOGIN PASSWORD '...';
GRANT CONNECT ON DATABASE app TO mcp_reader;
GRANT USAGE ON SCHEMA public TO mcp_reader;
GRANT SELECT ON ALL TABLES IN SCHEMA public TO mcp_reader;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT ON TABLES TO mcp_reader;

-- Resource limits
ALTER ROLE mcp_reader SET statement_timeout = '10s';
ALTER ROLE mcp_reader SET idle_in_transaction_session_timeout = '30s';
ALTER ROLE mcp_reader SET work_mem = '32MB';
```

Then add another layer:

- A dedicated read replica, not the primary.
- Network policy that only the MCP server can reach.
- Row-level security (RLS) per tenant.
- No superuser capabilities such as `pg_read_server_files`.

::: warning Read-only is not safe
`SELECT * FROM users` is also read-only. A read-only role prevents destruction, not exfiltration. Tenant filters, column permissions, and masking are still required.
:::

## Predefined queries

```python
from dataclasses import dataclass
from datetime import date

@dataclass(frozen=True)
class QuerySpec:
    sql: str
    max_rows: int = 100

QUERIES = {
    "orders_by_customer": QuerySpec(
        sql="""
            SELECT id, status, total_cents, created_at
            FROM orders
            WHERE tenant_id = $1 AND customer_email = $2 AND created_at >= $3
            ORDER BY created_at DESC
            LIMIT $4
        """,
        max_rows=50,
    ),
    "revenue_by_month": QuerySpec(
        sql="""
            SELECT date_trunc('month', created_at) AS month,
                   sum(total_cents) AS revenue_cents
            FROM orders
            WHERE tenant_id = $1 AND created_at >= $2
            GROUP BY 1
            ORDER BY 1
        """,
        max_rows=24,
    ),
}
```

The tool surface exposes parameters, not SQL:

```python
@mcp.tool()
async def find_orders(customer_email: str, since: str = "2026-01-01", limit: int = 20) -> dict:
    """Find recent orders for a customer email.

    Returns id, status, total_cents, created_at. At most 50 rows.
    """
    limit = max(1, min(limit, 50))
    since_date = date.fromisoformat(since)
    async with pool.acquire() as conn:
        rows = await conn.fetch(
            QUERIES["orders_by_customer"].sql,
            current_tenant(),
            customer_email,
            since_date,
            limit,
        )
    return {"count": len(rows), "orders": [dict(row) for row in rows]}
```

Why this works:

- SQL is reviewed in code; the model cannot inject it.
- Parameterized execution blocks injection by construction.
- Row limits, timeouts, and tenant filters are fixed server-side.
- Output shape is stable, which makes it easier for the model to use.

## A read-only SQL tool

If you truly need open queries, apply four layers.

### 1. Parse and allowlist statement types

```python
import sqlglot
from sqlglot import exp

ALLOWED_TABLES = {"orders", "customers", "products"}

def validate_readonly(sql: str) -> str:
    statements = sqlglot.parse(sql, read="postgres")
    if len(statements) != 1:
        raise ValueError("only a single statement is allowed")

    statement = statements[0]
    if not isinstance(statement, exp.Select):
        raise ValueError("only SELECT is allowed")

    for table in statement.find_all(exp.Table):
        if table.name not in ALLOWED_TABLES:
            raise ValueError(f"table not allowed: {table.name}")

    for node in statement.walk():
        if isinstance(node, (exp.Insert, exp.Update, exp.Delete, exp.Drop, exp.Create, exp.Command)):
            raise ValueError("write operations are not allowed")

    return statement.sql(dialect="postgres")
```

Don't classify SQL with regexes. Comments, casing, CTEs, and `SELECT ... INTO` all defeat simple rules.

### 2. Force a `LIMIT`

```python
def enforce_limit(sql: str, max_rows: int = 200) -> str:
    statement = sqlglot.parse_one(sql, read="postgres")
    existing = statement.args.get("limit")
    if existing is None:
        return statement.limit(max_rows).sql(dialect="postgres")
    value = int(existing.expression.this)
    if value > max_rows:
        return statement.limit(max_rows).sql(dialect="postgres")
    return statement.sql(dialect="postgres")
```

### 3. Database-level backstop

- Read-only role.
- `statement_timeout`.
- Read replica.
- RLS filtering by tenant.

### 4. Mask and truncate results

```python
SENSITIVE_COLUMNS = {"password_hash", "ssn", "api_key", "email"}

def shape_row(row: dict) -> dict:
    return {
        key: ("***" if key in SENSITIVE_COLUMNS else value)
        for key, value in row.items()
    }
```

## Execution and timeouts

```python
import asyncio

async def fetch_with_timeout(conn, sql: str, *args, timeout: float = 10.0):
    try:
        async with asyncio.timeout(timeout):
            return await conn.fetch(sql, *args)
    except TimeoutError:
        raise RuntimeError("query timed out after 10s; add filters or reduce the range")
```

Set the database side too:

```sql
SET LOCAL statement_timeout = '10s';
SET LOCAL idle_in_transaction_session_timeout = '15s';
```

You need both. The application timeout stops a hung coroutine; the database timeout stops a connection being held hostage.

## Connection pools

- Size the pool by instance count × concurrency, not one pool per tenant.
- Set an acquisition timeout so requests don't pile up.
- Use a separate pool for read-only queries so writes can't block them.
- Recycle idle connections.

```python
pool = await asyncpg.create_pool(
    dsn=os.environ["DATABASE_URL"],
    min_size=2,
    max_size=10,
    command_timeout=10,
    max_inactive_connection_lifetime=300,
)
```

## Schema description

The model needs to know the schema. Provide `list_tables` / `describe_table`, but **only expose allowed tables and columns**:

```python
@mcp.tool()
async def describe_table(table: str) -> dict:
    """Describe an allowed table: columns, types and a short comment."""
    if table not in ALLOWED_TABLES:
        raise ValueError("unknown table")
    rows = await pool.fetch(
        """
        SELECT column_name, data_type, is_nullable
        FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = $1
        ORDER BY ordinal_position
        """,
        table,
    )
    return {"table": table, "columns": [dict(row) for row in rows]}
```

Don't expose all of `information_schema`; table and column names alone reveal business structure.

## Multi-tenancy

Every query in a row-isolated design must carry `tenant_id`. Put that in the data-access layer so tool code never builds SQL directly:

```python
class TenantRepo:
    def __init__(self, conn, tenant: str):
        self.conn = conn
        self.tenant = tenant

    async def fetch(self, sql: str, *args):
        # Convention: the first placeholder is always tenant_id.
        return await self.conn.fetch(sql, self.tenant, *args)
```

A stronger option is database RLS:

```sql
ALTER TABLE orders ENABLE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation ON orders
  USING (tenant_id = current_setting('app.tenant_id', true));
```

Run `SET app.tenant_id = '...'` when the connection is established. Even if application code forgets a filter, the database enforces it.

## Output and pagination

| Item | Recommendation |
| --- | --- |
| Rows per call | ≤ 100 |
| Field size | Truncate at 4 KB |
| Total result | ≤ 1 MB |
| Pagination | `cursor` / `offset` with `has_more` |
| Time | ISO 8601 UTC |
| Money | Integer cents, never floats |

```python
return {
    "count": len(rows),
    "rows": [shape_row(dict(row)) for row in rows],
    "has_more": len(rows) == limit,
    "next_cursor": rows[-1]["id"] if len(rows) == limit else None,
}
```

## Test matrix

| Case | Expected |
| --- | --- |
| Non-SELECT statement | Rejected |
| Multiple statements | Rejected |
| Unauthorized table | Rejected |
| No LIMIT | Limit added |
| Huge LIMIT | Clamped |
| Query timeout | `timeout` error, connection recycled |
| Cross-tenant query | 0 rows or 403 |
| Sensitive column | Masked |

## Checklist

- [ ] Read-only account and read replica.
- [ ] Predefined, parameterized queries by default.
- [ ] Open SQL guarded by parser + table allowlist + statement type.
- [ ] Enforced row cap and statement timeout.
- [ ] Tenant filter injected in the data-access layer.
- [ ] Sensitive columns masked.
- [ ] Pool sizes and timeouts configured.
- [ ] Query logs record duration, rows, tenant — not full parameters.

## Next

- [API proxy](/en/recipes/api-proxy)
- [Multi-tenancy](/en/engineering/multi-tenant)
- [Logging & observability](/en/engineering/observability)
