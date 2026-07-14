# P25 trading shared-skills inheritance check

Run this only in staging on a disposable ATA sandbox created after the trading-harness shared
skills change is merged. Do not use a production sandbox or one containing needed work. Browser
first use installs Chromium and Linux packages into the sandbox rootfs.

## Preconditions

- Use a newly created post-bake ATA sandbox, not an older restored box.
- Confirm the sandbox cloned a trading-harness revision containing this release change.
- Keep the sandbox bearer private. Do not print shell tracing, request headers, cookies, browser
  storage, or saved session state.

## Catalog and inheritance

1. List direct children of `/root/skills`. The shared catalog must be exactly
   `zipbox-browser`, `zipbox-caddy`, `zipbox-dns`, `zipbox-email`, and
   `zipbox-websearch`; every directory must contain `SKILL.md`.
2. Confirm `/root/skills` and every directory below the five shared entries have mode `0555`, and
   every shared file has mode `0444`.
3. Confirm each repo-root `skills/zipbox-*` entry is a symlink to the matching
   `/root/skills/<slug>` directory. Confirm `.pi/skills` still resolves to repo-root `skills/`, and
   reading `.pi/skills/<slug>/SKILL.md` reaches the canonical shared file.
4. Confirm all 27 non-zipbox trading skill directories remain real directories. Their names and
   contents must match the checkout; none may move under `/root/skills` or become a per-slug link.
5. Run `scripts/install-shared-skills.sh` twice. The five canonical paths, numeric modes, file
   hashes, and link targets must remain unchanged, with no stale or duplicate `zipbox-*` entry.

## Functional shared-skill checks

Ask the ATA agent to read and use `zipbox-websearch` specifically, not the trading-only
`web-search` skill. Search for the current official Playwright CLI documentation and return the
page title and source URL. Then extract readable text from one known public documentation URL.
The bearer must remain private, and each factual claim must retain its source URL.

Ask the agent to read and use `zipbox-browser` specifically, not the trading-only `browser` skill.
Open a JavaScript-rendered public page headlessly, wait for a stable selector, capture a shallow
snapshot, read the title, and close the named session. First use may install Playwright CLI,
Chromium, and required packages. CAPTCHA or access-control bypass, headed mode, leaked browser
state, or an unclosed session is a failure.
