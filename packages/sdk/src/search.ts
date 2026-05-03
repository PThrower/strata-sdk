import type { Client } from './client'
import { StrataValidationError } from './errors'
import type { CapabilityFlag, FindMCPOptions, McpServer } from './types'

export async function findMCP(
  client: Client,
  query: string,
  options: FindMCPOptions = {},
): Promise<McpServer[]> {
  if (!query || typeof query !== 'string' || query.trim().length === 0) {
    throw new StrataValidationError('findMCP requires a non-empty query string')
  }

  const queryParams: Record<string, string | number | boolean> = { q: query }
  if (options.category) queryParams.category = options.category
  if (options.limit !== undefined) queryParams.limit = options.limit
  if (options.minSecurityScore !== undefined) {
    queryParams.min_security_score = options.minSecurityScore
  }
  if (options.minRuntimeScore !== undefined) {
    queryParams.min_runtime_score = options.minRuntimeScore
  }
  if (options.excludeCapabilities && options.excludeCapabilities.length > 0) {
    queryParams.exclude_capability_flags = (options.excludeCapabilities as CapabilityFlag[]).join(',')
  }
  if (options.requireHosted) queryParams.require_hosted = 'true'

  const { data } = await client.get<{ query: string; results: McpServer[] }>(
    '/api/v1/mcp-servers',
    { query: queryParams },
  )
  return data.results
}
