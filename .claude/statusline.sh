#!/bin/sh
# Repo-default Claude Code status line.
#
# Checked in so everyone working in this repo gets the same readout without
# configuring anything. Wired up by .claude/settings.json.
#
#   ~/Developer/terminal (main) │ ◆ Opus 5 (1M context) │ 612k/1.0M 61% │ 15m20s
#     │ effort medium │ 91% session │ 29% week │ +2k -146 │ ⟳ 3 bg
#
# Every value is READ from the JSON Claude Code pipes in on stdin — none of it is
# estimated or recomputed. Fields used (v2.1.220):
#   .model.display_name .effort.level
#   .rate_limits.five_hour.used_percentage  (5-hour session window)
#   .rate_limits.seven_day.used_percentage  (7-day window)
#   .context_window.{total_input_tokens,context_window_size,used_percentage}
#   .cost.{total_duration_ms,total_lines_added,total_lines_removed}
#
# PORTABILITY: no `tail -r` (BSD-only), no transcript parsing, and no bash-only
# parameter expansion. An earlier version walked the whole transcript backwards
# to derive context usage — macOS-only AND re-read a growing file on every
# render. Claude Code reports the same number directly, so this reads it.
# Checked with `dash -n`, not just `sh -n`: on macOS /bin/sh is bash in POSIX
# mode and happily accepts bashisms that break on Linux.
#
# Degrades silently: any absent field drops its segment rather than printing an
# error. A field that disappears in a future version should leave a shorter
# line, never a broken one.
input=$(cat)

# jq is the only dependency. Without it, print a bare path so the line still
# says something useful instead of erroring on every render.
if ! command -v jq >/dev/null 2>&1; then
  printf '%s' "$(printf '%s' "$PWD" | sed "s|^$HOME|~|")"
  exit 0
fi

j() { printf '%s' "$input" | jq -r "$1 // empty"; }

# Percentages arrive as FLOATS (rate_limits reports 91.4, not 91). Every use of
# them here is shell arithmetic or `test -lt`, both of which take integers only:
# `$((100 - 91.4))` is a fatal arithmetic error that kills the whole script and
# renders an EMPTY status line, not a shorter one. Truncate at the edge.
jint() { j "$1" | cut -d. -f1; }

# Dim pipe between segments. Segments are COLLECTED and joined here rather than
# each site appending its own " │ " — that version leaves an orphan separator
# whenever a segment is absent, which is exactly the case this line has to
# survive.
SEP=$(printf ' \033[2m│\033[0m ')
line=""
add() {
  [ -z "$1" ] && return 0
  if [ -z "$line" ]; then line="$1"; else line="${line}${SEP}$1"; fi
}

# --- location ---------------------------------------------------------------
cwd=$(j '.cwd')
[ -z "$cwd" ] && cwd=$(pwd)
disp=$(printf '%s' "$cwd" | sed "s|^$HOME|~|")
branch=$(git --no-optional-locks -C "$cwd" rev-parse --abbrev-ref HEAD 2>/dev/null)
if [ -n "$branch" ]; then
  add "$(printf "%s \033[36m(%s)\033[0m" "$disp" "$branch")"
else
  add "$disp"
fi

# --- model -------------------------------------------------------------------
model_disp=$(j '.model.display_name')
[ -n "$model_disp" ] && add "$(printf "\033[35m◆ %s\033[0m" "$model_disp")"

# --- context window ----------------------------------------------------------
fmt() {
  awk -v n="$1" 'BEGIN{ if(n>=1000000) printf "%.1fM",n/1000000; else if(n>=1000) printf "%.0fk",n/1000; else printf "%d",n }'
}

used=$(j '.context_window.total_input_tokens')
window=$(j '.context_window.context_window_size')
pct=$(jint '.context_window.used_percentage')
if [ -n "$used" ] && [ -n "$window" ] && [ -n "$pct" ] && [ "$window" -gt 0 ] 2>/dev/null; then
  # Bright green normally, red once genuinely full. Distinct from session (cyan)
  # and week (orange) so three numeric segments never look alike.
  if [ "$pct" -lt 80 ]; then col=92; else col=91; fi
  add "$(printf "\033[%sm%s/%s %s%%\033[0m" "$col" "$(fmt "$used")" "$(fmt "$window")" "$pct")"
fi

# --- elapsed -----------------------------------------------------------------
# Grey on purpose: orientation, not something to act on, so it must not compete
# with the numbers that are.
dur_ms=$(j '.cost.total_duration_ms')
if [ -n "$dur_ms" ] && [ "$dur_ms" -gt 0 ] 2>/dev/null; then
  secs=$((dur_ms / 1000))
  mins=$((secs / 60))
  rem=$((secs % 60))
  if [ "$mins" -gt 0 ]; then
    add "$(printf "\033[90m%sm%ss\033[0m" "$mins" "$rem")"
  else
    add "$(printf "\033[90m%ss\033[0m" "$secs")"
  fi
fi

# --- effort ------------------------------------------------------------------
# Label dim, value bright: the word never changes, the level does, so only the
# level should draw the eye.
effort=$(j '.effort.level')
[ -n "$effort" ] && add "$(printf "\033[38;5;208meffort\033[0m \033[91m%s\033[0m" "$effort")"

# --- rate limits: how much of the session and the week is LEFT ---------------
# Shown as REMAINING, not used. They are the same fact, but only one of them
# answers the question you have before starting something expensive.
#
# Each gets its OWN colour so the line can be parsed at a glance. The alarm
# survives as an OVERRIDE: at 20% or less remaining a limit turns red whatever
# colour it was assigned, so "nearly out" still shouts.
#
# Colours are SGR parameter STRINGS, not bare codes, so a segment can use a
# 256-colour value (38;5;N). Bright yellow (93) was unreadable on a light
# background — orange (38;5;208) replaced it.
LIM_CRITICAL=20
lim_col() { [ "$1" -le "$LIM_CRITICAL" ] && echo 91 || echo "$2"; }

sess_used=$(jint '.rate_limits.five_hour.used_percentage')
if [ -n "$sess_used" ]; then
  sess_left=$((100 - sess_used))
  add "$(printf "\033[%sm%s%% session\033[0m" "$(lim_col "$sess_left" 96)" "$sess_left")"
fi

week_used=$(jint '.rate_limits.seven_day.used_percentage')
if [ -n "$week_used" ]; then
  week_left=$((100 - week_used))
  add "$(printf "\033[%sm%s%% week\033[0m" "$(lim_col "$week_left" "38;5;208")" "$week_left")"
fi

# --- lines changed -----------------------------------------------------------
# Only when something actually changed, so a read-only session does not carry a
# permanent "+0 -0".
added=$(j '.cost.total_lines_added')
removed=$(j '.cost.total_lines_removed')
if [ -n "$added" ] && [ -n "$removed" ] && { [ "$added" -gt 0 ] 2>/dev/null || [ "$removed" -gt 0 ] 2>/dev/null; }; then
  add "$(printf "\033[92m+%s\033[0m \033[91m-%s\033[0m" "$(fmt "$added")" "$(fmt "$removed")")"
fi

# --- background agents -------------------------------------------------------
# Live background sessions from the local daemon roster, and how many are mid
# loop-iteration. Reads Claude Code's own per-user state under $HOME, so it is
# correct for whoever runs it and prints nothing for someone with no background
# work. Excludes THIS session and anything already done/failed.
self=$(j '.session_id' | cut -c1-8)
roster="$HOME/.claude/daemon/roster.json"
if [ -f "$roster" ]; then
  counts=$(jq -rn --slurpfile r "$roster" --arg self "$self" '
    ($r[0].workers // {} | keys) as $live
    | [ inputs
        | select( ((.daemonShort // "") as $s
                   | ($live | index($s)) != null and $s != $self)
                  and (.state | IN("done","failed") | not) ) ] as $jobs
    | "\($jobs|length) \($jobs | map(select((.inFlight.kinds // []) | index("session_cron"))) | length)"
  ' "$HOME"/.claude/jobs/*/state.json 2>/dev/null)
  n_bg=${counts%% *}
  n_loops=${counts##* }
  if [ "${n_bg:-0}" -gt 0 ] 2>/dev/null; then
    seg="⟳ ${n_bg} bg"
    if [ "${n_loops:-0}" -gt 0 ] 2>/dev/null; then
      s=""
      [ "$n_loops" -ne 1 ] && s="s"
      seg="${seg}, ${n_loops} loop${s}"
    fi
    add "$(printf "\033[94m%s\033[0m" "$seg")"
  fi
fi

printf '%s' "$line"
