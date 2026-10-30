"""Minimal MCP server over stdio.

Run: python server.py
The process speaks JSON-RPC on stdin/stdout. Keep stdout clean.
"""

from pathlib import Path

from mcp.server import MCPServer

NOTES_DIR = Path(__file__).parent / "notes"

mcp = MCPServer(
    "notes",
    version="0.1.0",
    instructions=(
        "A tiny notes server for learning MCP. "
        "Use search_notes to find relevant notes before reading one."
    ),
)


def _note_path(name: str) -> Path:
    clean = name.strip().removesuffix(".md")
    if not clean or any(char in clean for char in "/\\") or ".." in clean:
        raise ValueError("name must be a simple note name, e.g. 'welcome'")
    path = (NOTES_DIR / f"{clean}.md").resolve()
    if NOTES_DIR.resolve() not in path.parents:
        raise ValueError("path escapes the notes directory")
    if not path.is_file():
        raise ValueError(f"note not found: {clean}")
    return path


@mcp.tool()
def add(a: float, b: float) -> dict[str, float]:
    """Add two numbers. Use this for quick arithmetic checks."""
    return {"sum": a + b}


@mcp.tool()
def search_notes(query: str, limit: int = 5) -> dict[str, object]:
    """Search local markdown notes for a keyword.

    Returns at most `limit` matches with a short snippet, not the full file.
    """
    limit = max(1, min(limit, 20))
    query_lower = query.lower()
    hits: list[dict[str, str]] = []

    for path in sorted(NOTES_DIR.glob("*.md")):
        text = path.read_text(encoding="utf-8")
        index = text.lower().find(query_lower)
        if index == -1:
            continue
        start = max(0, index - 60)
        snippet = " ".join(text[start : index + 140].split())
        hits.append({"name": path.stem, "snippet": snippet})
        if len(hits) >= limit:
            break

    return {"count": len(hits), "matches": hits}


@mcp.tool()
def read_note(name: str) -> str:
    """Read one note by name. Prefer search_notes first on large collections."""
    return _note_path(name).read_text(encoding="utf-8")


@mcp.resource("note://{name}")
def note_resource(name: str) -> str:
    """Expose a note as a readable MCP resource."""
    return _note_path(name).read_text(encoding="utf-8")


@mcp.prompt()
def summarize_note(name: str) -> str:
    """Build a reusable prompt that summarizes a note."""
    return (
        "Summarize the following engineering note in three bullets. "
        "Keep code identifiers unchanged.\n\n"
        + _note_path(name).read_text(encoding="utf-8")
    )


if __name__ == "__main__":
    mcp.run()  # stdio is the default transport
