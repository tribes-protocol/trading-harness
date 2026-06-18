import { Command } from 'commander'

import { API_BASE_URL, API_BEARER_TOKEN, PRIVY_APP_ID } from '@/common/Env'
import { writeOutput } from '@/helpers/WriteOutput'
import { HyperliquidService } from '@/services/HyperliquidService'
import { TransactionService } from '@/services/TransactionService'
import {
  HyperliquidDepositCommandOptionsSchema,
  HyperliquidDexCashTransferCommandOptionsSchema,
  HyperliquidListAssetsCommandOptionsSchema,
  HyperliquidListBalancesCommandOptionsSchema,
  HyperliquidListExchangesCommandOptionsSchema,
  HyperliquidListPositionsCommandOptionsSchema,
  HyperliquidPerpTradeCommandOptionsSchema,
  HyperliquidSpotTradeCommandOptionsSchema,
  HyperliquidSpotTransferCommandOptionsSchema,
  HyperliquidUsdClassTransferCommandOptionsSchema,
  HyperliquidUsdTransferCommandOptionsSchema,
  HyperliquidWithdrawCommandOptionsSchema
} from '@/types/Hyperliquid'
import { ensureJsonTreeString } from '@/utils/Lang'

const VERSION = '1.0.0'

export function buildHyperliquidCommand(): Command {
  const transactionService = new TransactionService({
    apiBaseUrl: API_BASE_URL,
    apiBearerToken: API_BEARER_TOKEN,
    privyAppId: PRIVY_APP_ID
  })
  const hyperliquidService = new HyperliquidService({
    transaction: transactionService
  })

  const program = new Command('hyperliquid')
  program.description('Execution CLI for Hyperliquid').version(VERSION)

  program
    .command('list-exchanges')
    .description('List Hyperliquid perp dexes (exchanges), including main')
    .option('--out <file>', 'Write output JSON to file')
    .action(async (options: unknown): Promise<void> => {
      const request = HyperliquidListExchangesCommandOptionsSchema.parse(options)
      const response = await hyperliquidService.listExchanges()
      const output = ensureJsonTreeString(response)
      await writeOutput({
        output,
        outPath: request.out ?? undefined
      })
    })

  program
    .command('list-balances')
    .description('List perp and spot balances for a Hyperliquid account')
    .requiredOption('--address <address>', 'Hyperliquid account address to inspect')
    .option('--dex <dex>', 'Perp dex name (main by default)')
    .option('--out <file>', 'Write output JSON to file')
    .action(async (options: unknown): Promise<void> => {
      const request = HyperliquidListBalancesCommandOptionsSchema.parse(options)
      const response = await hyperliquidService.listBalances({
        address: request.address,
        dex: request.dex
      })
      const output = ensureJsonTreeString(response)
      await writeOutput({
        output,
        outPath: request.out ?? undefined
      })
    })

  program
    .command('list-positions')
    .description('List open perp positions for a Hyperliquid account')
    .requiredOption('--address <address>', 'Hyperliquid account address to inspect')
    .option('--dex <dex>', 'Perp dex name (main by default)')
    .option('--all-dexes', 'Sweep main and every perp dex')
    .option('--out <file>', 'Write output JSON to file')
    .action(async (options: unknown): Promise<void> => {
      const request = HyperliquidListPositionsCommandOptionsSchema.parse(options)
      const response = await hyperliquidService.listPositions({
        address: request.address,
        dex: request.dex,
        allDexes: request.allDexes
      })
      const output = ensureJsonTreeString(response)
      await writeOutput({
        output,
        outPath: request.out ?? undefined
      })
    })

  program
    .command('list-assets')
    .description('List tradable assets, optionally scoped to a perp dex or the spot market')
    .option('--dex <dex>', 'Perp dex name (main by default); ignored when --market spot')
    .option('--market <market>', 'Market type: perp | spot', 'perp')
    .option('--out <file>', 'Write output JSON to file')
    .action(async (options: unknown): Promise<void> => {
      const request = HyperliquidListAssetsCommandOptionsSchema.parse(options)
      const response =
        request.market === 'spot'
          ? await hyperliquidService.listSpotAssets()
          : await hyperliquidService.listPerpAssets(request.dex)
      const output = ensureJsonTreeString(response)
      await writeOutput({
        output,
        outPath: request.out ?? undefined
      })
    })

  program
    .command('deposit')
    .description('Deposit Arbitrum native USDC to Hyperliquid bridge')
    .requiredOption('--amount <amount>', 'USDC amount (decimal units)')
    .requiredOption('--from <address>', 'Sender EVM address (Privy wallet)')
    .requiredOption('--wallet-id <walletId>', 'Privy wallet id')
    .option('--out <file>', 'Write output JSON to file')
    .action(async (options: unknown): Promise<void> => {
      const request = HyperliquidDepositCommandOptionsSchema.parse(options)
      const response = await hyperliquidService.deposit({
        amount: request.amount,
        from: request.from,
        walletId: request.walletId
      })
      const output = ensureJsonTreeString(response)
      await writeOutput({
        output,
        outPath: request.out ?? undefined
      })
    })

  program
    .command('withdraw')
    .description('Withdraw USDC from Hyperliquid to an EVM address')
    .requiredOption('--amount <amount>', 'USDC amount (decimal units)')
    .requiredOption('--from <address>', 'Signer EVM address (Privy wallet)')
    .requiredOption('--destination <address>', 'Recipient EVM address')
    .requiredOption('--wallet-id <walletId>', 'Privy wallet id')
    .option('--out <file>', 'Write output JSON to file')
    .action(async (options: unknown): Promise<void> => {
      const request = HyperliquidWithdrawCommandOptionsSchema.parse(options)
      const response = await hyperliquidService.withdraw({
        request,
        walletId: request.walletId
      })
      const output = ensureJsonTreeString(response)
      await writeOutput({
        output,
        outPath: request.out ?? undefined
      })
    })

  program
    .command('trade-perp')
    .description(
      'Place a perpetual order on Hyperliquid; add --tp-px/--sl-px to attach an atomic OCO bracket'
    )
    .requiredOption('--from <address>', 'Signer EVM address (Privy wallet)')
    .requiredOption('--coin <coin>', 'Perp symbol (for example: BTC, ETH)')
    .requiredOption('--amount <amount>', 'Order size in base units')
    .requiredOption('--side <side>', 'Order side: long | short')
    .option(
      '--type <type>',
      'Order type: market | limit | stop_market | stop_limit | take_market | take_limit',
      'market'
    )
    .option('--price <price>', 'Limit price (required when --type limit | stop_limit | take_limit)')
    .option(
      '--trigger-px <price>',
      'Trigger price (required when --type stop_market | stop_limit | take_market | take_limit)'
    )
    .option('--tp-px <price>', 'Bracket take-profit trigger price (market | limit entry only)')
    .option('--sl-px <price>', 'Bracket stop-loss trigger price (market | limit entry only)')
    .option(
      '--tp-limit-px <price>',
      'Optional resting limit price for the TP leg (else market exit)'
    )
    .option(
      '--sl-limit-px <price>',
      'Optional resting limit price for the SL leg (else market exit)'
    )
    .option('--tif <tif>', 'Time in force for limit orders: Gtc | Ioc | Alo', 'Gtc')
    .option('--reduce-only', 'Place reduce-only order')
    .option('--margin-mode <mode>', 'Margin mode: cross | isolated', 'cross')
    .option('--leverage <leverage>', 'Set leverage before order (integer)')
    .option('--dex <dex>', 'Perp dex name (main by default)')
    .requiredOption('--wallet-id <walletId>', 'Privy wallet id')
    .option('--out <file>', 'Write output JSON to file')
    .action(async (options: unknown): Promise<void> => {
      const request = HyperliquidPerpTradeCommandOptionsSchema.parse(options)
      const response = await hyperliquidService.tradePerp({
        request,
        walletId: request.walletId
      })
      const output = ensureJsonTreeString(response)
      await writeOutput({
        output,
        outPath: request.out ?? undefined
      })
    })

  program
    .command('trade-spot')
    .description('Place a spot order on Hyperliquid')
    .requiredOption('--from <address>', 'Signer EVM address (Privy wallet)')
    .requiredOption('--pair <pair>', 'Spot pair (for example: HYPE/USDC)')
    .requiredOption('--amount <amount>', 'Order size in base units')
    .requiredOption('--side <side>', 'Order side: buy | sell')
    .option('--type <type>', 'Order type: market | limit', 'market')
    .option('--price <price>', 'Limit price (required when --type limit)')
    .option('--tif <tif>', 'Time in force for limit orders: Gtc | Ioc | Alo', 'Gtc')
    .requiredOption('--wallet-id <walletId>', 'Privy wallet id')
    .option('--out <file>', 'Write output JSON to file')
    .action(async (options: unknown): Promise<void> => {
      const request = HyperliquidSpotTradeCommandOptionsSchema.parse(options)
      const response = await hyperliquidService.tradeSpot({
        request,
        walletId: request.walletId
      })
      const output = ensureJsonTreeString(response)
      await writeOutput({
        output,
        outPath: request.out ?? undefined
      })
    })

  program
    .command('transfer-usd-class')
    .description('Transfer USDC between spot and perp wallets')
    .requiredOption('--amount <amount>', 'USDC amount (decimal units)')
    .requiredOption('--from <address>', 'Signer EVM address (Privy wallet)')
    .requiredOption('--direction <direction>', 'Transfer direction: spot-to-perp | perp-to-spot')
    .requiredOption('--wallet-id <walletId>', 'Privy wallet id')
    .option('--out <file>', 'Write output JSON to file')
    .action(async (options: unknown): Promise<void> => {
      const request = HyperliquidUsdClassTransferCommandOptionsSchema.parse(options)
      const response = await hyperliquidService.transferUsdClass({
        request,
        walletId: request.walletId
      })
      const output = ensureJsonTreeString(response)
      await writeOutput({
        output,
        outPath: request.out ?? undefined
      })
    })

  program
    .command('transfer-usd')
    .description('Send USDC from perp balance to another Hyperliquid user')
    .requiredOption('--amount <amount>', 'USDC amount (decimal units)')
    .requiredOption('--from <address>', 'Signer EVM address (Privy wallet)')
    .requiredOption('--destination <address>', 'Recipient Hyperliquid account address')
    .requiredOption('--wallet-id <walletId>', 'Privy wallet id')
    .option('--out <file>', 'Write output JSON to file')
    .action(async (options: unknown): Promise<void> => {
      const request = HyperliquidUsdTransferCommandOptionsSchema.parse(options)
      const response = await hyperliquidService.transferUsd({
        request,
        walletId: request.walletId
      })
      const output = ensureJsonTreeString(response)
      await writeOutput({
        output,
        outPath: request.out ?? undefined
      })
    })

  program
    .command('transfer-spot')
    .description('Send spot tokens to another Hyperliquid user')
    .requiredOption('--amount <amount>', 'Token amount (decimal units)')
    .requiredOption('--from <address>', 'Signer EVM address (Privy wallet)')
    .requiredOption('--destination <address>', 'Recipient Hyperliquid account address')
    .requiredOption('--token <token>', 'Spot token identifier (for example: HYPE, USDC)')
    .requiredOption('--wallet-id <walletId>', 'Privy wallet id')
    .option('--out <file>', 'Write output JSON to file')
    .action(async (options: unknown): Promise<void> => {
      const request = HyperliquidSpotTransferCommandOptionsSchema.parse(options)
      const response = await hyperliquidService.transferSpot({
        request,
        walletId: request.walletId
      })
      const output = ensureJsonTreeString(response)
      await writeOutput({
        output,
        outPath: request.out ?? undefined
      })
    })

  program
    .command('transfer-dex-cash')
    .description('Transfer token balances between dexes')
    .requiredOption('--amount <amount>', 'Token amount (decimal units)')
    .requiredOption('--from <address>', 'Signer EVM address (Privy wallet)')
    .requiredOption('--source-dex <dex>', 'Source dex: main | spot | xyz | ...')
    .requiredOption('--destination-dex <dex>', 'Destination dex: main | spot | xyz | ...')
    .option('--token <token>', 'Token identifier (default: USDC)', 'USDC')
    .requiredOption('--wallet-id <walletId>', 'Privy wallet id')
    .option('--out <file>', 'Write output JSON to file')
    .action(async (options: unknown): Promise<void> => {
      const request = HyperliquidDexCashTransferCommandOptionsSchema.parse(options)
      const response = await hyperliquidService.transferDexCash({
        request,
        walletId: request.walletId
      })
      const output = ensureJsonTreeString(response)
      await writeOutput({
        output,
        outPath: request.out ?? undefined
      })
    })

  return program
}
