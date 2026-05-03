# Strata MCP Security Check

A GitHub Action that finds every MCP (Model Context Protocol) server referenced in your repo and verifies each one against [Strata's](https://usestrata.dev) trust scores. Posts an idempotent PR comment with a risk report and fails the check on critical risk by default.

## Quick start

```yaml
name: MCP Security
on: [pull_request, push]

jobs:
  strata:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: PThrower/strata-sdk/packages/action@v1
        with:
          strata_api_key: ${{ secrets.STRATA_API_KEY }}
          fail_on: critical
```

That's it. The action will:
1. Walk your repo for MCP config files (`claude_desktop_config.json`, `mcp.json`, `.cursor/mcp.json`, `cline_mcp_settings.json`, `.claude/*.json`, and `package.json` files with an `mcp` field).
2. Extract every `mcpServers` entry, classify each as a verifiable identifier (npm package, GitHub URL, or hosted endpoint) or `unverifiable` (local script, container, etc.).
3. Verify each against Strata's directory.
4. Post or update a single PR comment with the trust report.
5. Fail the check if any server breaches the configured threshold.

## Inputs

| Input | Required | Default | Description |
|---|---|---|---|
| `strata_api_key` | no | — | Strata API key. Without it, the anonymous tier (10 req/hour per IP) is used. |
| `fail_on` | no | `critical` | Severity threshold: `critical` \| `high` \| `medium` |
| `comment_on_pr` | no | `true` | Post / update a PR comment |
| `github_token` | no | `${{ github.token }}` | Token for posting comments |
| `config_paths` | no | — | Comma-separated globs to override the default scan paths |
| `base_url` | no | `https://usestrata.dev` | Override the API base URL |

## Outputs

| Output | Description |
|---|---|
| `total` | Total MCP servers scanned |
| `critical` | Count of servers with critical risk |
| `high` | Count of servers with high or medium risk (warnings) |
| `passed` | Count of servers with low risk |
| `unverifiable` | Count that could not be verified (local scripts, etc.) |

## Example PR comment

```markdown
## Strata MCP Security Check

| Server | Security | Runtime | Risk | Flags |
|---|---|---|---|---|
| `@modelcontextprotocol/server-filesystem` | 85 | 72 | 🟢 low | fs_write |
| `owner/sketchy-mcp` | 12 | 8 | 🔴 critical | shell_exec, dynamic_eval |

✅ 1 passed · ⚠️ 0 warnings · ❌ 1 critical
```

## Risk levels

| Level | Conditions |
|---|---|
| 🔴 **critical** | server is quarantined or `security_score < 20` |
| 🟠 **high** | exposes `shell_exec` or `dynamic_eval` |
| 🟡 **medium** | exposes `fs_write` or `arbitrary_sql` |
| 🟢 **low** | none of the above |
| ⚪ **unknown** | server not in Strata's directory |

## Permissions

If you set `comment_on_pr: true` (the default), the workflow needs:

```yaml
permissions:
  pull-requests: write
  contents: read
```

For workflows triggered from forks, use `pull_request_target` carefully — see [GitHub's guidance](https://docs.github.com/en/actions/using-workflows/events-that-trigger-workflows#pull_request_target).

## Custom scan paths

```yaml
- uses: PThrower/strata-sdk/packages/action@v1
  with:
    config_paths: 'configs/**/*.json,scripts/mcp/*.json'
```

## Without an API key

The action works without `strata_api_key` — falls through to the anonymous tier (10 req/hour per IP). Fine for small repos, but a free key removes the limit.

## License

MIT
