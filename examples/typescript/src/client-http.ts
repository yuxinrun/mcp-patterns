import { Client, StreamableHTTPClientTransport } from '@modelcontextprotocol/client'

const url = process.env.MCP_URL ?? 'http://127.0.0.1:8000/mcp'
const client = new Client({ name: 'notes-http-cli', version: '0.1.0' })

await client.connect(new StreamableHTTPClientTransport(new URL(url)))

try {
  const { tools } = await client.listTools()
  console.log('tools:', tools.map(tool => tool.name).join(', '))

  const sum = await client.callTool({ name: 'add', arguments: { a: 20, b: 22 } })
  console.log('add:', sum.structuredContent ?? sum.content)

  const note = await client.callTool({ name: 'read_note', arguments: { name: 'transport' } })
  console.log('read_note:', note.structuredContent)
} finally {
  await client.close()
}
