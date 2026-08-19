---
name: zipbox-notify
description: >-
  Ping the user's dashboard when you finish a long task, get blocked, or need their input.
  The ping becomes a row in their notifications panel, a badge on the header bell, and an
  OS push when they are away from the tab. Several harnesses already send this by
  themselves when a turn completes — use your harness's own mechanism first; this skill is
  the manual fallback for the ones that do not, and for mid-session pings on any harness.
allowed-tools: bash read
---

# Zipbox Notify

<!-- synced from tribes-protocol/terminal — edit there, not here -->

The user is not watching this terminal. They opened this box in a browser tab, gave
you a job, and went to do something else. A notification is the only thing that tells
them you are done, stuck, or waiting — nothing else about your session reaches them
until they come back and read the screen.

## What a notification is here

The web terminal parses an OSC escape straight off the pty. There is no notify CLI in
this image and there never was — **the escape IS the interface**. When one lands, the
platform:

1. writes a row into the user's notifications panel (box name, your message, age),
2. increments the bell badge in the dashboard header and dots that box's tab,
3. fires an **OS/desktop push** if the user granted permission and is not looking at
   the tab, and
4. plays a short sound in the dashboard, unless the user muted it.

The history is stored server-side, so the row survives a reload and shows up on the
user's other devices too. No toast pops over the terminal — by design.

## Use your harness's own capability first

**If your harness notifies on its own when a turn completes, do NOT also fire a manual
escape at the end of your turn.** That double-notifies: two rows, two badges, two
pushes for one event. Check what you are running before you reach for the printf
below.

Harnesses on this platform that already emit by themselves:

| Harness    | Its own mechanism                                                   | When it fires                            |
| ---------- | ------------------------------------------------------------------- | ---------------------------------------- |
| **claude** | `~/.claude/settings.json` → `"preferredNotifChannel": "iterm2"`     | turn complete, only when unfocused       |
| **codex**  | `~/.codex/config.toml` → `[tui]` event list + `notification_method` | turn complete / approval, when unfocused |
| **grok**   | `~/.grok/config.toml` → `[ui.notifications] method = "osc777"`      | turn complete, only when unfocused       |
| **pi**     | `~/.pi/agent/extensions/tribes-notify.js` on `agent_settled`        | turn complete, focused or not            |

If you are on a **trading-harness / ATA** box, `tribes-cli notify "<message>"` is that
harness's own CLI — use it and stop; it walks the process tree to find the pty for you.

Everything else on this platform — **opencode, openclaw, cline, cursor, hermes,
herdr** — has no notification mechanism at all. On those, the escape below is the only
path, and a turn that ends without it ends silently.

`cat` the file in the table for your harness if you are unsure. Do not guess from the
harness name, and do not assume a config exists because a sibling harness has one.

Even on a harness that self-notifies, the escape is still yours to use **mid-session**:
its automatic ping only fires when the turn ends, so "I need your permission to
continue" thirty minutes into a job needs you to send one.

## The fallback escape

```bash
printf '\033]777;notify;Build;tests are green, deploying\033\\'
```

That is OSC 777: `<title>` and `<body>` separated by `;`, terminated by ST (`\033\\`).
A message with a shell-special character in it goes through a variable rather than
straight into the format string:

```bash
title='Build'
body='tests are green, deploying'
printf '\033]777;notify;%s;%s\033\\' "$title" "$body"
```

Rules, each of them measured against the receiver — not style preferences:

- **Rewrite `;` to `,` inside the title and the body.** `;` is OSC 777's own field
  separator: a semicolon in your text truncates the message at that point.
- **Keep the body under 500 characters.** The server clamps at 500. A notification is
  a summary with a verb in it, not a report — the user reads the detail on the screen
  when they come back.
- **Strip newlines and control characters** out of both fields. The escape is a single
  line; a newline in the middle of it ends the sequence early.
- **Write to `/dev/tty` when it opens, plain stdout otherwise.** Both work:

  ```bash
  if : > /dev/tty 2>/dev/null; then
    printf '\033]777;notify;%s;%s\033\\' "$title" "$body" > /dev/tty
  else
    printf '\033]777;notify;%s;%s\033\\' "$title" "$body"
  fi
  ```

  Agents commonly run their shell commands in a child with pipes for stdin/stdout and
  no controlling terminal, so `/dev/tty` fails to open — falling through to stdout
  still reaches the pty, because the agent's own output is on it.

- **Do not fire from inside a subshell whose output you capture** (`$(...)`,
  `| tee`, a redirect to a file). The escape has to reach the pty; captured output
  never does.

### The other two dialects

The terminal also parses OSC 9 and OSC 99. You do not need them — OSC 777 carries both
a title and a body and is the one to use — but if your harness or a script already
emits one of these, it works:

```bash
printf '\033]9;build finished\a'              # OSC 9: message only, no title
printf '\033]99;i=1:d=0;build finished\033\\' # OSC 99 (kitty-style)
```

**An OSC 9 message must not start with `<digit>;`** — that is ConEmu's progress
protocol and the receiver drops it. `\a` (BEL) terminates a sequence exactly like ST
does.

## When to notify

Send one when the user genuinely needs to come back:

- **A long job finished.** The build passed, the migration ran, the dataset finished
  downloading — anything you told them would take a while.
- **You are blocked and cannot proceed.** You need a credential, a decision between
  two options, or permission for something destructive. Say what you need in the body,
  so they know whether it can wait.
- **Unattended work stopped on an error.** They think you are still going; you are
  not.

Do **not** send one for:

- routine progress ("step 3 of 7 done") — normal output already reaches a user who is
  watching, and a user who is not does not want seven pings,
- anything you are about to say in your own reply anyway on a harness that
  self-notifies at the end of the turn,
- a retry that succeeded on its own, or
- a task the user watched you start ten seconds ago.

One notification per event. If three things finish together, send one notification
naming the three, not three notifications.

Write the body the way you would write a text message to the person who asked: what
happened, and whether they have to do something about it. "done" is a wasted
notification; "tests green, waiting for your OK to deploy" is not.

## Checking it landed

`printf` exits 0 whether or not anything parsed the escape, so a zero exit proves
nothing on its own. The honest check is the user's own dashboard: a row appears in
their notifications panel within a second. If you sent one and they tell you nothing
arrived, the usual cause is one of the rules above — a `;` inside the body, a captured
subshell, or a leading digit on an OSC 9 message.

## Related skills

- `zipbox-email` (`zipbox-email/SKILL.md`) — when the user needs the actual content
  rather than a ping, email it to them from this box's own address. A notification is
  a nudge; an email is a message.
- `zipbox-desktop` (`zipbox-desktop/SKILL.md`) — the other surface the user watches
  live. Notify when you have left something on the desktop for them to look at.
- `zipbox-image` (`zipbox-image/SKILL.md`) — the same "your harness first, this skill
  only for the gap" contract, applied to reading and generating images.
