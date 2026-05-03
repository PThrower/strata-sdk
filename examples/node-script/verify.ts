import { Strata } from '@strata-ai/sdk'

// Anonymous tier — no API key required (10 req/hour per IP).
const strata = process.env.STRATA_API_KEY
  ? new Strata({ apiKey: process.env.STRATA_API_KEY })
  : Strata.public()

const targets = [
  '@modelcontextprotocol/server-filesystem',
  'https://github.com/microsoft/playwright-mcp',
]

const results = await strata.verifyAll(targets)
for (const r of results) {
  const mark = r.risk_level === 'critical' ? '❌'
            : r.risk_level === 'high'     ? '⚠️'
            : r.risk_level === 'low'      ? '✅'
            : '❓'
  console.log(`${mark} ${r.name ?? '?'} — ${r.risk_level}  (security ${r.security_score ?? '–'}, runtime ${r.runtime_score ?? '–'})`)
  if (r.capability_flags && r.capability_flags.length > 0) {
    console.log(`   flags: ${r.capability_flags.join(', ')}`)
  }
}
