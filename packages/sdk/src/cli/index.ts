#!/usr/bin/env node
// Strata CLI entry point. Tiny argv parser, no dep on commander/yargs.
//
// Subcommands:
//   strata verify <url|npm|endpoint>   [--json] [--fail-on <level>] [--api-key <key>]
//   strata scan [path]                 [--json] [--fail-on <level>] [--api-key <key>]
//   strata --help
//   strata --version

import { runVerify } from './verify-cmd'
import { runScan } from './scan-cmd'
import { parseArgs, pickFlag } from './args'

const VERSION = '0.1.1'

const HELP = `Strata CLI v${VERSION}

USAGE
  strata verify <url|npm|endpoint>   verify a single MCP server
  strata scan [path]                 scan an MCP client config and verify every entry

OPTIONS
  --json                             output JSON (parseable)
  --fail-on <level>                  exit non-zero on critical|high|medium (default: critical)
  --api-key <key>                    override STRATA_API_KEY env var
  --base-url <url>                   override the API base URL
  -h, --help                         show this help
  -v, --version                      show SDK version

EXAMPLES
  strata verify @modelcontextprotocol/server-filesystem
  strata verify https://github.com/microsoft/playwright-mcp --fail-on high
  strata scan
  strata scan ./mcp.json --fail-on high

DOCS
  https://usestrata.dev/docs/sdk

ENV
  STRATA_API_KEY                     your Strata API key (optional — anon tier when missing)
  STRATA_BASE_URL                    override the API base URL
`

async function main(): Promise<number> {
  const args = parseArgs(process.argv.slice(2))

  if (args.flags.get('version')) {
    process.stdout.write(`${VERSION}\n`)
    return 0
  }

  if (args.flags.get('help')) {
    process.stdout.write(HELP)
    return 0
  }
  if (args.subcommand === null) {
    process.stdout.write(HELP)
    return 1  // no-op invocation is a usage error
  }

  const apiKey = pickFlag(args.flags, 'api-key') ?? process.env.STRATA_API_KEY
  const baseUrl = pickFlag(args.flags, 'base-url') ?? process.env.STRATA_BASE_URL
  const json = args.flags.get('json') === true
  const failOnRaw = pickFlag(args.flags, 'fail-on') ?? 'critical'
  if (failOnRaw !== 'critical' && failOnRaw !== 'high' && failOnRaw !== 'medium') {
    process.stderr.write(`Error: --fail-on must be critical|high|medium, got "${failOnRaw}"\n`)
    return 2
  }
  const failOn = failOnRaw

  switch (args.subcommand) {
    case 'verify': {
      const target = args.positional[0]
      if (!target) {
        process.stderr.write('Error: strata verify requires a target (url, npm package, or endpoint)\n')
        return 2
      }
      return runVerify({ target, apiKey, baseUrl, json, failOn })
    }
    case 'scan': {
      const path = args.positional[0]
      return runScan({ path, apiKey, baseUrl, json, failOn })
    }
    default:
      process.stderr.write(`Error: unknown subcommand "${args.subcommand}"\n\n${HELP}`)
      return 2
  }
}

main()
  .then((code) => process.exit(code))
  .catch((err) => {
    process.stderr.write(`Error: ${err instanceof Error ? err.message : String(err)}\n`)
    process.exit(2)
  })
