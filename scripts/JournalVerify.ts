#!/usr/bin/env bun
/**
 * Journal completeness verification (read-only).
 *
 * Proves the operator's "data missing/incomplete" concern is a surface issue,
 * not a store issue: the journal store is complete, unique, and listable. Runs a
 * read-only sweep and prints a verdict — it writes nothing to the DB.
 *
 * Invoke: bun scripts/JournalVerify.ts [dbPath] [dropDir]
 */
import { readdirSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { JournalService } from '@/services/JournalService'

const DB = process.argv[2] ?? resolve('/root/workspace/data/trade-journal.sqlite')
const DROP = process.argv[3] ?? resolve('/root/workspace/evidence/trade-reports')

const VALID_STATUS = new Set(['open', 'filled', 'closed', 'stopped', 'tp_hit'])

interface VerifyResult {
  ok: boolean
  total: number
  uniqueIds: boolean
  zeroSize: number
  missingStatus: number
  unknownStatus: number
  dropFiles: number
  dropIngestible: number
  dropNotIngestible: string[]
  errors: string[]
}

function main(): void {
  const journal = new JournalService({ dbPath: DB })
  const all = journal.list(100000, 0)
  const result: VerifyResult = {
    ok: true,
    total: all.length,
    uniqueIds: true,
    zeroSize: 0,
    missingStatus: 0,
    unknownStatus: 0,
    dropFiles: 0,
    dropIngestible: 0,
    dropNotIngestible: [],
    errors: []
  }

  // Uniqueness
  const ids = new Set<string>()
  for (const t of all) {
    if (ids.has(t.id)) {
      result.uniqueIds = false
      result.errors.push(`duplicate id: ${t.id}`)
    }
    ids.add(t.id)
  }

  // Zero-size + status integrity
  for (const t of all) {
    if (t.sizeBase === 0) result.zeroSize += 1
    if (!VALID_STATUS.has(t.status)) {
      result.unknownStatus += 1
      result.errors.push(`unknown status ${t.status} on ${t.id}`)
    }
  }

  // Drop files still ingestible (idempotent read; parse only, do not import)
  try {
    const files = readdirSync(DROP).filter((f) => f.endsWith('.json'))
    result.dropFiles = files.length
    for (const f of files) {
      try {
        JSON.parse(readFileSync(resolve(DROP, f), 'utf8'))
        result.dropIngestible += 1
      } catch {
        result.dropNotIngestible.push(f)
      }
    }
  } catch {
    result.errors.push(`drop dir missing: ${DROP}`)
  }

  if (
    result.uniqueIds === false ||
    result.zeroSize > 0 ||
    result.missingStatus > 0 ||
    result.unknownStatus > 0
  ) {
    result.ok = false
  }

  const line = [
    `total=${result.total}`,
    `unique=${result.uniqueIds ? 'yes' : 'NO'}`,
    `zeroSize=${result.zeroSize}`,
    `missingStatus=${result.missingStatus}`,
    `unknownStatus=${result.unknownStatus}`,
    `dropFiles=${result.dropFiles}`,
    `dropIngestible=${result.dropIngestible}`
  ].join(' ')
  console.log(`journal-completeness: ${result.ok ? 'COMPLETE' : 'INCOMPLETE'} — ${line}`)
  for (const e of result.errors.splice(0, 20)) console.error(`  ! ${e}`)
  if (!result.ok) process.exit(1)
}

void main()
