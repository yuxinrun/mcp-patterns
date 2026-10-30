---
title: 数据库查询
description: 把数据库安全地暴露给模型：只读账号、语句白名单、参数化、超时与行数上限。
---

# 数据库查询

「给模型一个 `run_sql` 工具」是很多团队的第一个 MCP 想法，也是最容易出事的想法。模型会写出全表扫描、笛卡尔积、`DROP TABLE`，或者把你的生产库当成 playground。

正确目标不是「让模型随便查」，而是**在可控边界内回答业务问题**。

## 三种暴露方式

| 方式 | 灵活度 | 风险 | 建议 |
| --- | --- | --- | --- |
| 预定义查询模板 | 低 | 低 | ✅ 面向业务用户 |
| 只读 SQL + 解析器 | 中 | 中 | ✅ 面向分析师，严格限制 |
| 任意 SQL | 高 | 高 | ❌ 生产环境不要 |

大多数 Agent 场景用**预定义模板 + 参数**就够了：

```text
list_tables()
describe_table(table)
find_orders(customer_email, since)
revenue_by_month(tenant, year)
```

模型不需要会写 SQL，也能完成任务。

## 只读账号

无论用哪种方式，数据库账号必须：

```sql
CREATE ROLE mcp_reader LOGIN PASSWORD '...';
GRANT CONNECT ON DATABASE app TO mcp_reader;
GRANT USAGE ON SCHEMA public TO mcp_reader;
GRANT SELECT ON ALL TABLES IN SCHEMA public TO mcp_reader;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT ON TABLES TO mcp_reader;

-- 限制资源
ALTER ROLE mcp_reader SET statement_timeout = '10s';
ALTER ROLE mcp_reader SET idle_in_transaction_session_timeout = '30s';
ALTER ROLE mcp_reader SET work_mem = '32MB';
```

再加一层：

- 独立的只读副本，不给主库地址。
- 网络层只允许 MCP Server 访问。
- 行级安全（RLS）按租户隔离。
- 禁止 `pg_read_server_files` 等超级权限。

::: warning 只读不等于安全
`SELECT * FROM users` 也是只读。只读账号防的是写破坏，不防数据泄露。租户过滤、列级权限、脱敏仍然必须做。
:::

## 预定义查询

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

工具层只暴露参数，不暴露 SQL：

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

好处：

- SQL 在代码里 review，模型无法注入。
- 参数化查询，天然防注入。
- 行数、超时、租户过滤都在服务端固定。
- 输出字段稳定，便于模型理解。

## 只读 SQL 工具

如果确实需要开放查询，至少做四层限制：

### 1. 语法解析与语句类型白名单

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

不要用正则判断 SQL 类型。注释、大小写、CTE、`SELECT ... INTO` 都能绕过简单规则。

### 2. 强制 `LIMIT`

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

### 3. 数据库层兜底

- 只读账号。
- `statement_timeout`。
- 只读副本。
- RLS 按租户过滤。

### 4. 结果脱敏与截断

```python
SENSITIVE_COLUMNS = {"password_hash", "ssn", "api_key", "email"}

def shape_row(row: dict) -> dict:
    return {
        key: ("***" if key in SENSITIVE_COLUMNS else value)
        for key, value in row.items()
    }
```

## 执行与超时

```python
import asyncio

async def fetch_with_timeout(conn, sql: str, *args, timeout: float = 10.0):
    try:
        async with asyncio.timeout(timeout):
            return await conn.fetch(sql, *args)
    except TimeoutError:
        raise RuntimeError("query timed out after 10s; add filters or reduce the range")
```

数据库侧也要设置：

```sql
SET LOCAL statement_timeout = '10s';
SET LOCAL idle_in_transaction_session_timeout = '15s';
```

两层超时缺一不可：应用层防止协程挂死，数据库层防止连接被长期占用。

## 连接池

- 池大小按实例数 × 并发估算，不要每租户一个池。
- 设置获取连接超时，避免请求堆积。
- 只读查询使用独立池，避免被写入事务阻塞。
- 定期回收空闲连接。

```python
pool = await asyncpg.create_pool(
    dsn=os.environ["DATABASE_URL"],
    min_size=2,
    max_size=10,
    command_timeout=10,
    max_inactive_connection_lifetime=300,
)
```

## Schema 说明

模型需要知道表结构。提供 `list_tables` / `describe_table`，但**只暴露允许查询的表和列**：

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

不要让 `information_schema` 全量暴露，攻击者可以从表名和列名推断业务结构。

## 多租户

行级隔离的每个查询都必须带 `tenant_id`。建议把它封装在数据访问层，工具代码不允许直接拼 SQL：

```python
class TenantRepo:
    def __init__(self, conn, tenant: str):
        self.conn = conn
        self.tenant = tenant

    async def fetch(self, sql: str, *args):
        # 约定：SQL 的第一个占位符永远是 tenant_id
        return await self.conn.fetch(sql, self.tenant, *args)
```

更彻底的做法是数据库 RLS：

```sql
ALTER TABLE orders ENABLE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation ON orders
  USING (tenant_id = current_setting('app.tenant_id', true));
```

连接建立时执行 `SET app.tenant_id = '...'`。这样即使代码漏了条件，数据库也会兜底。

## 输出与分页

| 项目 | 建议 |
| --- | --- |
| 单次返回行数 | ≤ 100 |
| 单字段大小 | 截断到 4 KB |
| 总结果 | ≤ 1 MB |
| 分页 | `cursor` / `offset`，并返回 `has_more` |
| 时间 | ISO 8601 UTC |
| 金额 | 整数分，避免浮点误差 |

```python
return {
    "count": len(rows),
    "rows": [shape_row(dict(row)) for row in rows],
    "has_more": len(rows) == limit,
    "next_cursor": rows[-1]["id"] if len(rows) == limit else None,
}
```

## 测试

| 用例 | 期望 |
| --- | --- |
| 非 SELECT 语句 | 拒绝 |
| 多语句 | 拒绝 |
| 未授权表 | 拒绝 |
| 无 LIMIT | 自动加 limit |
| 超大 LIMIT | 夹紧到上限 |
| 查询超时 | 返回 `timeout`，连接回收 |
| 跨租户查询 | 0 行或 403 |
| 敏感列 | 脱敏 |

## 检查清单

- [ ] 使用只读账号与只读副本。
- [ ] 优先预定义查询，参数化执行。
- [ ] 开放 SQL 时使用解析器 + 表白名单 + 语句类型限制。
- [ ] 强制行数上限与语句超时。
- [ ] 租户过滤在数据访问层统一注入。
- [ ] 敏感列脱敏。
- [ ] 连接池大小与超时合理。
- [ ] 查询日志记录耗时、行数、租户，不记录完整 SQL 参数。

## 下一步

- [API 代理](/recipes/api-proxy)
- [多租户隔离](/engineering/multi-tenant)
- [日志与可观测](/engineering/observability)
