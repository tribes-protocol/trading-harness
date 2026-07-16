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

import { buildHyperliquidCommand } from '@/cli/Hyperliquid'
import { buildLoginCommand } from '@/cli/Login'
import { buildMacrosCommand } from '@/cli/Macros'
import { buildMarketDataCommand } from '@/cli/MarketData'
import { buildNewsCommand } from '@/cli/News'
import { buildOnchainCommand } from '@/cli/Onchain'
import { buildPredictionCommand } from '@/cli/Prediction'
import { buildSmartMoneyCommand } from '@/cli/SmartMoney'
import { buildSpotTradingCommand } from '@/cli/SpotTrading'
import { buildStocksCommand } from '@/cli/Stocks'
import { buildTechnicalsCommand } from '@/cli/Technicals'
import { buildTokenCommand } from '@/cli/Token'
import { buildTransactionCommand } from '@/cli/Transaction'
import { buildWalletCommand } from '@/cli/Wallet'
import { buildWebSearchCommand } from '@/cli/WebSearch'
import { KNOWN_SECRET_VALUES } from '@/common/Env'
import { redactSecrets } from '@/helpers/ProviderHttp'

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
  program.addCommand(buildNewsCommand())
  program.addCommand(buildMacrosCommand())
  program.addCommand(buildTokenCommand())
  program.addCommand(buildWebSearchCommand())
  program.addCommand(buildPredictionCommand())
  program.addCommand(buildMarketDataCommand())
  program.addCommand(buildStocksCommand())
  program.addCommand(buildTechnicalsCommand())
  program.addCommand(buildOnchainCommand())
  program.addCommand(buildSmartMoneyCommand())

  program.addCommand(buildLoginCommand())

  return program
}

async function runCli(): Promise<void> {
  const program = buildTribesCli()
  await program.parseAsync(process.argv)
}

void runCli().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : 'Unknown error'
  process.stderr.write(`${redactSecrets(message, KNOWN_SECRET_VALUES)}\n`)
  process.exit(1)
})
