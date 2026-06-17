#!/usr/bin/env node

import { Command } from 'commander'

import { API_BASE_URL, API_BEARER_TOKEN, PRIVY_APP_ID } from '@/common/env'
import { WEB3_CLIENT } from '@/common/Web3'
import { writeOutput } from '@/helpers/WriteOutput'
import { TransactionService } from '@/services/TransactionService'
import {
  EthCallsCommandOptionsSchema,
  EthTransactionCommandOptionsSchema,
  SolTransactionCommandOptionsSchema,
  TransactionStatusCommandOptionsSchema
} from '@/types/Transaction'
import { ensureJsonTreeString } from '@/utils/lang'

const VERSION = '1.0.0'

const program = new Command()
const transactionService = new TransactionService({
  apiBaseUrl: API_BASE_URL,
  apiBearerToken: API_BEARER_TOKEN,
  privyAppId: PRIVY_APP_ID
})

program.name('transaction-cli').description('Privy transaction CLI').version(VERSION)

program
  .command('sendEthTransaction')
  .description('Send an EVM transaction via Privy eth_sendTransaction')
  .requiredOption('--chain-id <chainId>', 'EVM chain id (e.g. 1, 8453, 42161)')
  .requiredOption('--to <address>', 'Recipient EVM address')
  .requiredOption('--value <value>', 'Value in wei, for example 1000000000000000000')
  .option('--data <hexData>', 'Hex calldata, defaults to 0x')
  .option('--from <address>', 'Optional from address')
  .requiredOption('--wallet-id <walletId>', 'Privy wallet id')
  .requiredOption('--private-key-pem <privateKeyPem>', 'Privy authorization private key')
  .option('--out <file>', 'Write output JSON to file')
  .action(async (options: unknown): Promise<void> => {
    const request = EthTransactionCommandOptionsSchema.parse(options)
    const response = await transactionService.sendEthTransaction({
      txData: request,
      walletId: request.walletId,
      privateKeyPem: request.privateKeyPem
    })
    const output = ensureJsonTreeString(response)
    await writeOutput({
      output,
      outPath: request.out ?? undefined
    })
  })

program
  .command('sendCalls')
  .description('Send a batch of EVM calls atomically via Privy wallet_sendCalls (EIP-5792)')
  .requiredOption('--chain-id <chainId>', 'EVM chain id shared by every call (e.g. 8453)')
  .requiredOption(
    '--calls <json>',
    'JSON array of calls: [{"to":"0x..","value":"<wei>","data":"0x.."}]'
  )
  .requiredOption('--wallet-id <walletId>', 'Privy wallet id')
  .requiredOption('--private-key-pem <privateKeyPem>', 'Privy authorization private key')
  .option('--out <file>', 'Write output JSON to file')
  .action(async (options: unknown): Promise<void> => {
    const request = EthCallsCommandOptionsSchema.parse(options)
    const calls = request.calls.map((call) => ({
      chainId: request.chainId,
      to: call.to,
      data: call.data,
      value: call.value
    }))
    const response = await transactionService.sendCalls({
      calls,
      walletId: request.walletId,
      privateKeyPem: request.privateKeyPem
    })
    const output = ensureJsonTreeString(response)
    await writeOutput({
      output,
      outPath: request.out ?? undefined
    })
  })

program
  .command('sendSolTransaction')
  .description('Send a Solana transaction via Privy signAndSendTransaction')
  .requiredOption('--transaction <instruction>', 'Serialized transaction string')
  .requiredOption('--wallet-id <walletId>', 'Privy wallet id')
  .requiredOption('--private-key-pem <privateKeyPem>', 'Privy authorization private key')
  .option('--out <file>', 'Write output JSON to file')
  .action(async (options: unknown): Promise<void> => {
    const request = SolTransactionCommandOptionsSchema.parse(options)
    const response = await transactionService.sendSolTransaction({
      transaction: request.transaction,
      walletId: request.walletId,
      privateKeyPem: request.privateKeyPem
    })
    const output = ensureJsonTreeString(response)
    await writeOutput({
      output,
      outPath: request.out ?? undefined
    })
  })

program
  .command('getTransactionStatus')
  .description('Get cross-chain transaction status')
  .requiredOption('--chain-id <chainId>', 'Chain id (e.g. 1, 8453, 42161, solana)')
  .requiredOption('--hash <hash>', 'Transaction hash/signature')
  .option('--timestamp <timestamp>', 'Original transaction timestamp in ms')
  .option('--check-safe-confirmations', 'Check if transaction is confirmed')
  .option('--out <file>', 'Write output JSON to file')
  .action(async (options: unknown): Promise<void> => {
    const request = TransactionStatusCommandOptionsSchema.parse(options)
    const status = await WEB3_CLIENT.getTransactionStatus(request.chainId, request.hash, {
      timestamp: request.timestamp ?? undefined,
      checkSafeConfirmations: request.checkSafeConfirmations ?? undefined
    })
    const output = ensureJsonTreeString(status)
    await writeOutput({
      output,
      outPath: request.out ?? undefined
    })
  })

async function main(): Promise<void> {
  await program.parseAsync(process.argv)
}

void main().catch((error: unknown) => {
  if (error instanceof Error) {
    process.stderr.write(`${error.message}\n`)
  } else {
    process.stderr.write('Unknown error\n')
  }
  process.exit(1)
})
