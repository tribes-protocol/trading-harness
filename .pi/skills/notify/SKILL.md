---
name: notify
description: >-
  Send a desktop notification from any terminal. Use to alert the human when a
  long-running command finishes, a background job fails, or the agent needs
  attention while the terminal is unattended.
allowed-tools: bash
---

# Notify (desktop notifications from the terminal)

`notify` is a standalone shell CLI. It has no dependency on `tribes-cli`, the
Terminal API, or anything else in this repo, so it can be symlinked onto `PATH`
and used from any shell.

## CLI

```bash
notify "build finished"
notify -t Deploy -s staging --sound "rollout complete"
notify --title="Tests" --sound=Glass "42 passed"
make test && notify "tests passed" || notify -t FAIL --sound "tests broke"
long-running-job | tail -1 | notify -t "job done"
```

| Flag               | Meaning                                                |
| ------------------ | ------------------------------------------------------ |
| `-t`, `--title`    | Title line (default: `notify`)                         |
| `-s`, `--subtitle` | Subtitle; macOS only, ignored elsewhere                |
| `--sound`          | Play the default sound (`Ping`)                        |
| `--sound=<name>`   | Play a named sound (`Glass`, `Hero`, `Submarine`, ...) |
| `-b`, `--backend`  | Force a backend instead of auto-detecting              |
| `--list-backends`  | Show every backend and whether it works here           |
| `--doctor`         | Diagnose delivery, then send a test notification       |

The message is taken from the positional arguments, or from stdin when piped.
Every long option also accepts `--opt=value`.

A bare `--sound` never consumes the next argument, so
`notify --sound "all done"` notifies with the message `all done` rather than
looking for a sound called `all done`. Use `--sound=Glass` to name one.

Environment: `NOTIFY_BACKEND` and `NOTIFY_TITLE` set defaults. An explicit flag
wins over the environment.

Exit codes: `0` sent, `1` usage error, `2` no usable backend, `3` backend failed.

## Backends

Auto-detection picks the first available of `terminal-notifier`, then
`osascript` (macOS), then `notify-send` (Linux). `osc777` and `bell` are never
auto-selected and must be requested with `--backend`.

| Backend             | Notes                                                                                                                                      |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| `terminal-notifier` | Most reliable on macOS: registers its own bundle id, so macOS can hold a notification permission for it. `brew install terminal-notifier`. |
| `osascript`         | macOS built-in. Delivered under a system script host, not under your terminal, so its alert style is configured under that host's entry.   |
| `notify-send`       | Linux / freedesktop.                                                                                                                       |
| `osc777`            | Asks the _terminal emulator_ to notify. Works only if that emulator supports OSC 777 and holds notification permission. Needs a real tty.  |
| `bell`              | Audible bell only. No banner. Opt-in, last resort.                                                                                         |

## Delivery vs. visibility

A backend can report success and you still see nothing. The two are separate:

1. **Delivery** - did anything reach the OS notification system at all?
2. **Visibility** - does the OS draw a banner, or file it silently?

On macOS, an app whose alert style is **None** delivers notifications straight
into Notification Center without ever drawing a banner. So "sent" is truthful
and the screen stays empty. Fix it in **System Settings > Notifications**: find
the delivering app and set it to **Banners** or **Alerts**.

If a notification never appears in Notification Center either, then delivery
itself failed — the emitting app has no notification permission at all. This is
the usual state for terminal emulators that have never registered (they are
absent from `com.apple.ncprefs`), which is why `osc777` is opt-in.

`notify --doctor` prints the platform, every backend's availability, which one
auto-detect would choose, and then sends a test so you can check both layers.

Note: the Notification Center database is protected by TCC and cannot be read
from a sandboxed shell, so neither this tool nor an agent can confirm on your
behalf that a notification was actually displayed. Only you can.

## Agent guidance

Use `notify` when the human is likely away from the terminal and something needs
their attention: a long build finished, a trading cycle hit an error, a
confirmation is required before continuing. Do not use it for routine progress
updates — normal output already reaches the user when they are watching.
