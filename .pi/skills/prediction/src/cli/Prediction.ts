#!/usr/bin/env node

import { stderr, stdout } from 'node:process'

import { ensureJsonTreeString } from '@shared/utils/lang'
import { Command, Option } from 'commander'

import { PredictionService } from '@/services/Prediction'
import {
  PredictionGetEventCommandOptionsSchema,
  PredictionGetMarketCommandOptionsSchema,
  PredictionListEventsCommandOptionsSchema,
  PredictionListMarketsCommandOptionsSchema,
  PredictionSearchCommandOptionsSchema
} from '@/types/Prediction'
import { appendNumberValue, appendStringValue } from '@/utils/CommanderArgParser'
import { enrichEvent, enrichEvents } from '@/utils/Prediction'

const VERSION = '1.0.0'

const program = new Command()
const service = new PredictionService()

program
  .name('prediction-cli')
  .description('Polymarket prediction market research CLI')
  .version(VERSION)

program
  .command('search')
  .description('Search active prediction events')
  .requiredOption('--query <q>', 'Search query')
  .addOption(
    new Option('--limit-per-type <n>', 'Results per type (1..25)').argParser((value) =>
      Number(value)
    )
  )
  .addOption(
    new Option('--events-tag <tag>', 'Event tag filter (repeatable)').argParser(appendStringValue)
  )
  .action(async (options: unknown): Promise<void> => {
    const request = PredictionSearchCommandOptionsSchema.parse(options)
    const events = await service.search({
      q: request.query,
      limitPerType: request.limitPerType,
      eventsTag: request.eventsTag
    })
    stdout.write(
      `${ensureJsonTreeString({
        totalResults: events.length,
        events: enrichEvents(events)
      })}\n`
    )
  })

program
  .command('list-events')
  .description('List prediction events')
  .addOption(
    new Option('--id <id>', 'Polymarket event id (repeatable)')
      .argParser(appendNumberValue)
      .default([])
  )
  .option('--slug <slug>', 'Polymarket event slug')
  .option('--tag-id <id>', 'Polymarket tag id')
  .option('--tag-slug <slug>', 'Polymarket tag slug')
  .option('--active <value>', 'Filter active state', 'true')
  .option('--archived <value>', 'Filter archived state')
  .option('--closed <value>', 'Filter closed state')
  .option('--limit <n>', 'Result limit', (value) => Number(value))
  .option('--offset <n>', 'Result offset', (value) => Number(value))
  .option('--order <field>', 'Order field, e.g. volume or liquidity')
  .option('--ascending <value>', 'Sort ascending')
  .action(async (options: unknown): Promise<void> => {
    const request = PredictionListEventsCommandOptionsSchema.parse(options)
    const events = await service.listEvents(request)
    stdout.write(
      `${ensureJsonTreeString({
        totalEvents: events.length,
        events: enrichEvents(events)
      })}\n`
    )
  })

program
  .command('get-event')
  .description('Get one prediction event by id or slug')
  .option('--event-id <id>', 'Polymarket event id')
  .option('--event-slug <slug>', 'Polymarket event slug')
  .action(async (options: unknown): Promise<void> => {
    const request = PredictionGetEventCommandOptionsSchema.parse(options)
    const event = request.eventId
      ? await service.getEventById(request.eventId)
      : await service.getEventBySlug(request.eventSlug ?? '')
    stdout.write(`${ensureJsonTreeString(enrichEvent(event))}\n`)
  })

program
  .command('list-markets')
  .description('List prediction markets')
  .addOption(
    new Option('--id <id>', 'Polymarket market id (repeatable)')
      .argParser(appendNumberValue)
      .default([])
  )
  .option('--slug <slug>', 'Polymarket market slug')
  .option('--tag-id <id>', 'Polymarket tag id')
  .option('--closed <value>', 'Filter closed state')
  .option('--limit <n>', 'Result limit', (value) => Number(value))
  .option('--offset <n>', 'Result offset', (value) => Number(value))
  .option('--order <field>', 'Order field, e.g. volume or liquidity')
  .option('--ascending <value>', 'Sort ascending')
  .action(async (options: unknown): Promise<void> => {
    const request = PredictionListMarketsCommandOptionsSchema.parse(options)
    const markets = await service.listMarkets(request)
    stdout.write(`${ensureJsonTreeString({ totalMarkets: markets.length, markets })}\n`)
  })

program
  .command('get-market')
  .description('Get one prediction market by id or slug')
  .option('--market-id <id>', 'Polymarket market id')
  .option('--market-slug <slug>', 'Polymarket market slug')
  .action(async (options: unknown): Promise<void> => {
    const request = PredictionGetMarketCommandOptionsSchema.parse(options)
    const market = request.marketId
      ? await service.getMarketById(request.marketId)
      : await service.getMarketBySlug(request.marketSlug ?? '')
    stdout.write(`${ensureJsonTreeString(market)}\n`)
  })

async function main(): Promise<void> {
  await program.parseAsync(process.argv)
}

void main().catch((error: unknown) => {
  if (error instanceof Error) {
    stderr.write(`${error.message}\n`)
  } else {
    stderr.write('Unknown error\n')
  }
  process.exit(1)
})
