import { randomUUID } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { ValidationError } from '../core/errors.js';
import { nowIso } from '../core/time.js';
import {
  HandoffSchema,
  ResearchNoteSchema,
  type Handoff,
  type ResearchNote,
} from '../schemas/reports.js';

/**
 * Handoff and research-note helpers used by department skills/workflows.
 * Artifacts are validated on creation and persisted as JSON under
 * artifacts/ so every material inter-department handoff is auditable.
 */

export const ARTIFACTS_DIR = 'artifacts';

type HandoffInput = Omit<Handoff, 'id' | 'at' | 'schemaVersion'> &
  Partial<Pick<Handoff, 'id' | 'at'>>;

export function createHandoff(input: HandoffInput): Handoff {
  const candidate = {
    ...input,
    id: input.id ?? `handoff-${randomUUID()}`,
    at: input.at ?? nowIso(),
  };
  const parsed = HandoffSchema.safeParse(candidate);
  if (!parsed.success) {
    throw new ValidationError('Handoff failed schema validation', {
      details: { issues: parsed.error.issues.slice(0, 10) },
    });
  }
  return parsed.data;
}

type NoteInput = Omit<ResearchNote, 'id' | 'createdAt' | 'schemaVersion'> &
  Partial<Pick<ResearchNote, 'id' | 'createdAt'>>;

export function createResearchNote(input: NoteInput): ResearchNote {
  const candidate = {
    ...input,
    id: input.id ?? `note-${randomUUID()}`,
    createdAt: input.createdAt ?? nowIso(),
  };
  const parsed = ResearchNoteSchema.safeParse(candidate);
  if (!parsed.success) {
    throw new ValidationError('ResearchNote failed schema validation', {
      details: { issues: parsed.error.issues.slice(0, 10) },
    });
  }
  return parsed.data;
}

/** Reduce an artifact id to a filesystem-safe slug — ids are data, not paths. */
function safeSlug(id: string): string {
  const slug = id.replace(/[^A-Za-z0-9._-]+/g, '-').replace(/\.{2,}/g, '.').slice(0, 120);
  return slug.replace(/^[-.]+|[-.]+$/g, '') || 'artifact';
}

function persist(kind: string, id: string, value: unknown, baseDir: string): string {
  const date = nowIso().slice(0, 10);
  const path = join(baseDir, kind, `${date}-${safeSlug(id)}.json`);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
  return path;
}

export function saveHandoff(handoff: Handoff, baseDir: string = ARTIFACTS_DIR): string {
  return persist('handoffs', handoff.id, handoff, baseDir);
}

export function saveResearchNote(note: ResearchNote, baseDir: string = ARTIFACTS_DIR): string {
  return persist('notes', note.id, note, baseDir);
}
