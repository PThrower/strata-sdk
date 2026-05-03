import { describe, expect, it } from 'vitest'
import { computeRiskLevel, unknownRisk } from '../src/risk'

describe('computeRiskLevel', () => {
  it('quarantined → critical', () => {
    const r = computeRiskLevel({
      is_quarantined: true,
      security_score: 80,
      capability_flags: [],
    })
    expect(r.level).toBe('critical')
    expect(r.trusted).toBe(false)
    expect(r.reasons).toContain('flagged for prompt injection (quarantined)')
  })

  it('security_score below 20 → critical', () => {
    const r = computeRiskLevel({
      is_quarantined: false,
      security_score: 12,
      capability_flags: ['fs_write'],
    })
    expect(r.level).toBe('critical')
    expect(r.reasons.some((x) => x.includes('security_score 12'))).toBe(true)
  })

  it('quarantined AND low score → critical with both reasons', () => {
    const r = computeRiskLevel({
      is_quarantined: true,
      security_score: 5,
      capability_flags: ['shell_exec'],
    })
    expect(r.level).toBe('critical')
    expect(r.reasons.length).toBeGreaterThanOrEqual(2)
  })

  it('shell_exec → high', () => {
    const r = computeRiskLevel({
      is_quarantined: false,
      security_score: 80,
      capability_flags: ['shell_exec', 'net_egress'],
    })
    expect(r.level).toBe('high')
    expect(r.trusted).toBe(false)
    expect(r.reasons).toContain('exposes shell_exec')
  })

  it('dynamic_eval → high', () => {
    const r = computeRiskLevel({
      is_quarantined: false,
      security_score: 80,
      capability_flags: ['dynamic_eval'],
    })
    expect(r.level).toBe('high')
  })

  it('shell_exec AND dynamic_eval → high with both reasons', () => {
    const r = computeRiskLevel({
      is_quarantined: false,
      security_score: 80,
      capability_flags: ['shell_exec', 'dynamic_eval'],
    })
    expect(r.level).toBe('high')
    expect(r.reasons).toContain('exposes shell_exec')
    expect(r.reasons).toContain('exposes dynamic_eval')
  })

  it('fs_write only → medium', () => {
    const r = computeRiskLevel({
      is_quarantined: false,
      security_score: 80,
      capability_flags: ['fs_write'],
    })
    expect(r.level).toBe('medium')
    expect(r.trusted).toBe(false)
    expect(r.reasons).toContain('exposes fs_write')
  })

  it('arbitrary_sql → medium', () => {
    const r = computeRiskLevel({
      is_quarantined: false,
      security_score: 80,
      capability_flags: ['arbitrary_sql'],
    })
    expect(r.level).toBe('medium')
  })

  it('only net_egress / secret_read → low (still trusted)', () => {
    const r = computeRiskLevel({
      is_quarantined: false,
      security_score: 80,
      capability_flags: ['net_egress', 'secret_read'],
    })
    expect(r.level).toBe('low')
    expect(r.trusted).toBe(true)
  })

  it('no flags, score 80 → low', () => {
    const r = computeRiskLevel({
      is_quarantined: false,
      security_score: 80,
      capability_flags: [],
    })
    expect(r.level).toBe('low')
    expect(r.trusted).toBe(true)
    expect(r.reasons).toEqual([])
  })

  it('null capability_flags → treated as empty', () => {
    const r = computeRiskLevel({
      is_quarantined: false,
      security_score: 80,
      capability_flags: null,
    })
    expect(r.level).toBe('low')
  })

  it('null security_score → not critical from score', () => {
    const r = computeRiskLevel({
      is_quarantined: false,
      security_score: null,
      capability_flags: [],
    })
    expect(r.level).toBe('low')
  })

  it('null is_quarantined → not quarantined', () => {
    const r = computeRiskLevel({
      is_quarantined: null,
      security_score: 80,
      capability_flags: [],
    })
    expect(r.level).toBe('low')
  })

  it('hierarchy: quarantine wins over high-risk flag', () => {
    const r = computeRiskLevel({
      is_quarantined: true,
      security_score: 80,
      capability_flags: ['shell_exec'],
    })
    // Should NOT include shell_exec reason — critical short-circuits.
    expect(r.level).toBe('critical')
    expect(r.reasons.some((x) => x.includes('shell_exec'))).toBe(false)
  })

  it('hierarchy: high-risk flag wins over medium-risk flag', () => {
    const r = computeRiskLevel({
      is_quarantined: false,
      security_score: 80,
      capability_flags: ['shell_exec', 'fs_write'],
    })
    expect(r.level).toBe('high')
    // fs_write reason should NOT appear — medium block is skipped.
    expect(r.reasons.some((x) => x.includes('fs_write'))).toBe(false)
  })
})

describe('unknownRisk', () => {
  it('returns unknown level with given reason', () => {
    const r = unknownRisk('not in directory')
    expect(r.level).toBe('unknown')
    expect(r.trusted).toBe(false)
    expect(r.reasons).toEqual(['not in directory'])
  })
})
