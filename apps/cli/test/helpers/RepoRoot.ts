import { dirname, join } from 'path'
import { fileURLToPath } from 'url'

/**
 * Absolute path to the monorepo root — the directory Pi is launched from and the
 * anchor for `.pi/`, `skills/`, `.agents/`, `AGENTS.md` and `plans/`.
 *
 * Encoded in ONE place on purpose: this file sits at `apps/cli/test/helpers/`, so
 * the hop count changes whenever the package moves. Contract tests that read
 * repo-root files import this instead of counting `..` themselves.
 */
export const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..')
