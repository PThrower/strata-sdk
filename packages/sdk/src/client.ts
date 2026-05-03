// HTTP client. Wraps native fetch with timeout, headers, error mapping, and
// rate-limit parsing. No retries — callers decide their own retry policy
// because Strata responses include a precise resetAt that's better than
// blind exponential backoff.

import {
  StrataAuthError,
  StrataError,
  StrataNetworkError,
  StrataRateLimitError,
  StrataValidationError,
} from './errors'
import type { RateLimitInfo } from './types'

const DEFAULT_BASE_URL = 'https://usestrata.dev'
const DEFAULT_TIMEOUT_MS = 10_000
const SDK_VERSION = '0.1.2'

// Module-scope flag so the warning fires at most once per process,
// regardless of how many Strata instances are constructed.
let hasWarnedBrowserKey = false

export interface ClientOptions {
  apiKey?: string
  baseUrl?: string
  fetch?: typeof fetch
  timeout?: number
  userAgent?: string
}

export interface RequestOptions {
  query?: Record<string, string | number | boolean | undefined | null>
  body?: unknown
  signal?: AbortSignal
}

export interface ClientResponse<T> {
  data: T
  rateLimit: RateLimitInfo
  headers: Headers
}

export class Client {
  private readonly apiKey: string | null
  private readonly baseUrl: string
  private readonly fetchImpl: typeof fetch
  private readonly timeout: number
  private readonly userAgent: string

  /** Whether this client was constructed with an API key. */
  get hasApiKey(): boolean {
    return this.apiKey !== null
  }

  constructor(opts: ClientOptions = {}) {
    this.apiKey = opts.apiKey ?? null
    this.baseUrl = (opts.baseUrl ?? DEFAULT_BASE_URL).replace(/\/+$/, '')
    this.fetchImpl = opts.fetch ?? globalThis.fetch
    this.timeout = opts.timeout ?? DEFAULT_TIMEOUT_MS

    const baseUa = `StrataSDK/${SDK_VERSION}`
    this.userAgent = opts.userAgent ? `${baseUa} ${opts.userAgent}` : baseUa

    if (typeof this.fetchImpl !== 'function') {
      throw new StrataError(
        'No fetch implementation available. Pass `fetch` in options for older Node versions.',
        'no_fetch',
      )
    }

    this.warnIfBrowserKeyExposure()
  }

  private warnIfBrowserKeyExposure(): void {
    if (hasWarnedBrowserKey) return
    if (!this.apiKey) return
    if (typeof globalThis !== 'undefined' && typeof (globalThis as { window?: unknown }).window !== 'undefined') {
      hasWarnedBrowserKey = true
      // eslint-disable-next-line no-console
      console.warn(
        '[Strata] API key detected in browser context. Anyone viewing source can read it. ' +
          'Use Strata.public() for client-side calls and proxy authenticated requests through your server.',
      )
    }
  }

  async get<T>(path: string, opts: RequestOptions = {}): Promise<ClientResponse<T>> {
    return this.request<T>('GET', path, opts)
  }

  async post<T>(path: string, opts: RequestOptions = {}): Promise<ClientResponse<T>> {
    return this.request<T>('POST', path, opts)
  }

  private async request<T>(
    method: 'GET' | 'POST',
    path: string,
    opts: RequestOptions,
  ): Promise<ClientResponse<T>> {
    const url = this.buildUrl(path, opts.query)
    const headers: Record<string, string> = {
      'User-Agent': this.userAgent,
      Accept: 'application/json',
    }
    if (this.apiKey) headers.Authorization = `Bearer ${this.apiKey}`
    if (opts.body !== undefined) headers['Content-Type'] = 'application/json'

    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), this.timeout)

    let signal: AbortSignal = controller.signal
    if (opts.signal) {
      // Combine caller's signal with our timeout signal.
      const merged = anySignal([controller.signal, opts.signal])
      signal = merged
    }

    let response: Response
    try {
      response = await this.fetchImpl(url, {
        method,
        headers,
        body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
        signal,
      })
    } catch (err) {
      clearTimeout(timeoutId)
      if (err instanceof Error && err.name === 'AbortError') {
        throw new StrataNetworkError(`Request timed out after ${this.timeout}ms`, err)
      }
      throw new StrataNetworkError(
        `Network error: ${err instanceof Error ? err.message : String(err)}`,
        err,
      )
    } finally {
      clearTimeout(timeoutId)
    }

    const rateLimit = parseRateLimit(response.headers)

    if (response.status === 401 || response.status === 403) {
      const body = await safeJson(response)
      throw new StrataAuthError(
        extractErrorMessage(body) ?? `Authentication failed (${response.status})`,
        response.status,
      )
    }

    if (response.status === 429) {
      const body = await safeJson(response)
      const message = extractErrorMessage(body) ?? 'Rate limit reached'
      throw new StrataRateLimitError(message, rateLimit.resetAt, rateLimit.remaining ?? 0)
    }

    if (response.status === 400) {
      const body = await safeJson(response)
      throw new StrataValidationError(extractErrorMessage(body) ?? 'Bad request')
    }

    if (!response.ok) {
      const body = await safeJson(response)
      throw new StrataError(
        extractErrorMessage(body) ?? `HTTP ${response.status}`,
        'http_error',
        response.status,
      )
    }

    let data: T
    try {
      data = (await response.json()) as T
    } catch (err) {
      throw new StrataError(
        `Failed to parse response JSON: ${err instanceof Error ? err.message : String(err)}`,
        'parse_error',
      )
    }

    return { data, rateLimit, headers: response.headers }
  }

  private buildUrl(
    path: string,
    query?: Record<string, string | number | boolean | undefined | null>,
  ): string {
    const url = new URL(path.startsWith('/') ? path : `/${path}`, this.baseUrl)
    if (query) {
      for (const [key, value] of Object.entries(query)) {
        if (value === undefined || value === null) continue
        url.searchParams.set(key, String(value))
      }
    }
    return url.toString()
  }
}

function parseRateLimit(headers: Headers): RateLimitInfo {
  const num = (h: string): number | null => {
    const v = headers.get(h)
    if (!v) return null
    const n = Number.parseInt(v, 10)
    return Number.isNaN(n) ? null : n
  }
  const reset = headers.get('x-ratelimit-reset')
  let resetAt: Date | null = null
  if (reset) {
    const parsed = new Date(reset)
    if (!Number.isNaN(parsed.getTime())) resetAt = parsed
  }
  return {
    limit: num('x-ratelimit-limit'),
    remaining: num('x-ratelimit-remaining'),
    resetAt,
    callsCharged: num('x-strata-calls-charged'),
  }
}

async function safeJson(response: Response): Promise<unknown> {
  try {
    return await response.json()
  } catch {
    return null
  }
}

function extractErrorMessage(body: unknown): string | null {
  if (!body || typeof body !== 'object') return null
  const obj = body as Record<string, unknown>
  if (typeof obj.message === 'string') return obj.message
  if (typeof obj.error === 'string') return obj.error
  return null
}

// Combine multiple AbortSignals into one. (AbortSignal.any was added in Node 20+
// — polyfill for Node 18.)
function anySignal(signals: AbortSignal[]): AbortSignal {
  if (typeof (AbortSignal as unknown as { any?: (sigs: AbortSignal[]) => AbortSignal }).any === 'function') {
    return (AbortSignal as unknown as { any: (sigs: AbortSignal[]) => AbortSignal }).any(signals)
  }
  const controller = new AbortController()
  for (const sig of signals) {
    if (sig.aborted) {
      controller.abort(sig.reason)
      break
    }
    sig.addEventListener('abort', () => controller.abort(sig.reason), { once: true })
  }
  return controller.signal
}
