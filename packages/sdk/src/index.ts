// Public entry point. The Strata class is the primary surface; everything
// else is re-exported for advanced users.

import { Client } from './client'
import { verify, verifyAll, normalizeInput } from './verify'
import { findMCP } from './search'
import { ecosystem } from './ecosystem'
import type {
  EcosystemBrief,
  FindMCPOptions,
  McpServer,
  StrataOptions,
  VerifyInput,
  VerifyResult,
} from './types'

export class Strata {
  private readonly client: Client

  constructor(options: StrataOptions = {}) {
    this.client = new Client(options)
  }

  /**
   * Anonymous-tier factory. Constructs a Strata instance with no API key.
   * Limited to 10 requests / hour / IP. Safe for browser use.
   */
  static public(options: Omit<StrataOptions, 'apiKey'> = {}): Strata {
    return new Strata({ ...options, apiKey: undefined })
  }

  /**
   * Verify a single MCP server. Accepts a GitHub URL, npm package name,
   * hosted MCP endpoint URL, or a typed `VerifyInput` object.
   *
   * Returns `{ found: false, risk_level: 'unknown' }` for servers not in
   * Strata's directory — never throws for not-found.
   *
   * @example
   * await strata.verify('https://github.com/microsoft/playwright-mcp')
   * await strata.verify('@modelcontextprotocol/server-filesystem')
   * await strata.verify({ endpoint: 'https://example.com/mcp' })
   */
  async verify(input: string | VerifyInput): Promise<VerifyResult> {
    return verify(this.client, input)
  }

  /**
   * Verify many MCP servers in a single call. Uses the bulk endpoint when
   * `inputs.length > 5`, otherwise parallel single calls.
   *
   * Order is preserved. Each result is a full `VerifyResult` (including
   * `found: false` entries for unknown servers).
   *
   * Bulk requests count as `ceil(N/10)` calls against your monthly quota.
   */
  async verifyAll(inputs: Array<string | VerifyInput>): Promise<VerifyResult[]> {
    return verifyAll(this.client, inputs)
  }

  /**
   * Search MCP servers by use-case query. Semantic search via embeddings.
   * Quarantined and archived servers are excluded automatically.
   */
  async findMCP(query: string, options?: FindMCPOptions): Promise<McpServer[]> {
    return findMCP(this.client, query, options)
  }

  /**
   * Composite intelligence brief for an ecosystem — best practices, news,
   * and integrations in one round trip.
   *
   * Requires authentication (no anonymous tier).
   */
  async ecosystem(slug: string): Promise<EcosystemBrief> {
    return ecosystem(this.client, slug)
  }
}

// Re-exports
export { Client } from './client'
export {
  StrataAuthError,
  StrataError,
  StrataNetworkError,
  StrataRateLimitError,
  StrataValidationError,
} from './errors'
export { computeRiskLevel, unknownRisk } from './risk'
export type { RiskAssessment, RiskInput } from './risk'
export { normalizeInput } from './verify'
export {
  scanConfig,
  classifyEntry,
  stripVersionPin,
  defaultConfigPath,
  defaultConfigPaths,
} from './config-scanner'
export type { ScannedEntry, McpServerConfig, McpClientConfig } from './config-scanner'
export type {
  CapabilityFlag,
  ContentItem,
  EcosystemBrief,
  FindMCPOptions,
  McpServer,
  RateLimitInfo,
  RiskLevel,
  RuntimeFreshness,
  StrataOptions,
  VerifyInput,
  VerifyResult,
} from './types'
export { createStrataGuard } from './middleware'
export type { McpToolCall, BlockHandler } from './middleware'
