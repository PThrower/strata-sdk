# Strata SDK — Next.js example

A server-side route handler that verifies an MCP server URL. Keeps the API key off the client.

## Use

```ts
const res = await fetch('/api/check-mcp', {
  method: 'POST',
  body: JSON.stringify({ url: '@modelcontextprotocol/server-filesystem' }),
})
const data = await res.json()
console.log(data.risk_level, data.capability_flags)
```

## Env vars

```
STRATA_API_KEY=sk_…
```
