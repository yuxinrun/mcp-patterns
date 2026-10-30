import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { Client } from '@modelcontextprotocol/client'
import { StdioClientTransport } from '@modelcontextprotocol/client/stdio'

const here = path.dirname(fileURLToPath(import.meta.url))
const root = path.resolve(here, '..')

const client = new Client({ name: 'notes-cli', version: '0.1.0' })
const transport = new StdioClientTransport({
  command: process.execPath,
  args: ['--import', 'tsx', path.join(here, 'stdio.ts')],
  cwd: root,
  stderr: 'inherit'
})

await client.connect(transport)

try {
  const { tools } = await client.listTools()
  console.log('tools:', tools.map(tool => tool.name).join(', '))

  const sum = await client.callTool({ name: 'add', arguments: { a: 2, b: 3 } })
  console.log('add:', sum.structuredContent ?? sum.content)

  const found = await client.callTool({ name: 'search_notes', arguments: { query: 'transport' } })
  console.log('search_notes:', found.structuredContent)

  const resource = await client.readResource({ uri: 'notes://index' })
  const first = resource.contents[0]
  console.log('notes://index:', first && 'text' in first ? first.text : first)

  const prompt = await client.getPrompt({ name: 'summarize_note', arguments: { name: 'welcome' } })
  console.log('prompt:', prompt.messages[0]?.content)
} finally {
  await client.close()
}
