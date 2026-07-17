#!/usr/bin/env node
import { readFileSync } from 'node:fs';
import { Command, InvalidArgumentError } from 'commander';
import { loadEnv } from '../core/config.js';
import { FREQUENCIES } from '../core/time.js';
import { PlatformError } from '../core/errors.js';
import { redactString } from '../core/redact.js';
import { allAdapters, implementedProviderIds } from '../services/adapter-registry.js';
import * as marketData from '../services/market-data.js';
import * as macroSvc from '../services/macro.js';
import * as newsSvc from '../services/news.js';
import * as onchainSvc from '../services/onchain.js';
import { loadRegistry, getProviderRecord } from '../registry/registry.js';
import { HandoffSchema, ResearchNoteSchema, IcMemoSchema } from '../schemas/reports.js';
import type { Chain, Frequency } from '../schemas/common.js';
import {
  renderHealth,
  renderMacro,
  renderNews,
  renderProviderRecord,
  renderQuote,
  renderSearch,
  renderSeries,
  renderTokenPrice,
} from './render.js';

/**
 * `pi` — CLI entry point for the research platform. Data goes to stdout
 * (human-readable by default, --json for machine output); logs to stderr.
 */

const program = new Command();
program
  .name('pi')
  .description('Institutional multi-asset research platform CLI')
  .version('0.1.0');

function positiveIntArg(value: string): number {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new InvalidArgumentError(`expected a positive integer, got "${value}"`);
  }
  return parsed;
}

function frequencyArg(value: string): string {
  if (!(FREQUENCIES as readonly string[]).includes(value)) {
    throw new InvalidArgumentError(`expected one of ${FREQUENCIES.join(', ')}, got "${value}"`);
  }
  return value;
}

function emit(json: boolean, value: unknown, human: () => string): void {
  process.stdout.write(json ? `${JSON.stringify(value, null, 2)}\n` : `${human()}\n`);
}

function fail(error: unknown): never {
  const message =
    error instanceof PlatformError
      ? `${error.code}: ${error.message}`
      : error instanceof Error
        ? redactString(error.message)
        : String(error);
  process.stderr.write(`error: ${message}\n`);
  process.exit(1);
}

program
  .command('registry')
  .description('Show the provider capability registry (verified via docs research)')
  .argument('[providerId]', 'show a single provider in detail')
  .option('--json', 'JSON output')
  .action((providerId: string | undefined, opts: { json?: boolean }) => {
    try {
      if (providerId) {
        const record = getProviderRecord(providerId);
        if (!record) fail(new Error(`unknown provider "${providerId}"`));
        emit(opts.json ?? false, record, () => renderProviderRecord(record, true));
        return;
      }
      const registry = loadRegistry();
      emit(opts.json ?? false, registry, () =>
        [
          `Provider registry (schema ${registry.schemaVersion}, generated ${registry.generatedAt})`,
          ...registry.providers.map((p) => renderProviderRecord(p)),
        ].join('\n\n'),
      );
    } catch (error) {
      fail(error);
    }
  });

program
  .command('doctor')
  .description('Check provider configuration; --live performs one minimal request per provider')
  .option('--live', 'attempt one minimal-quota live request per configured provider')
  .option('--json', 'JSON output')
  .action(async (opts: { live?: boolean; json?: boolean }) => {
    try {
      loadEnv();
      const adapters = allAdapters();
      if (adapters.length === 0) {
        process.stdout.write('No adapters implemented yet.\n');
        return;
      }
      const results: Awaited<ReturnType<(typeof adapters)[number]['healthCheck']>>[] = [];
      for (const adapter of adapters) {
        results.push(await adapter.healthCheck({ live: opts.live ?? false }));
      }
      emit(opts.json ?? false, results, () =>
        [`Adapters implemented: ${implementedProviderIds().join(', ')}`, renderHealth(results)].join(
          '\n',
        ),
      );
    } catch (error) {
      fail(error);
    }
  });

program
  .command('quote')
  .description('Normalized quote via registry routing (with optional cross-check)')
  .argument('<symbol>')
  .option('--asset-class <assetClass>', 'e.g. equity, crypto, etf')
  .option('--cross-check', 'query a second provider and surface disagreement')
  .option('--tolerance <pct>', 'disagreement tolerance as decimal', '0.01')
  .option('--json', 'JSON output')
  .action(
    async (
      symbol: string,
      opts: { assetClass?: string; crossCheck?: boolean; tolerance: string; json?: boolean },
    ) => {
      try {
        const tolerance = Number(opts.tolerance);
        if (!Number.isFinite(tolerance) || tolerance < 0) {
          fail(new Error(`--tolerance must be a finite non-negative decimal, got "${opts.tolerance}"`));
        }
        if (opts.crossCheck) {
          const result = await marketData.getCrossCheckedQuote({
            symbol,
            assetClass: opts.assetClass as never,
            tolerance,
          });
          emit(opts.json ?? false, result, () => {
            const lines = [renderQuote(result.quote)];
            if (result.disagreement) {
              lines.push(
                `  DISAGREEMENT: ${result.disagreement.values
                  .map((v) => `${v.provider}=${v.value}`)
                  .join(' vs ')} (spread ${(result.disagreement.relativeSpread * 100).toFixed(2)}%)`,
              );
            } else if (result.views.length > 1) {
              lines.push(`  cross-checked across ${result.views.length} providers: consistent`);
            } else if (result.providersAttempted > 1) {
              lines.push(
                `  cross-check DEGRADED: ${result.failures.length} provider(s) failed — single view only`,
              );
            } else {
              lines.push('  cross-check requested but only one provider is configured for this operation');
            }
            for (const f of result.failures) {
              lines.push(`  provider failure: ${f.provider}: ${f.error}`);
            }
            return lines.join('\n');
          });
          return;
        }
        const quote = await marketData.getQuote({ symbol, assetClass: opts.assetClass as never });
        emit(opts.json ?? false, quote, () => renderQuote(quote));
      } catch (error) {
        fail(error);
      }
    },
  );

program
  .command('bars')
  .description('OHLCV bars (daily by default)')
  .argument('<symbol>')
  .option('--interval <interval>', 'bar interval (1d, 1h, ...)', frequencyArg, '1d')
  .option('--asset-class <assetClass>')
  .option('--from <isoDate>')
  .option('--to <isoDate>')
  .option('--limit <n>', 'max bars', positiveIntArg)
  .option('--json', 'JSON output')
  .action(
    async (
      symbol: string,
      opts: {
        interval: string;
        assetClass?: string;
        from?: string;
        to?: string;
        limit?: number;
        json?: boolean;
      },
    ) => {
      try {
        const common = {
          symbol,
          assetClass: opts.assetClass as never,
          from: opts.from,
          to: opts.to,
          limit: opts.limit,
        };
        const series =
          opts.interval === '1d'
            ? await marketData.getDailyBars(common)
            : await marketData.getIntradayBars({ ...common, interval: opts.interval as Frequency });
        emit(opts.json ?? false, series, () => renderSeries(series));
      } catch (error) {
        fail(error);
      }
    },
  );

program
  .command('series')
  .description('Macroeconomic time series (e.g. FRED series id)')
  .argument('<seriesId>')
  .option('--from <isoDate>')
  .option('--to <isoDate>')
  .option('--vintage <vintage>', 'latest | point_in_time', 'latest')
  .option('--json', 'JSON output')
  .action(
    async (
      seriesId: string,
      opts: { from?: string; to?: string; vintage: string; json?: boolean },
    ) => {
      try {
        if (opts.vintage !== 'latest' && opts.vintage !== 'point_in_time') {
          fail(new Error(`--vintage must be "latest" or "point_in_time", got "${opts.vintage}"`));
        }
        const series = await macroSvc.getMacroSeries({
          seriesId,
          from: opts.from,
          to: opts.to,
          vintage: opts.vintage as 'latest' | 'point_in_time',
        });
        emit(opts.json ?? false, series, () => renderMacro(series));
      } catch (error) {
        fail(error);
      }
    },
  );

program
  .command('series-search')
  .description('Search macro series by keyword')
  .argument('<query>')
  .option('--limit <n>', 'max results', positiveIntArg, 10)
  .option('--json', 'JSON output')
  .action(async (query: string, opts: { limit: number; json?: boolean }) => {
    try {
      const results = await macroSvc.searchMacroSeries({ query, limit: opts.limit });
      emit(opts.json ?? false, results, () =>
        results.map((r) => `${r.id.padEnd(20)} ${r.title} (${r.frequencyRaw ?? r.frequency ?? '?'})`).join('\n'),
      );
    } catch (error) {
      fail(error);
    }
  });

program
  .command('news')
  .description('News (latest, or archive when --from/--to given)')
  .option('--query <q>')
  .option('--category <category>')
  .option('--language <lang>')
  .option('--from <isoDate>')
  .option('--to <isoDate>')
  .option('--max <n>', 'max articles', positiveIntArg, 10)
  .option('--json', 'JSON output')
  .action(
    async (opts: {
      query?: string;
      category?: string;
      language?: string;
      from?: string;
      to?: string;
      max: number;
      json?: boolean;
    }) => {
      try {
        const batch = await newsSvc.getNews(opts);
        emit(opts.json ?? false, batch, () => renderNews(batch));
      } catch (error) {
        fail(error);
      }
    },
  );

program
  .command('search')
  .description('Web search for research (provider-routed, e.g. Tavily)')
  .argument('<query...>')
  .option('--depth <depth>', 'basic | advanced', 'basic')
  .option('--max <n>', 'max results', positiveIntArg, 8)
  .option('--answer', 'include provider-synthesized answer (model output)')
  .option('--json', 'JSON output')
  .action(
    async (
      queryParts: string[],
      opts: { depth: 'basic' | 'advanced'; max: number; answer?: boolean; json?: boolean },
    ) => {
      try {
        const batch = await newsSvc.webSearch({
          query: queryParts.join(' '),
          depth: opts.depth,
          maxResults: opts.max,
          includeAnswer: opts.answer ?? false,
        });
        emit(opts.json ?? false, batch, () => renderSearch(batch));
      } catch (error) {
        fail(error);
      }
    },
  );

const token = program.command('token').description('Crypto token data');

token
  .command('price')
  .description('Token price by chain+address or provider id')
  .option('--chain <chain>')
  .option('--address <address>')
  .option('--id <providerId>', 'provider-native id, e.g. CoinGecko coin id')
  .option('--symbol <symbol>')
  .option('--json', 'JSON output')
  .action(
    async (opts: {
      chain?: string;
      address?: string;
      id?: string;
      symbol?: string;
      json?: boolean;
    }) => {
      try {
        const price = await onchainSvc.getTokenPrice({
          token: {
            chain: opts.chain as Chain | undefined,
            address: opts.address,
            providerId: opts.id,
            symbol: opts.symbol,
          },
        });
        emit(opts.json ?? false, price, () => renderTokenPrice(price));
      } catch (error) {
        fail(error);
      }
    },
  );

token
  .command('ohlcv')
  .description('Token OHLCV bars by chain+address or provider id')
  .option('--chain <chain>')
  .option('--address <address>')
  .option('--id <providerId>', 'provider-native id, e.g. CoinGecko coin id')
  .option('--symbol <symbol>')
  .option('--interval <interval>', 'bar interval (1m, 1h, 1d, ...)', frequencyArg, '1d')
  .option('--from <isoDate>')
  .option('--to <isoDate>')
  .option('--limit <n>', 'max bars', positiveIntArg)
  .option('--json', 'JSON output')
  .action(
    async (opts: {
      chain?: string;
      address?: string;
      id?: string;
      symbol?: string;
      interval: string;
      from?: string;
      to?: string;
      limit?: number;
      json?: boolean;
    }) => {
      try {
        const series = await onchainSvc.getTokenOhlcv({
          token: {
            chain: opts.chain as Chain | undefined,
            address: opts.address,
            providerId: opts.id,
            symbol: opts.symbol,
          },
          interval: opts.interval as Frequency,
          from: opts.from,
          to: opts.to,
          limit: opts.limit,
        });
        emit(opts.json ?? false, series, () => renderSeries(series));
      } catch (error) {
        fail(error);
      }
    },
  );

program
  .command('wallet')
  .description('Wallet balances')
  .argument('<chain>')
  .argument('<address>')
  .option('--json', 'JSON output')
  .action(async (chain: string, address: string, opts: { json?: boolean }) => {
    try {
      const balances = await onchainSvc.getWalletBalances({ chain: chain as Chain, address });
      emit(opts.json ?? false, balances, () =>
        [
          `${balances.balances.length} balances for ${balances.address} on ${balances.chain} (source: ${balances.source.provider})`,
          ...balances.balances
            .slice(0, 25)
            .map(
              (b) =>
                `  ${(b.token.symbol ?? b.token.address ?? 'native').padEnd(12)} ${b.amount ?? b.rawAmount}${b.valueUsd !== undefined ? ` ($${b.valueUsd.toLocaleString('en-US')})` : ''}`,
            ),
        ].join('\n'),
      );
    } catch (error) {
      fail(error);
    }
  });

const validate = program
  .command('validate')
  .description('Validate research artifacts against platform schemas');

for (const [name, schema] of [
  ['handoff', HandoffSchema],
  ['note', ResearchNoteSchema],
  ['ic-memo', IcMemoSchema],
] as const) {
  validate
    .command(name)
    .argument('<file>', 'path to JSON artifact')
    .action((file: string) => {
      try {
        const parsed = schema.safeParse(JSON.parse(readFileSync(file, 'utf8')));
        if (parsed.success) {
          process.stdout.write(`OK: ${file} is a valid ${name}\n`);
        } else {
          process.stdout.write(
            `INVALID ${name}: ${file}\n${parsed.error.issues
              .slice(0, 20)
              .map((i) => `  - ${i.path.join('.')}: ${i.message}`)
              .join('\n')}\n`,
          );
          process.exit(2);
        }
      } catch (error) {
        fail(error);
      }
    });
}

program.parseAsync(process.argv).catch(fail);
