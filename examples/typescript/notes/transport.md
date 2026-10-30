# Choosing a transport

Use stdio for local tools started by the host. Use Streamable HTTP for remote
services that need auth, multi-tenancy, and horizontal scaling.

Legacy HTTP+SSE still exists for older clients, but new servers should not
start there.
