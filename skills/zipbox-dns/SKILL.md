---
name: zipbox-dns
description: Every name under this sandbox's apex already resolves via a platform wildcard — serve it and it works. Use the baked tribes-dns CLI only to pin a name to a single stack, or to list and delete records.
allowed-tools: bash read
---

# DNS management

<!-- synced from tribes-protocol/terminal — edit there, not here -->

This sandbox owns one apex hostname: `<slug>.<domain>` (for example
`hish.zipbox.ai`).

**Every name below that apex already resolves to this VM. You do not create DNS
records to serve a subdomain.** The platform publishes a wildcard pair for the
box — `*.<slug>.<domain>` A + AAAA — so `api.hish.zipbox.ai`,
`app.hish.zipbox.ai`, and anything else you invent answer immediately,
dual-stack, with no CLI call and no propagation wait:

- **A** → the serving host's public **IPv4**; that host's HAProxy suffix-routes
  the traffic back to this VM by SNI/Host.
- **AAAA** → this sandbox's own guest **IPv6**, straight to this VM.

The platform owns those records and **re-points them when the VM moves hosts**,
so the wildcard never goes stale.

To put a subdomain online, the only step is serving it: add the site with the
Caddy CLI (see the `zipbox-caddy` skill, `zipbox-caddy/SKILL.md`). Skip DNS
entirely.

You may **never** create or overwrite a record on the apex itself. The apex is
managed by the platform; it is what points the browser and SSH at this VM, and
clobbering it takes the machine offline.

## Reserved names

`ide.<apex>`, `vnc.<apex>` and `tunnel.<apex>` are **system-owned** fronts. They
resolve through the wildcard like everything else, but the CLI refuses to write
them — an explicit record there would shadow the wildcard and take the box's own
IDE, VNC or tunnel front offline.

## When you would still use the CLI

The wildcard answers **both** stacks. Create an explicit record only when you
deliberately want a name to answer over **one** stack:

- `set <label> A` → IPv4 only, through the host's HAProxy.
- `set <label> AAAA` → IPv6 only, straight to this VM.

An explicit record **overrides** the wildcard for that exact name. That is the
point — and also the cost: see the staleness warning below.

## The `tribes-dns` CLI

Everything here is driven by the baked `tribes-dns` CLI. Do not try to edit a
zone file, call a DNS provider API, or reach for an editor — the only supported
surface is the CLI below. Its command surface is frozen; use it verbatim.

> The CLI is `tribes-dns`, not `zipbox-dns`: one rootfs serves both zipbox and
> web/ata sandboxes, so the infra binaries stay product-agnostic (same reason
> the daemon is still called `sandboxd`). The skill carries the product
> identity; the binary does not.

```
tribes-dns list
tribes-dns expose <label>
tribes-dns set <label> A
tribes-dns set <label> AAAA
tribes-dns delete <label> A
tribes-dns delete <label> AAAA
```

`<label>` is the part **below** the apex (e.g. `api`), and the CLI appends the
apex for you — you never type the full FQDN and you can never aim a record at
the apex by accident. Neither `set A` nor `set AAAA` takes an address argument;
passing one is rejected, because the server pins the content.

`expose <label>` writes both an `A` and an `AAAA` for `<label>.<apex>`. Under
the wildcard that reproduces what the name already did, so it is rarely what you
want — reach for it only if you have a reason to hold explicit records.

## Only A and AAAA — and the server pins their content

You can set exactly two record types, and **you never supply the address**. The
server derives the host IPv4 (`A`) and this sandbox's guest IPv6 (`AAAA`).

Every other record type is **refused**: `CNAME`, `TXT`, and `MX`/`NS`/`SRV` are
all rejected. Wildcards are refused too — the box's wildcard is the platform's.

## Listing

```
tribes-dns list                  # every record you created under your apex
```

The platform's own records (the apex pair and the wildcard pair) are not yours
and do not appear here or count against your quota.

## Explicit records do not self-heal — re-expose after a restore

This applies **only to records you created**. An `A`/`AAAA` you set freezes the
address the server pinned **at the moment you set it**. A restore, or a tier
upgrade, re-places the VM onto a different host with a new public IPv6 and a new
host IPv4 — and your literal records do not follow that move. They silently
**rot** until you re-point them, and because an explicit record overrides the
wildcard, the name stays broken instead of falling back to it.

So after any restore or host-move, **re-run `expose <label>`** (or `set`) for
every name you created here to re-pin it. The wildcard needs no such step — it
is re-pointed for you, which is the strongest reason to leave names implicit.

## Quotas and lifecycle

- **30 records** maximum under your apex (your records only — the platform's
  apex and wildcard pairs are excluded).
- **10 mutations per minute** (`expose` / `set` / `delete` all count).
- Records **survive** archive and restore — but their pinned addresses go stale
  across a host-move, so re-run `expose` after a restore (see above).
- Records are **deleted** when the sandbox is **destroyed or stopped** — a
  stopped sandbox releases its name for reuse, so treat "stop" like "destroy"
  for anything you've set here.

## If the CLI is missing

Older sandboxes may not have DNS self-service. Degrade gracefully:

```
command -v tribes-dns || echo "this sandbox predates DNS self-service"
```
