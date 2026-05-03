// Builds the Markdown PR comment and updates idempotently via an HTML
// marker comment. The marker MUST be unique and persistent — never change.

import * as core from '@actions/core'
import * as github from '@actions/github'
import type { RiskLevel } from '@strata-ai/sdk'
import type { VerifiedEntry, ReportSummary } from './types'

const MARKER = '<!-- strata-mcp-check -->'

const RISK_EMOJI: Record<RiskLevel, string> = {
  low: '🟢',
  medium: '🟡',
  high: '🟠',
  critical: '🔴',
  unknown: '⚪',
}

const RISK_RANK: Record<RiskLevel, number> = {
  unknown: -1, low: 0, medium: 1, high: 2, critical: 3,
}

function riskRank(level: RiskLevel): number {
  return RISK_RANK[level] ?? -1
}

export function summarize(entries: VerifiedEntry[]): ReportSummary {
  let passed = 0, warnings = 0, critical = 0, unverifiable = 0
  let worst: RiskLevel = 'low'

  for (const e of entries) {
    if (!e.result || !e.identifier) {
      unverifiable++
      continue
    }
    const lvl = e.result.risk_level
    if (lvl === 'critical') critical++
    else if (lvl === 'high' || lvl === 'medium') warnings++
    else if (lvl === 'low') passed++
    else unverifiable++

    if (riskRank(lvl) > riskRank(worst)) worst = lvl
  }

  return {
    total: entries.length,
    passed, warnings, critical, unverifiable,
    worst,
  }
}

export function buildMarkdown(entries: VerifiedEntry[], summary: ReportSummary): string {
  const rows: string[] = []
  rows.push(MARKER)
  rows.push('## Strata MCP Security Check')
  rows.push('')

  if (summary.total === 0) {
    rows.push('_No MCP server references found in this repo._')
    rows.push('')
    rows.push('*Powered by [Strata](https://usestrata.dev) — AI Ecosystem Intelligence*')
    return rows.join('\n')
  }

  rows.push('| Server | Security | Runtime | Risk | Flags |')
  rows.push('|---|---|---|---|---|')

  // Sort: critical first, then high/medium, then low, then unverifiable.
  const sorted = [...entries].sort((a, b) => {
    const aRank = a.result ? riskRank(a.result.risk_level) : -2
    const bRank = b.result ? riskRank(b.result.risk_level) : -2
    return bRank - aRank
  })

  for (const entry of sorted) {
    const r = entry.result
    if (!r || !entry.identifier) {
      const reason = entry.reason ? ` (${escapeMd(entry.reason)})` : ''
      rows.push(`| \`${escapeMd(entry.name)}\`${reason} | – | – | ⚪ unverifiable | – |`)
      continue
    }
    const sec = r.security_score ?? '–'
    const run = r.runtime_score ?? '–'
    const flags = r.capability_flags && r.capability_flags.length > 0
      ? r.capability_flags.join(', ')
      : 'none'
    const displayName = r.name ?? entry.name
    const risk = `${RISK_EMOJI[r.risk_level]} ${r.risk_level}`
    rows.push(`| \`${escapeMd(displayName)}\` | ${sec} | ${run} | ${risk} | ${escapeMd(flags)} |`)
  }

  rows.push('')
  const parts: string[] = []
  parts.push(`✅ ${summary.passed} passed`)
  parts.push(`⚠️ ${summary.warnings} warnings`)
  parts.push(`❌ ${summary.critical} critical`)
  if (summary.unverifiable > 0) parts.push(`⚪ ${summary.unverifiable} unverifiable`)
  rows.push(parts.join(' · '))

  // Sources block
  const sourceCounts = new Map<string, number>()
  for (const entry of entries) {
    sourceCounts.set(entry.sourcePath, (sourceCounts.get(entry.sourcePath) ?? 0) + 1)
  }
  if (sourceCounts.size > 0) {
    rows.push('')
    rows.push(`<details><summary>Sources scanned (${sourceCounts.size} ${sourceCounts.size === 1 ? 'file' : 'files'})</summary>`)
    rows.push('')
    for (const [path, count] of [...sourceCounts.entries()].sort()) {
      rows.push(`- \`${escapeMd(path)}\` (${count} ${count === 1 ? 'server' : 'servers'})`)
    }
    rows.push('')
    rows.push('</details>')
  }

  rows.push('')
  rows.push('*Powered by [Strata](https://usestrata.dev) — AI Ecosystem Intelligence*')
  return rows.join('\n')
}

export async function postOrUpdateComment(args: {
  body: string
  githubToken: string
}): Promise<void> {
  const { body, githubToken } = args
  const ctx = github.context

  // Only post on pull_request / pull_request_target events.
  if (ctx.payload.pull_request === undefined) {
    core.info('No pull_request in event payload — skipping PR comment.')
    return
  }

  const issueNumber = ctx.payload.pull_request.number
  const owner = ctx.repo.owner
  const repo = ctx.repo.repo

  const octokit = github.getOctokit(githubToken)

  // Find existing marker comment.
  const { data: comments } = await octokit.rest.issues.listComments({
    owner, repo, issue_number: issueNumber, per_page: 100,
  })
  const existing = comments.find((c) => c.body?.startsWith(MARKER))

  if (existing) {
    await octokit.rest.issues.updateComment({
      owner, repo, comment_id: existing.id, body,
    })
    core.info(`Updated existing Strata comment #${existing.id}`)
  } else {
    const created = await octokit.rest.issues.createComment({
      owner, repo, issue_number: issueNumber, body,
    })
    core.info(`Created Strata comment #${created.data.id}`)
  }
}

function escapeMd(s: string): string {
  return String(s).replace(/[|`<>]/g, (c) => `\\${c}`)
}

export { MARKER }
