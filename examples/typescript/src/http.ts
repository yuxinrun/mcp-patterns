import http from 'node:http'
import { createMcpHandler } from '@modelcontextprotocol/server'
import { localhostHostValidation, localhostOriginValidation, toNodeHandler } from '@modelcontextprotocol/node'
import { createNotesServer } from './server.js'

const PORT = Number(process.env.PORT ?? 8000)

// One web-standard handler; every request gets a fresh server instance in this
// stateless setup, so there is no session state to keep in memory.
const handler = createMcpHandler(() => createNotesServer())
const mcp = toNodeHandler(handler)
const validateHost = localhostHostValidation()
const validateOrigin = localhostOriginValidation()

const server = http.createServer((req, res) => {
  const { pathname } = new URL(req.url ?? '/', 'http://localhost')

  if (pathname === '/healthz') {
    res.writeHead(200, { 'content-type': 'application/json' })
    res.end(JSON.stringify({ ok: true, server: 'notes', transport: 'streamable-http' }))
    return
  }

  if (pathname === '/mcp') {
    // DNS-rebinding protection: reject foreign Host and browser Origins.
    if (!validateHost(req, res) || !validateOrigin(req, res)) return
    void mcp(req, res)
    return
  }

  res.writeHead(404, { 'content-type': 'application/json' })
  res.end(JSON.stringify({ error: 'not found' }))
})

server.listen(PORT, '127.0.0.1', () => {
  console.error(`notes MCP server listening on http://127.0.0.1:${PORT}/mcp`)
})

const shutdown = () => {
  server.close(() => void handler.close().then(() => process.exit(0)))
}
process.on('SIGINT', shutdown)
process.on('SIGTERM', shutdown)
