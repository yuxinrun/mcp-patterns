"""Minimal MCP server over Streamable HTTP.

Run:
    python server.py          # Streamable HTTP on http://127.0.0.1:8000/mcp
    python server.py --sse    # Legacy HTTP+SSE on http://127.0.0.1:8001/sse

Keep this process behind your auth layer in production. The demo binds to
localhost on purpose.
"""

import os
import sys
from datetime import UTC, datetime

from mcp.server import MCPServer
from starlette.requests import Request
from starlette.responses import JSONResponse

mcp = MCPServer(
    "ops-tools",
    version="0.1.0",
    instructions="Small operational tools exposed over Streamable HTTP.",
)

STARTED_AT = datetime.now(UTC)


@mcp.tool()
def add(a: float, b: float) -> dict[str, float]:
    """Add two numbers."""
    return {"sum": a + b}


@mcp.tool()
def service_status() -> dict[str, str]:
    """Return a tiny health snapshot for demos and smoke tests."""
    return {
        "status": "ok",
        "started_at": STARTED_AT.isoformat(),
        "region": os.getenv("REGION", "local"),
    }


@mcp.custom_route("/healthz", methods=["GET"])
async def healthz(request: Request) -> JSONResponse:
    # Custom routes are not protected by MCP auth. Keep them boring.
    return JSONResponse({"ok": True, "uptime_seconds": int((datetime.now(UTC) - STARTED_AT).total_seconds())})


if __name__ == "__main__":
    if "--sse" in sys.argv:
        mcp.run(transport="sse", host="127.0.0.1", port=8001)
    else:
        mcp.run(
            transport="streamable-http",
            host="127.0.0.1",
            port=8000,
            stateless_http=True,
        )
