# @strata-ai/sdk

[![npm](https://img.shields.io/npm/v/@strata-ai/sdk.svg)](https://www.npmjs.com/package/@strata-ai/sdk)
[![license](https://img.shields.io/npm/l/@strata-ai/sdk.svg)](LICENSE)

Zero-dependency TypeScript SDK for [Strata](https://usestrata.dev) — verify the trust score and capability surface of any MCP (Model Context Protocol) server in one line of code.

```bash
npm install @strata-ai/sdk
```

## Quick start

```ts
import { Strata } from '@strata-ai/sdk'

const strata = new Strata({ apiKey: process.env.STRATA_API_KEY })

// Verify a single MCP server (GitHub URL, npm package, or hosted endpoint)
const result = await strata.verify('https://github.com/microsoft/playwright-mcp')

console.log(result.risk_level)        // 'low' | 'medium' | 'high' | 'critical' | 'unknown'
console.log(result.capability_flags)  // ['fs_write', 'net_egress']
console.log(result.security_score)    // 85
console.log(result.runtime_score)     // 72
console.log(result.trusted)           // true / false
```

## Without an API key (anonymous tier)

```ts
const strata = Strata.public()
await strata.verify('@modelcontextprotocol/server-filesystem')
```

Anonymous tier is 10 requests / hour / IP. For higher limits [grab a free key](https://usestrata.dev/signup).

## API

### `verify(input)`

Single-server lookup. Accepts:

- A GitHub URL (`'https://github.com/owner/repo'` or `'github.com/owner/repo'`)
- An npm package name (`'@scope/pkg'` — version pins like `@latest` are stripped)
- A hosted MCP endpoint URL (`'https://example.com/mcp'`)
- A typed `VerifyInput` object: `{ url }` | `{ npm }` | `{ endpoint }`

Returns a `VerifyResult`:

```ts
{
  found: boolean
  trusted: boolean              // true only when risk_level === 'low' AND not quarantined
  risk_level: RiskLevel         // 'low' | 'medium' | 'high' | 'critical' | 'unknown'
  is_quarantined: boolean
  reasons: string[]             // why this risk level was assigned
  // present only when found:
  name, description, url, category,
  security_score, runtime_score,
  capability_flags, hosted_endpoint, tool_count,
  runtime_freshness,            // 'fresh' | 'aging' | 'stale' | 'unknown'
  injection_risk_score,
}
```

Servers not in Strata's directory return `{ found: false, risk_level: 'unknown' }` — `verify` never throws for not-found.

### `verifyAll(inputs)`

Batch lookup. Order is preserved. Uses a single bulk call when `inputs.length > 5`. Each call counts as `ceil(N/10)` against your monthly quota.

### `findMCP(query, options?)`

Semantic search over Strata's directory. Quarantined and archived servers are excluded automatically.

```ts
const servers = await strata.findMCP('browser automation', {
  excludeCapabilities: ['shell_exec', 'dynamic_eval'],
  minSecurityScore: 50,
  minRuntimeScore: 40,
  requireHosted: false,
  limit: 5,
})
```

### `ecosystem(slug)`

Composite intelligence brief — best practices, news, integrations — in one round trip. Requires authentication.

```ts
const brief = await strata.ecosystem('claude')
console.log(brief.best_practices, brief.news, brief.integrations)
```

## Risk levels

| Level | Conditions |
|---|---|
| 🔴 **critical** | `is_quarantined: true` OR `security_score < 20` |
| 🟠 **high** | exposes `shell_exec` or `dynamic_eval` |
| 🟡 **medium** | exposes `fs_write` or `arbitrary_sql` |
| 🟢 **low** | none of the above |
| ⚪ **unknown** | server not in Strata directory |

`trusted: true` is only set when `risk_level === 'low'` and not quarantined. Conservative on purpose — use `findMCP({ excludeCapabilities: [...] })` to filter for your tolerance.

## CLI

The package ships a `strata` binary:

```bash
npx strata verify @modelcontextprotocol/server-filesystem
npx strata verify https://github.com/microsoft/playwright-mcp

# Scan an MCP client config (Claude Desktop / Cursor / Cline)
npx strata scan
npx strata scan ./mcp.json --fail-on high

# JSON output (parseable)
npx strata verify @scope/pkg --json
```

`strata scan` defaults to:
- macOS: `~/Library/Application Support/Claude/claude_desktop_config.json`
- Windows: `%APPDATA%/Claude/claude_desktop_config.json`
- Linux: `~/.config/Claude/claude_desktop_config.json`

Exit codes: 0 ok, 1 if any server breaches `--fail-on`, 2 internal error.

## Errors

Every failure mode has a typed class:

```ts
import {
  StrataAuthError,
  StrataRateLimitError,
  StrataValidationError,
  StrataNetworkError,
  StrataError,
} from '@strata-ai/sdk'

try {
  await strata.verify(url)
} catch (err) {
  if (err instanceof StrataRateLimitError) {
    console.log('Reset at', err.resetAt)
  }
}
```

## Browser usage

Anonymous calls are safe in the browser:

```ts
const strata = Strata.public()
```

If you pass `apiKey` in browser code, the SDK warns once to console — anyone viewing source can read it. Proxy authenticated calls through your server.

## TypeScript

All types are exported. Strict mode, `noUncheckedIndexedAccess`, public types stable across `0.x` patches.

## Configuration

```ts
const strata = new Strata({
  apiKey: 'sk_...',                 // optional
  baseUrl: 'https://usestrata.dev', // override
  fetch: customFetch,               // inject (Cloudflare Workers, testing, …)
  timeout: 10_000,                  // ms
  userAgent: 'my-app/1.0',          // appended to default
})
```

## Documentation

Full docs: [usestrata.dev/docs/sdk](https://usestrata.dev/docs/sdk)

## License

MIT
