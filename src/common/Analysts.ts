import type { AnalystConfig } from '@/types/Analyst'

export const ANALYSTS = {
  alphaScout: {
    cliName: 'alpha-scout-cli',
    description: 'Discovers emerging opportunities and tracks smart money signals.',
    endpointPath: '/agent/lucy/alpha-scout',
    errorLabel: 'Alpha scout',
    askDescription: 'Send a query to the alpha_scout specialist agent endpoint'
  },
  defiAnalyst: {
    cliName: 'defi-analyst-cli',
    description: 'Expert on DEX activity and liquidity pools.',
    endpointPath: '/agent/lucy/defi-analyst',
    errorLabel: 'DeFi analyst',
    askDescription: 'Send a query to the defi_analyst specialist agent endpoint'
  },
  exchangeAnalyst: {
    cliName: 'exchange-analyst-cli',
    description: 'Expert on exchanges, derivatives, and institutional crypto holdings.',
    endpointPath: '/agent/lucy/exchange-analyst',
    errorLabel: 'Exchange analyst',
    askDescription: 'Send a query to the exchange_analyst specialist agent endpoint'
  },
  fundamentalsAnalyst: {
    cliName: 'fundamentals-analyst-cli',
    description: 'Expert on in-depth coin research via CoinGecko data.',
    endpointPath: '/agent/lucy/fundamentals-analyst',
    errorLabel: 'Fundamentals analyst',
    askDescription: 'Send a query to the fundamentals_analyst specialist agent endpoint'
  },
  stockAnalyst: {
    cliName: 'stock-analyst-cli',
    description:
      'Expert on stock market data and technical analysis including prices, quotes, candles, snapshots, movers, TA indicators, and news.',
    endpointPath: '/agent/lucy/stock-analyst',
    errorLabel: 'Stock analyst',
    askDescription: 'Send a query to the stock_analyst specialist agent endpoint'
  },
  researchAnalyst: {
    cliName: 'research-analyst-cli',
    description: 'Expert on ENS identity resolution and web-based financial research.',
    endpointPath: '/agent/lucy/research-analyst',
    errorLabel: 'Research analyst',
    askDescription: 'Send a query to the research_analyst specialist agent endpoint'
  },
  technicalAnalyst: {
    cliName: 'technical-analyst-cli',
    description: 'Expert technical analyst for OHLCV indicators and backtesting.',
    endpointPath: '/agent/lucy/technical-analyst',
    errorLabel: 'Technical analyst',
    askDescription: 'Send a query to the technical_analyst specialist agent endpoint'
  },
  tokenAnalyst: {
    cliName: 'token-analyst-cli',
    description:
      'Token specialist that deep-dives into token price, security, flows, and trading context.',
    endpointPath: '/agent/lucy/token-analyst',
    errorLabel: 'Token analyst',
    askDescription: 'Send a query to the token_analyst specialist agent endpoint'
  },
  walletAnalyst: {
    cliName: 'wallet-analyst-cli',
    description: 'Expert on wallet and portfolio analysis.',
    endpointPath: '/agent/lucy/wallet-analyst',
    errorLabel: 'Wallet analyst',
    askDescription: 'Send a query to the wallet_analyst specialist agent endpoint'
  }
} satisfies Record<string, AnalystConfig>
