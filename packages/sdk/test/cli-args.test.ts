import { describe, expect, it } from 'vitest'
import { parseArgs } from '../src/cli/args'

describe('CLI parseArgs', () => {
  it('strata verify --json @scope/pkg → json is boolean, package is positional', () => {
    const { subcommand, positional, flags } = parseArgs(['verify', '--json', '@scope/pkg'])
    expect(subcommand).toBe('verify')
    expect(positional).toEqual(['@scope/pkg'])
    expect(flags.get('json')).toBe(true)
  })

  it('strata scan --json /tmp/x.json → json is boolean, path is positional', () => {
    const { subcommand, positional, flags } = parseArgs(['scan', '--json', '/tmp/x.json'])
    expect(subcommand).toBe('scan')
    expect(positional).toEqual(['/tmp/x.json'])
    expect(flags.get('json')).toBe(true)
  })

  it('strata verify @scope/pkg --json (positional first) still works', () => {
    const { subcommand, positional, flags } = parseArgs(['verify', '@scope/pkg', '--json'])
    expect(subcommand).toBe('verify')
    expect(positional).toEqual(['@scope/pkg'])
    expect(flags.get('json')).toBe(true)
  })

  it('strata scan ./mcp.json --fail-on high', () => {
    const { positional, flags } = parseArgs(['scan', './mcp.json', '--fail-on', 'high'])
    expect(positional).toEqual(['./mcp.json'])
    expect(flags.get('fail-on')).toBe('high')
  })

  it('strata verify --fail-on high @scope/pkg → fail-on takes value, pkg is positional', () => {
    const { subcommand, positional, flags } = parseArgs([
      'verify', '--fail-on', 'high', '@scope/pkg',
    ])
    expect(subcommand).toBe('verify')
    expect(positional).toEqual(['@scope/pkg'])
    expect(flags.get('fail-on')).toBe('high')
  })

  it('--api-key sk_xxx (non-boolean flag) consumes next arg', () => {
    const { flags } = parseArgs(['verify', '--api-key', 'sk_test', '@scope/pkg'])
    expect(flags.get('api-key')).toBe('sk_test')
  })

  it('--flag=value form parses', () => {
    const { flags } = parseArgs(['scan', '--fail-on=critical'])
    expect(flags.get('fail-on')).toBe('critical')
  })

  it('--help is recognized as boolean flag', () => {
    const { flags } = parseArgs(['--help'])
    expect(flags.get('help')).toBe(true)
  })

  it('-h short flag is recognized', () => {
    const { flags } = parseArgs(['-h'])
    expect(flags.get('help')).toBe(true)
  })

  it('--version is boolean', () => {
    const { flags } = parseArgs(['--version'])
    expect(flags.get('version')).toBe(true)
  })

  it('subcommand only', () => {
    const { subcommand, positional, flags } = parseArgs(['scan'])
    expect(subcommand).toBe('scan')
    expect(positional).toEqual([])
    expect(flags.size).toBe(0)
  })

  it('empty argv', () => {
    const { subcommand, positional, flags } = parseArgs([])
    expect(subcommand).toBeNull()
    expect(positional).toEqual([])
    expect(flags.size).toBe(0)
  })

  it('unknown flag with value gobbles next arg by default', () => {
    // Sanity check: only BOOLEAN_FLAGS short-circuit value-eating.
    const { flags } = parseArgs(['scan', '--something', 'value'])
    expect(flags.get('something')).toBe('value')
  })
})
