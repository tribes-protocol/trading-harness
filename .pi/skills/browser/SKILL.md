---
name: browser
description: >-
  Headless browser automation via Microsoft's @playwright/cli. Handles: rendering JS-heavy pages,
  clicking, typing, page snapshots, screenshots, PDF capture, console/network debugging, and
  session/storage handling. Call it ONLY when a page needs JavaScript or UI interaction, or when
  curl/wget/fetch or web-search extract is blocked (401/403/406/429, bot/CDN challenge, empty
  skeleton HTML). NOT a search tool — run web-search first for lookups and plain page text. NOT
  for: web search or readable pages (use web-search); market/asset news (use news); market,
  token, or stock data (route to the matching analyst skill).
allowed-tools: bash read
---

# Browser

Backing tool: Microsoft's `@playwright/cli` (`playwright-cli`) — the one skill that is not a
`tribes-cli` group. It drives a headless Chromium from the shell for pages that plain HTTP fetch
cannot handle, and for UI automation. Upstream docs: https://github.com/microsoft/playwright-cli
Requires: Node.js 18+ with npm (present in the Tribes sandbox). The CLI and browser install on
demand — a missing binary is a setup step, not a reason to skip the browser path (see Error
recovery).

## When to use

- IF you need ranked search results or plain readable page text → NOT this skill: run
  `tribes-cli web-search search` / `extract` first (`web-search` skill).
- IF curl/wget/fetch or `web-search extract` returns 401/403/406/429, a bot/CDN challenge or
  interstitial page, or empty/skeleton HTML that only renders with JavaScript → use this skill
  (see the fetch-fallback example).
- IF the task needs UI interaction — click, type, form submit, sign-in flow — or a screenshot or
  PDF of a rendered page → use this skill.
- IF you need a live page's console messages or network requests → use this skill.
- NOT for market/asset news or sentiment — use `news`.
- NOT for market, token, or stock data — use the matching analyst skill (see the AGENTS.md
  routing map).

## Hard rules

1. Shell state resets between bash calls — paste this wrapper at the top of EVERY bash
   invocation before any browser command, then call `pwcli`, NEVER bare `playwright-cli`, for
   session commands. (Meta commands MAY run bare: `install-browser`, `list`, `close-all`,
   `kill-all`.)

   ```bash
   pwcli() {
     PLAYWRIGHT_MCP_USER_AGENT='Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36' \
     PLAYWRIGHT_MCP_VIEWPORT_SIZE='1365x768' \
     playwright-cli "$@"
   }
   ```

2. The sandbox is headless with no GUI libraries: NEVER use `--headed` or `show`, and NEVER
   rely on a real Chrome channel — only the bundled chromium is installed.
3. Use one named session per task (`-s=<name>`) and keep it across navigations so cookies
   persist; run `close` on the session when done.
4. Element refs (`e15`) come from the latest `snapshot` output and go stale after every
   navigation — re-run `snapshot` before reusing a ref.
5. JS-heavy pages render after load: run the wait step from the fetch-fallback example before
   any snapshot or text extraction.
6. NEVER solve CAPTCHAs, bypass paywalls or access controls you are not entitled to, evade rate
   limits, or sign in or act as another user without explicit user instruction.
7. NEVER enter passwords, private keys, seed phrases, or payment details, and NEVER perform
   purchases or irreversible account actions, without explicit user confirmation immediately
   before the action.
8. NEVER print cookies, tokens, localStorage values, or saved state files unless the task
   explicitly requires it.
9. Save screenshots, PDFs, and state files under `.playwright-cli/` in the working directory.

## Command reference

Targeting: `<ref>` is a ref from `snapshot` (`e15`); CSS selectors (`"#main > button.submit"`)
and Playwright locators (`"getByRole('button', { name: 'Submit' })"`) also work anywhere a
`<ref>` is accepted.

`run-code` callbacks take a bare page argument.
Wrong: `run-code "async ({ page }) => await page.title()"` (runtime error).
Right: `run-code "async page => await page.title()"`.

```bash
# Open / navigate
pwcli -s=<session> open <url>
pwcli -s=<session> goto <url>
pwcli -s=<session> reload
pwcli -s=<session> go-back
pwcli -s=<session> go-forward

# Discover page structure (get refs)
pwcli -s=<session> snapshot
pwcli -s=<session> snapshot --depth=4
pwcli -s=<session> snapshot <ref>

# Interact
pwcli -s=<session> click <ref>
pwcli -s=<session> dblclick <ref>
pwcli -s=<session> fill <ref> "text"
pwcli -s=<session> fill <ref> "text" --submit
pwcli -s=<session> type "text"
pwcli -s=<session> press Enter
pwcli -s=<session> hover <ref>
pwcli -s=<session> select <ref> <value>
pwcli -s=<session> check <ref>
pwcli -s=<session> uncheck <ref>
pwcli -s=<session> upload <file>
pwcli -s=<session> drop <ref> --path=<file>
pwcli -s=<session> dialog-accept
pwcli -s=<session> dialog-dismiss
pwcli -s=<session> resize 390 844

# Artifacts
pwcli -s=<session> screenshot --filename=.playwright-cli/page.png
pwcli -s=<session> screenshot <ref> --filename=.playwright-cli/element.png
pwcli -s=<session> pdf --filename=.playwright-cli/page.pdf

# Debugging
pwcli -s=<session> console warning
pwcli -s=<session> requests
pwcli -s=<session> request <index>
pwcli -s=<session> response-body <index>
pwcli -s=<session> eval "() => document.title"
pwcli -s=<session> run-code "async page => await page.title()"

# Network mocking
pwcli -s=<session> route "**/api/items" --status=200 --body='[]'
pwcli -s=<session> route-list
pwcli -s=<session> unroute "**/api/items"
pwcli -s=<session> network-state-set offline

# Storage and auth state
pwcli -s=<session> state-save .playwright-cli/state.json
pwcli -s=<session> state-load .playwright-cli/state.json
pwcli -s=<session> cookie-list
pwcli -s=<session> localstorage-list
pwcli -s=<session> sessionstorage-list

# Tabs and sessions
pwcli -s=<session> tab-list
pwcli -s=<session> tab-new <url>
pwcli -s=<session> tab-select <index>
pwcli -s=<session> tab-close <index>
pwcli -s=<session> close
playwright-cli list
playwright-cli close-all
playwright-cli kill-all
```

Use plain commands first; use `run-code` only for what they cannot do — waiting for app state,
reading computed values, or extracting text/structured data. Keep snippets short.

## Examples

### Read a page that blocked curl (fetch fallback, end to end)

```bash
command -v playwright-cli || npm install -g @playwright/cli@latest

pwcli() {
  PLAYWRIGHT_MCP_USER_AGENT='Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36' \
  PLAYWRIGHT_MCP_VIEWPORT_SIZE='1365x768' \
  playwright-cli "$@"
}

pwcli -s=fetch open https://etherscan.io/token/0xaf88d065e77c8cc2239327c5edb3a432268e5831
pwcli -s=fetch run-code "async page => { await page.waitForLoadState('networkidle'); }"
pwcli -s=fetch run-code "async page => await page.evaluate(() => document.body.innerText)"
pwcli -s=fetch close
```

The last `run-code` prints the full readable page text — that is the fetch-fallback deliverable.
If `networkidle` times out on a chatty page, wait for a specific element instead:
`run-code "async page => { await page.waitForSelector('h1'); }"`.
To confirm the site sees a desktop browser, check
`run-code "async page => await page.evaluate(() => navigator.userAgent)"`.

### Interact with a page (snapshot → click → re-snapshot)

```bash
# pwcli wrapper from Hard rules 1 pasted here

pwcli -s=task open https://www.coingecko.com/en/coins/hyperliquid
pwcli -s=task snapshot --depth=4
pwcli -s=task click e15
pwcli -s=task snapshot
pwcli -s=task screenshot --filename=.playwright-cli/hyperliquid.png
pwcli -s=task close
```

Refs like `e15` come from the preceding `snapshot`; after the click navigates, snapshot again
before touching more refs.

### Dismiss a blocking overlay or native dialog

```bash
# pwcli wrapper from Hard rules 1 pasted here

# Cookie-consent banners are DOM elements: snapshot, then click the accept/close ref
pwcli -s=fetch snapshot --depth=4
pwcli -s=fetch click e7

# Native JS alert/confirm dialogs use the dialog commands
pwcli -s=fetch dialog-accept
```

### Debug console and network activity

```bash
# pwcli wrapper from Hard rules 1 pasted here

pwcli -s=debug open https://app.hyperliquid.xyz
pwcli -s=debug console warning
pwcli -s=debug requests
pwcli -s=debug response-body 3
pwcli -s=debug close
```

`requests` lists indexed network requests; pass an index to `request` / `response-body` for
details.

### Save and reuse a session's login state

```bash
# pwcli wrapper from Hard rules 1 pasted here

pwcli -s=task state-save .playwright-cli/state.json
pwcli -s=task2 state-load .playwright-cli/state.json
```

State files contain cookies and tokens — never print their contents.

## Error recovery

| Symptom                                               | Action                                                                                        |
| ----------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| `playwright-cli: command not found`                   | Run `npm install -g @playwright/cli@latest`, then retry the original command once.            |
| `pwcli: command not found`                            | The wrapper is missing from this bash call — paste it (Hard rules 1) and retry.               |
| "browser not found" / executable-path error on `open` | Run `playwright-cli install-browser chromium --with-deps`, then retry once.                   |
| Session not found / no open page                      | Re-run `open <url>` in that session, then retry.                                              |
| Snapshot shows a skeleton or empty page               | Run the wait step (`waitForLoadState` / `waitForSelector`), then re-snapshot.                 |
| Ref error (`e15` not found) after navigation          | Refs are stale — re-run `snapshot` and use fresh refs.                                        |
| Page is still a challenge/CAPTCHA after the fallback  | Stop and report the page is bot-protected. NEVER attempt to solve the CAPTCHA and NEVER loop. |
| Auth error from a `tribes-cli` command (unauthorized) | Run `tribes-cli login`, retry the original command once, then stop and report.                |

## Related skills

- `web-search` — try `tribes-cli web-search extract --url <url>` BEFORE this skill for any plain
  page read; come back here only when it fails or the page needs JS/interaction.
- `news` — market/asset news and sentiment; never scrape news sites here first.
- `research-analyst` — source-backed finance research when no specific blocked URL is involved.
