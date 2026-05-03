import { describe, expect, it } from 'vitest'
import { normalizeInput } from '../src/verify'

describe('normalizeInput', () => {
  it('full GitHub URL → { url }', () => {
    expect(normalizeInput('https://github.com/owner/repo')).toEqual({
      url: 'https://github.com/owner/repo',
    })
  })

  it('http GitHub URL → { url }', () => {
    expect(normalizeInput('http://github.com/owner/repo')).toEqual({
      url: 'http://github.com/owner/repo',
    })
  })

  it('www.github.com → { url }', () => {
    expect(normalizeInput('https://www.github.com/owner/repo')).toEqual({
      url: 'https://www.github.com/owner/repo',
    })
  })

  it('bare github.com URL → { url } (https added)', () => {
    expect(normalizeInput('github.com/owner/repo')).toEqual({
      url: 'https://github.com/owner/repo',
    })
  })

  it('non-github http URL → { endpoint }', () => {
    expect(normalizeInput('https://example.com/mcp')).toEqual({
      endpoint: 'https://example.com/mcp',
    })
  })

  it('scoped npm package → { npm }', () => {
    expect(normalizeInput('@modelcontextprotocol/server-filesystem')).toEqual({
      npm: '@modelcontextprotocol/server-filesystem',
    })
  })

  it('unscoped npm package → { npm }', () => {
    expect(normalizeInput('cowsay')).toEqual({ npm: 'cowsay' })
  })

  it('strips @latest from scoped npm', () => {
    expect(normalizeInput('@playwright/mcp@latest')).toEqual({ npm: '@playwright/mcp' })
  })

  it('strips @1.2.3 from unscoped npm', () => {
    expect(normalizeInput('cowsay@1.2.3')).toEqual({ npm: 'cowsay' })
  })

  it('passes through typed VerifyInput unchanged', () => {
    const input = { url: 'https://github.com/x/y' }
    expect(normalizeInput(input)).toBe(input)
  })

  it('passes through { npm } unchanged', () => {
    const input = { npm: '@x/y' }
    expect(normalizeInput(input)).toBe(input)
  })

  it('passes through { endpoint } unchanged', () => {
    const input = { endpoint: 'https://x.com/mcp' }
    expect(normalizeInput(input)).toBe(input)
  })

  it('throws on empty string', () => {
    expect(() => normalizeInput('')).toThrow()
    expect(() => normalizeInput('   ')).toThrow()
  })
})
