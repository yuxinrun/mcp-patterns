---
title: 工具设计模式
description: 工具是给模型看的 API：命名、schema、返回值、错误语义与上下文体量。
---

# 工具设计模式

MCP 工具和普通 REST API 最大的区别：**调用方是模型，不是熟悉你系统的工程师**。模型只会读工具名、description 和 schema，然后猜怎么用。设计目标不是「功能全」，而是「少犯错」。

## 一条工具的三要素

```python
@mcp.tool()
def search_notes(query: str, limit: int = 5) -> dict[str, object]:
    """Search local markdown notes for a keyword.

    Returns at most `limit` matches with name and snippet, not full content.
    Use `read_note` when you need the whole note.
    """
```

| 要素 | 作用 | 常见错误 |
| --- | --- | --- |
| 名称 | 模型选择工具的第一信号 | `do_stuff`、`tool1`、过度缩写 |
| 描述 | 说明「何时用、返回什么、边界在哪」 | 只写「搜索笔记」，不说返回结构 |
| schema | 约束参数类型与范围 | 全部用 `string`，不做枚举、不设上下限 |

## 命名

推荐 `动词_名词`，全小写蛇形：

| 好 | 差 | 原因 |
| --- | --- | --- |
| `search_notes` | `notes` | 看不出动作 |
| `read_note` | `get` | 宾语不明 |
| `list_tables` | `db` | 作用域不清 |
| `run_query` | `execute` | 执行什么？ |

规则：

- 同一领域前缀一致：`note_search` / `note_read` 或 `search_notes` / `read_note`，选一种。
- 避免和常见工具重名，Host 可能会合并多个 Server 的工具列表。
- 破坏性操作要显式：`delete_note`、`archive_project`，不要藏在 `update` 里。

## 描述：写给模型看的文档

一个合格的 description 包含四件事：

1. **做什么**：一句话。
2. **什么时候用**：触发条件，尤其是与相邻工具的区别。
3. **返回什么**：字段与结构。
4. **限制**：分页、超时、权限、只读。

```text
Search local markdown notes for a keyword.

Use this before read_note when you don't know which note contains the topic.
Returns at most `limit` matches, each with `name` and a short `snippet`.
Read-only; does not modify files.
```

不要写：

```text
Searches notes.
```

模型只能靠猜：搜全文还是标题？返回路径还是内容？有没有数量限制？

## 输入 schema

### 用枚举代替自由字符串

```python
from typing import Literal

@mcp.tool()
def set_log_level(level: Literal["debug", "info", "warn", "error"]) -> dict[str, str]:
    """Change the process log level."""
    ...
```

```ts
inputSchema: z.object({
  level: z.enum(['debug', 'info', 'warn', 'error'])
})
```

### 给出范围与默认值

```python
@mcp.tool()
def search_notes(query: str, limit: int = 5) -> dict[str, object]:
    """..."""
    limit = max(1, min(limit, 20))  # 服务端再夹紧一次
```

::: tip 双保险
schema 约束是给模型的提示，不是安全边界。服务端必须再校验一次，包括长度、范围、路径、SQL 参数。
:::

### 参数不要太多

| 参数数量 | 建议 |
| --- | --- |
| 1–3 | 理想 |
| 4–6 | 可以接受，考虑分组 |
| 7+ | 拆工具，或用 `options` 对象 |

参数越多，模型填错的概率越高。把「查询」和「导出」拆开，比在一个工具里塞 12 个开关更好。

### 避免布尔陷阱

```python
# 差：两个布尔组合出四种语义
def query(sql: str, dry_run: bool = False, explain: bool = False): ...

# 好：模式显式
def query(sql: str, mode: Literal["execute", "explain"] = "execute"): ...
```

## 输出设计

### 优先返回结构化对象

```python
@mcp.tool()
def add(a: float, b: float) -> dict[str, float]:
    """Add two numbers."""
    return {"sum": a + b}
```

客户端拿到 `structuredContent = {"sum": 5.0}`，比裸 `5.0` 稳定，也方便加 `unit`、`precision` 等字段。

```ts
return {
  content: [{ type: 'text', text: JSON.stringify(output) }],
  structuredContent: output
}
```

### 同时提供人类可读文本

`content` 给模型看，`structuredContent` 给程序用。两者都提供，兼容性最好。

### 控制返回体积

| 策略 | 示例 |
| --- | --- |
| 只返回摘要 | 搜索返回 snippet 而不是全文 |
| 分页 | `cursor` + `nextCursor` |
| 截断 | 超过 64 KB 截断并标记 `truncated: true` |
| 句柄 | 返回 `result_id`，再用 `fetch_result` 取详情 |

大结果不仅浪费 token，还会触发客户端缓冲区上限。stdio 默认单条消息上限约 10 MB，但真正该控制的是**模型上下文**，不是协议上限。

### 返回可执行的信息

错误信息要告诉模型下一步怎么做：

```json
{
  "error": "note_not_found",
  "message": "No note named 'onboarding'. Call search_notes with a keyword instead.",
  "retryable": false
}
```

比 `FileNotFoundError: [Errno 2] ...` 有用得多。

## 工具粒度

### 太细

```text
open_file / read_line / close_file / parse_markdown / extract_heading
```

模型要串 5 次调用才能完成一件事，每一步都可能出错。

### 太粗

```text
do_everything(action: str, payload: dict)
```

schema 退化成字符串，模型无法判断参数格式。

### 合适

```text
search_notes(query, limit)     # 找到候选
read_note(name)                # 读取一篇
create_note(name, content)     # 创建
```

**一个工具完成一个可描述的意图**，并且失败时能明确知道哪一步错了。

## 只读与破坏性操作

用 annotations 表达语义（支持它的 Host 会据此决定是否要求确认）：

```python
from mcp.types import ToolAnnotations

@mcp.tool(annotations=ToolAnnotations(readOnlyHint=True))
def search_notes(query: str) -> dict[str, object]:
    ...
```

```ts
annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true }
```

| 注解 | 含义 |
| --- | --- |
| `readOnlyHint` | 不修改任何状态 |
| `destructiveHint` | 可能删除或覆盖数据 |
| `idempotentHint` | 重复调用结果一致 |
| `openWorldHint` | 会访问外部网络 |

::: warning 注解不是权限
annotations 只是提示。真正的权限控制必须在服务端按 token / scope / 租户校验，不能因为工具标了 `readOnlyHint` 就放行。
:::

## 幂等与重试

模型和 Host 都可能重试。写操作要设计成幂等：

```python
@mcp.tool()
def create_note(name: str, content: str, request_id: str) -> dict[str, object]:
    """Create a note. Repeating the same request_id returns the original result."""
    cached = idempotency.get(request_id)
    if cached:
        return cached
    ...
```

对外部 API 的调用同样要带幂等键。否则一次超时重试可能创建两条订单。

## 上下文预算

工具定义会占用上下文。经验值：

| 工具数 | 建议 |
| --- | --- |
| < 10 | 全部直接暴露 |
| 10–30 | 按领域分组，描述精简 |
| 30+ | 引入 `search_tools` / 按需加载 |

Anthropic 的实践表明，把工具变成「可按需发现的文件」后，上下文可以从 150k tokens 降到 2k 量级。MCP 侧对应的做法：

- 高频工具常驻，长尾工具通过 `search_tools` 发现。
- description 控制在 1–3 行，详细文档放 resource。
- 不要把所有内部 API 一对一包成工具。

## 版本演进

- **只加字段**：通常安全，客户端应忽略未知字段。
- **改字段语义**：必须升版本，并在 description 里标注。
- **删工具**：先标记 deprecated，保留至少一个发布周期。
- **改 schema 必填项**：属于破坏性变更，按新工具名发布。

工具名是契约。改名等于删旧建新，Host 的提示词和缓存都可能失效。

## 反模式清单

::: danger 见到就该改
- 工具名是 `run` / `execute` / `process`，描述只有一句「执行」。
- 所有参数都是 `string`，包括本应是数字、枚举、布尔的值。
- 返回整个数据库表或整份日志。
- 错误直接抛堆栈，包含绝对路径和凭据。
- 一个工具同时做查询、写入、删除，靠 `action` 字符串区分。
- 破坏性操作没有确认、没有 dry-run、没有审计。
- 工具数量 50+，全部塞进上下文。
:::

## 自检表

- [ ] 名称能看出动作和对象。
- [ ] 描述说明了何时用、返回什么、有什么限制。
- [ ] 输入 schema 有类型、枚举、范围、默认值。
- [ ] 服务端对输入做了二次校验。
- [ ] 返回结构化对象，且体积可控。
- [ ] 错误可分类，并给出下一步建议。
- [ ] 写操作幂等或有幂等键。
- [ ] 破坏性操作有权限与审计。
- [ ] 工具总数与描述长度在预算内。

## 下一步

- [参数校验与错误处理](/engineering/validation-errors)
- [鉴权与权限控制](/engineering/auth)
- [日志与可观测](/engineering/observability)
