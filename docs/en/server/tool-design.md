---
title: Tool design patterns
description: "Tools are APIs for a model — naming, schemas, outputs, error semantics, and context budget."
---

# Tool design patterns

The caller of an MCP tool is a model, not an engineer who knows your system. It only sees the name, description, and schema, then guesses. The goal is not maximum functionality; it is **minimum surprise**.

## Three parts of a tool

```python
@mcp.tool()
def search_notes(query: str, limit: int = 5) -> dict[str, object]:
    """Search local markdown notes for a keyword.

    Returns at most `limit` matches with name and snippet, not full content.
    Use `read_note` when you need the whole note.
    """
```

| Part | Job | Common mistake |
| --- | --- | --- |
| Name | First selection signal | `do_stuff`, `tool1` |
| Description | When to use, what it returns, limits | “Searches notes.” |
| Schema | Types, ranges, enums | Everything is a string |

## Naming

Use `verb_noun`, lowercase snake case:

| Good | Bad | Why |
| --- | --- | --- |
| `search_notes` | `notes` | No action |
| `read_note` | `get` | No object |
| `run_query` | `execute` | Execute what? |
| `delete_note` | `update` | Hides a destructive action |

Keep prefixes consistent within a domain. Avoid names that collide with common tools in other servers.

## Descriptions

Include four things:

1. What it does.
2. When to use it, especially versus neighbors.
3. What it returns.
4. Limits: pagination, timeouts, permissions, read-only.

```text
Search local markdown notes for a keyword.

Use this before read_note when you don't know which note contains the topic.
Returns at most `limit` matches, each with `name` and a short `snippet`.
Read-only; does not modify files.
```

## Input schemas

### Enums over free strings

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

### Ranges and defaults

```python
limit = max(1, min(limit, 20))  # enforce again server-side
```

Schema constraints guide the model; they are not a security boundary.

### Keep parameter counts small

| Parameters | Recommendation |
| --- | --- |
| 1–3 | Ideal |
| 4–6 | Acceptable |
| 7+ | Split the tool or use an options object |

### Avoid boolean traps

```python
# Bad: four meanings from two booleans
def query(sql: str, dry_run: bool = False, explain: bool = False): ...

# Better
def query(sql: str, mode: Literal["execute", "explain"] = "execute"): ...
```

## Output design

Return structured objects:

```python
@mcp.tool()
def add(a: float, b: float) -> dict[str, float]:
    """Add two numbers."""
    return {"sum": a + b}
```

```ts
return {
  content: [{ type: 'text', text: JSON.stringify(output) }],
  structuredContent: output
}
```

`content` is for the model; `structuredContent` is for programs. Provide both.

Control size:

| Strategy | Example |
| --- | --- |
| Summary | Snippets in search results |
| Pagination | `cursor` + `nextCursor` |
| Truncation | `truncated: true` |
| Handle | `result_id` plus `fetch_result` |

Return actionable errors:

```json
{
  "error": "note_not_found",
  "message": "No note named 'onboarding'. Call search_notes with a keyword instead.",
  "retryable": false
}
```

## Granularity

Too fine: `open_file` / `read_line` / `close_file` forces five calls per task.

Too coarse: `do_everything(action, payload)` collapses the schema into strings.

Right-sized: one tool per describable intent:

```text
search_notes(query, limit)
read_note(name)
create_note(name, content)
```

## Annotations

```python
from mcp.types import ToolAnnotations

@mcp.tool(annotations=ToolAnnotations(readOnlyHint=True))
def search_notes(query: str) -> dict[str, object]:
    ...
```

| Hint | Meaning |
| --- | --- |
| `readOnlyHint` | No state changes |
| `destructiveHint` | May delete or overwrite |
| `idempotentHint` | Repeated calls are safe |
| `openWorldHint` | Reaches external networks |

::: warning Hints are not permissions
Enforce scopes and tenancy on the server. Never let `readOnlyHint` substitute for authorization.
:::

## Idempotency

Hosts and models retry. Make writes idempotent:

```python
@mcp.tool()
def create_note(name: str, content: str, request_id: str) -> dict[str, object]:
    """Create a note. Repeating the same request_id returns the original result."""
    cached = idempotency.get(request_id)
    if cached:
        return cached
    ...
```

External API calls need idempotency keys too, or a timeout retry creates duplicate orders.

## Context budget

| Tool count | Guidance |
| --- | --- |
| < 10 | Expose all |
| 10–30 | Group by domain, shorten descriptions |
| 30+ | Add `search_tools` / on-demand loading |

Anthropic’s code-execution pattern reduced tool context from 150k to about 2k tokens by making tools discoverable files. MCP equivalents: keep common tools resident, hide the long tail behind discovery, and keep descriptions to a few lines.

## Versioning

- Adding optional fields is usually safe.
- Changing semantics requires a version bump.
- Deprecate before deleting.
- Renaming a tool is a breaking change: publish a new tool and keep the old one for a release cycle.

## Anti-patterns

::: danger Fix on sight
- Names like `run`, `execute`, `process` with a one-line description.
- Everything typed as string.
- Returning an entire table or log file.
- Stack traces containing paths and credentials.
- One tool doing read, write, and delete via an `action` string.
- Destructive operations without confirmation, dry-run, or audit.
- Fifty tools all loaded into context.
:::

## Checklist

- [ ] Name shows action and object.
- [ ] Description covers when, return shape, and limits.
- [ ] Inputs have types, enums, ranges, defaults.
- [ ] Server re-validates everything.
- [ ] Structured output with bounded size.
- [ ] Errors are classified with next steps.
- [ ] Writes are idempotent.
- [ ] Destructive tools have permissions and audit.
- [ ] Tool count and description length fit the budget.

## Next

- [Validation and errors](/en/engineering/validation-errors)
- [Auth and permissions](/en/engineering/auth)
- [Logging and observability](/en/engineering/observability)
