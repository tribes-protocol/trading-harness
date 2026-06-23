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

const VERSION = '1.0.0'

function getRequestedCommand(argv: string[]): string | null {
  for (const arg of argv) {
    if (!arg.startsWith('-')) {
      return arg
    }
  }
  return null
}

async function runLoginCommand(): Promise<void> {
  const loginModule = await import('@/cli/Login')

  const program = new Command('tribes-cli')
  program
    .description('Unified Tribes trading-harness CLI (wallet, Hyperliquid, research)')
    .version(VERSION)

  program.addCommand(loginModule.buildLoginCommand())
  await program.parseAsync(process.argv)
}

async function buildTribesCli(): Promise<Command> {
  const [
    hyperliquidModule,
    macrosModule,
    newsModule,
    predictionModule,
    spotTradingModule,
    tokenModule,
    transactionModule,
    walletModule,
    webSearchModule,
    analystsModule,
    analystCliModule,
    loginModule
  ] = await Promise.all([
    import('@/cli/Hyperliquid'),
    import('@/cli/Macros'),
    import('@/cli/News'),
    import('@/cli/Prediction'),
    import('@/cli/SpotTrading'),
    import('@/cli/Token'),
    import('@/cli/Transaction'),
    import('@/cli/Wallet'),
    import('@/cli/WebSearch'),
    import('@/common/Analysts'),
    import('@/helpers/AnalystCli'),
    import('@/cli/Login')
  ])

  const program = new Command('tribes-cli')
  program
    .description('Unified Tribes trading-harness CLI (wallet, Hyperliquid, research)')
    .version(VERSION)

  // Wallet discovery + on-chain execution.
  program.addCommand(walletModule.buildWalletCommand())
  program.addCommand(hyperliquidModule.buildHyperliquidCommand())
  program.addCommand(transactionModule.buildTransactionCommand())
  program.addCommand(spotTradingModule.buildSpotTradingCommand())

  // Market data + research.
  program.addCommand(newsModule.buildNewsCommand())
  program.addCommand(macrosModule.buildMacrosCommand())
  program.addCommand(tokenModule.buildTokenCommand())
  program.addCommand(webSearchModule.buildWebSearchCommand())
  program.addCommand(predictionModule.buildPredictionCommand())

  // Specialist analyst agents (alpha-scout, defi-analyst, … wallet-analyst).
  for (const config of Object.values(analystsModule.ANALYSTS)) {
    program.addCommand(analystCliModule.buildAnalystCommand(config))
  }

  program.addCommand(loginModule.buildLoginCommand())

  return program
}

async function runCli(): Promise<void> {
  const requestedCommand = getRequestedCommand(process.argv.slice(2))
  if (requestedCommand === 'login') {
    await runLoginCommand()
    return
  }

  const program = await buildTribesCli()
  await program.parseAsync(process.argv)
}

void runCli().catch((error: unknown) => {
  process.stderr.write(`${error instanceof Error ? error.message : 'Unknown error'}\n`)
  process.exit(1)
})
