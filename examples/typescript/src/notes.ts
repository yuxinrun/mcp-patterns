import { readFile, readdir } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

export const NOTES_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../notes')

export type NoteMatch = {
  name: string
  snippet: string
}

export function resolveNotePath(name: string): string {
  const clean = name.trim().replace(/\.md$/i, '')
  if (!clean || /[\\/]/.test(clean) || clean.includes('..')) {
    throw new Error('name must be a simple note name, e.g. "welcome"')
  }
  const file = path.resolve(NOTES_DIR, `${clean}.md`)
  if (!file.startsWith(NOTES_DIR + path.sep)) {
    throw new Error('path escapes the notes directory')
  }
  return file
}

export async function readNote(name: string): Promise<string> {
  try {
    return await readFile(resolveNotePath(name), 'utf8')
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      throw new Error(`note not found: ${name}`)
    }
    throw error
  }
}

export async function listNoteNames(): Promise<string[]> {
  const entries = await readdir(NOTES_DIR)
  return entries.filter(entry => entry.endsWith('.md')).map(entry => entry.replace(/\.md$/, '')).sort()
}

export async function searchNotes(query: string, limit: number): Promise<NoteMatch[]> {
  const needle = query.trim().toLowerCase()
  if (!needle) throw new Error('query must not be empty')

  const matches: NoteMatch[] = []
  for (const name of await listNoteNames()) {
    const text = await readNote(name)
    const index = text.toLowerCase().indexOf(needle)
    if (index === -1) continue
    const start = Math.max(0, index - 40)
    const snippet = text.slice(start, index + needle.length + 40).replace(/\s+/g, ' ').trim()
    matches.push({ name, snippet: start > 0 ? `…${snippet}` : snippet })
    if (matches.length >= limit) break
  }
  return matches
}
