---
title: 常见问题排查
description: 从「连不上」到「结果太大」：MCP 故障的症状、根因与修复命令。
---

# 常见问题排查

MCP 的报错往往很含糊：Host 只显示「连接失败」或「工具调用出错」。下面按**症状**组织，先定位层，再修根因。

## 先做三步定位

```text
1. Server 能单独启动吗？      → 进程 / 依赖 / 配置
2. Inspector 能完成握手吗？    → 协议 / 传输 / 版本
3. 工具能单独调用吗？          → 业务逻辑 / 权限 / 超时
```

```bash
# stdio
npx @modelcontextprotocol/inspector python /abs/path/server.py

# HTTP
npx @modelcontextprotocol/inspector --url http://127.0.0.1:8000/mcp

# 查看 Host 侧连接状态（Claude Code）
claude mcp list
```

Inspector 能连通而 Host 不能，问题通常在**Host 配置**（路径、环境变量、作用域）。Inspector 也连不上，问题在 **Server 或传输**。

## 症状速查表

| 症状 | 最可能的原因 | 先查什么 |
| --- | --- | --- |
| Host 显示 server failed / 连接关闭 | 进程启动失败、stdout 被污染 | 手动运行、看 stderr |
| `initialize` 超时 | 版本不兼容、进程卡住 | 协议版本、启动日志 |
| 工具列表为空 | 注册失败、能力未声明 | `tools/list` 原始响应 |
| 401 Unauthorized | 缺 token、audience 错 | `WWW-Authenticate` |
| 403 Forbidden | scope 不足、租户不匹配 | token claims |
| 404 / session not found | 旧版 session 失效 | 是否用了 stateful |
| 405 Method Not Allowed | 端点或方法不对 | 请求方法与路径 |
| 调用一直转圈 | 代理缓冲、长任务无进度 | 代理配置、超时 |
| 返回乱码 / 解析失败 | 编码、stdout 混入日志 | 字节流 |
| 结果被截断 | 缓冲区 / 输出上限 | 消息大小 |
| 工具参数校验失败 | schema 与实现不一致 | schema JSON |
| 间歇性失败 | 并发、连接池、限流 | 指标与日志 |

## 1. stdout 被污染

**症状**：Host 报连接关闭、JSON 解析错误；Inspector 一连接就断。

**原因**：工具里 `print()`、库的 banner、进度条写到了 stdout。

**修复**：

```python
import logging, sys
logging.basicConfig(stream=sys.stderr, level=logging.INFO)
```

```ts
console.error('debug')  // 不要用 console.log
```

自检：

```bash
python server.py < /dev/null | head -c 100
# 应该没有任何输出；有输出就是污染
```

## 2. 进程启动失败

**症状**：Host 显示 `spawn ... ENOENT`、`command not found`。

**原因**：

- Host 的工作目录不可预测，相对路径失效。
- 虚拟环境没激活，`python` 指向了系统解释器。
- Windows 上路径含空格未加引号。
- Node 版本低于 20。

**修复**：

```json
{
  "mcpServers": {
    "notes": {
      "command": "/abs/path/.venv/bin/python",
      "args": ["/abs/path/server.py"],
      "cwd": "/abs/path"
    }
  }
}
```

Windows：

```json
{
  "command": "C:\\path\\.venv\\Scripts\\python.exe",
  "args": ["C:\\path\\server.py"]
}
```

排查时先手动执行完全相同的命令，确认退出码与 stderr。

## 3. 握手失败 / 版本不兼容

**症状**：`initialize` 返回错误，或连接建立后立即断开。

**原因**：

- 客户端与服务端支持的协议版本没有交集。
- 使用了旧 SDK，不认识新版本字段。
- 服务端在 `initialize` 前就尝试发送通知。

**修复**：

- 升级到当前 SDK 版本。
- 显式记录协商结果：

```python
@mcp.tool()
def server_info() -> dict[str, str]:
    """Return the negotiated protocol version and server version."""
    return {"protocol": "negotiated", "server": "0.1.0"}
```

- 用 Inspector 查看原始 `initialize` 请求与响应，确认 `protocolVersion`。

## 4. 401 / 403

**401** 表示没有有效身份：

```bash
curl -i https://mcp.example.com/mcp \
  -H 'content-type: application/json' \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}'
```

看响应头：

```http
WWW-Authenticate: Bearer resource_metadata="..."
```

逐项检查：

- token 是否过期。
- `iss` 是否在信任列表。
- `aud` 是否等于当前 resource。
- 时钟是否偏移。
- JWKS 是否拉取失败（网络 / 缓存）。

**403** 表示身份有效但权限不足：检查 scope、租户绑定、工具权限表。不要用 404 隐藏 403，除非你明确要防止资源枚举。

## 5. Session / 端点错误

| 报错 | 原因 | 修复 |
| --- | --- | --- |
| 404 session not found | stateful 模式的 session 过期 | 重新 initialize，或改 stateless |
| 405 Method Not Allowed | 对 `/mcp` 发了 GET/DELETE，但服务端不支持 | 只用 POST；确认端点 |
| 415 Unsupported Media Type | 缺少 `Content-Type: application/json` | 补 header |
| 406 Not Acceptable | `Accept` 没包含 `text/event-stream` | 同时接受 JSON 与 SSE |

Streamable HTTP 客户端应发送：

```http
Accept: application/json, text/event-stream
```

## 6. 代理 / 网关导致的假死

**症状**：本地 curl 正常，经过 Nginx / ALB 后一直不返回。

**原因**：

- 代理缓冲了 SSE 流。
- `proxy_read_timeout` 太短。
- 网关不支持分块传输。
- HTTP/2 与 SSE 的兼容问题。

**修复**：

```nginx
proxy_buffering off;
proxy_cache off;
proxy_read_timeout 3600s;
proxy_set_header Connection '';
proxy_http_version 1.1;
```

同时确认云厂商的 idle timeout（ALB 默认 60s，需要调大）。

## 7. 超时

| 层级 | 默认 / 常见值 | 调整 |
| --- | --- | --- |
| 客户端请求 | 30–60s | SDK 配置 |
| 代理 | 60s | 网关配置 |
| 工具内部 | 无 | 显式 `asyncio.timeout` |
| 数据库 | 无 | `statement_timeout` |
| 下游 API | 无 | connect / read 分开设置 |

长任务要发进度通知，否则客户端可能先超时：

```python
@mcp.tool()
async def reindex(ctx) -> dict:
    """Rebuild the search index. May take several minutes."""
    for i, batch in enumerate(batches):
        await process(batch)
        await ctx.report_progress(i + 1, len(batches))
    return {"ok": True}
```

具体 API 名称随 SDK 版本略有差异，核心是**让客户端知道还活着**。

## 8. 序列化错误

常见于返回了不可 JSON 序列化的对象：

| 类型 | 错误写法 | 修复 |
| --- | --- | --- |
| `datetime` | 直接返回 | `.isoformat()` |
| `Decimal` | 直接返回 | 转字符串或整数分 |
| `bytes` | 直接返回 | base64 或拒绝 |
| `NaN` / `Infinity` | 直接返回 | 转 `null` 或字符串 |
| ORM 对象 | 直接返回 | `dict(row)` / `.model_dump()` |
| 循环引用 | 直接返回 | 手动挑选字段 |

```python
def jsonable(value):
    if isinstance(value, (datetime, date)):
        return value.isoformat()
    if isinstance(value, Decimal):
        return str(value)
    if isinstance(value, float) and (value != value or value in (float("inf"), float("-inf"))):
        return None
    raise TypeError(f"not JSON serializable: {type(value)}")
```

## 9. 大内容传输

**症状**：结果被截断、连接断开、Host 卡住。

**原因**：

- 单条 JSON-RPC 消息超过缓冲区（stdio 默认约 10 MB）。
- 模型上下文装不下。
- 代理限制响应大小。

**修复**：

- 分页，返回 `next_cursor`。
- 截断并标记 `truncated: true`。
- 返回摘要 + 资源 URI，让模型按需读取。
- 二进制用 base64，并控制大小。
- 不要把整份日志、整张表塞进一次结果。

## 10. 工具 schema 与实现不一致

**症状**：模型传的参数总被拒绝，或工具不出现在列表里。

**原因**：

- schema 声明了必填，实现却有默认值。
- 类型不一致（`string` vs `number`）。
- 工具注册抛异常，被静默忽略。
- 名称重复，后被覆盖。

**修复**：

```bash
# 看原始 tools/list
npx @modelcontextprotocol/inspector ...
```

逐项对照：

- `name` 唯一。
- `inputSchema.required` 与函数签名一致。
- 枚举值与实现分支一致。
- 输出符合 `outputSchema`。

## 11. 编码问题

- 文件读取统一 UTF-8，错误用 `errors="replace"`。
- Windows 控制台默认 GBK，日志里中文可能乱码；显式设置 `PYTHONIOENCODING=utf-8`。
- HTTP 响应声明 `charset=utf-8`。
- 截断时不要切断多字节字符（按字节截断后 `decode(errors="ignore")`）。

## 12. 间歇性失败

| 现象 | 可能原因 |
| --- | --- |
| 高峰期失败率上升 | 连接池耗尽、下游限流 |
| 特定租户失败 | 配额、凭据过期、数据量异常 |
| 单实例失败 | 内存泄漏、文件描述符耗尽 |
| 重试后成功 | 瞬时网络、下游抖动 |

看指标：错误率、p95 延迟、连接池使用率、429 数量。没有指标就只能靠猜。

## 最小复现模板

遇到无法定位的问题，写一个最小 Server：

```python
from mcp.server import MCPServer

mcp = MCPServer("repro", version="0.0.1")

@mcp.tool()
def echo(text: str) -> dict[str, str]:
    """Echo the input back."""
    return {"text": text}

if __name__ == "__main__":
    mcp.run()
```

如果最小 Server 正常，逐步加回你的代码，直到问题复现。绝大多数问题在加回「日志」「第三方库」「自定义中间件」时暴露。

## 收集信息

报障时附上：

- Host 与版本、SDK 与版本、操作系统。
- 传输方式与端点。
- 完整错误信息（脱敏）。
- `trace_id`。
- 最小复现步骤。
- 相关日志（stderr，不要 stdout）。

## 检查清单

- [ ] 能手动启动，stdout 干净。
- [ ] Inspector 能完成握手与工具调用。
- [ ] Host 配置使用绝对路径与正确解释器。
- [ ] 协议版本协商成功。
- [ ] 鉴权失败时能看到 `WWW-Authenticate`。
- [ ] 代理关闭缓冲，超时足够长。
- [ ] 返回对象可 JSON 序列化。
- [ ] 大结果有分页或截断。
- [ ] 有 trace_id 与结构化日志。

## 下一步

- [stdio Server Demo](/server/stdio)
- [HTTP / SSE Server Demo](/server/http-sse)
- [日志与可观测](/engineering/observability)
