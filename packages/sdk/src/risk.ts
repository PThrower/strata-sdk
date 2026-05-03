// Mirror of lib/risk.ts in the Strata main repo. The two files are kept
// byte-for-byte equivalent in their core logic so the server and SDK never
// disagree about a server's risk level.

import type { RiskLevel } from './types'

export interface RiskInput {
  is_quarantined: boolean | null
  security_score: number | null
  capability_flags: string[] | null
}

export interface RiskAssessment {
  level: RiskLevel
  reasons: string[]
  trusted: boolean
}

const HIGH_RISK_FLAGS = ['shell_exec', 'dynamic_eval'] as const
const MEDIUM_RISK_FLAGS = ['fs_write', 'arbitrary_sql'] as const

export function computeRiskLevel(row: RiskInput): RiskAssessment {
  const reasons: string[] = []
  const flags = row.capability_flags ?? []
  const score = row.security_score

  if (row.is_quarantined === true) {
    reasons.push('flagged for prompt injection (quarantined)')
  }
  if (score !== null && score < 20) {
    reasons.push(`security_score ${score} below 20`)
  }
  if (row.is_quarantined === true || (score !== null && score < 20)) {
    return { level: 'critical', reasons, trusted: false }
  }

  const highHits = HIGH_RISK_FLAGS.filter((f) => flags.includes(f))
  if (highHits.length > 0) {
    for (const f of highHits) reasons.push(`exposes ${f}`)
    return { level: 'high', reasons, trusted: false }
  }

  const medHits = MEDIUM_RISK_FLAGS.filter((f) => flags.includes(f))
  if (medHits.length > 0) {
    for (const f of medHits) reasons.push(`exposes ${f}`)
    return { level: 'medium', reasons, trusted: false }
  }

  return { level: 'low', reasons, trusted: true }
}

export function unknownRisk(reason: string): RiskAssessment {
  return { level: 'unknown', reasons: [reason], trusted: false }
}
