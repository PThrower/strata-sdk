import { readFileSync, existsSync } from 'node:fs'
import { Strata } from '../index'
import { defaultConfigPaths, scanConfig, type ScannedEntry } from '../config-scanner'
import {
  StrataAuthError,
  StrataNetworkError,
  StrataRateLimitError,
  StrataValidationError,
} from '../errors'
import type { RiskLevel, VerifyResult } from '../types'
import {
  ANSI,
  RISK_EMOJI,
  RISK_COLOR,
  RISK_RANK,
  color,
} from './format'

export interface ScanCmdOptions {
  path?: string | undefined
  apiKey?: string | undefined
  baseUrl?: string | undefined
  json?: boolean
  failOn: 'critical' | 'high' | 'medium'
}

export async function runScan(opts: ScanCmdOptions): Promise<number> {
  let path = opts.path
  if (!path) {
    const candidates = defaultConfigPaths()
    if (candidates.length === 0) {
      process.stderr.write(color('Error: cannot determine default config path on this OS — pass an explicit path\n', ANSI.red))
      return 2
    }
    path = candidates.find((p) => existsSync(p))
    if (!path) {
      process.stderr.write(
        color(
          `Error: no config found at any default location (tried ${candidates.length}). Pass an explicit path.\n`,
          ANSI.red,
        ),
      )
      return 2
    }
  }
  if (!existsSync(path)) {
    process.stderr.write(color(`Error: config not found at ${path}\n`, ANSI.red))
    return 2
  }

  let parsed: unknown
  try {
    const raw = readFileSync(path, 'utf-8')
    parsed = JSON.parse(raw)
  } catch (err) {
    process.stderr.write(color(`Error: failed to read or parse ${path}: ${err instanceof Error ? err.message : String(err)}\n`, ANSI.red))
    return 2
  }

  const entries = scanConfig(parsed)
  if (entries.length === 0) {
    process.stdout.write(color('No mcpServers found in config.\n', ANSI.gray))
    return 0
  }

  const strata = new Strata({ apiKey: opts.apiKey, baseUrl: opts.baseUrl })

  // Verify all classifiable entries in one batch.
  const verifiable = entries.filter((e): e is ScannedEntry & { identifier: NonNullable<ScannedEntry['identifier']> } => e.identifier !== null)

  let results: VerifyResult[] = []
  if (verifiable.length > 0) {
    try {
      results = await strata.verifyAll(verifiable.map((e) => e.identifier))
    } catch (err) {
      return handleError(err, opts.json === true)
    }
  }

  // Build per-entry result map keyed by entry name (input order preserved by verifyAll).
  const resultMap = new Map<string, VerifyResult>()
  verifiable.forEach((entry, i) => {
    const r = results[i]
    if (r) resultMap.set(entry.name, r)
  })

  if (opts.json) {
    const out = entries.map((entry) => {
      const r = resultMap.get(entry.name)
      return {
        name: entry.name,
        identifier: entry.identifier,
        unverifiable_reason: entry.identifier ? null : entry.reason,
        result: r ?? null,
      }
    })
    process.stdout.write(JSON.stringify({ source: path, entries: out }, null, 2) + '\n')
  } else {
    printReport(path, entries, resultMap)
  }

  // Decide exit code based on --fail-on threshold.
  const threshold = RISK_RANK[opts.failOn]
  let worst: RiskLevel = 'low'
  for (const r of resultMap.values()) {
    if (RISK_RANK[r.risk_level] > RISK_RANK[worst]) worst = r.risk_level
  }
  return RISK_RANK[worst] >= threshold ? 1 : 0
}

function printReport(
  path: string,
  entries: ScannedEntry[],
  resultMap: Map<string, VerifyResult>,
): void {
  process.stdout.write(`${color('Strata MCP Security Scan', ANSI.bold)}\n`)
  process.stdout.write(`${color(path, ANSI.dim)}\n\n`)

  let pass = 0, warn = 0, crit = 0, unverifiable = 0

  for (const entry of entries) {
    if (!entry.identifier) {
      process.stdout.write(
        `${color('?', ANSI.gray)} ${color(entry.name, ANSI.bold)}  ${color(`unverifiable — ${entry.reason ?? 'unknown reason'}`, ANSI.gray)}\n`,
      )
      unverifiable++
      continue
    }
    const r = resultMap.get(entry.name)
    if (!r) {
      process.stdout.write(`${color('?', ANSI.gray)} ${color(entry.name, ANSI.bold)}  ${color('lookup failed', ANSI.gray)}\n`)
      unverifiable++
      continue
    }

    const mark = r.risk_level === 'critical' ? color('✗', ANSI.red)
              : r.risk_level === 'high' ? color('!', ANSI.orange)
              : r.risk_level === 'unknown' ? color('?', ANSI.gray)
              : color('✓', ANSI.green)
    const sec = r.security_score ?? '–'
    const run = r.runtime_score ?? '–'
    const flags = r.capability_flags && r.capability_flags.length > 0 ? color(` [${r.capability_flags.join(',')}]`, ANSI.dim) : ''
    const idLabel = r.name ?? entry.name
    process.stdout.write(
      `${mark} ${color(idLabel, ANSI.bold)}  ${RISK_EMOJI[r.risk_level]} ${color(r.risk_level, RISK_COLOR[r.risk_level])}  ${color(`security ${sec}, runtime ${run}`, ANSI.dim)}${flags}\n`,
    )

    if (r.risk_level === 'critical') crit++
    else if (r.risk_level === 'high' || r.risk_level === 'medium') warn++
    else if (r.risk_level === 'low') pass++
    else unverifiable++
  }

  process.stdout.write('\n')
  process.stdout.write(
    `${color('✓', ANSI.green)} ${pass} passed  ` +
    `${color('!', ANSI.orange)} ${warn} warnings  ` +
    `${color('✗', ANSI.red)} ${crit} critical  ` +
    `${color('?', ANSI.gray)} ${unverifiable} unverifiable\n`,
  )
}

function handleError(err: unknown, json: boolean): number {
  if (err instanceof StrataAuthError) {
    if (json) process.stdout.write(JSON.stringify({ error: 'auth_error', message: err.message }) + '\n')
    else process.stderr.write(color(`✗ Auth error: ${err.message}\n`, ANSI.red))
    return 2
  }
  if (err instanceof StrataRateLimitError) {
    if (json) process.stdout.write(JSON.stringify({ error: 'rate_limited', message: err.message, reset_at: err.resetAt }) + '\n')
    else process.stderr.write(color(`✗ Rate limit hit\n`, ANSI.yellow))
    return 2
  }
  if (err instanceof StrataValidationError) {
    if (json) process.stdout.write(JSON.stringify({ error: 'validation_error', message: err.message }) + '\n')
    else process.stderr.write(color(`✗ ${err.message}\n`, ANSI.red))
    return 2
  }
  if (err instanceof StrataNetworkError) {
    if (json) process.stdout.write(JSON.stringify({ error: 'network_error', message: err.message }) + '\n')
    else process.stderr.write(color(`✗ Network error: ${err.message}\n`, ANSI.red))
    return 2
  }
  const message = err instanceof Error ? err.message : String(err)
  if (json) process.stdout.write(JSON.stringify({ error: 'unknown', message }) + '\n')
  else process.stderr.write(color(`✗ ${message}\n`, ANSI.red))
  return 2
}
