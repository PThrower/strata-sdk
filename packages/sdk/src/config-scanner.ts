// Parses MCP client config files (Claude Desktop, Cursor, Cline — all share
// the same `mcpServers` shape) and classifies each entry as a verifiable
// identifier or as `unverifiable` (local scripts, opaque commands).
//
// Pure logic — no I/O. Caller is responsible for reading the file and passing
// in the parsed JSON object.

import type { VerifyInput } from './types'

export interface ScannedEntry {
  name: string
  identifier: VerifyInput | null
  reason?: string  // why it's unverifiable, when identifier is null
  raw: unknown
}

export interface McpServerConfig {
  command?: string
  args?: string[]
  url?: string
  endpoint?: string
  type?: string
  env?: Record<string, string>
  [key: string]: unknown
}

export interface McpClientConfig {
  mcpServers?: Record<string, McpServerConfig>
  // Some configs also nest under different keys; we walk the whole tree.
  [key: string]: unknown
}

// Strip `@latest` / `@x.y.z` semver pin from npm package names so the lookup
// matches the canonical mcp_servers.npm_package value.
export function stripVersionPin(name: string): string {
  // For scoped packages: keep @scope/name, strip the second @
  if (name.startsWith('@')) {
    const slash = name.indexOf('/')
    if (slash > 0) {
      const rest = name.slice(slash + 1)
      const at = rest.indexOf('@')
      if (at > 0) {
        return name.slice(0, slash + 1) + rest.slice(0, at)
      }
    }
    return name
  }
  // Bare package: strip everything after first @
  const at = name.indexOf('@')
  return at > 0 ? name.slice(0, at) : name
}

export function classifyEntry(name: string, config: unknown): ScannedEntry {
  if (!config || typeof config !== 'object') {
    return { name, identifier: null, reason: 'entry is not an object', raw: config }
  }
  const c = config as McpServerConfig

  // HTTP / streamable-http endpoint
  const httpUrl = c.url ?? c.endpoint
  if (typeof httpUrl === 'string' && /^https?:\/\//i.test(httpUrl)) {
    return { name, identifier: { endpoint: httpUrl }, raw: c }
  }

  // Stdio transport
  if (typeof c.command === 'string' && Array.isArray(c.args)) {
    const cmd = c.command.toLowerCase().split(/[/\\]/).pop() ?? c.command.toLowerCase()
    const args = c.args.filter((a) => typeof a === 'string')

    // npx-launched packages — the canonical MCP install pattern
    if (cmd === 'npx' || cmd === 'pnpx' || cmd === 'bunx') {
      const pkg = extractNpxPackage(args)
      if (pkg) {
        return { name, identifier: { npm: stripVersionPin(pkg) }, raw: c }
      }
      return {
        name, identifier: null,
        reason: 'npx invocation has no recognizable package argument',
        raw: c,
      }
    }

    // node ./local.js → unverifiable
    if (cmd === 'node' || cmd === 'node.exe') {
      return {
        name, identifier: null,
        reason: 'local node script — not in directory',
        raw: c,
      }
    }

    // python -m mod → unverifiable (pypi resolution would be guesswork)
    if (cmd === 'python' || cmd === 'python3' || cmd === 'python.exe') {
      return {
        name, identifier: null,
        reason: 'python module — pypi mapping not yet supported',
        raw: c,
      }
    }

    // uv run / uvx with a package
    if (cmd === 'uv' || cmd === 'uvx') {
      // uvx <pkg> [args] OR uv run --with <pkg>
      const pkg = args.find((a) => /^[a-z0-9][a-z0-9._-]*$/i.test(a))
      if (pkg) {
        return {
          name, identifier: null,
          reason: `uvx package "${pkg}" — pypi mapping not yet supported`,
          raw: c,
        }
      }
      return { name, identifier: null, reason: 'uvx command without package', raw: c }
    }

    // docker / podman → unverifiable for now
    if (cmd === 'docker' || cmd === 'podman') {
      return {
        name, identifier: null,
        reason: 'container-based MCP server — not in directory',
        raw: c,
      }
    }

    return {
      name, identifier: null,
      reason: `unsupported command "${c.command}"`,
      raw: c,
    }
  }

  return {
    name, identifier: null,
    reason: 'entry has neither url nor command/args',
    raw: c,
  }
}

// Walks a parsed JSON tree, finds every `mcpServers` object, classifies each
// entry. Handles nested config files where mcpServers might live under
// `globalShortcut`, `extensions`, or other vendor-specific wrappers.
export function scanConfig(parsed: unknown): ScannedEntry[] {
  const found: ScannedEntry[] = []
  const seen = new WeakSet<object>()

  function walk(node: unknown): void {
    if (!node || typeof node !== 'object') return
    if (Array.isArray(node)) {
      for (const item of node) walk(item)
      return
    }
    if (seen.has(node as object)) return
    seen.add(node as object)

    const obj = node as Record<string, unknown>
    if (obj.mcpServers && typeof obj.mcpServers === 'object' && !Array.isArray(obj.mcpServers)) {
      const servers = obj.mcpServers as Record<string, unknown>
      for (const [name, cfg] of Object.entries(servers)) {
        found.push(classifyEntry(name, cfg))
      }
    }

    for (const value of Object.values(obj)) {
      walk(value)
    }
  }

  walk(parsed)
  return found
}

function extractNpxPackage(args: string[]): string | null {
  // Skip leading flags: -y, --yes, -p, --package
  let i = 0
  while (i < args.length) {
    const a = args[i]
    if (!a) return null
    if (a === '-y' || a === '--yes') {
      i++
      continue
    }
    if (a === '-p' || a === '--package') {
      // Both forms: `-p <pkg>` or `--package=<pkg>`
      i += 2
      continue
    }
    if (a.startsWith('--package=')) {
      i++
      continue
    }
    // First non-flag is the package
    if (a.startsWith('-')) {
      i++
      continue
    }
    return a
  }
  return null
}

// Default config paths per OS (for `strata scan` with no explicit path).
export function defaultConfigPath(): string | null {
  const home = process.env.HOME ?? process.env.USERPROFILE
  if (!home) return null
  const platform = process.platform
  if (platform === 'darwin') {
    return `${home}/Library/Application Support/Claude/claude_desktop_config.json`
  }
  if (platform === 'win32') {
    const appData = process.env.APPDATA
    if (!appData) return null
    return `${appData}\\Claude\\claude_desktop_config.json`
  }
  return `${home}/.config/Claude/claude_desktop_config.json`
}
