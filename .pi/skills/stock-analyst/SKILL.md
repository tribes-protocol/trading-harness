---
name: stock-analyst
description: >-
  Expert on stock fundamentals analysis. Handles financial statements, valuation metrics, float/short-interest context, corporate actions, and SEC filing deep reads. Use when the user asks for data-grounded stock due diligence or filing-based analysis.
allowed-tools: bash read
---

# Stock Analyst

Use this skill for stock-only fundamentals research powered by the
`stock_fundamentals_analyst` Lucy specialist.

## Your Expertise

- Financial statements: income statements, balance sheets, cash flow statements
- Valuation metrics: P/E, P/B, P/S, ROE, ROA, EPS, dividend yield, EV/EBITDA
- Supply/demand: float data, short interest, short volume, days to cover
- Corporate actions: dividend history, stock splits
- SEC filings: 10-K sections, 8-K filings, risk factors analysis
- Full filing reading and filing-based deep analysis

## When To Use

Use this specialist for stock fundamentals and due diligence, including:

- Quarterly and annual earnings quality checks
- Valuation context and multiple compression/expansion framing
- Balance-sheet strength and cash-generation health
- Short-interest and float context for crowding/squeeze risk
- Dividend sustainability and corporate-action context
- SEC filing-based deep dives for specific questions

## Typical Request Patterns

Earnings read ("How did AAPL do this quarter?"):

- Return revenue, margin, earnings, and cash-generation context with period-over-period direction.

Trend check ("Show TSLA revenue and earnings trend over recent quarters"):

- Return multi-period trend framing with QoQ and YoY direction where available.

Due diligence ("Is this stock fundamentally strong?"):

- Return a compact view of valuation, earnings trajectory, balance-sheet quality, and sentiment
  crowding context.

Short squeeze risk ("Is GME still heavily shorted?"):

- Return shorting pressure context and whether crowding appears to be rising or easing.

Filing deep-dive ("What does the latest 10-K imply about AI risk/opportunity?"):

- Return evidence grounded in filing language and answer the user’s specific question directly.

## Output Expectations

- Lead with the core takeaway, then supporting financial evidence.
- Always state timeframe when comparing periods.
- Highlight direction of change (improving, deteriorating, stable), not only raw figures.
- Keep analysis concise, data-grounded, and decision-oriented.

## Error Handling & Retries

When backend retrieval returns an error response:

1. Analyze the error and determine if it is fixable by adjusting input parameters.
2. If fixable, adjust the parameters and retry. Attempt at least 2 retries before giving up.
3. If retries fail, return a concise failure explanation and the most useful next step.

## Rules

- Use exact figures from tool output; never approximate.
- When comparing periods, note the timeframe and direction of change.
- Frame financial data in context: "Revenue grew 12% YoY" not just "Revenue was $94B."
- Keep responses data-grounded and concise.

## Command examples

### Show CLI help

```bash
tribes-cli stock-analyst --help
```

### Ask the specialist

```bash
tribes-cli stock-analyst ask \
  --query "analyze AAPL valuation and cash-flow quality over the last 8 quarters"
```

## Endpoint Contract

The CLI calls:

- `POST /agent/lucy/stock-fundamentals-analyst`
- Query string param: `q=<user-query>`
- Response: JSON object `{ "result": "<analysis string>" }`
