---
title: 文件服务
description: 安全地暴露本地文件：根目录 jail、符号链接、大小限制、原子写入与搜索。
---

# 文件服务

文件工具是最常见、也最容易出安全事故的一类。模型会传入各种路径：`../../etc/passwd`、符号链接、绝对路径、Windows 盘符。你的任务不是「相信模型会传对」，而是**让错误路径无法生效**。

## 威胁模型

| 输入 | 风险 |
| --- | --- |
| `../../etc/passwd` | 目录穿越 |
| `link.md`（指向外部） | 符号链接逃逸 |
| `C:\Windows\...` | 绝对路径绕过 |
| `CON`、`NUL`（Windows） | 设备文件 |
| 超大文件 | 内存与上下文耗尽 |
| 二进制文件 | 解码错误、乱码 |
| 并发写入 | 文件损坏 |

## 根目录 jail

所有路径都必须**解析后**仍在根目录内：

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

要点：

1. **先拼接再 `resolve()`**，这样 `..` 和符号链接都会被展开。
2. **用 `parents` 判断包含关系**，不要用字符串 `startswith`（`/srv/notes-evil` 会误判）。
3. **显式拒绝符号链接**，除非你确实需要跟随。
4. 拒绝 NUL 字节，避免底层 API 截断。

::: danger 常见错误
```python
# 错：只检查字符串
if ".." in user_path:
    raise ValueError

# 错：startswith 前缀混淆
if not str(path).startswith(str(ROOT)):
    raise ValueError
```
这两种都能被编码、符号链接或相似前缀绕过。
:::

## 读取

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

关键点：

- **后缀白名单**，避免把数据库文件当文本读。
- **大小上限**，在读取前用 `stat()` 判断。
- **`errors="replace"`**，避免一个坏字节让整个调用失败。
- 返回**相对路径**，不泄露服务器目录结构。

## 写入

写入要防止部分写、覆盖重要文件、并发冲突：

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
        os.replace(tmp, target)  # 原子替换
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

设计要点：

- **默认不覆盖**，要求显式 `overwrite=true`。
- 写入前再次做 jail 校验（父目录可能是符号链接）。
- 原子替换，避免读到半截文件。
- 返回字节数，便于审计。

## 列出与搜索

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

搜索要限制扫描范围与单文件大小，避免一次调用遍历整个磁盘：

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

## TypeScript 版本

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

`path.relative` 比字符串前缀更可靠；`realpath` 负责解析符号链接。

## 大文件与流式读取

超过上下文预算的文件不要整份返回：

- 按行范围读取：`read_lines(path, start, end)`。
- 返回摘要 + 命中片段。
- 生成临时下载句柄（如果是 HTTP Server）。
- 明确告诉模型「还有多少内容未显示」。

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

## 并发与锁

多个 Agent 同时写同一文件时：

- 用文件锁（`fcntl.flock` / `proper-lockfile`）。
- 或要求传入 `expected_version`，做乐观并发控制。
- 写入前比较 mtime / hash。

```python
def write_if_unchanged(target: Path, text: str, expected_mtime: float) -> None:
    if target.exists() and abs(target.stat().st_mtime - expected_mtime) > 0.001:
        raise RuntimeError("file changed since it was read; re-read before writing")
    atomic_write(target, text)
```

## 测试

| 用例 | 期望 |
| --- | --- |
| `../../etc/passwd` | 拒绝 |
| 绝对路径 `/etc/passwd` | 拒绝 |
| 指向外部的符号链接 | 拒绝 |
| 不存在的文件 | `not_found` |
| 超大文件 | 拒绝并提示上限 |
| 二进制文件 | 拒绝 |
| 已存在文件未传 overwrite | 拒绝 |
| 并发写入 | 一方成功，一方收到冲突 |

## 检查清单

- [ ] 所有路径 `resolve()` 后校验根目录包含关系。
- [ ] 拒绝符号链接与 NUL 字节。
- [ ] 读 / 写都有大小上限。
- [ ] 后缀白名单，默认只处理文本。
- [ ] 写入原子化，默认不覆盖。
- [ ] 返回相对路径，不泄露绝对路径。
- [ ] 搜索限制扫描文件数与单文件大小。
- [ ] 有并发冲突处理。
- [ ] 破坏性操作有审计。

## 下一步

- [本地工具封装](/recipes/local-tools)
- [参数校验与错误处理](/engineering/validation-errors)
- [鉴权与权限控制](/engineering/auth)
