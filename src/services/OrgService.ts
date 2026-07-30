import { readFile } from 'node:fs/promises'
import { basename } from 'node:path'

import type { ZodError } from 'zod'

import type {
  OrgArtifactState,
  OrgEnvelope,
  OrgValidationError,
  OrgValidationResult
} from '@/types/Org'
import { OrgAckSchema, OrgEnvelopeSchema, OrgValidationResultSchema } from '@/types/Org'
import { isRecord, isRequiredString } from '@/utils/Lang'

// States whose charter contract mandates a non-null `expires_at` (a signal's
// validity window, a strategy's horizon, an instruction's TTL).
const EXPIRES_REQUIRED_STATES: readonly OrgArtifactState[] = [
  'validated-signal',
  'approved-strategy',
  'trade-instruction'
]

// Execution-chain states whose file basename must be the artifact's UUIDv4 id
// so the whole chain joins on one key.
const UUID_FILENAME_STATES: readonly OrgArtifactState[] = [
  'trade-instruction',
  'submitting',
  'submitted-order',
  'confirmed-fill',
  'portfolio-position'
]

const UUID_V4_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/

type OrgParsedJson = { ok: true; data: unknown } | { ok: false; error: OrgValidationError }

// Pure local-file validation of org-protocol artifacts and ack sidecars.
// No network, no auth: the artifact on disk is the whole input.
export class OrgService {
  async validateArtifact(filePath: string): Promise<OrgValidationResult> {
    const parsed = await this.readJsonFile(filePath)
    if (!parsed.ok) {
      return this.buildResult({ kind: 'artifact', filePath, errors: [parsed.error] })
    }

    const envelope = OrgEnvelopeSchema.safeParse(parsed.data)
    if (!envelope.success) {
      return this.buildResult({
        kind: 'artifact',
        filePath,
        state: readStringField(parsed.data, 'state'),
        id: readStringField(parsed.data, 'id'),
        errors: zodIssuesToErrors('envelope-schema', envelope.error)
      })
    }

    const errors: OrgValidationError[] = [
      ...checkExpiresRequired(envelope.data),
      ...checkUuidFilename(envelope.data, filePath),
      ...checkSourcesStandards(envelope.data)
    ]
    return this.buildResult({
      kind: 'artifact',
      filePath,
      state: envelope.data.state,
      id: envelope.data.id,
      errors
    })
  }

  async validateAck(filePath: string): Promise<OrgValidationResult> {
    const parsed = await this.readJsonFile(filePath)
    if (!parsed.ok) {
      return this.buildResult({ kind: 'ack', filePath, errors: [parsed.error] })
    }

    const ack = OrgAckSchema.safeParse(parsed.data)
    if (!ack.success) {
      return this.buildResult({
        kind: 'ack',
        filePath,
        errors: zodIssuesToErrors('ack-schema', ack.error)
      })
    }
    return this.buildResult({ kind: 'ack', filePath, errors: [] })
  }

  // Reads and JSON-parses the file. An unreadable path throws (caller error);
  // unparseable content is a structured validation failure, never a crash.
  private async readJsonFile(filePath: string): Promise<OrgParsedJson> {
    let raw: string
    try {
      raw = await readFile(filePath, 'utf8')
    } catch (error: unknown) {
      const detail = error instanceof Error ? error.message : 'unknown error'
      throw new Error(`Cannot read org file '${filePath}': ${detail}`)
    }

    try {
      const data: unknown = JSON.parse(raw)
      return { ok: true, data }
    } catch (error: unknown) {
      const detail = error instanceof Error ? error.message : 'unknown error'
      return { ok: false, error: { rule: 'json-parse', message: `Invalid JSON: ${detail}` } }
    }
  }

  private buildResult(params: {
    readonly kind: 'artifact' | 'ack'
    readonly filePath: string
    readonly state?: string
    readonly id?: string
    readonly errors: OrgValidationError[]
  }): OrgValidationResult {
    return OrgValidationResultSchema.parse({
      valid: params.errors.length === 0,
      kind: params.kind,
      file: params.filePath,
      state: params.state ?? null,
      id: params.id ?? null,
      errors: params.errors
    })
  }
}

function readStringField(data: unknown, key: string): string | undefined {
  if (!isRecord(data)) {
    return undefined
  }
  const value = data[key]
  return isRequiredString(value) && value.length > 0 ? value : undefined
}

function zodIssuesToErrors(rule: string, error: ZodError): OrgValidationError[] {
  return error.issues.map((issue) => {
    const path = issue.path.join('.')
    return { rule, message: path === '' ? issue.message : `${path}: ${issue.message}` }
  })
}

function checkExpiresRequired(envelope: OrgEnvelope): OrgValidationError[] {
  if (!EXPIRES_REQUIRED_STATES.includes(envelope.state)) {
    return []
  }
  if (envelope.expires_at !== null && envelope.expires_at !== undefined) {
    return []
  }
  return [
    {
      rule: 'expires-required',
      message: `state '${envelope.state}' requires a non-null expires_at`
    }
  ]
}

function checkUuidFilename(envelope: OrgEnvelope, filePath: string): OrgValidationError[] {
  if (!UUID_FILENAME_STATES.includes(envelope.state)) {
    return []
  }
  const base = basename(filePath)
  const stem = base.endsWith('.json') ? base.slice(0, -'.json'.length) : base

  const errors: OrgValidationError[] = []
  if (!UUID_V4_PATTERN.test(stem)) {
    errors.push({
      rule: 'uuid-filename',
      message: `state '${envelope.state}' requires a lowercase UUIDv4 filename, got '${base}'`
    })
  }
  if (stem !== envelope.id) {
    errors.push({
      rule: 'uuid-filename',
      message: `filename stem '${stem}' does not match artifact id '${envelope.id}'`
    })
  }
  return errors
}

function checkSourcesStandards(envelope: OrgEnvelope): OrgValidationError[] {
  const errors: OrgValidationError[] = []
  envelope.sources.forEach((source, index) => {
    if (source.source_ts === null || source.source_ts === undefined) {
      return
    }
    if (Date.parse(source.source_ts) > Date.parse(source.retrieved_at)) {
      errors.push({
        rule: 'sources-standards',
        message: `sources.${index}: source_ts '${source.source_ts}' is after retrieved_at '${source.retrieved_at}'`
      })
    }
  })
  return errors
}
