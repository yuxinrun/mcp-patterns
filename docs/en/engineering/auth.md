---
title: Auth and permissions
description: "Treat an MCP server as an OAuth 2.1 resource server — flow, validation, scopes, and attack surfaces."
---

# Auth and permissions

A stdio server trusts the local user. An HTTP server is a **JSON-RPC endpoint anyone can scan**. Auth is not optional.

The model:

- **MCP server = OAuth 2.1 resource server**, validating access tokens.
- **Authorization server (AS)** handles login, consent, and token issuance.
- **MCP client** runs the authorization flow and sends a bearer token.

## Flow

<AuthFlow />

1. The client calls `/mcp` without a token.
2. The server returns `401` with `resource_metadata` in `WWW-Authenticate` (RFC 9728).
3. The client fetches protected resource metadata and learns the AS and scopes.
4. The client reads AS metadata (RFC 8414) for endpoints and PKCE support.
5. It runs Authorization Code + PKCE with a `resource` parameter (RFC 8707).
6. The user logs in and consents; the AS issues a token bound to that audience.
7. The client sends `Authorization: Bearer <token>` on every request.

::: tip Why audience matters
A token without audience validation can be replayed against any service trusting the same AS. RFC 8707 plus `aud` validation prevents cross-service token reuse.
:::

## Minimal 401

```http
HTTP/1.1 401 Unauthorized
WWW-Authenticate: Bearer resource_metadata="https://mcp.example.com/.well-known/oauth-protected-resource"
Content-Type: application/json

{"error":"invalid_token","error_description":"missing bearer token"}
```

```json
{
  "resource": "https://mcp.example.com/mcp",
  "authorization_servers": ["https://auth.example.com"],
  "scopes_supported": ["notes:read", "notes:write", "admin:metrics"],
  "bearer_methods_supported": ["header"]
}
```

## Validation checklist

| Check | Requirement |
| --- | --- |
| Signature | Verify with AS JWKS; reject `alg: none` |
| `iss` | Must equal a trusted issuer |
| `aud` | Must include this server's resource ID |
| `exp` / `nbf` | Clock skew ≤ 60 seconds |
| `scope` | Required scope present for the tool |
| Revocation | Introspection or short TTL for sensitive actions |
| Tenant | From a trusted claim, never a request parameter |

### Python

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

Wrap the whole MCP handler, not only business tools. Otherwise `initialize` and `tools/list` leak schemas.

### TypeScript

```ts
import { createRemoteJWKSet, jwtVerify } from 'jose'

const jwks = createRemoteJWKSet(new URL('https://auth.example.com/.well-known/jwks.json'))

export async function verifyToken(token: string) {
  const { payload } = await jwtVerify(token, jwks, {
    issuer: 'https://auth.example.com',
    audience: 'https://mcp.example.com/mcp',
    algorithms: ['RS256', 'ES256'],
    clockTolerance: 30
  })
  if (!payload.sub) throw new Error('token has no subject')
  return payload
}
```

Validate before the Node handler and pass `authInfo` through; do not rely on the SDK to parse headers.

## Scopes

| Scope | Allows |
| --- | --- |
| `notes:read` | Search and read |
| `notes:write` | Create and update |
| `notes:delete` | Delete (separate consent) |
| `admin:metrics` | Internal metrics |

Default to read. Separate destructive actions. Map tools to scopes explicitly:

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

## Attack surfaces

### Token passthrough
Forwarding the user's MCP token downstream breaks audience boundaries and removes your ability to scope permissions. Use your own service identity or token exchange (RFC 8693).

### Confused deputy
Bind every operation to `sub`, `tenant`, and `aud`; never switch credentials based on a client-supplied tenant; require step-up for sensitive actions.

### SSRF
For proxy tools, allowlist hosts, block private and metadata IPs after DNS resolution, disable redirects or revalidate each hop, and force egress through a proxy.

### Session hijacking
Legacy SSE relies on session IDs. Bind sessions to `sub` and client identity with short TTLs. Stateless Streamable HTTP avoids the issue.

### Scope escalation
The AS must issue the minimum requested scope; the resource server checks only what it needs.

## Tests

| Case | Expected |
| --- | --- |
| No token | 401 + `WWW-Authenticate` |
| Expired token | 401 |
| Wrong audience | 401 |
| Unknown issuer | 401 |
| Missing scope | 403, no side effect |
| Valid token | 200 with `structuredContent` |
| Cross-tenant token | 403/404 without leaking existence |
| Retried write | Exactly one side effect |

## Checklist

- [ ] HTTPS everywhere.
- [ ] Correct resource metadata URL.
- [ ] JWKS caching and key rotation.
- [ ] `aud` / `iss` / `exp` enforced.
- [ ] Every tool maps to a scope.
- [ ] No token passthrough.
- [ ] Egress allowlist.
- [ ] Audit logs include `sub`, tenant, tool, and result.
- [ ] 401/403 responses leak nothing internal.

## Next

- [Multi-tenancy](/en/engineering/multi-tenant)
- [Validation and errors](/en/engineering/validation-errors)
- [Observability](/en/engineering/observability)
