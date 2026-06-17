---
name: browser
description: >-
  Provides browser automation via Microsoft's @playwright/cli for inspection, screenshots, PDF capture,
  console/network debugging, storage/session handling, and UI testing. Use when opening pages, clicking,
  typing, snapshots, or debugging web behavior. Use as the preferred fallback when curl, wget, fetch, or
  other HTTP clients get 401, 403, 406, or 429 responses, bot or CDN challenge pages, HTML that is empty or
  unusable without JavaScript, or when cookies, redirects, or CSRF flows block programmatic fetch.
allowed-tools: bash read
---

# Browser

Use Microsoft's `@playwright/cli` for token-efficient browser automation from the shell.

`playwright-cli` is NOT preinstalled — sandbox images ship without Playwright or
Chromium to keep the rootfs small. The first use of this skill installs both
(see Setup below); expect that one-time install to take a few minutes. Always
run the Setup check before the first browser command of a session.

## Use as fetcher fallback

When `curl`, `wget`, language `fetch`, or other non-browser HTTP tooling is blocked, incomplete, or wrong, switch to this skill. Typical signals: `401`, `403`, `406`, `429`, HTML that is a challenge or interstitial, a skeleton page with no real content until JS runs, or responses that clearly need an existing session cookie or full browser navigation.

Treat Playwright as your web browser for that task: use a dedicated named session (`-s=<session>`), keep the same session across navigations so cookies apply, and configure context so the site sees a normal desktop client rather than a bare script.

Before relying on the page, verify the live context (user agent, viewport) matches intent:

```bash
playwright-cli -s=<session> run-code "async page => {
  return await page.evaluate(() => ({
    userAgent: navigator.userAgent,
    language: navigator.language,
    viewport: { w: window.innerWidth, h: window.innerHeight }
  }));
}"
```

Set a realistic user agent and viewport for the session. One-shot env vars for `open` (see `@playwright/cli` README for `PLAYWRIGHT_MCP_*`):

```bash
PLAYWRIGHT_MCP_USER_AGENT='Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36' \
PLAYWRIGHT_MCP_VIEWPORT_SIZE=1365x768 \
playwright-cli -s=fetch-fallback open https://example.com
```

For repeatable tasks, use `--config path/to/config.json` or the default `.playwright/cli.config.json`. Put desktop-like `userAgent`, `viewport`, `locale`, and `timezoneId` under `browser.contextOptions` (see Playwright `BrowserContextOptions` and the configuration schema in the `@playwright/cli` README). Use `open --browser chrome` (or another channel) if the target behaves differently in real Chrome vs bundled Chromium.

Do not use this fallback to solve CAPTCHAs, bypass paywalls or access controls you are not entitled to, or impersonate another user without explicit user instruction.

Primary command:

```bash
playwright-cli <command>
playwright-cli -s=<session> <command>
```

Verify the global CLI before use:

```bash
command -v playwright-cli
playwright-cli --help
```

## Setup

The CLI is installed on demand. Before using it, check whether it already
exists and only install if it is missing. In a Tribes sandbox you are root on a
Debian (glibc) system with node/npm available, so the steps below work as-is —
use `--with-deps` for the browser install since the image carries no GUI
libraries.

1. Check for the CLI:

   ```bash
   command -v playwright-cli && playwright-cli --help
   ```

2. If `playwright-cli` is not found, install it globally (requires Node.js 18 or
   newer):

   ```bash
   npm install -g @playwright/cli@latest
   ```

   Then re-verify with `playwright-cli --help`.

3. Install the browser binary if it is missing (a missing browser surfaces as a
   "browser not found" / executable-path error on `open`). Chromium is the
   default; pass `firefox` or `webkit` for others:

   ```bash
   playwright-cli install-browser chromium
   ```

   On Linux/CI where system libraries may be absent, also pull OS dependencies:

   ```bash
   playwright-cli install-browser chromium --with-deps
   ```

   Useful flags: `--list` (show installed browsers), `--force` (reinstall),
   `--dry-run` (print actions without installing).

See the upstream README for the full installation reference:
https://github.com/microsoft/playwright-cli

## Safety and privacy

- Do not enter passwords, private keys, seed phrases, API keys, or payment details unless the user explicitly instructs you and the site/action is trusted.
- Do not perform purchases, irreversible account actions, wallet transactions, or destructive admin actions without explicit user confirmation immediately before the action.
- Do not use browser fallback to solve CAPTCHAs, evade rate limits or access controls, or perform sign-in or account actions unless the user explicitly instructs you and the action is appropriate.
- Use isolated sessions for unrelated tasks. Close sessions when done if persistence is not needed.
- Prefer snapshots and targeted screenshots over dumping large pages into chat.
- Never print cookies, tokens, localStorage secrets, or session state unless explicitly needed and approved.

## Standard workflow

1. Start/open a page in a named session.
2. Capture a snapshot to get stable element refs.
3. Interact with refs, CSS selectors, or Playwright locators.
4. Inspect console/network when debugging.
5. Save screenshots/artifacts into `.playwright-cli/`, `.pi/skills/browser/.playwright/`, or a user-requested path.
6. Close the session if no longer needed.

Example:

```bash
PWCLI="playwright-cli"
$PWCLI -s=browser-task open https://example.com
$PWCLI -s=browser-task snapshot --depth=4
$PWCLI -s=browser-task click e15
$PWCLI -s=browser-task screenshot --filename=.pi/skills/browser/.playwright/example.png
$PWCLI -s=browser-task close
```

Use `--headed` with `open` only when the user wants to watch or manually intervene:

```bash
$PWCLI -s=manual open https://example.com --headed
```

## Common commands

```bash
# Open/navigate
playwright-cli -s=<session> open [url]
playwright-cli -s=<session> open [url] --headed
playwright-cli -s=<session> goto <url>
playwright-cli -s=<session> reload
playwright-cli -s=<session> go-back
playwright-cli -s=<session> go-forward

# Discover page structure and target elements
playwright-cli -s=<session> snapshot
playwright-cli -s=<session> snapshot --depth=4
playwright-cli -s=<session> snapshot <ref-or-selector>
playwright-cli -s=<session> snapshot --boxes
playwright-cli -s=<session> generate-locator <ref>
playwright-cli -s=<session> highlight <ref>
playwright-cli -s=<session> highlight --hide

# Interact
playwright-cli -s=<session> click <ref-or-selector> [button]
playwright-cli -s=<session> dblclick <ref-or-selector> [button]
playwright-cli -s=<session> fill <ref-or-selector> "text"
playwright-cli -s=<session> fill <ref-or-selector> "text" --submit
playwright-cli -s=<session> type "text"
playwright-cli -s=<session> press Enter
playwright-cli -s=<session> hover <ref-or-selector>
playwright-cli -s=<session> select <ref-or-selector> <value>
playwright-cli -s=<session> check <ref-or-selector>
playwright-cli -s=<session> uncheck <ref-or-selector>
playwright-cli -s=<session> drop <ref-or-selector> --path=<file>

# Artifacts
playwright-cli -s=<session> screenshot --filename=<path.png>
playwright-cli -s=<session> screenshot <ref-or-selector> --filename=<path.png>
playwright-cli -s=<session> pdf --filename=<path.pdf>

# Debugging
playwright-cli -s=<session> console warning
playwright-cli -s=<session> requests
playwright-cli -s=<session> request <index>
playwright-cli -s=<session> response-body <index>
playwright-cli -s=<session> eval "() => document.title"
playwright-cli -s=<session> run-code "async ({ page }) => await page.title()"

# Tabs and sessions
playwright-cli -s=<session> tab-list
playwright-cli -s=<session> tab-new [url]
playwright-cli -s=<session> tab-select <index>
playwright-cli -s=<session> tab-close [index]
playwright-cli list
playwright-cli -s=<session> close
playwright-cli close-all
playwright-cli kill-all
```

## Targeting elements

Prefer refs from `snapshot`:

```bash
playwright-cli -s=task snapshot
playwright-cli -s=task click e15
```

CSS selectors and Playwright locators also work:

```bash
playwright-cli -s=task click "#main > button.submit"
playwright-cli -s=task click "getByRole('button', { name: 'Submit' })"
playwright-cli -s=task fill "getByLabel('Email')" "user@example.com"
```

## Storage and auth state

Use only with care; auth files and storage can contain secrets.

```bash
playwright-cli -s=<session> state-save /safe/path/state.json
playwright-cli -s=<session> state-load /safe/path/state.json
playwright-cli -s=<session> cookie-list
playwright-cli -s=<session> localstorage-list
playwright-cli -s=<session> sessionstorage-list
```

## Network mocking

```bash
playwright-cli -s=<session> route "**/api/items" --status=200 --body='[]'
playwright-cli -s=<session> route-list
playwright-cli -s=<session> unroute "**/api/items"
playwright-cli -s=<session> network-state-set offline
playwright-cli -s=<session> network-state-set online
```

## When to use `run-code`

Use normal CLI commands first. Use `run-code` only for checks or interactions that are awkward via refs/selectors, such as reading computed styles, multiple assertions, waiting for app state, or extracting small structured data.

Keep snippets short and do not exfiltrate secrets:

```bash
playwright-cli -s=task run-code "async ({ page }) => ({ title: await page.title(), url: page.url() })"
```

## References

- Upstream project and configuration schema: https://github.com/microsoft/playwright-cli (see README for `.playwright/cli.config.json` and `PLAYWRIGHT_MCP_*` variables)
