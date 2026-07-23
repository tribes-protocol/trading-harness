import { Command } from 'commander'

import { MASSIVE_API_KEY } from '@/common/Env'
import { writeOutput } from '@/helpers/WriteOutput'
import { StockFundamentalsService } from '@/services/StockFundamentalsService'
import {
  StockFundamentalsEightKCommandOptionsSchema,
  StockFundamentalsFilingsCommandOptionsSchema,
  StockFundamentalsStatementCommandOptionsSchema,
  StockFundamentalsSymbolCommandOptionsSchema,
  StockFundamentalsTenKSectionCommandOptionsSchema
} from '@/types/StockFundamentals'
import { ensureJsonTreeString } from '@/utils/Lang'

const VERSION = '1.0.0'

const DEFAULT_TIMEFRAME = 'annual'
const DEFAULT_STATEMENTS_LIMIT = 4
const DEFAULT_RATIOS_LIMIT = 1
const DEFAULT_FLOAT_LIMIT = 1
const DEFAULT_SHORT_INTEREST_LIMIT = 5
const DEFAULT_SHORT_VOLUME_LIMIT = 10
const DEFAULT_DIVIDENDS_LIMIT = 10
const DEFAULT_SPLITS_LIMIT = 10
const DEFAULT_FILINGS_LIMIT = 10
const DEFAULT_TENK_LIMIT = 1
const DEFAULT_EIGHTK_LIMIT = 1
const DEFAULT_RISK_FACTORS_LIMIT = 10

export function buildStockFundamentalsCommand(): Command {
  const service = new StockFundamentalsService({ apiKey: MASSIVE_API_KEY })

  const program = new Command('stock-fundamentals')
  program
    .description('SEC stock fundamentals and filings from Massive (structured JSON)')
    .version(VERSION)

  program
    .command('income')
    .description('Income statements: revenue, gross profit, operating/net income, EPS')
    .requiredOption('--symbol <symbol>', 'Stock ticker, e.g. AAPL')
    .option('--timeframe <timeframe>', 'Period type: annual|quarterly (default annual)')
    .option('--limit <n>', 'Periods to return, 1-20 (default 4)', (value) => Number(value))
    .option('--out <file>', 'Write output JSON to file')
    .action(async (options: unknown): Promise<void> => {
      const request = StockFundamentalsStatementCommandOptionsSchema.parse(options)
      const income = await service.getIncomeStatements({
        symbol: request.symbol,
        timeframe: request.timeframe ?? DEFAULT_TIMEFRAME,
        limit: request.limit ?? DEFAULT_STATEMENTS_LIMIT
      })
      await writeOutput({ output: ensureJsonTreeString(income), outPath: request.out ?? undefined })
    })

  program
    .command('balance-sheet')
    .description('Balance sheets: assets, liabilities, cash, equity')
    .requiredOption('--symbol <symbol>', 'Stock ticker, e.g. AAPL')
    .option('--timeframe <timeframe>', 'Period type: annual|quarterly (default annual)')
    .option('--limit <n>', 'Periods to return, 1-20 (default 4)', (value) => Number(value))
    .option('--out <file>', 'Write output JSON to file')
    .action(async (options: unknown): Promise<void> => {
      const request = StockFundamentalsStatementCommandOptionsSchema.parse(options)
      const sheets = await service.getBalanceSheets({
        symbol: request.symbol,
        timeframe: request.timeframe ?? DEFAULT_TIMEFRAME,
        limit: request.limit ?? DEFAULT_STATEMENTS_LIMIT
      })
      await writeOutput({ output: ensureJsonTreeString(sheets), outPath: request.out ?? undefined })
    })

  program
    .command('cash-flow')
    .description('Cash flow statements: operating, investing, financing, change in cash')
    .requiredOption('--symbol <symbol>', 'Stock ticker, e.g. AAPL')
    .option('--timeframe <timeframe>', 'Period type: annual|quarterly (default annual)')
    .option('--limit <n>', 'Periods to return, 1-20 (default 4)', (value) => Number(value))
    .option('--out <file>', 'Write output JSON to file')
    .action(async (options: unknown): Promise<void> => {
      const request = StockFundamentalsStatementCommandOptionsSchema.parse(options)
      const statements = await service.getCashFlowStatements({
        symbol: request.symbol,
        timeframe: request.timeframe ?? DEFAULT_TIMEFRAME,
        limit: request.limit ?? DEFAULT_STATEMENTS_LIMIT
      })
      await writeOutput({
        output: ensureJsonTreeString(statements),
        outPath: request.out ?? undefined
      })
    })

  program
    .command('ratios')
    .description('Valuation and health ratios: P/E, P/B, ROE, EV/EBITDA, debt/equity')
    .requiredOption('--symbol <symbol>', 'Stock ticker, e.g. AAPL')
    .option('--limit <n>', 'Rows to return, 1-50 (default 1)', (value) => Number(value))
    .option('--out <file>', 'Write output JSON to file')
    .action(async (options: unknown): Promise<void> => {
      const request = StockFundamentalsSymbolCommandOptionsSchema.parse(options)
      const ratios = await service.getRatios({
        symbol: request.symbol,
        limit: request.limit ?? DEFAULT_RATIOS_LIMIT
      })
      await writeOutput({ output: ensureJsonTreeString(ratios), outPath: request.out ?? undefined })
    })

  program
    .command('float')
    .description('Free float shares and free float percentage')
    .requiredOption('--symbol <symbol>', 'Stock ticker, e.g. AAPL')
    .option('--limit <n>', 'Rows to return, 1-50 (default 1)', (value) => Number(value))
    .option('--out <file>', 'Write output JSON to file')
    .action(async (options: unknown): Promise<void> => {
      const request = StockFundamentalsSymbolCommandOptionsSchema.parse(options)
      const rows = await service.getFloat({
        symbol: request.symbol,
        limit: request.limit ?? DEFAULT_FLOAT_LIMIT
      })
      await writeOutput({ output: ensureJsonTreeString(rows), outPath: request.out ?? undefined })
    })

  program
    .command('short-interest')
    .description('Short interest with days-to-cover per settlement date')
    .requiredOption('--symbol <symbol>', 'Stock ticker, e.g. AAPL')
    .option('--limit <n>', 'Rows to return, 1-50 (default 5)', (value) => Number(value))
    .option('--out <file>', 'Write output JSON to file')
    .action(async (options: unknown): Promise<void> => {
      const request = StockFundamentalsSymbolCommandOptionsSchema.parse(options)
      const rows = await service.getShortInterest({
        symbol: request.symbol,
        limit: request.limit ?? DEFAULT_SHORT_INTEREST_LIMIT
      })
      await writeOutput({ output: ensureJsonTreeString(rows), outPath: request.out ?? undefined })
    })

  program
    .command('short-volume')
    .description('Daily short volume and short volume ratio')
    .requiredOption('--symbol <symbol>', 'Stock ticker, e.g. AAPL')
    .option('--limit <n>', 'Days to return, 1-50 (default 10)', (value) => Number(value))
    .option('--out <file>', 'Write output JSON to file')
    .action(async (options: unknown): Promise<void> => {
      const request = StockFundamentalsSymbolCommandOptionsSchema.parse(options)
      const rows = await service.getShortVolume({
        symbol: request.symbol,
        limit: request.limit ?? DEFAULT_SHORT_VOLUME_LIMIT
      })
      await writeOutput({ output: ensureJsonTreeString(rows), outPath: request.out ?? undefined })
    })

  program
    .command('dividends')
    .description('Dividend history: ex-date, pay date, cash amount, frequency')
    .requiredOption('--symbol <symbol>', 'Stock ticker, e.g. AAPL')
    .option('--limit <n>', 'Dividends to return, 1-50 (default 10)', (value) => Number(value))
    .option('--out <file>', 'Write output JSON to file')
    .action(async (options: unknown): Promise<void> => {
      const request = StockFundamentalsSymbolCommandOptionsSchema.parse(options)
      const dividends = await service.getDividends({
        symbol: request.symbol,
        limit: request.limit ?? DEFAULT_DIVIDENDS_LIMIT
      })
      await writeOutput({
        output: ensureJsonTreeString(dividends),
        outPath: request.out ?? undefined
      })
    })

  program
    .command('splits')
    .description('Stock split history: execution date and split ratio')
    .requiredOption('--symbol <symbol>', 'Stock ticker, e.g. AAPL')
    .option('--limit <n>', 'Splits to return, 1-50 (default 10)', (value) => Number(value))
    .option('--out <file>', 'Write output JSON to file')
    .action(async (options: unknown): Promise<void> => {
      const request = StockFundamentalsSymbolCommandOptionsSchema.parse(options)
      const splits = await service.getSplits({
        symbol: request.symbol,
        limit: request.limit ?? DEFAULT_SPLITS_LIMIT
      })
      await writeOutput({ output: ensureJsonTreeString(splits), outPath: request.out ?? undefined })
    })

  program
    .command('filings')
    .description('SEC filings index: dates, form types, URLs, newest first')
    .requiredOption('--symbol <symbol>', 'Stock ticker, e.g. AAPL')
    .option('--form-type <type>', 'Filter by form type, e.g. 10-K, 10-Q, 8-K')
    .option('--limit <n>', 'Filings to return, 1-50 (default 10)', (value) => Number(value))
    .option('--out <file>', 'Write output JSON to file')
    .action(async (options: unknown): Promise<void> => {
      const request = StockFundamentalsFilingsCommandOptionsSchema.parse(options)
      const filings = await service.getFilings({
        symbol: request.symbol,
        formType: request.formType,
        limit: request.limit ?? DEFAULT_FILINGS_LIMIT
      })
      await writeOutput({
        output: ensureJsonTreeString(filings),
        outPath: request.out ?? undefined
      })
    })

  program
    .command('tenk-section')
    .description('Full text of a 10-K annual report section')
    .requiredOption('--symbol <symbol>', 'Stock ticker, e.g. AAPL')
    .requiredOption('--section <section>', '10-K section identifier, e.g. risk_factors, business')
    .option('--limit <n>', 'Filings to return, 1-5 (default 1)', (value) => Number(value))
    .option('--out <file>', 'Write output JSON to file')
    .action(async (options: unknown): Promise<void> => {
      const request = StockFundamentalsTenKSectionCommandOptionsSchema.parse(options)
      const sections = await service.getTenKSections({
        symbol: request.symbol,
        section: request.section,
        limit: request.limit ?? DEFAULT_TENK_LIMIT
      })
      await writeOutput({
        output: ensureJsonTreeString(sections),
        outPath: request.out ?? undefined
      })
    })

  program
    .command('eightk')
    .description('8-K current report text (material events), newest first')
    .requiredOption('--symbol <symbol>', 'Stock ticker, e.g. AAPL')
    .option('--limit <n>', 'Filings to return, 1-5 (default 1)', (value) => Number(value))
    .option('--out <file>', 'Write output JSON to file')
    .action(async (options: unknown): Promise<void> => {
      const request = StockFundamentalsEightKCommandOptionsSchema.parse(options)
      const filings = await service.getEightK({
        symbol: request.symbol,
        limit: request.limit ?? DEFAULT_EIGHTK_LIMIT
      })
      await writeOutput({
        output: ensureJsonTreeString(filings),
        outPath: request.out ?? undefined
      })
    })

  program
    .command('risk-factors')
    .description('Categorized risk factors disclosed in SEC filings')
    .requiredOption('--symbol <symbol>', 'Stock ticker, e.g. AAPL')
    .option('--limit <n>', 'Risk factors to return, 1-50 (default 10)', (value) => Number(value))
    .option('--out <file>', 'Write output JSON to file')
    .action(async (options: unknown): Promise<void> => {
      const request = StockFundamentalsSymbolCommandOptionsSchema.parse(options)
      const factors = await service.getRiskFactors({
        symbol: request.symbol,
        limit: request.limit ?? DEFAULT_RISK_FACTORS_LIMIT
      })
      await writeOutput({
        output: ensureJsonTreeString(factors),
        outPath: request.out ?? undefined
      })
    })

  return program
}
