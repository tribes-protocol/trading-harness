import { mkdtempSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { createHandoff, saveHandoff } from '../../src/departments/handoff.js';
import { ValidationError } from '../../src/core/errors.js';

const base = mkdtempSync(join(tmpdir(), 'pi-handoff-test-'));
afterAll(() => rmSync(base, { recursive: true, force: true }));

function validInput(id?: string) {
  return {
    ...(id !== undefined ? { id } : {}),
    fromDepartment: 'global-macro',
    toDepartment: 'portfolio-management',
    subject: 'test',
    dataSources: ['fred:CPIAUCSL'],
    analyticalMethods: [],
    findings: [
      {
        statement: 's',
        evidenceType: 'calculated' as const,
        support: [],
        confidence: 'high' as const,
      },
    ],
    confidence: 'high' as const,
    assumptions: [],
    limitations: [],
    unresolvedQuestions: [],
    recommendedNextAction: 'review',
    artifacts: [],
    dissents: [],
  };
}

describe('createHandoff', () => {
  it('fills id/timestamp and validates', () => {
    const handoff = createHandoff(validInput());
    expect(handoff.id).toMatch(/^handoff-/);
    expect(Date.parse(handoff.at)).not.toBeNaN();
  });

  it('rejects invalid content', () => {
    expect(() =>
      createHandoff({ ...validInput(), findings: [] as never }),
    ).toThrow(ValidationError);
  });
});

describe('saveHandoff', () => {
  it('sanitizes hostile ids so artifacts cannot escape the audit directory', () => {
    const handoff = createHandoff(validInput('../../escape/evil'));
    const path = saveHandoff(handoff, base);
    expect(resolve(path).startsWith(resolve(base))).toBe(true);
    expect(path).not.toContain('..');
    expect(existsSync(path)).toBe(true);
  });

  it('persists under the handoffs subdirectory', () => {
    const handoff = createHandoff(validInput());
    const path = saveHandoff(handoff, base);
    expect(path).toContain(join(base, 'handoffs'));
    expect(existsSync(path)).toBe(true);
  });
});
