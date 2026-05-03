import type { Client } from './client'
import { StrataValidationError } from './errors'
import type { VerifyInput, VerifyResult } from './types'

const BULK_THRESHOLD = 5
const BULK_BATCH_SIZE = 50

// Smart input detection. Accepts a string and decides whether it's a GitHub
// URL, a hosted endpoint URL, or an npm package name. Caller can always pass
// a typed VerifyInput object instead.
export function normalizeInput(input: string | VerifyInput): VerifyInput {
  if (typeof input !== 'string') return input
  const trimmed = input.trim()
  if (!trimmed) throw new StrataValidationError('verify input cannot be empty')

  // URL forms
  if (/^https?:\/\//i.test(trimmed)) {
    return /(?:^|\/\/)(?:www\.)?github\.com\//i.test(trimmed)
      ? { url: trimmed }
      : { endpoint: trimmed }
  }
  // Bare github.com/owner/repo (no scheme)
  if (/^(?:www\.)?github\.com\//i.test(trimmed)) {
    return { url: `https://${trimmed}` }
  }
  // Strip @latest / @x.y.z semver pin off npm packages
  // Handle both @scope/pkg@latest and pkg@latest forms
  const npm = trimmed.replace(/(@[^/]+\/[^@]+|^[^@/][^@]*)@.+$/, '$1')
  return { npm }
}

export async function verify(
  client: Client,
  input: string | VerifyInput,
): Promise<VerifyResult> {
  const id = normalizeInput(input)
  const query: Record<string, string> = {}
  if ('url' in id) query.url = id.url
  else if ('npm' in id) query.npm = id.npm
  else if ('endpoint' in id) query.endpoint = id.endpoint

  const { data } = await client.get<VerifyResult>('/api/v1/mcp/verify', { query })
  return data
}

export async function verifyAll(
  client: Client,
  inputs: Array<string | VerifyInput>,
): Promise<VerifyResult[]> {
  if (inputs.length === 0) return []

  const normalized = inputs.map((i) => normalizeInput(i))

  // Small N → parallel singles, no auth requirement on batch endpoint
  if (normalized.length <= BULK_THRESHOLD) {
    return Promise.all(normalized.map((id) => verify(client, id)))
  }

  // Large N → bulk endpoint, possibly chunked
  const chunks: VerifyInput[][] = []
  for (let i = 0; i < normalized.length; i += BULK_BATCH_SIZE) {
    chunks.push(normalized.slice(i, i + BULK_BATCH_SIZE))
  }

  const allResults: VerifyResult[] = []
  for (const chunk of chunks) {
    try {
      const { data } = await client.post<{ results: VerifyResult[] }>(
        '/api/v1/mcp/verify-bulk',
        { body: { identifiers: chunk } },
      )
      allResults.push(...data.results)
    } catch (err) {
      // 404 → older API without bulk endpoint.
      // 401/403 + no API key → bulk requires auth but caller is anonymous.
      // Both fall back to per-call /verify which supports the anon tier.
      const status = (err as { statusCode?: number }).statusCode
      const isAuthFallback = (status === 401 || status === 403) && !client.hasApiKey
      if (status === 404 || isAuthFallback) {
        const results = await mapWithConcurrency(chunk, 5, (id) => verify(client, id))
        allResults.push(...results)
        continue
      }
      throw err
    }
  }

  return allResults
}

async function mapWithConcurrency<T, R>(
  items: T[],
  concurrency: number,
  worker: (item: T) => Promise<R>,
): Promise<R[]> {
  const results: R[] = new Array(items.length)
  let cursor = 0
  const workers = Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (true) {
      const i = cursor++
      if (i >= items.length) return
      const item = items[i]
      if (item === undefined) continue
      results[i] = await worker(item)
    }
  })
  await Promise.all(workers)
  return results
}
