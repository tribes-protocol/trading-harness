#!/usr/bin/env node

/**
 * `tribes-cli` — the whole trading-harness compiled into one runnable.
 *
 * bootstrap.sh builds this file into a single native binary (`bun build
 * --compile`) and installs it on PATH, so every skill calls
 * `tribes-cli <group> <command> …` instead of `bun src/cli/<Name>.ts …`.
 *
 * Each group is registered from its own `build…Command()` builder.
 */

import { Command } from 'commander'

import { buildAssetCommand } from '@/cli/Asset'
import { buildTokenDataCommand } from '@/cli/BirdeyeData'
import { buildCoinCommand } from '@/cli/Coin'
import { buildEnsCommand } from '@/cli/Ens'
import { buildExchangesCommand } from '@/cli/Exchanges'
import { buildHyperliquidCommand } from '@/cli/Hyperliquid'
import { buildLoginCommand } from '@/cli/Login'
import { buildMacrosCommand } from '@/cli/Macros'
import { buildMarketCommand } from '@/cli/Market'
import { buildNewsCommand } from '@/cli/News'
import { buildNotifyCommand } from '@/cli/Notify'
import { buildOnchainCommand } from '@/cli/Onchain'
import { buildPredictionCommand } from '@/cli/Prediction'
import { buildSmartMoneyCommand } from '@/cli/SmartMoney'
import { buildSpotTradingCommand } from '@/cli/SpotTrading'
import { buildStocksCommand } from '@/cli/Stocks'
import { buildTaCommand } from '@/cli/Ta'
import { buildTokenCommand } from '@/cli/Token'
import { buildTransactionCommand } from '@/cli/Transaction'
import { buildWalletCommand } from '@/cli/Wallet'
import { buildWalletDataCommand } from '@/cli/WalletData'
import { buildWebSearchCommand } from '@/cli/WebSearch'

const VERSION = '1.0.0'

function buildTribesCli(): Command {
  const program = new Command('tribes-cli')
  program
    .description('Unified Tribes trading-harness CLI (wallet, Hyperliquid, research)')
    .version(VERSION)

  // Wallet discovery + on-chain execution.
  program.addCommand(buildWalletCommand())
  program.addCommand(buildHyperliquidCommand())
  program.addCommand(buildTransactionCommand())
  program.addCommand(buildSpotTradingCommand())

  // Market data + research.
  program.addCommand(buildAssetCommand())
  program.addCommand(buildNewsCommand())
  program.addCommand(buildMacrosCommand())
  program.addCommand(buildMarketCommand())
  program.addCommand(buildCoinCommand())
  program.addCommand(buildOnchainCommand())
  program.addCommand(buildExchangesCommand())
  program.addCommand(buildTokenDataCommand())
  program.addCommand(buildSmartMoneyCommand())
  program.addCommand(buildWalletDataCommand())
  program.addCommand(buildStocksCommand())
  program.addCommand(buildEnsCommand())
  program.addCommand(buildTaCommand())
  program.addCommand(buildTokenCommand())
  program.addCommand(buildWebSearchCommand())
  program.addCommand(buildPredictionCommand())

  program.addCommand(buildLoginCommand())

  // Desktop notifications (no network, no auth).
  program.addCommand(buildNotifyCommand())

  return program
}

async function runCli(): Promise<void> {
  const program = buildTribesCli()
  await program.parseAsync(process.argv)
}

void runCli().catch((error: unknown) => {
  process.stderr.write(`${error instanceof Error ? error.message : 'Unknown error'}\n`)
  process.exit(1)
})
