import { Command } from 'commander'

import { API_BASE_URL, API_BEARER_TOKEN, PRIVY_APP_ID } from '@/common/Env'
import { writeOutput } from '@/helpers/WriteOutput'
import {
  HyperliquidOrderBookCommandOptionsSchema,
  HyperliquidService
} from '@/services/HyperliquidService'
import { TransactionService } from '@/services/TransactionService'
import {
  HyperliquidAdjustMarginCommandOptionsSchema,
  HyperliquidCancelOrderCommandOptionsSchema,
  HyperliquidCandlesCommandOptionsSchema,
  HyperliquidDepositCommandOptionsSchema,
  HyperliquidDexCashTransferCommandOptionsSchema,
  HyperliquidFundingHistoryCommandOptionsSchema,
  HyperliquidLedgerCommandOptionsSchema,
  HyperliquidListAssetsCommandOptionsSchema,
  HyperliquidListBalancesCommandOptionsSchema,
  HyperliquidListExchangesCommandOptionsSchema,
  HyperliquidListFillsCommandOptionsSchema,
  HyperliquidListOpenOrdersCommandOptionsSchema,
  HyperliquidListPositionsCommandOptionsSchema,
  HyperliquidOrderStatusCommandOptionsSchema,
  HyperliquidPerpTradeCommandOptionsSchema,
  HyperliquidPortfolioCommandOptionsSchema,
  HyperliquidPredictedFundingsCommandOptionsSchema,
  HyperliquidRateLimitCommandOptionsSchema,
  HyperliquidScaleOrderCommandOptionsSchema,
  HyperliquidSetLeverageCommandOptionsSchema,
  HyperliquidSpotCancelOrderCommandOptionsSchema,
  HyperliquidSpotScaleOrderCommandOptionsSchema,
  HyperliquidSpotTradeCommandOptionsSchema,
  HyperliquidSpotTransferCommandOptionsSchema,
  HyperliquidSpotTwapCancelCommandOptionsSchema,
  HyperliquidSpotTwapOrderCommandOptionsSchema,
  HyperliquidTwapCancelCommandOptionsSchema,
  HyperliquidTwapOrderCommandOptionsSchema,
  HyperliquidUsdClassTransferCommandOptionsSchema,
  HyperliquidUsdTransferCommandOptionsSchema,
  HyperliquidUserFeesCommandOptionsSchema,
  HyperliquidWithdrawCommandOptionsSchema
} from '@/types/Hyperliquid'
import { ensureJsonTreeString, isNullish } from '@/utils/Lang'

const VERSION = '1.0.0'

const DEFAULT_ORDER_BOOK_DEPTH = 10

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
    .description('List open perp positions and active TWAP orders for a Hyperliquid account')
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
    .command('list-open-orders')
    .description('List open resting orders (perp and spot) for a Hyperliquid account')
    .requiredOption('--address <address>', 'Hyperliquid account address to inspect')
    .option('--dex <dex>', 'Perp dex name (main by default); spot orders appear on main only')
    .option('--all-dexes', 'Sweep main and every perp dex')
    .option('--out <file>', 'Write output JSON to file')
    .action(async (options: unknown): Promise<void> => {
      const request = HyperliquidListOpenOrdersCommandOptionsSchema.parse(options)
      const response = await hyperliquidService.listOpenOrders({
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
    .command('list-fills')
    .description('List trade fills for a Hyperliquid account')
    .requiredOption('--address <address>', 'Hyperliquid account address to inspect')
    .option(
      '--start-time <ms>',
      'Start time in milliseconds (inclusive); omit for up to 2000 most recent fills'
    )
    .option('--end-time <ms>', 'End time in milliseconds (inclusive); requires --start-time')
    .option('--aggregate-by-time', 'Combine partial fills from the same crossing order')
    .option(
      '--reversed',
      'Return newest fills first (only with --start-time; default is oldest first)'
    )
    .option('--out <file>', 'Write output JSON to file')
    .action(async (options: unknown): Promise<void> => {
      const request = HyperliquidListFillsCommandOptionsSchema.parse(options)
      const response = await hyperliquidService.listFills({
        address: request.address,
        startTime: request.startTime,
        endTime: request.endTime,
        aggregateByTime: request.aggregateByTime,
        reversed: request.reversed
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
    .option('--all-dexes', 'Sweep main and every perp dex; ignored when --market spot')
    .option('--out <file>', 'Write output JSON to file')
    .action(async (options: unknown): Promise<void> => {
      const request = HyperliquidListAssetsCommandOptionsSchema.parse(options)
      const response =
        request.market === 'spot'
          ? await hyperliquidService.listSpotAssets()
          : request.allDexes
            ? await hyperliquidService.listAllPerpAssets()
            : await hyperliquidService.listPerpAssets(request.dex)
      const output = ensureJsonTreeString(response)
      await writeOutput({
        output,
        outPath: request.out ?? undefined
      })
    })

  program
    .command('order-book')
    .description('L2 order book snapshot for a perp coin')
    .requiredOption('--coin <coin>', 'Perp symbol (for example: BTC, ETH)')
    .option('--depth <levels>', 'Levels per side, 1-20 (default 10)', (value) => Number(value))
    .option('--dex <dex>', 'Perp dex name (main by default)')
    .option('--out <file>', 'Write output JSON to file')
    .action(async (options: unknown): Promise<void> => {
      const request = HyperliquidOrderBookCommandOptionsSchema.parse(options)
      const response = await hyperliquidService.getOrderBook({
        coin: request.coin,
        depth: request.depth ?? DEFAULT_ORDER_BOOK_DEPTH,
        dex: request.dex
      })
      const output = ensureJsonTreeString(response)
      await writeOutput({
        output,
        outPath: request.out ?? undefined
      })
    })

  program
    .command('order-status')
    .description('Look up one order by order id or client order id (cloid)')
    .requiredOption('--address <address>', 'Hyperliquid account address that placed the order')
    .option('--oid <oid>', 'Order id (exactly one of --oid | --cloid)')
    .option(
      '--cloid <cloid>',
      'Client order id: 0x + 32 hex chars (exactly one of --oid | --cloid)'
    )
    .option('--out <file>', 'Write output JSON to file')
    .action(async (options: unknown): Promise<void> => {
      const request = HyperliquidOrderStatusCommandOptionsSchema.parse(options)
      const response = await hyperliquidService.getOrderStatus({
        address: request.address,
        oid: request.oid,
        cloid: request.cloid
      })
      const output = ensureJsonTreeString(response)
      await writeOutput({
        output,
        outPath: request.out ?? undefined
      })
    })

  program
    .command('funding-history')
    .description('Historical funding rate records for a perp coin')
    .requiredOption('--coin <coin>', 'Perp symbol (for example: BTC, ETH)')
    .requiredOption('--start-time <ms>', 'Start time in milliseconds (inclusive)')
    .option('--end-time <ms>', 'End time in milliseconds (inclusive)')
    .option('--dex <dex>', 'Perp dex name (main by default)')
    .option('--out <file>', 'Write output JSON to file')
    .action(async (options: unknown): Promise<void> => {
      const request = HyperliquidFundingHistoryCommandOptionsSchema.parse(options)
      const response = await hyperliquidService.getFundingHistory({
        coin: request.coin,
        startTime: request.startTime,
        endTime: request.endTime,
        dex: request.dex
      })
      const output = ensureJsonTreeString(response)
      await writeOutput({
        output,
        outPath: request.out ?? undefined
      })
    })

  program
    .command('predicted-fundings')
    .description('Predicted funding rates per coin across venues')
    .option('--out <file>', 'Write output JSON to file')
    .action(async (options: unknown): Promise<void> => {
      const request = HyperliquidPredictedFundingsCommandOptionsSchema.parse(options)
      const response = await hyperliquidService.getPredictedFundings()
      const output = ensureJsonTreeString(response)
      await writeOutput({
        output,
        outPath: request.out ?? undefined
      })
    })

  program
    .command('candles')
    .description('Candlestick snapshot for a perp coin')
    .requiredOption('--coin <coin>', 'Perp symbol (for example: BTC, ETH)')
    .requiredOption(
      '--interval <interval>',
      'Candle interval: 1m | 3m | 5m | 15m | 30m | 1h | 2h | 4h | 8h | 12h | 1d | 3d | 1w | 1M'
    )
    .requiredOption('--start-time <ms>', 'Start time in milliseconds (inclusive)')
    .option('--end-time <ms>', 'End time in milliseconds (inclusive)')
    .option('--dex <dex>', 'Perp dex name (main by default)')
    .option('--out <file>', 'Write output JSON to file')
    .action(async (options: unknown): Promise<void> => {
      const request = HyperliquidCandlesCommandOptionsSchema.parse(options)
      const response = await hyperliquidService.getCandles({
        coin: request.coin,
        interval: request.interval,
        startTime: request.startTime,
        endTime: request.endTime,
        dex: request.dex
      })
      const output = ensureJsonTreeString(response)
      await writeOutput({
        output,
        outPath: request.out ?? undefined
      })
    })

  program
    .command('portfolio')
    .description('Portfolio period buckets (account value, pnl, volume) for a Hyperliquid account')
    .requiredOption('--address <address>', 'Hyperliquid account address to inspect')
    .option('--out <file>', 'Write output JSON to file')
    .action(async (options: unknown): Promise<void> => {
      const request = HyperliquidPortfolioCommandOptionsSchema.parse(options)
      const response = await hyperliquidService.getPortfolio({
        address: request.address
      })
      const output = ensureJsonTreeString(response)
      await writeOutput({
        output,
        outPath: request.out ?? undefined
      })
    })

  program
    .command('ledger')
    .description(
      'Non-funding ledger updates (deposits, withdrawals, transfers) for a Hyperliquid account'
    )
    .requiredOption('--address <address>', 'Hyperliquid account address to inspect')
    .option('--start-time <ms>', 'Start time in milliseconds (inclusive)')
    .option('--end-time <ms>', 'End time in milliseconds (inclusive)')
    .option('--out <file>', 'Write output JSON to file')
    .action(async (options: unknown): Promise<void> => {
      const request = HyperliquidLedgerCommandOptionsSchema.parse(options)
      const response = await hyperliquidService.getLedgerUpdates({
        address: request.address,
        startTime: request.startTime,
        endTime: request.endTime
      })
      const output = ensureJsonTreeString(response)
      await writeOutput({
        output,
        outPath: request.out ?? undefined
      })
    })

  program
    .command('user-fees')
    .description('Fee rates and 14-day volume for a Hyperliquid account')
    .requiredOption('--address <address>', 'Hyperliquid account address to inspect')
    .option('--out <file>', 'Write output JSON to file')
    .action(async (options: unknown): Promise<void> => {
      const request = HyperliquidUserFeesCommandOptionsSchema.parse(options)
      const response = await hyperliquidService.getUserFees({
        address: request.address
      })
      const output = ensureJsonTreeString(response)
      await writeOutput({
        output,
        outPath: request.out ?? undefined
      })
    })

  program
    .command('rate-limit')
    .description('API rate-limit usage (cumulative volume, requests used/cap) for an account')
    .requiredOption('--address <address>', 'Hyperliquid account address to inspect')
    .option('--out <file>', 'Write output JSON to file')
    .action(async (options: unknown): Promise<void> => {
      const request = HyperliquidRateLimitCommandOptionsSchema.parse(options)
      const response = await hyperliquidService.getRateLimit({
        address: request.address
      })
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
    .command('set-leverage')
    .description('Update leverage on a perp without placing an order')
    .requiredOption('--from <address>', 'Signer EVM address (Privy wallet)')
    .requiredOption('--coin <coin>', 'Perp symbol (for example: BTC, ETH)')
    .requiredOption('--leverage <leverage>', 'Target leverage (integer)')
    .option('--margin-mode <mode>', 'Margin mode: cross | isolated', 'cross')
    .option('--dex <dex>', 'Perp dex name (main by default)')
    .requiredOption('--wallet-id <walletId>', 'Privy wallet id')
    .option('--out <file>', 'Write output JSON to file')
    .action(async (options: unknown): Promise<void> => {
      const request = HyperliquidSetLeverageCommandOptionsSchema.parse(options)
      const response = await hyperliquidService.setLeverage({
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
    .command('adjust-margin')
    .description('Add or remove isolated margin on an open perp position')
    .requiredOption('--from <address>', 'Signer EVM address (Privy wallet)')
    .requiredOption('--coin <coin>', 'Perp symbol (for example: BTC, ETH)')
    .requiredOption('--amount <amount>', 'Margin delta in USDC (decimal units)')
    .requiredOption('--side <side>', 'Position side: long | short')
    .option('--direction <direction>', 'Margin direction: add | remove', 'add')
    .option('--dex <dex>', 'Perp dex name (main by default)')
    .requiredOption('--wallet-id <walletId>', 'Privy wallet id')
    .option('--out <file>', 'Write output JSON to file')
    .action(async (options: unknown): Promise<void> => {
      const request = HyperliquidAdjustMarginCommandOptionsSchema.parse(options)
      const response = await hyperliquidService.adjustMargin({
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
    .command('twap-perp')
    .description('Place a TWAP perp order on Hyperliquid (slices the order over a duration)')
    .requiredOption('--from <address>', 'Signer EVM address (Privy wallet)')
    .requiredOption('--coin <coin>', 'Perp symbol (for example: BTC, ETH)')
    .requiredOption('--amount <amount>', 'Total order size in base units')
    .requiredOption('--side <side>', 'Order side: long | short')
    .requiredOption('--duration-minutes <minutes>', 'TWAP duration in minutes (5-1440)')
    .option('--randomize', 'Randomize sub-order timing')
    .option('--reduce-only', 'Place reduce-only order')
    .option('--margin-mode <mode>', 'Margin mode: cross | isolated', 'cross')
    .option('--leverage <leverage>', 'Set leverage before order (integer)')
    .option('--dex <dex>', 'Perp dex name (main by default)')
    .requiredOption('--wallet-id <walletId>', 'Privy wallet id')
    .option('--out <file>', 'Write output JSON to file')
    .action(async (options: unknown): Promise<void> => {
      const request = HyperliquidTwapOrderCommandOptionsSchema.parse(options)
      const response = await hyperliquidService.twapPerp({
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
    .command('twap-spot')
    .description('Place a TWAP spot order on Hyperliquid (slices the order over a duration)')
    .requiredOption('--from <address>', 'Signer EVM address (Privy wallet)')
    .requiredOption('--pair <pair>', 'Spot pair (for example: HYPE/USDC)')
    .requiredOption('--amount <amount>', 'Total order size in base units')
    .requiredOption('--side <side>', 'Order side: buy | sell')
    .requiredOption('--duration-minutes <minutes>', 'TWAP duration in minutes (5-1440)')
    .option('--randomize', 'Randomize sub-order timing')
    .requiredOption('--wallet-id <walletId>', 'Privy wallet id')
    .option('--out <file>', 'Write output JSON to file')
    .action(async (options: unknown): Promise<void> => {
      const request = HyperliquidSpotTwapOrderCommandOptionsSchema.parse(options)
      const response = await hyperliquidService.twapSpot({
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
    .command('twap-cancel')
    .description('Cancel a running TWAP perp order on Hyperliquid')
    .requiredOption('--from <address>', 'Signer EVM address (Privy wallet)')
    .requiredOption('--coin <coin>', 'Perp symbol the TWAP was placed on')
    .requiredOption('--twap-id <twapId>', 'TWAP id returned when the order was placed')
    .option('--dex <dex>', 'Perp dex name (main by default)')
    .requiredOption('--wallet-id <walletId>', 'Privy wallet id')
    .option('--out <file>', 'Write output JSON to file')
    .action(async (options: unknown): Promise<void> => {
      const request = HyperliquidTwapCancelCommandOptionsSchema.parse(options)
      const response = await hyperliquidService.twapCancel({
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
    .command('twap-cancel-spot')
    .description('Cancel a running TWAP spot order on Hyperliquid')
    .requiredOption('--from <address>', 'Signer EVM address (Privy wallet)')
    .requiredOption('--pair <pair>', 'Spot pair the TWAP was placed on (for example: HYPE/USDC)')
    .requiredOption('--twap-id <twapId>', 'TWAP id returned when the order was placed')
    .requiredOption('--wallet-id <walletId>', 'Privy wallet id')
    .option('--out <file>', 'Write output JSON to file')
    .action(async (options: unknown): Promise<void> => {
      const request = HyperliquidSpotTwapCancelCommandOptionsSchema.parse(options)
      const response = await hyperliquidService.twapCancelSpot({
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
    .command('cancel-order')
    .description('Cancel a resting perp order on Hyperliquid by order id or cloid')
    .requiredOption('--from <address>', 'Signer EVM address (Privy wallet)')
    .requiredOption('--coin <coin>', 'Perp symbol the order was placed on')
    .option('--order-id <orderId>', 'Order id (exactly one of --order-id | --cloid)')
    .option(
      '--cloid <cloid>',
      'Client order id: 0x + 32 hex chars (exactly one of --order-id | --cloid)'
    )
    .option('--dex <dex>', 'Perp dex name (main by default)')
    .requiredOption('--wallet-id <walletId>', 'Privy wallet id')
    .option('--out <file>', 'Write output JSON to file')
    .action(async (options: unknown): Promise<void> => {
      const request = HyperliquidCancelOrderCommandOptionsSchema.parse(options)
      const response = await hyperliquidService.cancelOrder({
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
    .command('cancel-order-spot')
    .description('Cancel a resting spot order on Hyperliquid by order id or cloid')
    .requiredOption('--from <address>', 'Signer EVM address (Privy wallet)')
    .requiredOption('--pair <pair>', 'Spot pair the order was placed on (for example: HYPE/USDC)')
    .option('--order-id <orderId>', 'Order id (exactly one of --order-id | --cloid)')
    .option(
      '--cloid <cloid>',
      'Client order id: 0x + 32 hex chars (exactly one of --order-id | --cloid)'
    )
    .requiredOption('--wallet-id <walletId>', 'Privy wallet id')
    .option('--out <file>', 'Write output JSON to file')
    .action(async (options: unknown): Promise<void> => {
      const request = HyperliquidSpotCancelOrderCommandOptionsSchema.parse(options)
      const response = await hyperliquidService.cancelOrderSpot({
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
    .command('scale-spot')
    .description(
      'Place a scale (ladder) spot order on Hyperliquid — N limit orders evenly spaced across a price range'
    )
    .requiredOption('--from <address>', 'Signer EVM address (Privy wallet)')
    .requiredOption('--pair <pair>', 'Spot pair (for example: HYPE/USDC)')
    .requiredOption('--amount <amount>', 'Total order size in base units (split across legs)')
    .requiredOption('--side <side>', 'Order side: buy | sell')
    .requiredOption('--start-px <price>', 'Start of the price range (first leg price)')
    .requiredOption('--end-px <price>', 'End of the price range (last leg price)')
    .requiredOption('--orders <count>', 'Number of limit legs (2-50)')
    .option('--size-skew <ratio>', 'Size ratio from first to last leg (1 = uniform)', '1')
    .option('--tif <tif>', 'Time in force for all legs: Gtc | Ioc | Alo', 'Gtc')
    .requiredOption('--wallet-id <walletId>', 'Privy wallet id')
    .option('--out <file>', 'Write output JSON to file')
    .action(async (options: unknown): Promise<void> => {
      const request = HyperliquidSpotScaleOrderCommandOptionsSchema.parse(options)
      const response = await hyperliquidService.scaleSpot({
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
    .command('scale-perp')
    .description(
      'Place a scale (ladder) perp order on Hyperliquid — N limit orders evenly spaced across a price range'
    )
    .requiredOption('--from <address>', 'Signer EVM address (Privy wallet)')
    .requiredOption('--coin <coin>', 'Perp symbol (for example: BTC, ETH)')
    .requiredOption('--amount <amount>', 'Total order size in base units (split across legs)')
    .requiredOption('--side <side>', 'Order side: long | short')
    .requiredOption('--start-px <price>', 'Start of the price range (first leg price)')
    .requiredOption('--end-px <price>', 'End of the price range (last leg price)')
    .requiredOption('--orders <count>', 'Number of limit legs (2-50)')
    .option('--size-skew <ratio>', 'Size ratio from first to last leg (1 = uniform)', '1')
    .option('--tif <tif>', 'Time in force for all legs: Gtc | Ioc | Alo', 'Gtc')
    .option('--reduce-only', 'Place reduce-only orders')
    .option('--margin-mode <mode>', 'Margin mode: cross | isolated', 'cross')
    .option('--leverage <leverage>', 'Set leverage before order (integer)')
    .option('--dex <dex>', 'Perp dex name (main by default)')
    .requiredOption('--wallet-id <walletId>', 'Privy wallet id')
    .option('--out <file>', 'Write output JSON to file')
    .action(async (options: unknown): Promise<void> => {
      const request = HyperliquidScaleOrderCommandOptionsSchema.parse(options)
      const response = await hyperliquidService.scalePerp({
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
    .option('--cloid <cloid>', 'Client order id for the entry order: 0x + 32 hex chars')
    .option('--dex <dex>', 'Perp dex name (main by default)')
    .requiredOption('--wallet-id <walletId>', 'Privy wallet id')
    .option('--out <file>', 'Write output JSON to file')
    .action(async (options: unknown): Promise<void> => {
      const request = HyperliquidPerpTradeCommandOptionsSchema.parse(options)
      const response = await hyperliquidService.tradePerp({
        request,
        walletId: request.walletId
      })
      const output = ensureJsonTreeString(
        isNullish(request.cloid) ? response : { ...response, cloid: request.cloid }
      )
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
    .option('--cloid <cloid>', 'Client order id: 0x + 32 hex chars')
    .requiredOption('--wallet-id <walletId>', 'Privy wallet id')
    .option('--out <file>', 'Write output JSON to file')
    .action(async (options: unknown): Promise<void> => {
      const request = HyperliquidSpotTradeCommandOptionsSchema.parse(options)
      const response = await hyperliquidService.tradeSpot({
        request,
        walletId: request.walletId
      })
      const output = ensureJsonTreeString(
        isNullish(request.cloid) ? response : { ...response, cloid: request.cloid }
      )
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
