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

The command prints a login URL, tries to open it in a browser automatically, then polls until the user completes sign-in (up to about 3 minutes).

**Surface the URL as soon as it appears.** Watch the background output and, the moment the `URL:` line is printed, show that URL to the user as a link they can click to approve the agent — for example:

> To finish logging in, open this link and approve the agent: <url>

Do this even when the browser looks like it opened on its own. In a sandbox, remote, or headless session the auto-open silently fails, and without the visible link the user has no way to complete login and just waits for the command to time out.

Then keep watching the background command until it exits. A clean exit means success; a non-zero exit or timeout means failure.

## On success

1. Confirm `.env` now contains `API_BEARER_TOKEN`.
2. Warm the wallet snapshot (best-effort):

```bash
tribes-cli wallet list
```

3. Tell the user they are logged in and can use other harness skills and tribes-cli commands.

## On failure

Report the CLI error output plainly. If it timed out, the user most likely did not open the login link in time — remind them to open the link you surfaced above, then start `/tribes-login` again so a fresh link is generated.

Do not proceed with trading or other tribes-cli commands until login succeeds.
