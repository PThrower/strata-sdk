import { describe, expect, it } from 'vitest'
import { classifyEntry, scanConfig, stripVersionPin } from '../src/config-scanner'

describe('stripVersionPin', () => {
  it('strips @latest from scoped package', () => {
    expect(stripVersionPin('@modelcontextprotocol/server-filesystem@latest')).toBe(
      '@modelcontextprotocol/server-filesystem',
    )
  })
  it('strips @x.y.z from scoped package', () => {
    expect(stripVersionPin('@scope/pkg@1.2.3')).toBe('@scope/pkg')
  })
  it('strips @latest from unscoped package', () => {
    expect(stripVersionPin('cowsay@latest')).toBe('cowsay')
  })
  it('keeps scoped package without pin', () => {
    expect(stripVersionPin('@scope/pkg')).toBe('@scope/pkg')
  })
  it('keeps unscoped package without pin', () => {
    expect(stripVersionPin('cowsay')).toBe('cowsay')
  })
})

describe('classifyEntry', () => {
  it('npx -y @scope/pkg → npm identifier', () => {
    const r = classifyEntry('fs', {
      command: 'npx',
      args: ['-y', '@modelcontextprotocol/server-filesystem', '/path'],
    })
    expect(r.identifier).toEqual({ npm: '@modelcontextprotocol/server-filesystem' })
  })

  it('npx --yes pkg → npm identifier', () => {
    const r = classifyEntry('fs', {
      command: 'npx',
      args: ['--yes', '@scope/pkg', '/path'],
    })
    expect(r.identifier).toEqual({ npm: '@scope/pkg' })
  })

  it('npx pkg (no -y) → npm identifier', () => {
    const r = classifyEntry('fs', {
      command: 'npx',
      args: ['@scope/pkg', '/path'],
    })
    expect(r.identifier).toEqual({ npm: '@scope/pkg' })
  })

  it('npx -p pkg cmd → npm identifier IS the package, not the binary', () => {
    // The package supplied via -p / --package is what `npx` resolves; the
    // following non-flag is the binary inside that package, not a separate
    // package. Verify against the package name.
    const r = classifyEntry('fs', {
      command: 'npx',
      args: ['-p', '@scope/pkg', 'binary', '--flag'],
    })
    expect(r.identifier).toEqual({ npm: '@scope/pkg' })
  })

  it('npx --package=@scope/pkg bin → identifier is package', () => {
    const r = classifyEntry('fs', {
      command: 'npx',
      args: ['--package=@scope/pkg', 'binary'],
    })
    expect(r.identifier).toEqual({ npm: '@scope/pkg' })
  })

  it('npx --package @scope/pkg bin → identifier is package', () => {
    const r = classifyEntry('fs', {
      command: 'npx',
      args: ['--package', '@scope/pkg', 'binary'],
    })
    expect(r.identifier).toEqual({ npm: '@scope/pkg' })
  })

  it('strips @latest pin', () => {
    const r = classifyEntry('fs', {
      command: 'npx',
      args: ['-y', '@playwright/mcp@latest'],
    })
    expect(r.identifier).toEqual({ npm: '@playwright/mcp' })
  })

  it('absolute path to npx works', () => {
    const r = classifyEntry('fs', {
      command: '/usr/local/bin/npx',
      args: ['-y', '@scope/pkg'],
    })
    expect(r.identifier).toEqual({ npm: '@scope/pkg' })
  })

  it('bunx → npm identifier', () => {
    const r = classifyEntry('fs', {
      command: 'bunx',
      args: ['@scope/pkg'],
    })
    expect(r.identifier).toEqual({ npm: '@scope/pkg' })
  })

  it('http url entry → endpoint identifier', () => {
    const r = classifyEntry('remote', {
      url: 'https://example.com/mcp',
      type: 'http',
    })
    expect(r.identifier).toEqual({ endpoint: 'https://example.com/mcp' })
  })

  it('streamable-http entry → endpoint identifier', () => {
    const r = classifyEntry('remote', {
      url: 'https://example.com/mcp',
      type: 'streamable-http',
    })
    expect(r.identifier).toEqual({ endpoint: 'https://example.com/mcp' })
  })

  it('node ./local.js → unverifiable', () => {
    const r = classifyEntry('local', {
      command: 'node',
      args: ['./local.js'],
    })
    expect(r.identifier).toBeNull()
    expect(r.reason).toMatch(/local node script/)
  })

  it('python module → unverifiable', () => {
    const r = classifyEntry('py', {
      command: 'python',
      args: ['-m', 'mod'],
    })
    expect(r.identifier).toBeNull()
    expect(r.reason).toMatch(/python module/)
  })

  it('uvx pkg → unverifiable (pypi mapping not yet supported)', () => {
    const r = classifyEntry('uvx', {
      command: 'uvx',
      args: ['mcp-pypi'],
    })
    expect(r.identifier).toBeNull()
    expect(r.reason).toMatch(/uvx/)
  })

  it('docker → unverifiable', () => {
    const r = classifyEntry('docker', {
      command: 'docker',
      args: ['run', 'image'],
    })
    expect(r.identifier).toBeNull()
    expect(r.reason).toMatch(/container/)
  })

  it('unknown command → unverifiable', () => {
    const r = classifyEntry('weird', {
      command: 'totallymadeupcommand',
      args: [],
    })
    expect(r.identifier).toBeNull()
    expect(r.reason).toMatch(/unsupported command/)
  })

  it('non-object → unverifiable', () => {
    const r = classifyEntry('bad', null)
    expect(r.identifier).toBeNull()
  })

  it('empty config → unverifiable', () => {
    const r = classifyEntry('empty', {})
    expect(r.identifier).toBeNull()
  })
})

describe('scanConfig', () => {
  it('Claude Desktop format with mixed entries', () => {
    const config = {
      mcpServers: {
        filesystem: {
          command: 'npx',
          args: ['-y', '@modelcontextprotocol/server-filesystem', '/Users/me/dev'],
        },
        playwright: {
          command: 'npx',
          args: ['-y', '@playwright/mcp@latest'],
        },
        remote: {
          url: 'https://api.example.com/mcp',
          type: 'http',
        },
        local: {
          command: 'node',
          args: ['./scripts/mcp.js'],
        },
      },
    }
    const entries = scanConfig(config)
    expect(entries).toHaveLength(4)
    expect(entries.find((e) => e.name === 'filesystem')?.identifier).toEqual({
      npm: '@modelcontextprotocol/server-filesystem',
    })
    expect(entries.find((e) => e.name === 'playwright')?.identifier).toEqual({
      npm: '@playwright/mcp',
    })
    expect(entries.find((e) => e.name === 'remote')?.identifier).toEqual({
      endpoint: 'https://api.example.com/mcp',
    })
    expect(entries.find((e) => e.name === 'local')?.identifier).toBeNull()
  })

  it('finds nested mcpServers', () => {
    const config = {
      profiles: {
        default: {
          mcpServers: {
            git: { command: 'npx', args: ['-y', '@scope/git'] },
          },
        },
      },
    }
    const entries = scanConfig(config)
    expect(entries).toHaveLength(1)
    expect(entries[0]?.identifier).toEqual({ npm: '@scope/git' })
  })

  it('finds mcpServers in arrays', () => {
    const config = {
      configs: [
        { mcpServers: { a: { command: 'npx', args: ['@x/a'] } } },
        { mcpServers: { b: { command: 'npx', args: ['@x/b'] } } },
      ],
    }
    const entries = scanConfig(config)
    expect(entries).toHaveLength(2)
  })

  it('returns empty for config without mcpServers', () => {
    expect(scanConfig({ foo: 'bar' })).toEqual([])
  })

  it('returns empty for null', () => {
    expect(scanConfig(null)).toEqual([])
  })

  it('returns empty for primitive', () => {
    expect(scanConfig('hello')).toEqual([])
  })

  it('handles cyclic objects without infinite loop', () => {
    const config: Record<string, unknown> = { mcpServers: { x: { command: 'npx', args: ['@x/x'] } } }
    config.self = config
    const entries = scanConfig(config)
    expect(entries).toHaveLength(1)
  })
})
