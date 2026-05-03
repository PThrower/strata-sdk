#!/usr/bin/env node
// Strata CLI entry point. Tiny argv parser, no dep on commander/yargs.
//
// Subcommands:
//   strata verify <url|npm|endpoint>   [--json] [--api-key <key>]
//   strata scan [path]                 [--json] [--fail-on critical|high|medium] [--api-key <key>]
//   strata --help
//   strata --version

import { runVerify } from './verify-cmd'
import { runScan } from './scan-cmd'

const VERSION = '0.1.0'

const HELP = `Strata CLI v${VERSION}

USAGE
  strata verify <url|npm|endpoint>   verify a single MCP server
  strata scan [path]                 scan an MCP client config and verify every entry

OPTIONS
  --json                             output JSON (parseable)
  --fail-on <level>                  scan: exit non-zero on critical|high|medium (default: critical)
  --api-key <key>                    override STRATA_API_KEY env var
  --base-url <url>                   override the API base URL
  -h, --help                         show this help
  -v, --version                      show SDK version

EXAMPLES
  strata verify @modelcontextprotocol/server-filesystem
  strata verify https://github.com/microsoft/playwright-mcp
  strata scan
  strata scan ./mcp.json --fail-on high

DOCS
  https://usestrata.dev/docs/sdk

ENV
  STRATA_API_KEY                     your Strata API key (optional — anon tier when missing)
  STRATA_BASE_URL                    override the API base URL
`

interface ParsedArgs {
  subcommand: string | null
  positional: string[]
  flags: Map<string, string | boolean>
}

function parseArgs(argv: string[]): ParsedArgs {
  const flags = new Map<string, string | boolean>()
  const positional: string[] = []
  let subcommand: string | null = null

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]
    if (arg === undefined) continue

    if (arg === '-h' || arg === '--help') {
      flags.set('help', true)
    } else if (arg === '-v' || arg === '--version') {
      flags.set('version', true)
    } else if (arg.startsWith('--')) {
      const eq = arg.indexOf('=')
      if (eq > 0) {
        flags.set(arg.slice(2, eq), arg.slice(eq + 1))
      } else {
        const next = argv[i + 1]
        if (next !== undefined && !next.startsWith('-')) {
          flags.set(arg.slice(2), next)
          i++
        } else {
          flags.set(arg.slice(2), true)
        }
      }
    } else if (arg.startsWith('-') && arg.length > 1) {
      flags.set(arg.slice(1), true)
    } else if (subcommand === null) {
      subcommand = arg
    } else {
      positional.push(arg)
    }
  }

  return { subcommand, positional, flags }
}

async function main(): Promise<number> {
  const args = parseArgs(process.argv.slice(2))

  if (args.flags.get('version')) {
    process.stdout.write(`${VERSION}\n`)
    return 0
  }

  if (args.flags.get('help') || args.subcommand === null) {
    process.stdout.write(HELP)
    return args.subcommand === null ? 0 : 0
  }

  const apiKey = pickFlag(args.flags, 'api-key') ?? process.env.STRATA_API_KEY
  const baseUrl = pickFlag(args.flags, 'base-url') ?? process.env.STRATA_BASE_URL
  const json = args.flags.get('json') === true

  switch (args.subcommand) {
    case 'verify': {
      const target = args.positional[0]
      if (!target) {
        process.stderr.write('Error: strata verify requires a target (url, npm package, or endpoint)\n')
        return 2
      }
      return runVerify({ target, apiKey, baseUrl, json })
    }
    case 'scan': {
      const path = args.positional[0]
      const failOn = pickFlag(args.flags, 'fail-on') ?? 'critical'
      if (failOn !== 'critical' && failOn !== 'high' && failOn !== 'medium') {
        process.stderr.write(`Error: --fail-on must be critical|high|medium, got "${failOn}"\n`)
        return 2
      }
      return runScan({ path, apiKey, baseUrl, json, failOn })
    }
    default:
      process.stderr.write(`Error: unknown subcommand "${args.subcommand}"\n\n${HELP}`)
      return 2
  }
}

function pickFlag(flags: Map<string, string | boolean>, name: string): string | undefined {
  const v = flags.get(name)
  return typeof v === 'string' ? v : undefined
}

main()
  .then((code) => process.exit(code))
  .catch((err) => {
    process.stderr.write(`Error: ${err instanceof Error ? err.message : String(err)}\n`)
    process.exit(2)
  })
