---
name: zipbox-api-keys
description: >-
  Find and use the API keys this box already holds for third-party providers.
  Read this BEFORE deciding you have no credential for a provider, before asking
  the user for a key, and before debugging a 401 or a 403. Every key this box has
  is a line in /run/zipbox/placeholders.env — that file is the list, and its
  values are public placeholders, not secrets.
allowed-tools: bash read
---

# Zipbox API keys

<!-- synced from tribes-protocol/terminal — edit there, not here -->

You already hold a working credential for every provider this box is enabled
for. It is not a secret and it is not in your environment by accident: it is a
**placeholder** that the platform swaps for a real key at the network boundary.

## The file is the list

There is no table in this document to consult, and no list to memorize. Read the
file:

```bash
cat /run/zipbox/placeholders.env
```

`NAME=value`, one line per credential. Whatever is in there is what you have;
whatever is not in there, you do not have. Load them all into a shell:

```bash
set -a; . /run/zipbox/placeholders.env; set +a
```

A few of the placeholders are also pre-set in the boot environment, so
`printenv` sometimes answers without sourcing anything. Do not rely on that: a
non-login shell (`ssh box 'cmd'`, a systemd unit, a cron job) can be missing
them, and a box that took a sync after boot has lines in the file that were never
exported. **When a key looks absent, read the file before concluding you have
none.**

The file is the live list as this box last received it. Delivery is best-effort
by design — it is seeded at boot and re-pushed when the enabled set changes, and
neither leg blocks the box — so the file can lag the platform, or on rare
occasion be missing entirely. Neither case means you have no credential; see the
failure table.

## How to use one

Send it exactly where that provider's own documentation says its key goes —
header, query parameter, or URL path segment. No proxy variable, no special
client, no extra flag:

```bash
curl -s "https://api.coingecko.com/api/v3/simple/price?ids=bitcoin&vs_currencies=usd" \
  -H "x-cg-pro-api-key: $COIN_GECKO_PRO_API_KEY"
```

The platform intercepts the request transparently, substitutes the real key, and
charges whichever key applies (see below). **Do not export `HTTP_PROXY` or
`HTTPS_PROXY`** — interception needs no help from you, and a global proxy export
breaks unrelated traffic (`apt-get`, `npm`, `pip`, git).

## Rules

1. **Never overwrite, unset, or "correct" a placeholder.** It looks fake because
   it is a public string. Replacing it with something that looks more like a key
   does not authenticate you — the boundary refuses a value it did not mint
   (`403 own provider key not allowed`) and nothing is charged.
2. **Never edit or delete `/run/zipbox/placeholders.env`.** The directory is
   mounted read-only and a write fails with `Read-only file system`. The platform
   rewrites the file whenever the enabled set changes, so a local edit would be
   lost even if it succeeded.
3. **Never ask the user for a key for a provider that is in the file.** You have
   one. Ask only for a provider with no line of its own.
4. **A user's own key is configured in the dashboard, never in this file.** If
   the user says "use my OpenRouter key", they add it under **API keys** in the
   zipbox dashboard — on this machine's tab for this machine only, or in Settings
   as their default for every machine. Nothing here changes: you keep sending the
   same placeholder, and the boundary swaps in their key instead of the
   platform's. Pasting their key into a variable is the one thing that BREAKS it.
5. **Calls cost money.** A call on a platform key bills this box's wallet; a call
   on the user's own key bills them. Cache responses to disk instead of
   re-fetching.

## When something fails

| Symptom                                                                                                                       | What it means                                                                                                                                                                                                                                                   |
| ----------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `401` from the provider                                                                                                       | The placeholder was replaced or mangled. Re-read the value out of `/run/zipbox/placeholders.env` and send it verbatim.                                                                                                                                          |
| `403 own provider key not allowed`                                                                                            | You sent something that is not the placeholder. Restore the placeholder; if the user wants their own key used, they add it in the dashboard (rule 4). Nothing was charged.                                                                                      |
| `400 malformed provider request`                                                                                              | The placeholder appears more than once in the request. Send it exactly once.                                                                                                                                                                                    |
| `402`                                                                                                                         | The wallet is out of credits. Stop and report it; retrying cannot succeed.                                                                                                                                                                                      |
| `501`                                                                                                                         | No real key is available for that provider — the operator has none configured, or the user's own key is present but unusable. Not retryable, and it never silently falls back to another key.                                                                   |
| Variable is empty in a non-login shell                                                                                        | Source the file: `set -a; . /run/zipbox/placeholders.env; set +a`.                                                                                                                                                                                              |
| `Read-only file system` writing the file                                                                                      | Working as designed. See rule 2.                                                                                                                                                                                                                                |
| The file does not exist at all                                                                                                | This box booted before the platform had a set to seed, and seeding is deliberately not boot-blocking. The boot environment may still carry a few placeholders (`printenv`) — use what is set, verbatim. Report the missing file; do not ask the user for a key. |
| A provider you know is enabled is absent from the file, or its placeholder starts failing right after the enabled set changed | This box has not taken the latest sync. Nothing in the guest can force one; a reboot re-seeds from the current set. Use what the file does hold and report the gap — do not invent a value or ask the user for one.                                             |

## Related skills

- `zipbox-x` (`zipbox-x/SKILL.md`) — the X API in detail, including its per-resource cost table.
- `zipbox-websearch` (`zipbox-websearch/SKILL.md`) — web search: your harness's own tool
  first, the metered Tavily key in this file second.
- `zipbox-geo` (`zipbox-geo/SKILL.md`) — geocode, places, routes, isolines. Metered
  `GEOAPIFY_API_KEY` in this file.
- `zipbox-image` (`zipbox-image/SKILL.md`) — reading images rides this same
  OpenRouter placeholder; generating them goes through a separate baked CLI, not
  this file (fal is not one of this file's providers).
- `zipbox-wallet` (`zipbox-wallet/SKILL.md`) — the wallet these calls are billed to.
