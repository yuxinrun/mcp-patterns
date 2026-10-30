---
title: 参数校验与错误处理
description: 区分协议错误与工具错误，设计模型能理解、程序能重试的错误结构。
---

# 参数校验与错误处理

MCP 里有两类完全不同的错误，混在一起会让客户端和模型都无所适从：

| 类型 | 层 | 表现 | 谁来修 |
| --- | --- | --- | --- |
| 协议错误 | JSON-RPC | 顶层 `error` 字段，带 code | 客户端 / 开发者 |
| 工具错误 | Tool result | `result.isError: true` | 模型 / 用户 |

经验法则：

- **请求本身不合法**（方法不存在、参数不是 JSON、版本不支持）→ 协议错误。
- **工具执行失败**（文件不存在、SQL 语法错、下游 500）→ 工具错误。

## 协议错误

```json
{
  "jsonrpc": "2.0",
  "id": 7,
  "error": {
    "code": -32602,
    "message": "Invalid params",
    "data": {"field": "limit", "reason": "must be between 1 and 20"}
  }
}
```

标准 code：

| code | 含义 |
| --- | --- |
| -32700 | Parse error：不是合法 JSON |
| -32600 | Invalid Request：不是合法 JSON-RPC |
| -32601 | Method not found |
| -32602 | Invalid params |
| -32603 | Internal error |
| -32002 | Resource not found（MCP 定义） |

协议错误通常由 SDK 生成。你需要做的是**不要用协议错误表达业务失败**——模型看到顶层 error 往往只会重试或放弃，看不到你的业务建议。

## 工具错误

工具错误是正常结果的一部分，用 `isError: true` 标记：

```python
from mcp.server import MCPServer
from mcp.types import CallToolResult, TextContent

mcp = MCPServer("notes", version="0.1.0")

@mcp.tool()
def read_note(name: str) -> CallToolResult:
    """Read one note by name."""
    try:
        text = load_note(name)
    except NoteNotFound:
        return CallToolResult(
            isError=True,
            content=[TextContent(
                type="text",
                text='{"error":"note_not_found","message":"No note named '
                     + name + '. Call search_notes to find the right name.","retryable":false}',
            )],
        )
    return CallToolResult(content=[TextContent(type="text", text=text)])
```

::: tip SDK 的默认行为
在工具函数里直接 `raise ValueError(...)`，多数 SDK 会把它转换成 `isError: true` 的结果，并把异常文本放进 content。这很方便，但**异常文本不受控**：可能包含路径、SQL、内部主机名。生产环境建议显式捕获并返回结构化错误。
:::

TypeScript：

```ts
server.registerTool(
  'read_note',
  { inputSchema: z.object({ name: z.string().min(1) }) },
  async ({ name }) => {
    try {
      const text = await readNote(name)
      return { content: [{ type: 'text', text }] }
    } catch (error) {
      const notFound = (error as NodeJS.ErrnoException).code === 'ENOENT'
      const payload = {
        error: notFound ? 'note_not_found' : 'internal_error',
        message: notFound
          ? `No note named "${name}". Call search_notes first.`
          : 'Failed to read the note. Retry once, then report the issue.',
        retryable: !notFound
      }
      return { isError: true, content: [{ type: 'text', text: JSON.stringify(payload) }] }
    }
  }
)
```

## 统一错误结构

建议所有工具返回同一种错误对象：

```json
{
  "error": "rate_limited",
  "message": "Tenant acme exceeded 60 requests/min. Retry after 12s.",
  "retryable": true,
  "retry_after_ms": 12000,
  "details": {"limit": 60, "window": "1m"}
}
```

| 字段 | 作用 |
| --- | --- |
| `error` | 稳定的机器可读码，不要随文案变化 |
| `message` | 给模型看的说明，包含下一步建议 |
| `retryable` | 是否值得重试 |
| `retry_after_ms` | 建议退避时间 |
| `details` | 非敏感的结构化上下文 |

错误码建议控制在 10–20 个，例如：

| 错误码 | 可重试 | 说明 |
| --- | --- | --- |
| `invalid_argument` | ❌ | 参数不合法，需修正 |
| `not_found` | ❌ | 资源不存在 |
| `permission_denied` | ❌ | 缺少 scope / 租户不匹配 |
| `rate_limited` | ✅ | 稍后重试 |
| `upstream_unavailable` | ✅ | 下游不可用 |
| `timeout` | ✅ | 可重试，但需控制次数 |
| `conflict` | ⚠️ | 版本冲突，需重新读取 |
| `internal_error` | ⚠️ | 记录 trace id，谨慎重试 |

## 输入校验

### 三层校验

```text
Host/模型 → schema 提示 → 服务端校验 → 业务约束
```

1. **schema 提示**：让模型少填错（类型、枚举、范围）。
2. **服务端校验**：真正的边界，绝不省略。
3. **业务约束**：租户、权限、配额、状态机。

```python
def search_notes(query: str, limit: int = 5) -> dict[str, object]:
    if not query.strip():
        raise ValueError("query must not be empty")
    limit = max(1, min(limit, 20))
    ...
```

```ts
inputSchema: z.object({
  query: z.string().trim().min(1).max(200),
  limit: z.number().int().min(1).max(20).default(5)
})
```

### 校验清单

- 字符串：长度、字符集、是否允许空。
- 数字：整数 / 浮点、上下界、NaN。
- 枚举：只接受白名单值。
- 路径：规范化后必须在根目录内，拒绝 `..`、符号链接逃逸。
- URL：只允许 `https`，解析后校验主机与 IP。
- SQL：参数化，禁止拼接；只读工具限制语句类型。
- 数组：元素数量上限，避免内存放大。

## 超时与取消

每个工具都应该有超时：

```python
import asyncio

async def run_query(sql: str) -> dict:
    try:
        async with asyncio.timeout(10):
            return await db.fetch(sql)
    except TimeoutError:
        return error("timeout", "Query exceeded 10s. Add filters or a LIMIT.", retryable=True)
```

客户端取消（`notifications/cancelled`）时，服务端应尽快停止工作并释放资源。长任务要检查取消信号，而不是等它自然结束。

## 输出上限

| 限制 | 建议值 | 超限行为 |
| --- | --- | --- |
| 单条工具结果 | 256 KB – 1 MB | 截断 + `truncated: true` |
| 单行日志 | 8 KB | 截断 |
| 列表条数 | 100 | 分页 |
| 请求体 | 4 MiB | 413 |

```python
MAX_BYTES = 256 * 1024

def clamp(text: str) -> tuple[str, bool]:
    data = text.encode("utf-8")
    if len(data) <= MAX_BYTES:
        return text, False
    return data[:MAX_BYTES].decode("utf-8", errors="ignore"), True
```

stdout / HTTP 的协议上限更大（stdio 默认约 10 MB），但真正该控制的是**模型上下文**。一次返回 5 MB 的日志，既浪费 token，也可能让 Host 直接截断。

## 不要泄露的信息

错误信息里禁止出现：

- 堆栈、源码行号、内部文件路径。
- 数据库连接串、主机名、内网 IP。
- token、cookie、API key。
- 其他租户的资源名或存在性。
- 完整 SQL（可能含敏感条件）。

需要排查时返回 `trace_id`，让开发者去日志系统查：

```json
{"error":"internal_error","message":"Unexpected failure.","trace_id":"4bf92f35..."}
```

## 重试策略

客户端 / Agent 侧：

```python
async def call_with_retry(tool, args, attempts=3):
    for i in range(attempts):
        result = await client.call_tool(tool, args)
        if not result.is_error:
            return result
        payload = json.loads(result.content[0].text)
        if not payload.get("retryable"):
            return result
        await asyncio.sleep(payload.get("retry_after_ms", 500 * 2**i) / 1000)
    return result
```

服务端侧：

- 只对幂等操作自动重试下游。
- 使用指数退避 + 抖动。
- 设置总预算，避免无限重试。
- 记录每次重试的原因与次数。

## 测试

| 用例 | 期望 |
| --- | --- |
| 缺必填参数 | 协议层 `-32602` 或工具错误 `invalid_argument` |
| 参数超范围 | 工具错误，不执行副作用 |
| 资源不存在 | `isError` + `not_found` |
| 下游超时 | `timeout` + `retryable: true` |
| 权限不足 | `permission_denied`，不泄露资源细节 |
| 超大结果 | 截断 + `truncated: true` |
| 内部异常 | `internal_error` + `trace_id`，无堆栈 |

## 下一步

- [工具设计模式](/server/tool-design)
- [调试排坑](/debugging/troubleshooting)
- [日志与可观测](/engineering/observability)
