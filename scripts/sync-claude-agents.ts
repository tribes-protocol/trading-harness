import { mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { basename, join } from 'node:path';

/**
 * Generates Claude Code agent definitions from the canonical pi prompt
 * templates. This repo is pi-first: `.pi/prompts/*.md` is the single
 * source of truth for department personas — edit there, then re-run:
 *
 *   npm run sync:agents
 *
 * Each canonical prompt carries `description` (used by pi) and
 * `claudeTools` (ignored by pi; becomes the Claude agent's `tools`).
 */

const PROMPTS_DIR = '.pi/prompts';
const OUT_DIR = '.claude/agents';

mkdirSync(OUT_DIR, { recursive: true });
const files = readdirSync(PROMPTS_DIR)
  .filter((f) => f.endsWith('.md'))
  .sort();

let written = 0;
for (const file of files) {
  const raw = readFileSync(join(PROMPTS_DIR, file), 'utf8');
  const match = raw.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
  if (!match || match[1] === undefined || match[2] === undefined) {
    process.stderr.write(`skip ${file}: no frontmatter found\n`);
    continue;
  }
  const fm = match[1];
  const description =
    fm.split('\n').find((l) => l.startsWith('description:'))?.slice('description:'.length).trim() ??
    '';
  const tools =
    fm.split('\n').find((l) => l.startsWith('claudeTools:'))?.slice('claudeTools:'.length).trim() ??
    'Bash, Read, Write, Grep, Glob, Skill';
  const body = match[2].trim();
  const name = basename(file, '.md');
  const out = [
    '---',
    `name: ${name}`,
    `description: ${description}`,
    `tools: ${tools}`,
    '---',
    `<!-- Generated from ${PROMPTS_DIR}/${file} by scripts/sync-claude-agents.ts — edit the source, then re-run. -->`,
    '',
    body,
    '',
  ].join('\n');
  writeFileSync(join(OUT_DIR, `${name}.md`), out, 'utf8');
  written += 1;
}
process.stdout.write(`wrote ${written} Claude agent definitions to ${OUT_DIR}\n`);
