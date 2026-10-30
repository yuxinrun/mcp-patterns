---
title: Filesystem
description: Expose local files safely — root jail, symlinks, size limits, atomic writes and search.
---

# Filesystem

File tools are the most common MCP recipe and the easiest way to cause a security incident. The model will send `../../etc/passwd`, symlinks, absolute paths, and Windows drive letters. Your job is not to trust the model — it's to make wrong paths impossible to use.

## Threat model

| Input | Risk |
| --- | --- |
| `../../etc/passwd` | Path traversal |
| `link.md` pointing outside | Symlink escape |
| `C:\Windows\...` | Absolute path bypass |
| `CON`, `NUL` (Windows) | Device files |
| Huge file | Memory and context exhaustion |
| Binary file | Decode errors, garbage output |
| Concurrent writes | Corrupted file |

## Root jail

Every path must still be inside the root **after resolution**:

```python
from pathlib import Path

ROOT = Path("/srv/notes").resolve()

def safe_path(user_path: str) -> Path:
    if not user_path or "\x00" in user_path:
        raise ValueError("empty or invalid path")

    candidate = (ROOT / user_path).resolve()
    if candidate != ROOT and ROOT not in candidate.parents:
        raise ValueError("path escapes the workspace")
    if candidate.is_symlink():
        raise ValueError("symlinks are not allowed")
    return candidate
```

The details that matter:

1. **Join first, then `resolve()`** so `..` and symlinks are expanded before the check.
2. **Use `parents`**, not a string `startswith` — `/srv/notes-evil` would pass a prefix check.
3. **Reject symlinks explicitly** unless you really intend to follow them.
4. Reject NUL bytes; low-level APIs may truncate at them.

::: danger Common mistakes
```python
# Wrong: string check only
if ".." in user_path:
    raise ValueError

# Wrong: prefix confusion
if not str(path).startswith(str(ROOT)):
    raise ValueError
```
Both can be bypassed with encoding, symlinks, or a sibling directory with a shared prefix.
:::

## Reading

```python
MAX_BYTES = 256 * 1024
TEXT_SUFFIXES = {".md", ".txt", ".json", ".yaml", ".yml", ".py", ".ts"}

@mcp.tool()
def read_file(path: str) -> dict[str, object]:
    """Read a UTF-8 text file inside the workspace.

    Returns at most 256 KB. Use list_files to discover paths first.
    """
    target = safe_path(path)

    if not target.is_file():
        raise ValueError(f"not a file: {path}")
    if target.suffix.lower() not in TEXT_SUFFIXES:
        raise ValueError(f"unsupported file type: {target.suffix}")
    if target.stat().st_size > MAX_BYTES:
        raise ValueError(f"file too large: {target.stat().st_size} bytes")

    text = target.read_text(encoding="utf-8", errors="replace")
    return {"path": str(target.relative_to(ROOT)), "text": text}
```

- **Suffix allowlist** keeps database files and binaries out.
- **Size cap** checked with `stat()` before reading.
- **`errors="replace"`** so one bad byte doesn't fail the whole call.
- Return a **relative path**; don't leak the server's directory layout.

## Writing

Writes need to avoid partial files, accidental overwrites, and concurrent corruption:

```python
import os
import tempfile
from pathlib import Path

MAX_WRITE_BYTES = 1024 * 1024

def atomic_write(target: Path, text: str) -> None:
    data = text.encode("utf-8")
    if len(data) > MAX_WRITE_BYTES:
        raise ValueError("content too large")

    target.parent.mkdir(parents=True, exist_ok=True)
    fd, tmp = tempfile.mkstemp(dir=target.parent, prefix=".tmp-")
    try:
        with os.fdopen(fd, "wb") as handle:
            handle.write(data)
            handle.flush()
            os.fsync(handle.fileno())
        os.replace(tmp, target)  # atomic replace
    finally:
        if os.path.exists(tmp):
            os.unlink(tmp)
```

```python
@mcp.tool()
def write_file(path: str, content: str, overwrite: bool = False) -> dict[str, object]:
    """Write a UTF-8 text file. Set overwrite=true to replace an existing file."""
    target = safe_path(path)
    if target.exists() and not overwrite:
        raise ValueError("file exists; pass overwrite=true to replace it")
    atomic_write(target, content)
    return {"path": str(target.relative_to(ROOT)), "bytes": len(content.encode("utf-8"))}
```

- **No overwrite by default**; require an explicit flag.
- Re-check the jail after creating parent directories.
- Atomic replace means readers never see half a file.
- Return byte counts for auditing.

## Listing and searching

```python
@mcp.tool()
def list_files(directory: str = ".", limit: int = 100) -> dict[str, object]:
    """List files under a directory. Hidden files are skipped."""
    base = safe_path(directory)
    if not base.is_dir():
        raise ValueError(f"not a directory: {directory}")

    limit = max(1, min(limit, 500))
    files: list[dict[str, object]] = []
    for item in sorted(base.rglob("*")):
        if item.is_symlink() or not item.is_file():
            continue
        if any(part.startswith(".") for part in item.relative_to(base).parts):
            continue
        files.append({
            "path": str(item.relative_to(ROOT)),
            "size": item.stat().st_size,
        })
        if len(files) >= limit:
            break

    return {"count": len(files), "files": files, "truncated": len(files) >= limit}
```

Search must bound both the scan and the per-file size, or one call can crawl the whole disk:

```python
@mcp.tool()
def search_files(query: str, glob: str = "**/*.md", limit: int = 20) -> dict[str, object]:
    """Search text files for a keyword. Scans at most 200 files."""
    if not query.strip():
        raise ValueError("query must not be empty")

    limit = max(1, min(limit, 50))
    hits: list[dict[str, str]] = []
    scanned = 0

    for item in sorted(ROOT.glob(glob)):
        if scanned >= 200 or len(hits) >= limit:
            break
        if item.is_symlink() or not item.is_file():
            continue
        if item.stat().st_size > MAX_BYTES:
            continue
        scanned += 1
        text = item.read_text(encoding="utf-8", errors="replace")
        index = text.lower().find(query.lower())
        if index >= 0:
            start = max(0, index - 60)
            hits.append({
                "path": str(item.relative_to(ROOT)),
                "snippet": " ".join(text[start:index + 140].split()),
            })

    return {"count": len(hits), "hits": hits, "scanned": scanned}
```

## TypeScript version

```ts
import path from 'node:path'
import { readFile, realpath, stat } from 'node:fs/promises'

const ROOT = await realpath(process.env.WORKSPACE ?? './workspace')

export async function safePath(userPath: string): Promise<string> {
  if (!userPath || userPath.includes('\0')) throw new Error('invalid path')
  const candidate = path.resolve(ROOT, userPath)
  const real = await realpath(candidate).catch(() => candidate)
  const relative = path.relative(ROOT, real)
  if (relative.startsWith('..') || path.isAbsolute(relative)) {
    throw new Error('path escapes the workspace')
  }
  return real
}
```

`path.relative` is more reliable than a prefix check; `realpath` handles symlink resolution.

## Large files

Never dump a file that exceeds the context budget:

- Read by line range: `read_lines(path, start, end)`.
- Return a summary plus matching snippets.
- For HTTP servers, hand back a temporary download handle.
- Tell the model explicitly how much was not shown.

```python
@mcp.tool()
def read_lines(path: str, start: int = 1, count: int = 200) -> dict[str, object]:
    """Read a line range from a text file (1-based, at most 200 lines)."""
    target = safe_path(path)
    count = max(1, min(count, 200))
    lines = target.read_text(encoding="utf-8", errors="replace").splitlines()
    chunk = lines[start - 1 : start - 1 + count]
    return {
        "path": str(target.relative_to(ROOT)),
        "start": start,
        "returned": len(chunk),
        "total": len(lines),
        "lines": chunk,
    }
```

## Concurrency

When multiple agents write the same file:

- Use a file lock (`fcntl.flock` / `proper-lockfile`).
- Or require `expected_version` for optimistic concurrency.
- Compare mtime or hash before writing.

```python
def write_if_unchanged(target: Path, text: str, expected_mtime: float) -> None:
    if target.exists() and abs(target.stat().st_mtime - expected_mtime) > 0.001:
        raise RuntimeError("file changed since it was read; re-read before writing")
    atomic_write(target, text)
```

## Test matrix

| Case | Expected |
| --- | --- |
| `../../etc/passwd` | Rejected |
| Absolute path `/etc/passwd` | Rejected |
| Symlink pointing outside | Rejected |
| Missing file | `not_found` |
| Oversized file | Rejected with the limit |
| Binary file | Rejected |
| Existing file without overwrite | Rejected |
| Concurrent write | One succeeds, one gets a conflict |

## Checklist

- [ ] Every path is resolved and checked against the root.
- [ ] Symlinks and NUL bytes are rejected.
- [ ] Reads and writes both have size caps.
- [ ] Suffix allowlist, text only by default.
- [ ] Writes are atomic and don't overwrite by default.
- [ ] Relative paths returned, never absolute ones.
- [ ] Search bounds file count and per-file size.
- [ ] Concurrent writes are handled.
- [ ] Destructive operations are audited.

## Next

- [Local tools](/en/recipes/local-tools)
- [Validation & errors](/en/engineering/validation-errors)
- [Auth & permissions](/en/engineering/auth)
