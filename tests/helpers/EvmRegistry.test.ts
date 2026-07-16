import { mainnet } from 'viem/chains'
import { describe, expect, it } from 'vitest'

import { EvmRegistry } from '@/helpers/EvmRegistry'

describe('EvmRegistry transports', () => {
  it('uses a plain http transport when no fallback URLs are configured', () => {
    const registry = new EvmRegistry([[mainnet, 'https://primary.example.test']])
    const transport = registry.getTransports()[mainnet.id]
    expect(transport).toBeDefined()
    const instance = transport?.({ chain: mainnet })
    expect(instance?.config.type).toBe('http')
  })

  it('uses a fallback transport when fallback URLs are configured', () => {
    const registry = new EvmRegistry([
      [mainnet, 'https://primary.example.test', ['https://fallback.example.test']]
    ])
    const transport = registry.getTransports()[mainnet.id]
    const instance = transport?.({ chain: mainnet })
    expect(instance?.config.type).toBe('fallback')
  })

  it('still reports the primary URL as the chain rpc url', () => {
    const registry = new EvmRegistry([
      [mainnet, 'https://primary.example.test', ['https://fallback.example.test']]
    ])
    expect(registry.getRpcUrl(mainnet.id)).toBe('https://primary.example.test')
  })
})
