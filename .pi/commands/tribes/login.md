---
name: tribes-login
description: Log in to Tribes to enable agentic trading
invokable: true
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

Execute:

```bash
tribes-cli login
```

This prints a login URL, attempts to open it in a browser, then **blocks and polls until the user approves in the browser or it times out** (up to about 3 minutes). A single successful run finishes the entire flow on its own — approval completes it automatically. There is no second command to run to "complete" the login.

**Surface the URL the moment it appears.** Show the printed `URL:` line to the user as a clickable link — for example:

> To finish logging in, open this link and approve the agent: <url>

Do this even if the browser looks like it opened on its own: in a sandbox, remote, or headless session the auto-open silently fails, and without the visible link the user cannot approve and the command just times out.

**Then wait for that same command to exit — do not stop, and do not hand control back to the user.** Specifically:

- Do NOT end your turn after printing the URL.
- Do NOT ask the user to "tell you when they've approved" or say you'll "re-run to complete" — the running command detects the approval itself and exits.
- Just keep the command running until it exits: a clean exit means success; a non-zero exit or timeout means failure.

## On success

1. Confirm `.env` now contains `API_BEARER_TOKEN`.
2. Warm the wallet snapshot (best-effort):

```bash
tribes-cli wallet list
```

3. Tell the user they are logged in and can use other harness skills and tribes-cli commands.

## On failure

Report the CLI error output plainly. A timeout means the user did not approve within the ~3 minute window — the only remedy is to run `tribes-cli login` again, which mints a **fresh** URL (the old one is dead). Surface that new link and, again, wait for the new command to exit rather than handing control back.

Do not proceed with trading or other tribes-cli commands until login succeeds.
