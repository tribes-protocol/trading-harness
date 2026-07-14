---
name: tribes-login
description: >-
  Guided Tribes sign-in. Runs `tribes-cli login` in the background, surfaces the browser-approval
  URL to the user immediately, and watches until the token is minted and persisted to `.env` as
  API_BEARER_TOKEN. Use when the user asks to log in or runs /tribes-login. NOT for: mid-session
  auth errors on another command — run `tribes-cli login` directly and retry that command once
  (see AGENTS.md Error Recovery).
allowed-tools: bash read
disable-model-invocation: true
---

# Tribes Login

Backing command: `tribes-cli login`. It prints a browser login URL, tries to auto-open it, blocks
polling for approval (3-minute timeout), and exits on its own once approved. Success persists
`API_BEARER_TOKEN` into `.env`.
Requires: `tribes-cli` on PATH — if missing, run `bun run bootstrap.sh` (AGENTS.md Installation).

## When to use

- The user asked to log in (or ran `/tribes-login`), or a fresh environment has no token yet.
- NOT for a single failed command mid-session — run `tribes-cli login` directly, retry once.

## Hard rules

1. MUST run login in the background — foreground blocks up to 3 minutes and hides the URL.
2. MUST surface the login URL to the user the moment the `URL:` line appears, even when the
   browser auto-opened — in sandboxed or headless sessions auto-open fails silently.
3. MUST watch the running command until it exits: NEVER end your turn after surfacing the URL,
   NEVER ask the user to report approval — one run detects the approval itself and completes it.
4. NEVER show commands, flags, file paths, or raw CLI output to the user — plain language only
   (AGENTS.md).
5. Retry the whole flow AT MOST once on failure, then stop and tell the user login failed.
6. NEVER run other `tribes-cli` commands until login succeeds.

## Command reference

| Subcommand | Purpose                                                             | Required flags | Read-only or signed |
| ---------- | ------------------------------------------------------------------- | -------------- | ------------------- |
| `login`    | Print browser login URL, poll for approval, persist token to `.env` | none           | local writes only   |

## Procedure

1. IF `.env` already has `API_BEARER_TOKEN` (check below prints 1), confirm the user wants to
   re-authenticate (same or different account); stop if they decline.

   ```bash
   grep -c '^API_BEARER_TOKEN=' .env 2>/dev/null
   ```

2. Start login in the background:

   ```bash
   nohup tribes-cli login > /tmp/tribes-login.log 2>&1 &
   echo $! > /tmp/tribes-login.pid
   ```

3. Poll every few seconds until the URL appears (log format:
   `URL: https://tribes.xyz/agents/login?id=<uuid>&pubKey=<key>`, color codes wrap the link),
   then send the user: "To finish logging in, open this link and approve: <url>".

   ```bash
   grep -ao 'https://[^[:space:]]*' /tmp/tribes-login.log | sed 's/\x1b.*$//'
   ```

4. Keep polling until the process exits. Success = `EXITED` plus `Logged in.` in the log;
   `EXITED` without it = failure (see Error recovery).

   ```bash
   kill -0 "$(cat /tmp/tribes-login.pid)" 2>/dev/null && echo RUNNING || echo EXITED
   grep -c 'Logged in.' /tmp/tribes-login.log
   ```

5. On success, verify the token landed (`grep -c '^API_BEARER_TOKEN=' .env` must print 1 —
   treat 0 as failure), warm the wallet snapshot best-effort with `tribes-cli wallet list`,
   then tell the user: "You're logged in — I can now trade and check balances for you."

## Error recovery

| Symptom                                             | Action                                                                                          |
| --------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| Log shows `Timed out waiting for login result`      | The old link is dead. Rerun the procedure once — it mints a fresh URL. If that fails too, stop. |
| Log shows `Could not auto-open browser`             | Normal in sandboxes. The surfaced URL is the path — keep waiting for the exit.                  |
| Exit looked clean but `.env` has no token           | Treat as failure: rerun the procedure once, then stop and report.                               |
| Auth error on OTHER commands (unauthorized/expired) | Run `tribes-cli login`, retry the original command once, then stop and report (AGENTS.md).      |

## Related skills

- `wallet` — run `tribes-cli wallet list` right after login to warm the wallet snapshot.
