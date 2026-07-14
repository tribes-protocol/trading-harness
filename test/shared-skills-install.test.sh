#!/bin/sh
# Runtime inheritance contract for the trading harness. Run as root on the
# disposable GitHub runner because the production target is fixed at /root/skills.
set -eu

REPO="$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)"
EXPECTED="zipbox-browser
zipbox-caddy
zipbox-dns
zipbox-email
zipbox-websearch"

fail() {
  printf 'FAIL - %s\n' "$1" >&2
  exit 1
}

assert_eq() {
  [ "$1" = "$2" ] || fail "$3 (got '$1', expected '$2')"
}

if [ -e /root/skills ] || [ -L /root/skills ]; then
  fail 'test requires a clean disposable runner: /root/skills already exists'
fi

TMP_ROOT="$(mktemp -d)"
cleanup() {
  chmod -R u+rwX /root/skills 2>/dev/null || true
  rm -rf /root/skills "$TMP_ROOT"
}
trap cleanup EXIT HUP INT TERM

WORKSPACE="$TMP_ROOT/workspace"
mkdir -p "$WORKSPACE/scripts" "$WORKSPACE/.pi"
cp "$REPO/scripts/install-shared-skills.sh" "$WORKSPACE/scripts/"
cp -a "$REPO/skills" "$WORKSPACE/skills"
ln -s ../skills "$WORKSPACE/.pi/skills"

mkdir -p "$WORKSPACE/skills/local-test" "$WORKSPACE/skills/zipbox-stale"
printf '%s\n' 'local trading skill' > "$WORKSPACE/skills/local-test/SKILL.md"
printf '%s\n' 'stale repo skill' > "$WORKSPACE/skills/zipbox-stale/SKILL.md"

mkdir -p /root/skills/local-root /root/skills/zipbox-stale
printf '%s\n' 'local root skill' > /root/skills/local-root/SKILL.md
printf '%s\n' 'stale root skill' > /root/skills/zipbox-stale/SKILL.md

non_zipbox_snapshot() {
  for entry in "$WORKSPACE/skills"/*; do
    name="$(basename "$entry")"
    case "$name" in zipbox-*) continue ;; esac
    find "$entry" -printf '%p|%y|%m|%l\n'
    find "$entry" -type f -exec sha256sum {} \;
  done | sort
  sha256sum "$WORKSPACE/skills/.synced.json"
}

non_zipbox_snapshot > "$TMP_ROOT/non-zipbox.before"
sh "$WORKSPACE/scripts/install-shared-skills.sh"

root_catalog="$(
  find /root/skills -mindepth 1 -maxdepth 1 -type d -name 'zipbox-*' \
    -exec test -f '{}/SKILL.md' \; -printf '%f\n' | sort
)"
assert_eq "$root_catalog" "$EXPECTED" 'canonical zipbox catalog'
assert_eq "$(stat -c '%a' /root/skills)" '555' '/root/skills mode'
[ -f /root/skills/local-root/SKILL.md ] || fail 'canonical update removed non-zipbox content'
[ ! -e /root/skills/zipbox-stale ] || fail 'canonical update left a stale zipbox skill'

for slug in $EXPECTED; do
  [ -z "$(find "/root/skills/$slug" -type d ! -perm 0555 -print -quit)" ] \
    || fail "$slug contains a writable directory"
  [ -z "$(find "/root/skills/$slug" -type f ! -perm 0444 -print -quit)" ] \
    || fail "$slug contains a writable file"

  link="$WORKSPACE/skills/$slug"
  [ -L "$link" ] || fail "$link is not a per-slug symlink"
  assert_eq "$(readlink "$link")" "/root/skills/$slug" "$slug repo symlink target"
  [ -f "$WORKSPACE/.pi/skills/$slug/SKILL.md" ] \
    || fail "$slug is not inherited through the Pi client path"
done

[ ! -e "$WORKSPACE/skills/zipbox-stale" ] \
  || fail 'mixed trading catalog left a stale zipbox entry'
[ -f "$WORKSPACE/skills/local-test/SKILL.md" ] \
  || fail 'mixed trading catalog removed a non-zipbox skill'
non_zipbox_snapshot > "$TMP_ROOT/non-zipbox.after"
cmp "$TMP_ROOT/non-zipbox.before" "$TMP_ROOT/non-zipbox.after" >/dev/null \
  || fail 'non-zipbox trading skills changed during installation'

runtime_snapshot() {
  find /root/skills -printf '%p|%y|%m|%l\n' | sort
  find /root/skills -type f -exec sha256sum {} \; | sort
  find "$WORKSPACE/skills" -mindepth 1 -maxdepth 1 -name 'zipbox-*' \
    -printf '%p|%y|%m|%l\n' | sort
}

runtime_snapshot > "$TMP_ROOT/runtime.before"
sh "$WORKSPACE/scripts/install-shared-skills.sh"
runtime_snapshot > "$TMP_ROOT/runtime.after"

cmp "$TMP_ROOT/runtime.before" "$TMP_ROOT/runtime.after" >/dev/null \
  || fail 'second install changed paths, modes, targets, or content'
non_zipbox_snapshot > "$TMP_ROOT/non-zipbox.second"
cmp "$TMP_ROOT/non-zipbox.before" "$TMP_ROOT/non-zipbox.second" >/dev/null \
  || fail 'second install changed non-zipbox trading skills'

printf '%s\n' 'ok - trading harness shared skills inheritance contract'
