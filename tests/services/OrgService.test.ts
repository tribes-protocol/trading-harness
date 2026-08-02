import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { OrgService } from '@/services/OrgService'
import { ensureJsonTreeString } from '@/utils/Lang'

const INSTRUCTION_UUID = 'a3e27112-385e-436f-bba7-e1253b6d4ed8'
const OTHER_UUID = '0f8fad5b-d9cb-469f-a165-70867728950e'

const HAPPY_SOURCE = {
  provider: 'hyperliquid',
  command: 'tribes-cli hyperliquid list-assets --all-dexes',
  source_ts: '2026-01-01T11:59:40Z',
  retrieved_at: '2026-01-01T12:00:00Z',
  freshness: 'live'
}

const HAPPY_ARTIFACT = {
  id: '20260101T120000Z-btc-funding-dislocation',
  state: 'observation',
  created_at: '2026-01-01T12:00:00Z',
  expires_at: null,
  producer: 'intel-funding-oi',
  sources: [HAPPY_SOURCE],
  upstream: [],
  checks: ['freshness:live'],
  payload: { note: 'BTC funding dislocated vs peers', evidence_type: 'observed' },
  extra_top_level_key: 'the spec is a floor, not a ceiling'
}

describe('OrgService', () => {
  let fixtureDir = ''
  const service = new OrgService()

  beforeEach(async () => {
    fixtureDir = await mkdtemp(join(tmpdir(), 'org-service-'))
  })

  afterEach(async () => {
    await rm(fixtureDir, { recursive: true, force: true })
  })

  async function writeFixture(name: string, content: unknown): Promise<string> {
    const filePath = join(fixtureDir, name)
    await writeFile(filePath, `${ensureJsonTreeString(content)}\n`, 'utf8')
    return filePath
  }

  it('accepts a happy observation artifact (extra top-level keys allowed)', async () => {
    const filePath = await writeFixture(`${HAPPY_ARTIFACT.id}.json`, HAPPY_ARTIFACT)

    const result = await service.validateArtifact(filePath)

    expect(result).toEqual({
      valid: true,
      kind: 'artifact',
      file: filePath,
      state: 'observation',
      id: HAPPY_ARTIFACT.id,
      errors: []
    })
  })

  it('fails a trade-instruction without expires_at with rule expires-required', async () => {
    const filePath = await writeFixture(`${INSTRUCTION_UUID}.json`, {
      ...HAPPY_ARTIFACT,
      id: INSTRUCTION_UUID,
      state: 'trade-instruction',
      expires_at: null,
      producer: 'portfolio-manager'
    })

    const result = await service.validateArtifact(filePath)

    expect(result.valid).toBe(false)
    expect(result.state).toBe('trade-instruction')
    expect(result.errors.map((error) => error.rule)).toEqual(['expires-required'])
  })

  it('accepts a trade-instruction with a TTL and matching uuid filename', async () => {
    const filePath = await writeFixture(`${INSTRUCTION_UUID}.json`, {
      ...HAPPY_ARTIFACT,
      id: INSTRUCTION_UUID,
      state: 'trade-instruction',
      expires_at: '2026-01-01T18:00:00Z',
      producer: 'portfolio-manager'
    })

    const result = await service.validateArtifact(filePath)

    expect(result.valid).toBe(true)
    expect(result.errors).toEqual([])
  })

  it('fails execution-chain states whose filename is not the artifact uuid', async () => {
    const filePath = await writeFixture(`${OTHER_UUID}.json`, {
      ...HAPPY_ARTIFACT,
      id: INSTRUCTION_UUID,
      state: 'submitted-order',
      expires_at: '2026-01-01T18:00:00Z',
      producer: 'execution-runner'
    })

    const result = await service.validateArtifact(filePath)

    expect(result.valid).toBe(false)
    expect(result.errors.map((error) => error.rule)).toEqual(['uuid-filename'])
  })

  it('fails a non-uuid filename on an execution-chain state', async () => {
    const filePath = await writeFixture('not-a-uuid.json', {
      ...HAPPY_ARTIFACT,
      id: INSTRUCTION_UUID,
      state: 'confirmed-fill',
      producer: 'order-monitor'
    })

    const result = await service.validateArtifact(filePath)

    expect(result.valid).toBe(false)
    expect(result.errors.every((error) => error.rule === 'uuid-filename')).toBe(true)
    expect(result.errors.length).toBe(2)
  })

  it('fails a source whose source_ts is after retrieved_at', async () => {
    const filePath = await writeFixture(`${HAPPY_ARTIFACT.id}.json`, {
      ...HAPPY_ARTIFACT,
      sources: [
        HAPPY_SOURCE,
        { ...HAPPY_SOURCE, source_ts: '2026-01-01T12:05:00Z', retrieved_at: '2026-01-01T12:00:00Z' }
      ]
    })

    const result = await service.validateArtifact(filePath)

    expect(result.valid).toBe(false)
    expect(result.errors.map((error) => error.rule)).toEqual(['sources-standards'])
    expect(result.errors[0]?.message).toContain('sources.1')
  })

  it('rejects an unknown state via the envelope schema', async () => {
    const filePath = await writeFixture(`${HAPPY_ARTIFACT.id}.json`, {
      ...HAPPY_ARTIFACT,
      state: 'wishful-thinking'
    })

    const result = await service.validateArtifact(filePath)

    expect(result.valid).toBe(false)
    expect(result.state).toBe('wishful-thinking')
    expect(result.errors.map((error) => error.rule)).toEqual(['envelope-schema'])
  })

  it('fails an ack with verdict reject and no reason', async () => {
    const filePath = await writeFixture(`${HAPPY_ARTIFACT.id}.ack.json`, {
      by: 'execution-lead',
      at: '2026-01-01T12:10:00Z',
      verdict: 'reject'
    })

    const result = await service.validateAck(filePath)

    expect(result.valid).toBe(false)
    expect(result.kind).toBe('ack')
    expect(result.errors.map((error) => error.rule)).toEqual(['ack-schema'])
    expect(result.errors[0]?.message).toContain('reason')
  })

  it('accepts an ack with verdict ack and no reason', async () => {
    const filePath = await writeFixture(`${HAPPY_ARTIFACT.id}.ack.json`, {
      by: 'execution-lead',
      at: '2026-01-01T12:10:00Z',
      verdict: 'ack'
    })

    const result = await service.validateAck(filePath)

    expect(result).toEqual({
      valid: true,
      kind: 'ack',
      file: filePath,
      state: null,
      id: null,
      errors: []
    })
  })

  it('returns a structured json-parse error for malformed JSON instead of throwing', async () => {
    const filePath = join(fixtureDir, 'broken.json')
    await writeFile(filePath, '{ this is not json', 'utf8')

    const result = await service.validateArtifact(filePath)

    expect(result.valid).toBe(false)
    expect(result.state).toBeNull()
    expect(result.id).toBeNull()
    expect(result.errors.map((error) => error.rule)).toEqual(['json-parse'])
  })

  it('throws a clear error for an unreadable path', async () => {
    const filePath = join(fixtureDir, 'does-not-exist.json')

    await expect(service.validateArtifact(filePath)).rejects.toThrow(
      `Cannot read org file '${filePath}'`
    )
  })
})
