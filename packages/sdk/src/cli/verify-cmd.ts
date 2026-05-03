import { Strata } from '../index'
import {
  StrataAuthError,
  StrataNetworkError,
  StrataRateLimitError,
  StrataValidationError,
} from '../errors'
import type { RiskLevel, VerifyResult } from '../types'

const ANSI = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  dim: '\x1b[2m',
  red: '\x1b[38;2;239;68;68m',
  green: '\x1b[38;2;0;196;114m',
  yellow: '\x1b[38;2;245;158;11m',
  orange: '\x1b[38;2;249;115;22m',
  gray: '\x1b[38;2;160;160;160m',
}

const RISK_EMOJI: Record<RiskLevel, string> = {
  low: '🟢',
  medium: '🟡',
  high: '🟠',
  critical: '🔴',
  unknown: '⚪',
}

const RISK_COLOR: Record<RiskLevel, string> = {
  low: ANSI.green,
  medium: ANSI.yellow,
  high: ANSI.orange,
  critical: ANSI.red,
  unknown: ANSI.gray,
}

const useColor = process.stdout.isTTY && process.env.NO_COLOR === undefined

function color(s: string, c: string): string {
  return useColor ? `${c}${s}${ANSI.reset}` : s
}

export interface VerifyCmdOptions {
  target: string
  apiKey?: string | undefined
  baseUrl?: string | undefined
  json?: boolean
}

export async function runVerify(opts: VerifyCmdOptions): Promise<number> {
  const strata = new Strata({ apiKey: opts.apiKey, baseUrl: opts.baseUrl })

  let result: VerifyResult
  try {
    result = await strata.verify(opts.target)
  } catch (err) {
    return handleError(err, opts.json === true)
  }

  if (opts.json) {
    process.stdout.write(JSON.stringify(result, null, 2) + '\n')
    return result.risk_level === 'critical' ? 1 : 0
  }

  printResult(opts.target, result)
  return result.risk_level === 'critical' ? 1 : 0
}

function printResult(input: string, r: VerifyResult): void {
  const mark = r.found
    ? r.risk_level === 'critical' || r.risk_level === 'high'
      ? color('✗', ANSI.red)
      : color('✓', ANSI.green)
    : color('?', ANSI.gray)

  const name = r.name ?? input
  process.stdout.write(`${mark} ${color(name, ANSI.bold)}\n`)

  if (!r.found) {
    process.stdout.write(`  ${color('Not in Strata directory', ANSI.gray)}\n`)
    process.stdout.write(`  ${color('Risk:', ANSI.dim)} ${RISK_EMOJI.unknown} ${color('unknown', RISK_COLOR.unknown)}\n`)
    return
  }

  const sec = r.security_score ?? '–'
  const run = r.runtime_score ?? '–'
  process.stdout.write(
    `  ${color('Risk:', ANSI.dim)} ${RISK_EMOJI[r.risk_level]} ${color(r.risk_level, RISK_COLOR[r.risk_level])} ${color(`(security ${sec}, runtime ${run})`, ANSI.dim)}\n`,
  )

  if (r.capability_flags && r.capability_flags.length > 0) {
    process.stdout.write(
      `  ${color('Flags:', ANSI.dim)} ${r.capability_flags.join(', ')}\n`,
    )
  }
  if (r.runtime_freshness && r.runtime_freshness !== 'fresh') {
    const freshColor = r.runtime_freshness === 'stale' ? ANSI.yellow : ANSI.dim
    process.stdout.write(
      `  ${color('Data:', ANSI.dim)} ${color(r.runtime_freshness, freshColor)}\n`,
    )
  }
  if (r.reasons.length > 0 && r.risk_level !== 'low') {
    process.stdout.write(
      `  ${color('Reasons:', ANSI.dim)} ${r.reasons.join('; ')}\n`,
    )
  }
  if (r.url) {
    process.stdout.write(`  ${color('→', ANSI.dim)} ${r.url}\n`)
  }
}

function handleError(err: unknown, json: boolean): number {
  if (err instanceof StrataAuthError) {
    if (json) process.stdout.write(JSON.stringify({ error: 'auth_error', message: err.message }) + '\n')
    else process.stderr.write(color(`✗ Auth error: ${err.message}\n`, ANSI.red))
    return 2
  }
  if (err instanceof StrataRateLimitError) {
    const reset = err.resetAt ? ` (resets ${err.resetAt.toISOString()})` : ''
    if (json) {
      process.stdout.write(JSON.stringify({ error: 'rate_limited', message: err.message, reset_at: err.resetAt }) + '\n')
    } else {
      process.stderr.write(color(`✗ Rate limit hit${reset}\n`, ANSI.yellow))
    }
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
