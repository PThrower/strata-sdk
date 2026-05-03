// app/api/check-mcp/route.ts — Next.js 15+ route handler.
//
// Verifies an MCP server URL passed by the client. The Strata API key stays
// server-side and is never exposed to the browser.

import { Strata } from '@strata-ai/sdk'
import { NextResponse, type NextRequest } from 'next/server'

const strata = new Strata({ apiKey: process.env.STRATA_API_KEY })

export async function POST(req: NextRequest) {
  const { url } = await req.json()
  if (typeof url !== 'string') {
    return NextResponse.json({ error: 'url required' }, { status: 400 })
  }

  try {
    const result = await strata.verify(url)
    return NextResponse.json(result)
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'unknown' },
      { status: 500 },
    )
  }
}
