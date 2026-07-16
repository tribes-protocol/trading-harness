import { mainnet } from 'viem/chains'
import { normalize } from 'viem/ens'

import { EVM_REGISTRY } from '@/common/Web3'
import { type EnsResolution, EnsResolutionSchema } from '@/types/Ens'
import { isNullish } from '@/utils/Lang'

// Direct ENS resolution on Ethereum mainnet via the existing viem public
// client (proxy RPC with Alchemy fallback) — no external agent involved.

export async function resolveEnsName(name: string): Promise<EnsResolution> {
  const client = EVM_REGISTRY.getPublicClient(mainnet.id)
  const address = await client.getEnsAddress({ name: normalize(name) })
  return EnsResolutionSchema.parse({
    source: 'ens-mainnet',
    query: name,
    address: address ?? null,
    name: isNullish(address) ? null : name,
    resolved: !isNullish(address)
  })
}

export async function lookupEnsAddress(address: `0x${string}`): Promise<EnsResolution> {
  const client = EVM_REGISTRY.getPublicClient(mainnet.id)
  const name = await client.getEnsName({ address })
  return EnsResolutionSchema.parse({
    source: 'ens-mainnet',
    query: address,
    address,
    name: name ?? null,
    resolved: !isNullish(name)
  })
}
