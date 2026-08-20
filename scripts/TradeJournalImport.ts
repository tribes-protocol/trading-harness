#!/usr/bin/env bun
/**
 * Trade-journal import — idempotent backfill from the drop dir.
 *
 * Scans /root/workspace/evidence/trade-reports/ for *.json conforming to the
 * ingest schema (eng-head/shared/trade-journal-ingest-schema.md), upserts each
 * into the SQLite trades table, id-keyed. Re-running never duplicates.
 *
 * Invoke: bun scripts/TradeJournalImport.ts [dbPath] [dropDir]
 */
import { readdirSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { JournalService } from '@/services/JournalService'
import { JournalInsertInputSchema, type JournalImportResult } from '@/types/Journal'

const DB_PATH = process.argv[2] ?? resolve('/root/workspace/data/trade-journal.sqlite')
const DROP_DIR = process.argv[3] ?? resolve('/root/workspace/evidence/trade-reports')

const journal = new JournalService({ dbPath: DB_PATH })

function importFile(file: string, result: JournalImportResult): void {
  try {
    const raw = JSON.parse(readFileSync(resolve(DROP_DIR, file), 'utf8')) as unknown
    const input = JournalInsertInputSchema.parse(raw)
    journal.upsert(input)
    result.inserted += 1
  } catch (err) {
    // A malformed file must not fail the whole import — report and skip.
    result.skipped += 1
    console.error(`import skip ${file}: ${err instanceof Error ? err.message : String(err)}`)
  }
}

const result: JournalImportResult = { inserted: 0, updated: 0, skipped: 0, file: DROP_DIR }
let files: string[] = []
try {
  files = readdirSync(DROP_DIR).filter((f) => f.endsWith('.json'))
} catch {
  console.error(`drop dir missing: ${DROP_DIR}`)
  files = []
}
for (const file of files) importFile(file, result)
console.log(JSON.stringify(result))
