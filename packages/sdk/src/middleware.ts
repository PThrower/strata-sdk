import { Client } from './client'
import { verify } from './verify'
import type { StrataOptions, VerifyInput, VerifyResult } from './types'

export interface McpToolCall {
  /** The MCP server being called — GitHub URL, npm name, or hosted endpoint. */
  server:   string | VerifyInput
  toolName: string
  args:     unknown
}

export type BlockHandler = (result: VerifyResult, call: McpToolCall) => void

/**
 * Returns an async guard function that verifies an MCP server before
 * executing a tool call. Throws if the server is quarantined or critical-risk.
 *
 * @example
 * const guard = createStrataGuard({ apiKey: process.env.STRATA_API_KEY })
 * const result = await guard(
 *   { server: 'https://github.com/acme/mcp-server', toolName: 'read_file', args: {} },
 *   () => mcpClient.callTool('read_file', {}),
 * )
 */
export function createStrataGuard(
  opts: StrataOptions,
  onBlock?: BlockHandler,
) {
  const client = new Client(opts)

  return async function strataGuard<T>(
    call: McpToolCall,
    execute: () => Promise<T>,
  ): Promise<T> {
    const result = await verify(client, call.server)

    if (result.is_quarantined || result.risk_level === 'critical') {
      onBlock?.(result, call)
      const reason = result.is_quarantined
        ? 'server is quarantined'
        : `risk level is ${result.risk_level}`
      throw new Error(
        `[Strata] Blocked tool call "${call.toolName}" — ${reason}. Reasons: ${result.reasons.join(', ')}`,
      )
    }

    return execute()
  }
}
