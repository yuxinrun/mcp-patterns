"""Exercise the stdio server end to end.

Run: python client.py
"""

import asyncio
import sys
from pathlib import Path

from mcp import Client, StdioServerParameters

SERVER = Path(__file__).with_name("server.py")


async def main() -> None:
    params = StdioServerParameters(
        command=sys.executable,
        args=[str(SERVER)],
        cwd=SERVER.parent,
    )

    async with Client(params) as client:
        tools = await client.list_tools()
        print("tools:", ", ".join(tool.name for tool in tools.tools))

        added = await client.call_tool("add", {"a": 2, "b": 3})
        print("add(2, 3) ->", added.structured_content)

        found = await client.call_tool("search_notes", {"query": "stdio"})
        print("search_notes('stdio') ->", found.structured_content)

        note = await client.read_resource("note://welcome")
        print("resource note://welcome ->", note.contents[0].text.splitlines()[0])

        prompt = await client.get_prompt("summarize_note", {"name": "welcome"})
        print("prompt summarize_note ->", prompt.messages[0].content.text.splitlines()[0])


if __name__ == "__main__":
    asyncio.run(main())
