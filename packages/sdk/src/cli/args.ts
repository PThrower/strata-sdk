// Argv parser for the strata CLI. Lives in its own module so tests can
// import it without triggering the auto-run main() in cli/index.ts.

export interface ParsedArgs {
  subcommand: string | null
  positional: string[]
  flags: Map<string, string | boolean>
}

// Flags that never take a value; without this set, `--json @scope/pkg`
// would consume `@scope/pkg` as the json flag's value.
export const BOOLEAN_FLAGS = new Set(['json', 'help', 'version'])

export function parseArgs(argv: string[]): ParsedArgs {
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
        const name = arg.slice(2)
        if (BOOLEAN_FLAGS.has(name)) {
          flags.set(name, true)
        } else {
          const next = argv[i + 1]
          if (next !== undefined && !next.startsWith('-')) {
            flags.set(name, next)
            i++
          } else {
            flags.set(name, true)
          }
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

export function pickFlag(
  flags: Map<string, string | boolean>,
  name: string,
): string | undefined {
  const v = flags.get(name)
  return typeof v === 'string' ? v : undefined
}
