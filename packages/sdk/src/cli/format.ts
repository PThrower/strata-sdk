// Shared CLI formatting primitives used by both verify-cmd and scan-cmd.
// Inline ANSI escapes — no chalk / picocolors dependency.

import type { RiskLevel } from '../types'

export const ANSI = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  dim: '\x1b[2m',
  red: '\x1b[38;2;239;68;68m',
  green: '\x1b[38;2;0;196;114m',
  yellow: '\x1b[38;2;245;158;11m',
  orange: '\x1b[38;2;249;115;22m',
  gray: '\x1b[38;2;160;160;160m',
} as const

export const RISK_EMOJI: Record<RiskLevel, string> = {
  low: '🟢',
  medium: '🟡',
  high: '🟠',
  critical: '🔴',
  unknown: '⚪',
}

export const RISK_COLOR: Record<RiskLevel, string> = {
  low: ANSI.green,
  medium: ANSI.yellow,
  high: ANSI.orange,
  critical: ANSI.red,
  unknown: ANSI.gray,
}

export const RISK_RANK: Record<RiskLevel, number> = {
  unknown: -1, low: 0, medium: 1, high: 2, critical: 3,
}

export function riskRank(level: RiskLevel): number {
  return RISK_RANK[level] ?? -1
}

export const useColor: boolean =
  typeof process !== 'undefined' &&
  Boolean(process.stdout?.isTTY) &&
  process.env.NO_COLOR === undefined

export function color(s: string, c: string): string {
  return useColor ? `${c}${s}${ANSI.reset}` : s
}
