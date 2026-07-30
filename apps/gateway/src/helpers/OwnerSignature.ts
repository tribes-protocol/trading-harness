import { verifyMessage } from 'viem'

import { HexSignatureSchema, OwnerAddressSchema } from '@/types/OwnerAuth'

/**
 * Recover the signer of a personal_sign message and compare it to the owner
 * address. Pure ECDSA over local bytes (Privy embedded wallets are EOAs) — no
 * network, no state — but `verifyMessage` is async, so it lives in helpers/.
 *
 * A thin adapter on purpose: it answers "did THIS address sign THIS text" and
 * nothing else. Whether the text is a challenge this gateway should honour is
 * utils/SandboxChallenge's job.
 */

interface VerifyOwnerSignatureParams {
  message: string
  signature: string
  ownerAddress: string
}

export async function verifyOwnerSignature(params: VerifyOwnerSignatureParams): Promise<boolean> {
  const owner = OwnerAddressSchema.safeParse(params.ownerAddress)
  const signature = HexSignatureSchema.safeParse(params.signature)
  if (!owner.success || !signature.success) {
    return false
  }
  try {
    return await verifyMessage({
      address: owner.data,
      message: params.message,
      signature: signature.data
    })
  } catch {
    // Malformed signature bytes (wrong length, bad recovery id) — not the owner.
    return false
  }
}
