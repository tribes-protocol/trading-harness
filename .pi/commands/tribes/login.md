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

This prints a browser URL, attempts to open it, and polls until the user completes sign-in (up to about 3 minutes). Stay on this step until the command exits successfully or fails.

## On success

1. Confirm `.env` now contains `API_BEARER_TOKEN`.
2. Warm the wallet snapshot (best-effort):

```bash
tribes-cli wallet list
```

3. Tell the user they are logged in and can use other harness skills and tribes-cli commands.

## On failure

Report the CLI error output plainly. If the user timed out in the browser, tell them to run `/tribes:login` again after finishing sign-in.

Do not proceed with trading or other tribes-cli commands until login succeeds.
