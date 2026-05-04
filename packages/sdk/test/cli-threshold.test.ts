import { describe, expect, it } from 'vitest'
import { RISK_RANK, riskRank } from '../src/cli/format'
import type { RiskLevel } from '../src/types'

type FailOnLevel = 'medium' | 'high' | 'critical'

describe('--fail-on threshold cascade', () => {
  // Lock cascade order — alphabetizing RISK_RANK would silently break `--fail-on high`.
  const cases: Array<[RiskLevel, FailOnLevel, boolean]> = [
    ['critical', 'critical', true],
    ['critical', 'high',     true],
    ['critical', 'medium',   true],
    ['high',     'critical', false],
    ['high',     'high',     true],
    ['high',     'medium',   true],
    ['medium',   'critical', false],
    ['medium',   'high',     false],
    ['medium',   'medium',   true],
    ['low',      'critical', false],
    ['low',      'high',     false],
    ['low',      'medium',   false],
    ['unknown',  'critical', false],
    ['unknown',  'high',     false],
    ['unknown',  'medium',   false],
  ]

  for (const [actual, failOn, expected] of cases) {
    it(`risk_level=${actual} vs --fail-on ${failOn} → ${expected ? 'breach' : 'pass'}`, () => {
      expect(riskRank(actual) >= riskRank(failOn)).toBe(expected)
    })
  }
})

describe('RISK_RANK ordering', () => {
  it('is strictly increasing: unknown < low < medium < high < critical', () => {
    expect(RISK_RANK.unknown).toBeLessThan(RISK_RANK.low)
    expect(RISK_RANK.low).toBeLessThan(RISK_RANK.medium)
    expect(RISK_RANK.medium).toBeLessThan(RISK_RANK.high)
    expect(RISK_RANK.high).toBeLessThan(RISK_RANK.critical)
  })

  it('riskRank falls back to -1 for unrecognized levels', () => {
    expect(riskRank('bogus' as RiskLevel)).toBe(-1)
  })
})
