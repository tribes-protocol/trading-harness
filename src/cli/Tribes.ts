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

import { buildAlphaScoutCommand } from '@/cli/AlphaScout'
import { buildFundamentalsAnalystCommand } from '@/cli/FundamentalsAnalyst'
import { buildHyperliquidCommand } from '@/cli/Hyperliquid'
import { buildLoginCommand } from '@/cli/Login'
import { buildMacrosCommand } from '@/cli/Macros'
import { buildNewsCommand } from '@/cli/News'
import { buildPredictionCommand } from '@/cli/Prediction'
import { buildSpotTradingCommand } from '@/cli/SpotTrading'
import { buildStockAnalystCommand } from '@/cli/StockAnalyst'
import { buildTokenCommand } from '@/cli/Token'
import { buildTransactionCommand } from '@/cli/Transaction'
import { buildWalletCommand } from '@/cli/Wallet'
import { buildWebSearchCommand } from '@/cli/WebSearch'
import { ANALYSTS } from '@/common/Analysts'
import { buildAnalystCommand } from '@/helpers/AnalystCli'

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
  program.addCommand(buildStockAnalystCommand())
  program.addCommand(buildFundamentalsAnalystCommand())
  program.addCommand(buildAlphaScoutCommand())
  program.addCommand(buildWebSearchCommand())
  program.addCommand(buildPredictionCommand())

  // Specialist analyst agents (alpha-scout, defi-analyst, … wallet-analyst).
  for (const config of Object.values(ANALYSTS)) {
    program.addCommand(buildAnalystCommand(config))
  }

  program.addCommand(buildLoginCommand())

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
