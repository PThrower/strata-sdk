import type { Client } from './client'
import { StrataValidationError } from './errors'
import type { EcosystemBrief } from './types'

const SLUG_RE = /^[a-z0-9][a-z0-9_-]{0,63}$/

export async function ecosystem(client: Client, slug: string): Promise<EcosystemBrief> {
  if (!slug || typeof slug !== 'string') {
    throw new StrataValidationError('ecosystem(slug) requires a non-empty string')
  }
  if (!SLUG_RE.test(slug)) {
    throw new StrataValidationError(
      `Invalid ecosystem slug "${slug}" — must match /^[a-z0-9][a-z0-9_-]{0,63}$/`,
    )
  }
  const { data } = await client.get<EcosystemBrief>(`/api/v1/ecosystems/${slug}/brief`)
  return data
}
