// Entry point. Reads inputs, finds MCP references, verifies via SDK,
// posts/updates PR comment, sets outputs, decides exit code.

import * as core from '@actions/core'
import {
  Strata,
  StrataAuthError,
  StrataNetworkError,
  StrataRateLimitError,
  type VerifyResult,
} from '@strata-ai/sdk'
import { findMcpReferences } from './finder'
import { buildMarkdown, postOrUpdateComment, summarize } from './reporter'
import type { FoundEntry, VerifiedEntry } from './types'
import type { RiskLevel } from '@strata-ai/sdk'

const RISK_RANK: Record<RiskLevel, number> = {
  unknown: -1, low: 0, medium: 1, high: 2, critical: 3,
}

function riskRank(level: RiskLevel): number {
  return RISK_RANK[level] ?? -1
}

const RETRY_ATTEMPTS = 3

// Retry transient failures (5xx, network) with exponential backoff.
// A flaky API should not take down every PR build.
async function withRetry<T>(fn: () => Promise<T>, attempts = RETRY_ATTEMPTS): Promise<T> {
  let lastErr: unknown
  for (let i = 0; i < attempts; i++) {
    try {
      return await fn()
    } catch (err) {
      lastErr = err
      if (i === attempts - 1) throw err
      const status = (err as { statusCode?: number }).statusCode
      const retryable =
        err instanceof StrataNetworkError ||
        (typeof status === 'number' && status >= 500 && status < 600)
      if (!retryable) throw err
      const backoffMs = 1000 * Math.pow(2, i)
      core.info(`Strata request failed (attempt ${i + 1}/${attempts}); retrying in ${backoffMs}ms…`)
      await new Promise((r) => setTimeout(r, backoffMs))
    }
  }
  throw lastErr
}

async function run(): Promise<void> {
  try {
    const apiKey = core.getInput('strata_api_key') || undefined
    // Register the API key as a secret so it is masked in logs even if the
    // SDK ever surfaces it in an error message.
    if (apiKey) core.setSecret(apiKey)

    const failOnRaw = core.getInput('fail_on') || 'critical'
    const commentOnPr = (core.getInput('comment_on_pr') || 'true').toLowerCase() === 'true'
    const githubToken = core.getInput('github_token') || process.env.GITHUB_TOKEN || ''
    if (githubToken) core.setSecret(githubToken)
    const configPathsInput = core.getInput('config_paths')
    const baseUrl = core.getInput('base_url') || undefined

    if (failOnRaw !== 'critical' && failOnRaw !== 'high' && failOnRaw !== 'medium') {
      core.setFailed(`fail_on must be one of: critical, high, medium (got "${failOnRaw}")`)
      return
    }
    const failOn = failOnRaw as 'critical' | 'high' | 'medium'

    if (apiKey && /^sk_[a-z0-9]+$/i.test(apiKey) === false) {
      core.warning(
        'strata_api_key does not look like a Strata API key (sk_…). ' +
          'Double-check that you set the secret correctly.',
      )
    }

    const repoRoot = process.env.GITHUB_WORKSPACE ?? process.cwd()
    const customGlobs = configPathsInput
      ? configPathsInput.split(',').map((s) => s.trim()).filter(Boolean)
      : undefined

    core.info(`Scanning ${repoRoot} for MCP server references…`)
    const found: FoundEntry[] = findMcpReferences(repoRoot, customGlobs)
    core.info(`Found ${found.length} MCP server reference${found.length === 1 ? '' : 's'}`)

    if (found.length === 0) {
      const summary = summarize([])
      const body = buildMarkdown([], summary)
      if (commentOnPr && githubToken) {
        try {
          await postOrUpdateComment({ body, githubToken })
        } catch (err) {
          core.warning(`Failed to post PR comment: ${err instanceof Error ? err.message : String(err)}`)
        }
      }
      writeSummary(body)
      setOutputs(summary)
      return
    }

    const verifiable = found.filter((e): e is FoundEntry & { identifier: NonNullable<FoundEntry['identifier']> } =>
      e.identifier !== null,
    )

    let verifiedResults: VerifiedEntry[] = []
    if (verifiable.length === 0) {
      verifiedResults = found.map((e) => ({ ...e, result: null }))
    } else {
      const strata = new Strata({ apiKey, baseUrl, userAgent: 'StrataAction/1.0.1' })
      try {
        const results: VerifyResult[] = await withRetry(() =>
          strata.verifyAll(verifiable.map((e) => e.identifier)),
        )
        const resultMap = new Map(verifiable.map((e, i) => [e.name + '@' + e.sourcePath, results[i]]))
        verifiedResults = found.map((e) => ({
          ...e,
          result: e.identifier ? (resultMap.get(e.name + '@' + e.sourcePath) ?? null) : null,
        }))
      } catch (err) {
        if (err instanceof StrataAuthError) {
          core.setFailed(`Strata auth error: ${err.message}. Check that strata_api_key is set correctly.`)
          return
        }
        if (err instanceof StrataRateLimitError) {
          const reset = err.resetAt ? ` (resets at ${err.resetAt.toISOString()})` : ''
          core.setFailed(`Strata rate limit reached${reset}. Use a Strata API key for higher limits.`)
          return
        }
        if (err instanceof StrataNetworkError) {
          core.setFailed(`Strata network error: ${err.message}`)
          return
        }
        core.setFailed(`Strata error: ${err instanceof Error ? err.message : String(err)}`)
        return
      }
    }

    const summary = summarize(verifiedResults)
    const body = buildMarkdown(verifiedResults, summary)

    writeSummary(body)
    setOutputs(summary)

    if (commentOnPr && githubToken) {
      try {
        await postOrUpdateComment({ body, githubToken })
      } catch (err) {
        core.warning(`Failed to post PR comment: ${err instanceof Error ? err.message : String(err)}`)
      }
    } else if (commentOnPr) {
      core.warning('comment_on_pr=true but no github_token available — skipping comment.')
    }

    // Decide exit code.
    const threshold = riskRank(failOn)
    if (riskRank(summary.worst) >= threshold) {
      const trigger = summary.worst
      core.setFailed(
        `Strata MCP check failed: ${countAtOrAbove(verifiedResults, threshold)} server(s) at "${trigger}" risk or higher (threshold: ${failOn}).`,
      )
    } else {
      core.info(`Strata MCP check passed (worst risk: ${summary.worst}, threshold: ${failOn}).`)
    }
  } catch (err) {
    core.setFailed(`Unexpected error: ${err instanceof Error ? err.message : String(err)}`)
  }
}

function writeSummary(markdown: string): void {
  // core.summary writes to GITHUB_STEP_SUMMARY — visible in the Actions UI even
  // without a PR comment. Async, but we don't await — best-effort logging.
  void core.summary.addRaw(markdown).write()
}

function setOutputs(summary: ReturnType<typeof summarize>): void {
  core.setOutput('total', String(summary.total))
  core.setOutput('critical', String(summary.critical))
  core.setOutput('high', String(summary.high))
  core.setOutput('medium', String(summary.medium))
  core.setOutput('passed', String(summary.passed))
  core.setOutput('unverifiable', String(summary.unverifiable))
}

function countAtOrAbove(entries: VerifiedEntry[], threshold: number): number {
  let n = 0
  for (const e of entries) {
    if (e.result && riskRank(e.result.risk_level) >= threshold) n++
  }
  return n
}

void run()
