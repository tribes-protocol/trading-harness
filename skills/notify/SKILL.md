---
name: notify
description: >-
  Send a desktop notification from any terminal. Use to alert the human when a
  long-running command finishes, a background job fails, or the agent needs
  attention while the terminal is unattended.
allowed-tools: bash read
---

# Notify (desktop notifications from the terminal)

`bootstrap.sh` installs `tribes-cli` on PATH, so this works from any shell with
no extra setup. The command performs no network I/O and needs no auth.

## CLI

```bash
tribes-cli notify "build finished"
tribes-cli notify -t Deploy -s staging --sound "shipped"
tribes-cli notify -t Tests --sound-name Glass "42 passed"
make test && tribes-cli notify "tests passed" || tribes-cli notify -t FAIL --sound "tests broke"
long-running-job | tail -1 | tribes-cli notify -t "job done"
```

| Flag                  | Meaning                                             |
| --------------------- | --------------------------------------------------- |
| `-t`, `--title`       | Title line (default: `Tribes Agent`)                |
| `-s`, `--subtitle`    | Subtitle; macOS only, ignored elsewhere             |
| `--sound`             | Play the default sound (`Ping`)                     |
| `--sound-name <name>` | Play a named sound (macOS: `Glass`, `Hero`, ...)    |
| `-b`, `--backend`     | Force a backend instead of auto-detecting           |
| `--list-backends`     | Print each backend and whether it is available here |
| `--doctor`            | Diagnose delivery, then send a test notification    |

The message comes from the positional arguments, or from stdin when piped
(`cmd | tribes-cli notify`) or redirected (`tribes-cli notify < file`). Stdin is
otherwise ignored, so the command never blocks waiting on an inherited stream.

The message is optional as long as `--title` or `--subtitle` carries the content,
so `tribes-cli notify -t Deploy -s staging` sends a banner with no body. A bare
`tribes-cli notify` with nothing to say is a usage error.

`--sound` is a boolean and never consumes the next argument, so
`notify --sound "all done"` notifies with the message `all done`. Use
`--sound-name Glass` to pick a specific sound.

Exit codes: `0` sent, `1` usage error, `2` no usable backend, `3` backend failed.

## Backends

Auto-detection picks the first available of `terminal-notifier`, then
`osascript` (macOS), then `notify-send` (Linux), then `osc`. `bell` is never
auto-selected.

"Available" means _can actually deliver_, not merely "is installed" — a backend
that is present but cannot deliver would be auto-selected, fail, and exit 3
without falling through to one that works.

| Backend             | Notes                                                                                                                                      |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| `terminal-notifier` | Most reliable on macOS: registers its own bundle id, so macOS can hold a notification permission for it. `brew install terminal-notifier`. |
| `osascript`         | macOS built-in. Delivered under a system script host, not under your terminal, so its alert style is configured under that host's entry.   |
| `notify-send`       | Linux / freedesktop. Counts as available only with a D-Bus session bus, since it delivers over one — the binary alone is not enough.       |
| `osc`               | Terminal escape (OSC 777). Reaches a browser-hosted terminal, so it is the backend that fires inside a cloud microVM.                      |
| `bell`              | Audible bell only. No banner. Opt-in, last resort.                                                                                         |

## Delivery vs. visibility

A backend can report success and you still see nothing. The two are separate:

1. **Delivery** — did anything reach the OS notification system at all?
2. **Visibility** — does the OS draw a banner, or file it silently?

On macOS, an app whose alert style is **None** delivers notifications straight
into Notification Center without ever drawing a banner. So "sent" is truthful
and the screen stays empty. Fix it in **System Settings > Notifications**: find
the delivering app and set it to **Banners** or **Alerts**.

If a notification never appears in Notification Center either, then delivery
itself failed — the emitting app has no notification permission at all.

`tribes-cli notify --doctor` prints the platform, every backend's availability,
which one auto-detect would choose, and then sends a test so you can check both
layers.

Note: the Notification Center database is protected by TCC and cannot be read
from a sandboxed shell, so neither this tool nor an agent can confirm on your
behalf that a notification was actually displayed. Only you can.

## Agent guidance

Use `notify` when the human is likely away from the terminal and something needs
their attention: a long build finished, a trading cycle hit an error, a
confirmation is required before continuing. Do not use it for routine progress
updates — normal output already reaches the user when they are watching.
