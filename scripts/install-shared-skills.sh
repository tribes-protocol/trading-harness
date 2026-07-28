#!/bin/sh
# Install the synced zipbox catalog at the sandbox-wide read-only path and make
# this harness consume it through per-slug links. Trading-only skills stay in
# the repository and are never copied, removed, or chmodded by this script.
set -u

REPO_ROOT="$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)"
SOURCE_DIR="$REPO_ROOT/skills"
SHARED_DIR="/root/skills"

MANIFEST="$SOURCE_DIR/.synced.json"

# Derive the catalog from the sync manifest instead of hardcoding it. A hardcoded
# list makes a skill added upstream invisible here — and because the relink loop
# below deletes EVERY zipbox-* before restoring only the listed ones, an unlisted
# skill is not merely skipped, it is deleted. Deriving it keeps
# `bun run skills:upgrade` the only step needed to ship a new shared skill.
#
# The manifest, not a directory glob, is the authority on what was vendored: a glob
# cannot tell an upstream skill from a leftover zipbox-* directory, and would
# reinstate exactly the stale entries this script exists to clear. Keys look like
# "skills/<slug>/SKILL.md"; the file is machine-written one key per line.
EXPECTED_SKILLS="$(
  sed -n 's|.*"skills/\(zipbox-[^/"]*\)/[^"]*".*|\1|p' "$MANIFEST" 2>/dev/null | sort -u
)"

if [ -z "$EXPECTED_SKILLS" ]; then
  printf '%s\n' '[shared-skills] no vendored zipbox skills in .synced.json; leaving current skills intact'
  exit 0
fi

TMP="$(mktemp -d 2>/dev/null || true)"
if [ -z "$TMP" ]; then
  printf '%s\n' '[shared-skills] could not create staging directory; leaving current skills intact'
  exit 0
fi
trap 'rm -rf "$TMP" 2>/dev/null || true' EXIT HUP INT TERM

STAGED="$TMP/catalog"
mkdir -p "$STAGED" 2>/dev/null || {
  printf '%s\n' '[shared-skills] could not prepare catalog; leaving current skills intact'
  exit 0
}

# Stage before changing either location. On a repeated run the repo entries are
# already symlinks, so -L deliberately copies their canonical targets.
for slug in $EXPECTED_SKILLS; do
  source="$SOURCE_DIR/$slug"
  if [ ! -d "$source" ] || [ ! -f "$source/SKILL.md" ]; then
    printf '%s\n' "[shared-skills] missing $slug; leaving current skills intact"
    exit 0
  fi
  if ! cp -RL "$source" "$STAGED/$slug" 2>/dev/null; then
    printf '%s\n' "[shared-skills] could not stage $slug; leaving current skills intact"
    exit 0
  fi
done

for slug in $EXPECTED_SKILLS; do
  find "$STAGED/$slug" -type f -exec chmod 0444 {} + 2>/dev/null || true
  find "$STAGED/$slug" -type d -exec chmod 0555 {} + 2>/dev/null || true
done

if [ -L "$SHARED_DIR" ] || { [ -e "$SHARED_DIR" ] && [ ! -d "$SHARED_DIR" ]; }; then
  rm -rf "$SHARED_DIR" 2>/dev/null || true
fi
mkdir -p "$SHARED_DIR" 2>/dev/null || {
  printf '%s\n' '[shared-skills] could not create /root/skills; leaving repo skills intact'
  exit 0
}
chmod u+w "$SHARED_DIR" 2>/dev/null || true

for stale in "$SHARED_DIR"/zipbox-*; do
  [ -e "$stale" ] || [ -L "$stale" ] || continue
  rm -rf "$stale" 2>/dev/null || true
done

for slug in $EXPECTED_SKILLS; do
  mv "$STAGED/$slug" "$SHARED_DIR/$slug" 2>/dev/null || true
done

complete=1
for slug in $EXPECTED_SKILLS; do
  [ -f "$SHARED_DIR/$slug/SKILL.md" ] || complete=0
done
if [ "$complete" -ne 1 ]; then
  chmod 0555 "$SHARED_DIR" 2>/dev/null || true
  printf '%s\n' '[shared-skills] canonical catalog is incomplete; leaving repo skills intact'
  exit 0
fi

for slug in $EXPECTED_SKILLS; do
  find "$SHARED_DIR/$slug" -type f -exec chmod 0444 {} + 2>/dev/null || true
  find "$SHARED_DIR/$slug" -type d -exec chmod 0555 {} + 2>/dev/null || true
done
chmod 0555 "$SHARED_DIR" 2>/dev/null || true

# Replace only zipbox-* entries in the mixed trading catalog. This removes stale
# managed copies or links and leaves every other skill byte-for-byte intact.
for stale in "$SOURCE_DIR"/zipbox-*; do
  [ -e "$stale" ] || [ -L "$stale" ] || continue
  rm -rf "$stale" 2>/dev/null || true
done
for slug in $EXPECTED_SKILLS; do
  ln -s "$SHARED_DIR/$slug" "$SOURCE_DIR/$slug" 2>/dev/null || true
done

printf '[shared-skills] installed %s read-only zipbox skills under /root/skills\n' \
  "$(printf '%s\n' "$EXPECTED_SKILLS" | wc -l | tr -d ' ')"
exit 0
