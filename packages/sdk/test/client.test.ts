import { describe, expect, it, vi } from 'vitest'
import { Client } from '../src/client'
import {
  StrataAuthError,
  StrataNetworkError,
  StrataRateLimitError,
  StrataValidationError,
} from '../src/errors'

function jsonResponse(body: unknown, init: ResponseInit = {}): Response {
  return new Response(JSON.stringify(body), {
    headers: { 'Content-Type': 'application/json', ...((init.headers ?? {}) as Record<string, string>) },
    ...init,
  })
}

describe('Client', () => {
  it('GET returns parsed JSON', async () => {
    const fetch = vi.fn(async () => jsonResponse({ hello: 'world' }))
    const client = new Client({ fetch, apiKey: 'sk_test', baseUrl: 'https://api.test' })
    const { data } = await client.get<{ hello: string }>('/v1/x')
    expect(data).toEqual({ hello: 'world' })
    const call = fetch.mock.calls[0]
    expect(call?.[0]).toBe('https://api.test/v1/x')
    const init = call?.[1] as RequestInit
    const headers = init.headers as Record<string, string>
    expect(headers.Authorization).toBe('Bearer sk_test')
    expect(headers['User-Agent']).toMatch(/^StrataSDK\//)
  })

  it('GET serializes query params', async () => {
    const fetch = vi.fn(async () => jsonResponse({}))
    const client = new Client({ fetch, baseUrl: 'https://api.test' })
    await client.get('/v1/x', { query: { a: 1, b: 'hi', c: true, d: null, e: undefined } })
    const url = (fetch.mock.calls[0]?.[0]) as string
    expect(url).toContain('a=1')
    expect(url).toContain('b=hi')
    expect(url).toContain('c=true')
    expect(url).not.toContain('d=')
    expect(url).not.toContain('e=')
  })

  it('omits Authorization when no apiKey', async () => {
    const fetch = vi.fn(async () => jsonResponse({}))
    const client = new Client({ fetch, baseUrl: 'https://api.test' })
    await client.get('/v1/x')
    const init = fetch.mock.calls[0]?.[1] as RequestInit
    const headers = init.headers as Record<string, string>
    expect(headers.Authorization).toBeUndefined()
  })

  it('POST sends JSON body', async () => {
    const fetch = vi.fn(async () => jsonResponse({ ok: true }))
    const client = new Client({ fetch, apiKey: 'sk_test', baseUrl: 'https://api.test' })
    await client.post('/v1/x', { body: { foo: 'bar' } })
    const init = fetch.mock.calls[0]?.[1] as RequestInit
    expect(init.method).toBe('POST')
    expect(init.body).toBe(JSON.stringify({ foo: 'bar' }))
    const headers = init.headers as Record<string, string>
    expect(headers['Content-Type']).toBe('application/json')
  })

  it('401 throws StrataAuthError', async () => {
    const fetch = vi.fn(async () => jsonResponse({ error: 'Invalid API key' }, { status: 401 }))
    const client = new Client({ fetch, apiKey: 'sk_bad', baseUrl: 'https://api.test' })
    await expect(client.get('/v1/x')).rejects.toBeInstanceOf(StrataAuthError)
  })

  it('429 throws StrataRateLimitError with parsed reset', async () => {
    const reset = '2026-12-01T00:00:00.000Z'
    const fetch = vi.fn(async () =>
      jsonResponse(
        { error: 'rate_limited', message: 'Rate limit reached' },
        {
          status: 429,
          headers: {
            'X-RateLimit-Limit': '10',
            'X-RateLimit-Remaining': '0',
            'X-RateLimit-Reset': reset,
          },
        },
      ),
    )
    const client = new Client({ fetch, baseUrl: 'https://api.test' })
    try {
      await client.get('/v1/x')
      throw new Error('should have thrown')
    } catch (err) {
      expect(err).toBeInstanceOf(StrataRateLimitError)
      const e = err as StrataRateLimitError
      expect(e.resetAt?.toISOString()).toBe(reset)
      expect(e.remaining).toBe(0)
    }
  })

  it('400 throws StrataValidationError', async () => {
    const fetch = vi.fn(async () => jsonResponse({ error: 'invalid' }, { status: 400 }))
    const client = new Client({ fetch, baseUrl: 'https://api.test' })
    await expect(client.get('/v1/x')).rejects.toBeInstanceOf(StrataValidationError)
  })

  it('500 throws generic StrataError', async () => {
    const fetch = vi.fn(async () => jsonResponse({ error: 'server' }, { status: 500 }))
    const client = new Client({ fetch, baseUrl: 'https://api.test' })
    await expect(client.get('/v1/x')).rejects.toThrow(/server|HTTP 500/)
  })

  it('timeout aborts and throws StrataNetworkError', async () => {
    // Mock fetch that respects AbortSignal — what real fetch does.
    const fetch = vi.fn(async (_url: string, init?: RequestInit) => {
      return new Promise<Response>((resolve, reject) => {
        const id = setTimeout(() => resolve(jsonResponse({})), 200)
        init?.signal?.addEventListener('abort', () => {
          clearTimeout(id)
          const err = new Error('aborted')
          err.name = 'AbortError'
          reject(err)
        })
      })
    })
    const client = new Client({ fetch, baseUrl: 'https://api.test', timeout: 50 })
    await expect(client.get('/v1/x')).rejects.toBeInstanceOf(StrataNetworkError)
  })

  it('parses rate-limit info on success', async () => {
    const fetch = vi.fn(async () =>
      jsonResponse(
        {},
        {
          headers: {
            'X-RateLimit-Limit': '10000',
            'X-RateLimit-Remaining': '9999',
            'X-Strata-Calls-Charged': '3',
          },
        },
      ),
    )
    const client = new Client({ fetch, baseUrl: 'https://api.test' })
    const { rateLimit } = await client.get('/v1/x')
    expect(rateLimit.limit).toBe(10000)
    expect(rateLimit.remaining).toBe(9999)
    expect(rateLimit.callsCharged).toBe(3)
  })
})
