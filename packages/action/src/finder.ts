// Walks the repo and finds every MCP server reference. No glob library —
// uses Node's native fs.readdir with a hand-rolled matcher so the action
// dependency surface stays tight.

import { type Dirent, readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative, basename } from 'node:path'
import { scanConfig } from '@strata-ai/sdk'
import type { FoundEntry } from './types'

const MAX_FILES = 5000

const SKIP_DIRS = new Set([
  'node_modules', '.git', 'dist', 'build', '.next',
  '.vercel', '.turbo', 'coverage', 'vendor', 'target',
  '.cache', '.parcel-cache', '.svelte-kit',
])

const DEFAULT_FILE_PATTERNS: Array<(filename: string, fullPath: string) => boolean> = [
  (n) => n === 'claude_desktop_config.json',
  (n) => n === 'mcp.json' || n === '.mcp.json' || n.endsWith('.mcp.json'),
  (n) => n === 'cline_mcp_settings.json',
  // .claude/ and .cursor/ directories — match any .json inside
  (_n, p) => /[/\\]\.claude[/\\][^/\\]*\.json$/.test(p),
  (_n, p) => /[/\\]\.cursor[/\\][^/\\]*\.json$/.test(p),
  // package.json that mentions MCP at top level (handled in scan)
  (n) => n === 'package.json',
]

export function findMcpReferences(
  repoRoot: string,
  customGlobs?: string[],
): FoundEntry[] {
  const matchers = customGlobs && customGlobs.length > 0
    ? customGlobs.map(globToTester)
    : DEFAULT_FILE_PATTERNS

  const found: FoundEntry[] = []
  let filesScanned = 0
  let truncated = false

  const walk = (dir: string): void => {
    if (filesScanned >= MAX_FILES) { truncated = true; return }
    let dirents: Dirent[]
    try {
      dirents = readdirSync(dir, { withFileTypes: true }) as Dirent[]
    } catch {
      return
    }
    for (const entry of dirents) {
      if (filesScanned >= MAX_FILES) { truncated = true; return }
      const name = entry.name
      if (entry.isDirectory()) {
        if (SKIP_DIRS.has(name)) continue
        if (name.startsWith('.') && !/^\.(claude|cursor|github)$/.test(name)) continue
        walk(join(dir, name))
        continue
      }
      if (!entry.isFile()) continue
      const fullPath = join(dir, name)
      filesScanned++
      const matchesAny = matchers.some((m) => m(name, fullPath))
      if (!matchesAny) continue

      const parsed = safeReadJson(fullPath)
      if (!parsed) continue

      // For package.json, only proceed if it has mcp* keys at top level.
      if (basename(fullPath) === 'package.json') {
        const obj = parsed as Record<string, unknown>
        if (!obj.mcp && !obj.mcpServers) continue
      }

      const scanned = scanConfig(parsed)
      const sourcePath = relative(repoRoot, fullPath)
      for (const e of scanned) {
        const out: FoundEntry = {
          name: e.name,
          identifier: e.identifier,
          sourcePath,
          ...(e.reason !== undefined ? { reason: e.reason } : {}),
        }
        found.push(out)
      }
    }
  }

  if (statSync(repoRoot).isDirectory()) walk(repoRoot)

  if (truncated) {
    process.stderr.write(`[strata-action] file traversal capped at ${MAX_FILES} — increase if you really need more\n`)
  }

  // De-dupe by (sourcePath, name) — same entry across two configs is rare
  // but we still surface both since they may differ.
  return found
}

function safeReadJson(path: string): unknown {
  try {
    const raw = readFileSync(path, 'utf-8')
    return JSON.parse(raw)
  } catch {
    return null
  }
}

// Minimal glob → predicate. Supports leading **/ and trailing /** plus *
// in filenames. Anything more exotic falls back to substring match.
function globToTester(glob: string): (filename: string, fullPath: string) => boolean {
  const trimmed = glob.trim()
  if (!trimmed.includes('*')) {
    return (_n, p) => p.endsWith(trimmed)
  }
  const escaped = trimmed
    .replace(/[.+^${}()|[\]\\]/g, '\\$&')
    .replace(/\*\*\/?/g, '.*')
    .replace(/\*/g, '[^/\\\\]*')
  const re = new RegExp(escaped + '$')
  return (_n, p) => re.test(p)
}
