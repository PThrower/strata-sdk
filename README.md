# Strata SDK + GitHub Action

[![npm](https://img.shields.io/npm/v/@strata-ai/sdk.svg)](https://www.npmjs.com/package/@strata-ai/sdk)
[![license](https://img.shields.io/npm/l/@strata-ai/sdk.svg)](LICENSE)

The official TypeScript SDK and GitHub Action for [Strata](https://usestrata.dev) — verify the trust score and capability surface of any MCP (Model Context Protocol) server in one line of code, or gate every PR on MCP supply-chain safety.

## Packages

| Package | Description |
|---|---|
| [`@strata-ai/sdk`](packages/sdk) | Zero-dependency TypeScript SDK with `verify`, `verifyAll`, `findMCP`, `ecosystem`, plus a `strata` CLI |
| [`packages/action`](packages/action) | GitHub Action — finds MCP server references, posts an idempotent PR comment, fails the check on critical risk |

## Quick install

```bash
npm install @strata-ai/sdk
```

```ts
import { Strata } from '@strata-ai/sdk'

const strata = new Strata({ apiKey: process.env.STRATA_API_KEY })

const result = await strata.verify('https://github.com/microsoft/playwright-mcp')
console.log(result.risk_level, result.capability_flags)
```

## Quick action

```yaml
- uses: PThrower/strata-sdk/packages/action@v1
  with:
    strata_api_key: ${{ secrets.STRATA_API_KEY }}
    fail_on: critical
```

## CLI

```bash
npx strata verify @modelcontextprotocol/server-filesystem
npx strata scan ~/Library/Application\ Support/Claude/claude_desktop_config.json
```

## Documentation

Full docs: [usestrata.dev/docs/sdk](https://usestrata.dev/docs/sdk)

## License

MIT
