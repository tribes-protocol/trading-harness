import { mkdtemp, readFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

import {
  coerceExtensionToggles,
  DEFAULT_TOGGLES,
  parseToggleArg,
  readExtensionToggles,
  writeExtensionToggle
} from '../../.pi/extensions/tribes/ExtensionToggles.ts'

describe('extension toggles', () => {
  it('defaults BOTH extensions off — startup enables neither', () => {
    expect(DEFAULT_TOGGLES).toEqual({ hyperliquid: false, wallet: false })
  })

  it('reads the defaults when no state file exists', async () => {
    const cwd = await mkdtemp(join(tmpdir(), 'toggles-'))
    expect(await readExtensionToggles(cwd)).toEqual({ hyperliquid: false, wallet: false })
  })

  it('persists each toggle independently and round-trips', async () => {
    const cwd = await mkdtemp(join(tmpdir(), 'toggles-'))
    expect(await writeExtensionToggle(cwd, 'hyperliquid', true)).toEqual({
      hyperliquid: true,
      wallet: false
    })
    // The other toggle is untouched by a later write…
    expect(await writeExtensionToggle(cwd, 'wallet', true)).toEqual({
      hyperliquid: true,
      wallet: true
    })
    expect(await writeExtensionToggle(cwd, 'hyperliquid', false)).toEqual({
      hyperliquid: false,
      wallet: true
    })
    expect(await readExtensionToggles(cwd)).toEqual({ hyperliquid: false, wallet: true })
    // …and the file is real JSON on disk under runtime/tribes/.
    const raw: unknown = JSON.parse(
      await readFile(join(cwd, 'runtime/tribes/extension-toggles.json'), 'utf8')
    )
    expect(coerceExtensionToggles(raw)).toEqual({ hyperliquid: false, wallet: true })
  })

  it('coerces malformed state back to the off defaults', () => {
    expect(coerceExtensionToggles(null)).toEqual(DEFAULT_TOGGLES)
    expect(coerceExtensionToggles([])).toEqual(DEFAULT_TOGGLES)
    expect(coerceExtensionToggles({ hyperliquid: 'yes', wallet: 1 })).toEqual(DEFAULT_TOGGLES)
    expect(coerceExtensionToggles({ hyperliquid: true })).toEqual({
      hyperliquid: true,
      wallet: false
    })
  })

  it('parses only explicit on/off; anything else is status or rejected', () => {
    expect(parseToggleArg('on')).toBe('on')
    expect(parseToggleArg(' ENABLE ')).toBe('on')
    expect(parseToggleArg('off')).toBe('off')
    expect(parseToggleArg('disable')).toBe('off')
    expect(parseToggleArg('')).toBe('status')
    expect(parseToggleArg('status')).toBe('status')
    expect(parseToggleArg('toggle')).toBeNull()
    expect(parseToggleArg('maybe')).toBeNull()
  })
})
