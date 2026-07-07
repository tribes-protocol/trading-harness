---
name: tribes-login
description: Log in to Tribes to enable agentic trading. Use when the user asks to log in or run /tribes-login.
allowed-tools: bash read
disable-model-invocation: true
---

# Tribes login

Run the Tribes CLI login flow so this workspace can call Tribes APIs and execute trades.

## Before you start

1. Ensure `tribes-cli` is on PATH. If it is missing, run `bun run bootstrap.sh` once from the repo root and retry.
2. Check whether `.tribes/agent-authorization-key.json` already exists.
   - If it exists, ask the user whether they want to log in again with a different account. Stop if they decline.

## Run login

Start the login flow in the **background** so its output streams while it waits. Do not run it in the foreground: it blocks for up to about 3 minutes while polling, which hides the login URL and leaves the user watching a stuck command.

```bash
tribes-cli login
```

The command prints a login URL, tries to open it in a browser automatically, then **blocks and polls until the user approves or it times out** (up to about 3 minutes). A single successful run finishes the whole flow on its own — approval completes it automatically. There is no second command to run to "complete" the login.

**Surface the URL as soon as it appears.** Watch the background output and, the moment the `URL:` line is printed, show that URL to the user as a link they can click to approve the agent — for example:

> To finish logging in, open this link and approve the agent: <url>

Do this even when the browser looks like it opened on its own. In a sandbox, remote, or headless session the auto-open silently fails, and without the visible link the user has no way to complete login and just waits for the command to time out.

**Then keep watching that same command until it exits — do not stop, and do not hand control back to the user.** Specifically:

- Do NOT end your turn after surfacing the URL.
- Do NOT ask the user to "tell you when they've approved" or say you'll "re-run to complete" — the running command detects the approval itself and exits.

A clean exit means success; a non-zero exit or timeout means failure.

## On success

1. Confirm `.env` now contains `API_BEARER_TOKEN`.
2. Warm the wallet snapshot (best-effort):

```bash
tribes-cli wallet list
```

3. Tell the user they are logged in and can use other harness skills and tribes-cli commands.

## On failure

Report the CLI error output plainly. A timeout means the user did not approve within the ~3 minute window — the only remedy is to start login again, which mints a **fresh** link (the old one is dead). Surface that new link and, again, keep watching the new command until it exits rather than handing control back.

Do not proceed with trading or other tribes-cli commands until login succeeds.
