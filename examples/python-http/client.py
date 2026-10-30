"""Call the Streamable HTTP demo server.

Start server.py first, then run: python client.py
"""

import asyncio

from mcp import Client

URL = "http://127.0.0.1:8000/mcp"


async def main() -> None:
    async with Client(URL) as client:
        tools = await client.list_tools()
        print("tools:", ", ".join(tool.name for tool in tools.tools))

        result = await client.call_tool("add", {"a": 20, "b": 22})
        print("add(20, 22) ->", result.structured_content)

        status = await client.call_tool("service_status")
        print("service_status ->", status.structured_content)


if __name__ == "__main__":
    asyncio.run(main())
