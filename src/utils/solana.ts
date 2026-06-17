import { PublicKey } from '@solana/web3.js'
import bs58 from 'bs58'

export function isSolanaWalletAddress(input: string): boolean {
  try {
    const publicKey = PublicKey.isOnCurve(input)
    return Boolean(publicKey)
  } catch {
    return false
  }
}

export function isSolanaPubKey(input: string): boolean {
  try {
    const publicKey = new PublicKey(input)
    return Boolean(publicKey)
  } catch {
    return false
  }
}

export function isValidSolanaTxSignature(sig: string): boolean {
  try {
    const decoded = bs58.decode(sig)
    return decoded.length === 64
  } catch {
    return false
  }
}

export function isValidSolanaInstruction(input: string): boolean {
  try {
    const raw = Buffer.from(input, 'base64')
    if (raw.length < 10) {
      return false
    }
    return true
  } catch {
    return false
  }
}
