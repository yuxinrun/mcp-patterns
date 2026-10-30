# 可运行示例

四份最小可运行 Demo，配套文档里的代码都能在这里找到完整版本。

| 目录 | 传输 | 语言 | 说明 |
| --- | --- | --- | --- |
| `python-stdio/` | stdio | Python | 笔记工具：`add` / `search_notes` / `read_note`，含 resource 与 prompt |
| `python-http/` | Streamable HTTP / 旧版 SSE | Python | 运维工具：`add` / `service_status`，带 `/healthz` |
| `typescript/` | stdio + Streamable HTTP | TypeScript | 与 Python 笔记示例同构，`src/stdio.ts` 与 `src/http.ts` 共用工具定义 |

## Python

```bash
cd python-stdio
python -m venv .venv
source .venv/bin/activate        # Windows: .venv\Scripts\activate
pip install -r requirements.txt

python client.py                 # 以客户端身份拉起 server.py 并调用工具
```

HTTP 版本：

```bash
cd python-http
pip install -r requirements.txt
python server.py                 # http://127.0.0.1:8000/mcp
python client.py                 # 另开一个终端
python server.py --sse           # 旧版 HTTP+SSE，端口 8001，仅用于兼容验证
```

## TypeScript

```bash
cd typescript
npm install
npm run typecheck
npm run client:stdio             # 自动拉起 src/stdio.ts

npm run dev:http                 # 终端 A：http://127.0.0.1:8000/mcp
npm run client:http              # 终端 B
```

要求 Node.js >= 20。示例使用 MCP TypeScript SDK v2：

- `@modelcontextprotocol/server`：`McpServer`、`createMcpHandler`
- `@modelcontextprotocol/server/stdio`：`serveStdio`
- `@modelcontextprotocol/client`：`Client`、`StdioClientTransport`、`StreamableHTTPClientTransport`
- `@modelcontextprotocol/node`：`toNodeHandler`、Host / Origin 校验

## 用 Inspector 手工调试

```bash
# stdio
npx @modelcontextprotocol/inspector python python-stdio/server.py

# Streamable HTTP（先启动 server）
npx @modelcontextprotocol/inspector --url http://127.0.0.1:8000/mcp
```

## 约定

- 日志一律写 stderr。stdout 只允许出现 JSON-RPC 消息。
- 示例故意保持单文件、少依赖，方便复制到自己的项目里。
- 所有文件路径都经过白名单校验，不要删掉这些检查。
