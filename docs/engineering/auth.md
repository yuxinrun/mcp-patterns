---
title: 鉴权与权限控制
description: 把 MCP Server 当成 OAuth 2.1 Resource Server：流程、校验、scope 设计与常见攻击面。
---

# 鉴权与权限控制

stdio Server 的信任边界是「本机用户」。一旦换成 HTTP，你就暴露了一个**可以被任何人扫描到的 JSON-RPC 端点**。鉴权不是可选项，而是上线门槛。

MCP 的授权模型很明确：

- **MCP Server = OAuth 2.1 Resource Server**，只负责校验 access token。
- **授权服务器（AS）** 负责登录、同意、发 token。
- **MCP Client** 负责走授权流程、携带 Bearer token。

## 完整流程

<AuthFlow />

展开成七步：

1. 客户端未带 token 请求 `/mcp`。
2. 服务端返回 `401`，并在 `WWW-Authenticate` 中给出 `resource_metadata` 地址（RFC 9728）。
3. 客户端拉取 Protected Resource Metadata，得知 AS 地址与支持的 scope。
4. 客户端从 AS 元数据（RFC 8414）找到授权端点、token 端点、支持的 PKCE 方法。
5. 客户端用 **Authorization Code + PKCE** 发起授权，`resource` 参数指向当前 MCP Server（RFC 8707）。
6. 用户登录并同意 scope，AS 返回绑定该 audience 的 access token。
7. 客户端带 `Authorization: Bearer <token>` 调用 `/mcp`，服务端逐请求校验。

::: tip 为什么强调 audience
没有 audience 校验的 token，可以被拿去调用**任意**接受同一 AS 的服务。攻击者只要拿到一个低权限服务的 token，就能横向访问你的 MCP Server。RFC 8707 的 `resource` 参数和 token 的 `aud` 校验就是为这个场景设计的。
:::

## 最小 401 响应

```http
HTTP/1.1 401 Unauthorized
WWW-Authenticate: Bearer resource_metadata="https://mcp.example.com/.well-known/oauth-protected-resource"
Content-Type: application/json

{"error":"invalid_token","error_description":"missing bearer token"}
```

资源元数据：

```json
{
  "resource": "https://mcp.example.com/mcp",
  "authorization_servers": ["https://auth.example.com"],
  "scopes_supported": ["notes:read", "notes:write", "admin:metrics"],
  "bearer_methods_supported": ["header"]
}
```

## Token 校验清单

每个请求都要检查，缺一不可：

| 检查项 | 说明 |
| --- | --- |
| 签名 | 用 AS 的 JWKS 验签，禁止 `alg: none` |
| `iss` | 必须等于受信任的 issuer |
| `aud` | 必须包含当前 MCP Server 的 resource 标识 |
| `exp` / `nbf` | 允许的时钟偏移不超过 60 秒 |
| `scope` | 当前工具所需的 scope 必须存在 |
| 吊销 | 高风险操作可走 introspection 或短 TTL |
| 租户 | 从可信 claim 取租户，不信任请求参数 |

### Python 校验示例

```python
import jwt
from jwt import PyJWKClient

class TokenVerifier:
    def __init__(self, issuer: str, audience: str, jwks_url: str) -> None:
        self.issuer = issuer
        self.audience = audience
        self.jwks = PyJWKClient(jwks_url, cache_keys=True)

    def verify(self, token: str) -> dict:
        key = self.jwks.get_signing_key_from_jwt(token)
        return jwt.decode(
            token,
            key.key,
            algorithms=["RS256", "ES256"],
            audience=self.audience,
            issuer=self.issuer,
            options={"require": ["exp", "iss", "aud", "sub"]},
            leeway=30,
        )
```

接到 HTTP 层：

```python
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.responses import JSONResponse

RESOURCE_METADATA = "https://mcp.example.com/.well-known/oauth-protected-resource"

class BearerAuth(BaseHTTPMiddleware):
    async def dispatch(self, request, call_next):
        if request.url.path != "/mcp":
            return await call_next(request)

        header = request.headers.get("authorization", "")
        if not header.startswith("Bearer "):
            return self.challenge("missing bearer token")

        try:
            claims = verifier.verify(header.removeprefix("Bearer ").strip())
        except Exception:
            return self.challenge("invalid token")

        request.state.auth = claims
        return await call_next(request)

    def challenge(self, message: str) -> JSONResponse:
        return JSONResponse(
            {"error": "invalid_token", "error_description": message},
            status_code=401,
            headers={"WWW-Authenticate": f'Bearer resource_metadata="{RESOURCE_METADATA}"'},
        )
```

::: warning 中间件顺序
鉴权必须包在 MCP handler 外层。只给「业务工具」加校验、却让 `initialize` / `tools/list` 裸奔，会泄露工具清单和 schema。
:::

### TypeScript 校验示例

```ts
import { createRemoteJWKSet, jwtVerify } from 'jose'

const jwks = createRemoteJWKSet(new URL('https://auth.example.com/.well-known/jwks.json'))
const AUDIENCE = 'https://mcp.example.com/mcp'
const ISSUER = 'https://auth.example.com'

export async function verifyToken(token: string) {
  const { payload } = await jwtVerify(token, jwks, {
    issuer: ISSUER,
    audience: AUDIENCE,
    algorithms: ['RS256', 'ES256'],
    clockTolerance: 30
  })
  if (!payload.sub) throw new Error('token has no subject')
  return payload
}
```

在 Node handler 之前取出 `req.headers.authorization`，校验通过后把 `authInfo` 传给 handler（SDK 支持透传，不会自己解析 header）。

## Scope 设计

scope 是权限的最小单位，建议按「资源 + 动作」划分：

| scope | 允许 |
| --- | --- |
| `notes:read` | 搜索、读取 |
| `notes:write` | 创建、更新 |
| `notes:delete` | 删除（单独授权） |
| `admin:metrics` | 查看内部指标 |
| `tenant:acme` | 访问 acme 租户（可选，通常用 claim 更合适） |

原则：

- **默认只给读**，写操作单独申请。
- 破坏性操作独立 scope，不与写操作合并。
- scope 数量控制在 10 个以内，太多会让用户无从选择。
- 工具与 scope 的映射写成表，代码里显式检查：

```python
TOOL_SCOPES = {
    "search_notes": {"notes:read"},
    "read_note": {"notes:read"},
    "create_note": {"notes:write"},
    "delete_note": {"notes:delete"},
}

def require_scope(claims: dict, tool: str) -> None:
    granted = set(claims.get("scope", "").split())
    missing = TOOL_SCOPES[tool] - granted
    if missing:
        raise PermissionError(f"missing scope: {', '.join(sorted(missing))}")
```

## 常见攻击面

### 1. Token passthrough

把用户带来的 token 原样转发给下游 API。问题：

- 下游可能不认识这个 token。
- 如果认识，说明 audience 校验失效，token 被跨服务滥用。
- 你失去了在服务端做权限裁剪的机会。

正确做法：**用自己的服务身份换取下游凭据**，或者使用 token exchange（RFC 8693）。

### 2. Confused deputy

攻击者诱导你的服务用**更高权限的凭据**执行操作。防御：

- 每次操作都绑定 `sub` + `tenant` + `aud`。
- 不根据客户端传入的 `tenant_id` 切换凭据。
- 高风险操作要求二次确认或 step-up scope。

### 3. SSRF

`api-proxy` 类工具如果接受任意 URL，攻击者可以访问云元数据、内网管理面。防御：

- 域名白名单，禁止 IP 字面量与私有网段。
- 禁止跟随重定向到非白名单域名。
- 出站代理统一管控。
- 解析 DNS 后再次校验目标地址。

### 4. Session 劫持

旧版 SSE 依赖 session id。若 id 可预测、可复用、不绑定用户，就会被劫持。Streamable HTTP 的无状态模式从根上减少了这类问题；仍使用会话时，必须把 session 绑定到 `sub` 与客户端指纹，并设置短 TTL。

### 5. Scope 升级

客户端请求 `notes:read`，服务端却发了包含 `notes:delete` 的 token。授权服务器必须按请求的最小 scope 签发；资源服务器只检查自己需要的 scope。

## 本地开发

本地 stdio 通常不需要 OAuth。HTTP 开发环境可以：

- 用 `localhost` 绑定，只允许本机访问。
- 使用测试 AS（Keycloak、Ory Hydra、Auth0 测试租户）。
- 准备短 TTL token，验证过期与刷新路径。
- 在 Inspector 中配置自定义 header 或 OAuth 流程。

不要在生产环境用「固定 API key」替代 OAuth。API key 无法表达用户同意、scope 和 audience。

## 测试用例

| 用例 | 期望 |
| --- | --- |
| 无 token | 401 + `WWW-Authenticate` |
| 过期 token | 401 |
| 错误 audience | 401 |
| 未知 issuer | 401 |
| 缺少 scope 调用工具 | 403，且不执行副作用 |
| 正常 token | 200，返回 `structuredContent` |
| 跨租户 token 访问 | 404 或 403，不泄露资源存在性 |
| 重复请求（幂等键） | 只产生一次副作用 |

## 上线检查

- [ ] 全站 HTTPS，HTTP 自动跳转。
- [ ] `WWW-Authenticate` 指向正确的资源元数据。
- [ ] 验签使用 JWKS 缓存，支持密钥轮换。
- [ ] 强制 `aud` / `iss` / `exp` 校验。
- [ ] 每个工具映射到明确 scope。
- [ ] 不存在 token passthrough。
- [ ] 出站请求有域名白名单。
- [ ] 审计日志记录 `sub`、`tenant`、工具、结果。
- [ ] 401 / 403 不泄露内部细节。

## 下一步

- [多租户隔离](/engineering/multi-tenant)
- [参数校验与错误处理](/engineering/validation-errors)
- [日志与可观测](/engineering/observability)
