// Public types — single import target so consumers can `import type { … } from '@strata-ai/sdk'`.

export type RiskLevel = 'low' | 'medium' | 'high' | 'critical' | 'unknown'

export type RuntimeFreshness = 'fresh' | 'aging' | 'stale' | 'unknown'

export type CapabilityFlag =
  | 'shell_exec'
  | 'fs_write'
  | 'net_egress'
  | 'secret_read'
  | 'dynamic_eval'
  | 'arbitrary_sql'
  | 'process_spawn'
  | (string & {})

export type VerifyInput =
  | { url: string }       // GitHub URL, or partial URL like "github.com/owner/repo"
  | { npm: string }       // npm package name (with or without @scope)
  | { endpoint: string }  // explicit MCP HTTP endpoint URL

export interface VerifyResult {
  found: boolean
  trusted: boolean
  risk_level: RiskLevel
  is_quarantined: boolean
  reasons: string[]
  /** Present when `found: true`. Otherwise `undefined`. */
  id?: string
  name?: string
  description?: string | null
  url?: string | null
  category?: string | null
  security_score?: number | null
  runtime_score?: number | null
  capability_flags?: CapabilityFlag[]
  hosted_endpoint?: string | null
  tool_count?: number | null
  runtime_freshness?: RuntimeFreshness
  injection_risk_score?: number | null
}

export interface McpServer {
  id: string
  name: string
  description: string | null
  url: string | null
  category: string | null
  tags: string[]
  similarity: number
  security_score: number | null
  runtime_score: number | null
  capability_flags: CapabilityFlag[]
  hosted_endpoint: string | null
  tool_count: number | null
  stars: number | null
  runtime_freshness: RuntimeFreshness
}

export interface FindMCPOptions {
  category?: string
  limit?: number
  minSecurityScore?: number
  minRuntimeScore?: number
  excludeCapabilities?: CapabilityFlag[]
  requireHosted?: boolean
}

export interface ContentItem {
  id: string
  title: string
  body: string
  source_urls: string[]
  confidence?: string
  source_count?: number
  published_at?: string
  updated_at?: string
  content_age_hours?: number
  data_freshness?: 'live' | 'recent' | 'stale' | 'very_stale'
  last_verified_at?: string
}

export interface EcosystemBrief {
  ecosystem: string
  tier: 'free' | 'pro'
  best_practices: ContentItem[]
  news: ContentItem[]
  integrations: ContentItem[]
}

export interface StrataOptions {
  /** Strata API key. Omit for the anonymous tier (10 req/hour per IP). */
  apiKey?: string
  /** Override the API base URL. Default: https://usestrata.dev */
  baseUrl?: string
  /** Inject a fetch implementation (testing, polyfills, edge runtimes). */
  fetch?: typeof fetch
  /** Request timeout in milliseconds. Default: 10_000 */
  timeout?: number
  /** Custom suffix appended to the User-Agent string. */
  userAgent?: string
}

/** Per-call rate-limit info parsed from response headers. */
export interface RateLimitInfo {
  limit: number | null
  remaining: number | null
  resetAt: Date | null
  callsCharged: number | null
}
