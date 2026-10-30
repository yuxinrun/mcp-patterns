import { serveStdio } from '@modelcontextprotocol/server/stdio'
import { createNotesServer } from './server.js'

// stdout carries JSON-RPC only. Any debug output must go to stderr.
serveStdio(() => createNotesServer())
