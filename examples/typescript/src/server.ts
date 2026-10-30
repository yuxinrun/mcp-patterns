import { McpServer } from '@modelcontextprotocol/server'
import { z } from 'zod'
import { listNoteNames, readNote, searchNotes } from './notes.js'

/**
 * Builds the notes server with its tools, resource and prompt.
 *
 * The same instance shape works over any transport: call `serveStdio()` for a
 * local process, or hand it to `createMcpHandler()` for Streamable HTTP.
 */
export function createNotesServer(): McpServer {
  const server = new McpServer(
    { name: 'notes', version: '0.1.0' },
    { instructions: 'Local markdown notes. Search before reading; prefer small, focused calls.' }
  )

  server.registerTool(
    'add',
    {
      title: 'Add numbers',
      description: 'Add two numbers. Use this for quick arithmetic checks.',
      inputSchema: z.object({ a: z.number(), b: z.number() }),
      outputSchema: z.object({ sum: z.number() }),
      annotations: { readOnlyHint: true }
    },
    async ({ a, b }) => {
      const output = { sum: a + b }
      return {
        content: [{ type: 'text', text: JSON.stringify(output) }],
        structuredContent: output
      }
    }
  )

  server.registerTool(
    'search_notes',
    {
      title: 'Search notes',
      description: 'Search local markdown notes for a keyword. Returns at most `limit` matches.',
      inputSchema: z.object({
        query: z.string().min(1),
        limit: z.number().int().min(1).max(20).default(5)
      }),
      outputSchema: z.object({
        count: z.number(),
        matches: z.array(z.object({ name: z.string(), snippet: z.string() }))
      }),
      annotations: { readOnlyHint: true }
    },
    async ({ query, limit }) => {
      const matches = await searchNotes(query, limit)
      const output = { count: matches.length, matches }
      return {
        content: [{ type: 'text', text: JSON.stringify(output) }],
        structuredContent: output
      }
    }
  )

  server.registerTool(
    'read_note',
    {
      title: 'Read note',
      description: 'Read a markdown note by name (without the .md suffix).',
      inputSchema: z.object({ name: z.string().min(1) }),
      outputSchema: z.object({ name: z.string(), text: z.string() }),
      annotations: { readOnlyHint: true }
    },
    async ({ name }) => {
      const text = await readNote(name)
      const output = { name, text }
      return {
        content: [{ type: 'text', text }],
        structuredContent: output
      }
    }
  )

  server.registerResource(
    'notes-index',
    'notes://index',
    { title: 'Notes index', description: 'Names of every note in the local notes directory.', mimeType: 'text/plain' },
    async uri => {
      const names = await listNoteNames()
      return { contents: [{ uri: uri.href, text: names.join('\n') }] }
    }
  )

  server.registerPrompt(
    'summarize_note',
    {
      title: 'Summarize a note',
      description: 'Build a prompt that asks for a short summary of one note.',
      argsSchema: z.object({ name: z.string().min(1) })
    },
    async ({ name }) => ({
      messages: [
        {
          role: 'user' as const,
          content: {
            type: 'text' as const,
            text: `Read the note "${name}" with the read_note tool, then summarize it in three bullet points.`
          }
        }
      ]
    })
  )

  return server
}
