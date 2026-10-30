---
title: 日志与可观测
description: 结构化日志、指标、链路追踪与审计：让每一次工具调用都能被定位。
---

# 日志与可观测

MCP Server 出问题时，症状通常很模糊：Host 说「工具调用失败」、用户说「很慢」、模型说「没有权限」。可观测性决定你能否在 5 分钟内定位，而不是靠猜。

## 四个平面

| 平面 | 回答的问题 | 去向 |
| --- | --- | --- |
| 日志 | 发生了什么？ | stderr / 日志平台 |
| 指标 | 整体健康吗？ | Prometheus / OTLP |
| 链路 | 慢在哪一步？ | OpenTelemetry |
| 审计 | 谁做了什么？ | 独立、不可篡改的存储 |

审计不是普通日志。它需要长期保留、按租户检索、访问受控，通常还要满足合规要求。

## stdio 的特殊规则

stdio Server 的 stdout 属于协议，**所有日志必须写 stderr**：

```python
import logging
import sys

logging.basicConfig(
    stream=sys.stderr,
    level=logging.INFO,
    format='{"ts":"%(asctime)s","level":"%(levelname)s","logger":"%(name)s","msg":"%(message)s"}',
)

log = logging.getLogger("notes")
log.info("server started")
```

更稳妥的做法是直接输出 JSON：

```python
import json, sys, time

def log_event(**fields):
    fields.setdefault("ts", time.time())
    sys.stderr.write(json.dumps(fields, ensure_ascii=False) + "\n")
    sys.stderr.flush()
```

TypeScript 同理：用 `console.error` 或结构化 logger，绝不 `console.log`。

## 结构化日志字段

一条工具调用日志至少包含：

```json
{
  "ts": "2026-10-30T12:00:00.123Z",
  "level": "info",
  "event": "tool_call",
  "trace_id": "4bf92f3577b34da6a3ce929d0e0e4736",
  "span_id": "00f067aa0ba902b7",
  "tenant": "acme",
  "sub": "user_123",
  "tool": "search_notes",
  "args_hash": "sha256:9f2c...",
  "status": "ok",
  "duration_ms": 42,
  "result_bytes": 812,
  "transport": "stdio"
}
```

原则：

- **字段名稳定**，方便查询与告警。
- **记录摘要，不记录原文**：参数可能含隐私，结果可能很大。
- **错误记录错误码**，不是整段堆栈；堆栈单独存。
- **时间统一 UTC**，带毫秒。

## 链路追踪

MCP 2026 修订版在请求 `_meta` 中支持 W3C Trace Context（`traceparent` / `tracestate`）。做法：

1. 从入站请求读取 `traceparent`，没有就新建。
2. 为每个工具调用创建 span，属性包含工具名、租户、结果码。
3. 调用下游时注入 `traceparent`。
4. 把 `trace_id` 返回给客户端，便于用户报障。

Python（OpenTelemetry）示意：

```python
from opentelemetry import trace
from opentelemetry.propagate import extract, inject

tracer = trace.get_tracer("notes-mcp")

async def handle_tool(name: str, args: dict, meta: dict):
    ctx = extract(meta)  # 读取 traceparent
    with tracer.start_as_current_span(f"tool.{name}", context=ctx) as span:
        span.set_attribute("mcp.tool", name)
        span.set_attribute("tenant.id", current_tenant())
        try:
            result = await dispatch(name, args)
            span.set_attribute("mcp.status", "ok")
            return result
        except Exception as exc:
            span.record_exception(exc)
            span.set_attribute("mcp.status", "error")
            raise
```

TypeScript 用 `@opentelemetry/api` 的 `propagation.extract` / `inject`，思路一致。

::: tip 无状态也要传递
即使 Server 不保存会话，也要把 trace 上下文随请求传下去。否则一次跨三个服务的调用断成三段，排障时只能靠时间戳猜。
:::

## 指标

最小指标集：

| 指标 | 类型 | 标签 |
| --- | --- | --- |
| `mcp_tool_calls_total` | Counter | tool, status, tenant |
| `mcp_tool_duration_ms` | Histogram | tool |
| `mcp_tool_result_bytes` | Histogram | tool |
| `mcp_inflight_requests` | Gauge | transport |
| `mcp_auth_failures_total` | Counter | reason |
| `mcp_rate_limited_total` | Counter | tenant |

建议分位数：p50 / p95 / p99。告警示例：

```text
# 错误率
sum(rate(mcp_tool_calls_total{status="error"}[5m]))
  / sum(rate(mcp_tool_calls_total[5m])) > 0.05

# p95 延迟
histogram_quantile(0.95, sum(rate(mcp_tool_duration_ms_bucket[5m])) by (le, tool)) > 3000

# 鉴权失败突增
increase(mcp_auth_failures_total[10m]) > 50
```

不要按 `sub` 做指标标签，基数会爆炸。用户维度放日志与审计。

## 采样

- **错误全采**，成功请求按 1%–10% 采样。
- **慢请求全采**（超过 p95 阈值）。
- **审计不采样**，每一笔都要留。
- 采样决策在入口做，并把决策写入 trace，避免下游重复判断。

## 脱敏

日志进入平台前必须过滤：

```python
SENSITIVE = {"authorization", "cookie", "password", "token", "api_key", "secret"}

def redact(data: dict) -> dict:
    return {
        key: ("***" if key.lower() in SENSITIVE else value)
        for key, value in data.items()
    }
```

注意：

- URL 查询参数也可能带 token。
- 错误对象里的 `request.headers` 常常整包泄露。
- 用户输入的文本可能包含个人信息，记录 hash 或长度即可。

## 审计日志

审计关注「谁对什么做了什么」：

```json
{
  "ts": "2026-10-30T12:00:00Z",
  "actor": {"sub": "user_123", "tenant": "acme", "ip": "203.0.113.7"},
  "action": "note.delete",
  "resource": "notes/onboarding",
  "result": "allowed",
  "policy": "notes:delete",
  "trace_id": "4bf92f35..."
}
```

要求：

- 只追加，不可修改。
- 与业务库分离，独立保留策略。
- 支持按租户、用户、时间、工具检索。
- 记录拒绝事件，而不只是成功事件。

## 排查流程

当用户报告「调用失败」时：

```text
1. 让用户提供 trace_id（或时间 + 租户 + 工具名）
2. 在日志中查该 trace 的所有事件
3. 看 span：卡在鉴权、数据库、还是下游 API
4. 对照指标：是单点故障还是整体劣化
5. 查审计：是否有权限拒绝
6. 复现：用 Inspector 带相同参数调用
```

如果返回给用户的错误里没有 `trace_id`，这一步就无法开始。**所有内部错误都应带 trace_id。**

## 仪表盘建议

一屏放得下的四个图：

1. 调用量按工具（Top 10）。
2. 错误率与错误码分布。
3. p50 / p95 / p99 延迟。
4. 鉴权失败与限流次数。

再加一个「按租户的调用量」，用于发现异常租户或计费核对。

## 检查清单

- [ ] stdio 模式日志全部走 stderr。
- [ ] 日志是结构化 JSON，字段稳定。
- [ ] 每次调用有 `trace_id`，并透传到下游。
- [ ] 错误返回包含 `trace_id`，不包含堆栈。
- [ ] 有调用量、错误率、延迟、结果大小四类指标。
- [ ] 敏感字段在入库前脱敏。
- [ ] 审计日志独立存储、只追加、可检索。
- [ ] 告警有明确的阈值与 Runbook。
- [ ] 采样策略不会漏掉错误与慢请求。

## 下一步

- [鉴权与权限控制](/engineering/auth)
- [多租户隔离](/engineering/multi-tenant)
- [调试排坑](/debugging/troubleshooting)
