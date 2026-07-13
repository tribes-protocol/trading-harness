# How the Tribes Harness Works

**You talk. It trades.**

The Tribes harness is an autonomous trading co-pilot you speak to in plain English. Think of it as a sharp trader sitting next to you who also does the research, places the orders, and manages the positions — you describe what you want, it does the work and reports back.

This guide is for people who know markets but have never used a trading agent before. You will never touch a terminal, copy a command, or handle a private key. If a word here is new to you, it's defined the first time it appears and again in the [glossary](#speaking-the-language-a-glossary).

> [!IMPORTANT]
> This is real money, and with leverage you can lose more than you'd expect from a small price move. The harness always tells you exactly what's about to happen before it puts money at risk — read those confirmations.

## Contents

**Start here**

- [What it can do](#what-it-can-do)
- [Getting started](#getting-started)
- [The mental model](#the-mental-model)

**Your money's journey**

- [Part 1: Putting money in](#part-1--putting-money-in)
- [Part 2: Trading](#part-2--trading)
- [Part 3: Managing positions](#part-3--managing-positions)
- [Part 4: Research](#part-4--research-before-during-or-instead-of-trading)
- [Part 5: Taking money out](#part-5--taking-money-out)

**Reference**

- [Safety & guardrails](#safety--guardrails)
- [Glossary](#speaking-the-language-a-glossary)
- [FAQ / troubleshooting](#faq--troubleshooting)

## What it can do

- **Trade crypto** — long or short, spot or leverage.
- **Trade stocks and commodities** — under the hood these settle as [Hyperliquid](https://hyperliquid.xyz) perpetual futures ("perps"), so _"buy $500 of Microsoft"_ becomes a perp trade automatically. You don't have to know or care about that plumbing.
- **Do the research** — market overviews, news, technicals, smart-money flows, token safety checks, prediction-market odds, and more.

If it needs a decision from you — how much to risk, which direction, or a confirmation before spending money — it asks in normal language.

---

## Getting started

The fastest way to learn what it can do is to ask it:

> 💬 "What can you do?"

> 💬 "Show me my wallet and balances."

> 💬 "How's the market looking today?"

Three things to know up front:

1. **You may be asked to log in once.** The harness hands you a link; open it and approve the agent. That's it — it detects your approval on its own and ties the harness to your account so it can trade on your behalf.
2. **You need funds to trade.** See [Putting money in](#part-1--putting-money-in). The practical minimum is **5 USDC** (the deposit minimum), though a little headroom beyond that is wise.
3. **It asks before risking money.** Nothing gets traded, funded, or withdrawn silently. You get a plain-language confirmation first.

---

## The mental model

You don't need the technical details, but a simple picture helps you trust it:

```
   You  ─────►  The agent  ─────►  Hyperliquid
 (plain      (does the research,   (where trades
  English)    places the orders)    settle)
```

Four facts complete the picture:

- **Your money lives in a wallet the agent controls for you.** The private keys are secured in a vault (Privy) and are _never_ shown, printed, or pasted anywhere — not even to you. The agent signs trades through that vault.
- **Trades settle on Hyperliquid**, a fast on-chain exchange for perps and spot. Your deposited **USDC** (a dollar-pegged stablecoin) is your trading balance and your margin.
- **Gas is on the house.** Moving funds on-chain normally costs a small network fee ("gas") paid in the chain's native coin. Here, gas is **sponsored** — you never need to hold ETH or any other coin just to transact. Ignore gas entirely.
- **Stocks are traded as perps.** There's no separate stock brokerage. When you say _"go long Apple,"_ the agent finds the venue that lists AAPL as a perp and trades it there.

---

## Part 1 — Putting money in

Funding means getting **USDC into your Hyperliquid account**. You tell the agent how much; it handles the route.

> [!TIP]
> Deposit **USDC on Arbitrum** — it's the fastest and recommended way to start. Hyperliquid settles on the Arbitrum network, so USDC already there deposits in one direct step: no swap, no bridge, no waiting. The deposit minimum is **5 USDC**.

### No crypto yet? Buy with a card

You don't need to already own crypto. Once you're signed in to the Tribes app, tap the **Fund** button in the footer to buy crypto with a debit or credit card — choose **USDC on Arbitrum** so it lands ready to trade. It arrives in your wallet; then just say _"Fund my Hyperliquid account"_ and the agent takes it from there.

> [!NOTE]
> The **Fund** button lives in the Tribes app. On other clients you won't see it — fund by moving crypto into your wallet instead (see below).

### Already hold crypto?

Anything works — the agent just has an extra step or two. It checks your balances, figures out which case you're in, and does the right thing:

| Where your funds are                               | What the agent does                                         |
| -------------------------------------------------- | ----------------------------------------------------------- |
| **USDC on Arbitrum** _(recommended)_               | Deposits directly — fastest, no conversion                  |
| A different token on Arbitrum (say, ETH)           | Swaps it to USDC first, then deposits                       |
| Another chain entirely (Ethereum, Base, Solana, …) | Bridges to the right place, converts to USDC, then deposits |

### Just ask — either way

Whichever path you're on, tell the agent what you want:

> 💬 "Fund my Hyperliquid account with $100."
>
> 💬 "I have some ETH on Base — use it to put $250 into Hyperliquid."
>
> 💬 "How much do I have available to trade right now?"

It shows you the plan (source funds, amount, any conversion) and asks you to confirm before moving anything.

---

## Part 2 — Trading

### The basics

- **Go long or short** on crypto perps, stock perps, and commodity perps.
- **Buy and sell spot** crypto (owning the asset outright, no leverage).
- **Market or limit orders** — fill now at the going price, or name your price and wait.
- **Stop-loss and take-profit** — automatic exits that fire when price hits a level you choose.
- **Brackets** — attach a take-profit _and_ a stop-loss to a new position in a single order, so your exits are live the instant you're filled.
- **TWAP** — spread a large order out over time to avoid moving the price against yourself.
- **Scale / ladder orders** — a series of orders across a price range, to average into (or out of) a position.
- **Leverage and margin control** — set how much leverage you use and whether a position uses isolated or shared (cross) margin.

**Simple trades, said simply:**

> 💬 "Buy $200 of Bitcoin spot."
>
> 💬 "Go long $500 of ETH with 3x leverage."
>
> 💬 "Short $300 of Solana."
>
> 💬 "Sell half my ETH position."

### The playbook: advanced trades

Each play below is **what you say**, then **what happens**.

#### The protected entry (bracket order)

> 💬 "Go long $500 of Bitcoin at 5x, take profit at +6%, stop-loss at −3%."

The agent opens the long _and_ attaches both exits as a single linked order. The take-profit and stop-loss are an "OCO" pair — **one cancels the other** — so when either fires, the leftover is automatically removed. There's no window where your position sits unprotected and no stray order left dangling. This is the recommended way to enter with a plan.

#### The seatbelt, added later

> 💬 "Put a stop-loss at $58,000 on my Bitcoin long, and take profit at $72,000."

It places protective exits sized to your existing position, marked **reduce-only** — they can only close the position, never accidentally flip you to the other side.

#### The quiet accumulation (TWAP)

> 💬 "Buy $600 of Bitcoin gradually over the next 30 minutes."

A TWAP ("time-weighted average price") order slices your buy into many small pieces spread evenly across the window, so one large order doesn't spook the market.

> [!NOTE]
> Because a TWAP is chopped into many small clips, each slice has to clear a small per-order minimum (about $10). The agent checks this for you and will say if your amount is too small or your window too long — the fix is usually a bigger total or a shorter duration.

#### The ladder (scale order)

> 💬 "Ladder into ETH — buy across five orders between $2,900 and $3,100."

It places five limit orders stepping through that range, so you average in rather than betting everything on one price. You can tilt more size toward the cheaper or richer end if you want.

#### The stock trade that isn't

> 💬 "Go long $500 of Microsoft."

There's no separate stock account — the agent finds the venue that lists MSFT as a Hyperliquid perp, sizes the order from your dollar amount, and places it. To you it feels like buying the stock; underneath it's a perp. The same works for Apple, Tesla, and other listed names, and you can add a bracket just like a crypto trade.

#### The tune-up (leverage & margin)

> 💬 "Set my Bitcoin position to 5x isolated margin."
>
> 💬 "Add $50 of margin to my BTC long so I'm further from liquidation."

It changes the leverage or margin on the existing position without opening or closing anything. "Isolated" means only the margin assigned to that one trade is at risk — see the [glossary](#speaking-the-language-a-glossary).

#### The second opinion (the desk debate)

> 💬 "What should I trade today?"
>
> 💬 "Should I short Tesla this week?"

For "is this trade worth it?" questions, the agent doesn't just answer — it convenes a desk. It gathers the research (macro, news, technicals, fundamentals), then has one side argue the trade wins, the other argue it loses, and a judge make a categorical call. A risk manager checks live market quality and execution safety. You get the verdict, the strongest argument on each side, and the one thing that would flip the call — then it's your decision. Nothing is placed unless you say go, or you've given it standing permission and every safety check passes.

---

## Part 3 — Managing positions

- **See everything** — open positions, resting orders, recent fills, and current profit and loss.
- **Adjust on the fly** — change leverage, add or remove margin, move your stop-loss.
- **Close or trim** — exit fully or reduce a position by any amount.
- **Cancel** resting orders you no longer want.
- **Move funds around** — between your spot and perp balances, or out to an external wallet.

**Check-ins and adjustments:**

> 💬 "How's my portfolio doing?"
>
> 💬 "What are my open positions and their P&L?"
>
> 💬 "Am I up or down on the week?"
>
> 💬 "Move my SOL stop up to break-even."
>
> 💬 "Close everything."

---

## Part 4 — Research (before, during, or instead of trading)

The harness has a bench of specialist analysts it consults before you trade — or just to answer a question. You reach all of them the same way: by asking.

| Specialist               | What it covers                                                                   | Ask something like                                |
| ------------------------ | -------------------------------------------------------------------------------- | ------------------------------------------------- |
| Market overview          | Global market cap, Bitcoin dominance, top gainers and losers, sector performance | 💬 "How's the market? Who's up big today?"        |
| News & sentiment         | Catalysts and headlines for a coin, stock, or theme                              | 💬 "Any news moving Solana this week?"            |
| Macro                    | Dollar index, Treasury yields, VIX, gold, oil, CPI                               | 💬 "What's the macro backdrop right now?"         |
| Smart money & discovery  | Trending tokens, new listings, what large successful wallets are buying          | 💬 "What's smart money accumulating?"             |
| Technicals & backtests   | Momentum, trend, and volatility indicators; testing a strategy against history   | 💬 "Give me the technical picture on ETH."        |
| Prediction markets       | What Polymarket implies about rate cuts, elections, and other binary outcomes    | 💬 "What are the odds the Fed cuts next meeting?" |
| Token safety             | On-chain audits of a token's contract, holders, and liquidity                    | 💬 "Is this token a rug?"                         |
| Your portfolio           | Net worth over time, realized and unrealized P&L, per-token performance          | 💬 "Break down my P&L by position."               |
| DeFi, exchanges & stocks | DEX pools and pairs, exchange and derivatives data, stock quotes and technicals  | 💬 "What are the deepest ETH pools right now?"    |

Three things the agent does for you automatically:

- **It synthesizes.** For an open-ended question like _"find me a good setup,"_ it pulls several specialists together and gives you a decision-grade answer, not a raw data dump.
- **It looks across markets.** Ask for opportunities without naming an asset class and it scans crypto, securities, _and_ commodities, presenting all three — unless you scope it yourself ("crypto only").
- **It can brief you like a morning desk note.** Say _"give me a market briefing"_ and you get the macro numbers, the headlines, prediction-market odds, and ideas across crypto, securities, and commodities — split into what's tradable now versus watchlist-only.

---

## Part 5 — Taking money out

When you want cash out, tell the agent how much and where:

> 💬 "Withdraw $100 to my wallet."

One thing it will clarify, because the two are different:

- **Withdraw to a chain** — sends USDC out of Hyperliquid to an external wallet address you control. This is what "cash out" usually means.
- **Send to another Hyperliquid user** — an internal transfer to someone else's Hyperliquid account, which stays on the exchange.

If your request is ambiguous, the agent asks which one you mean and confirms the exact amount and destination before sending. As with everything else, gas for the withdrawal is sponsored.

---

## Safety & guardrails

The harness is built to protect you from expensive mistakes:

- **It asks before risking money.** Trades, funding, and withdrawals always get a plain-language confirmation first.
- **It clarifies vague money moves.** Say _"move all my funds somewhere"_ and it will _stop and ask_ exactly what, how much, and where — rather than guessing with your balance. Ambiguity around moving money is treated as a reason to pause, deliberately.
- **It only pitches things you can actually trade.** Before suggesting an asset, it verifies the asset is really listed and tradable on Hyperliquid. Anything that isn't is clearly labeled as watchlist-only.
- **Protective exits are reduce-only.** Stop-losses and take-profits can only close a position, never accidentally open a new one.
- **New leveraged trades come with a stop-loss by default.** The agent attaches one unless you explicitly wave it off, and it warns you when a position drifts too close to liquidation.
- **Autopilot has gates.** The agent never opens a trade on its own unless you've explicitly authorized that — and even then, only when the desk judge and live safety checks agree it is executable.
- **It won't trade when you're not logged in.** If your session isn't authorized, it refuses to sign anything and asks you to log in first.
- **Your keys never leave the vault.** Private keys live in Privy and are never displayed, logged, or pasted — not in chat, not in confirmations, nowhere.

---

## Speaking the language (a glossary)

You already know markets, so the trading terms below are quick refreshers on how they apply _here_. The crypto plumbing, though, may be genuinely new.

### The crypto plumbing

| Term                        | Plain English                                                                                                                                                                             |
| --------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **USDC**                    | A stablecoin pegged 1:1 to the US dollar. Your trading balance and margin are held in it.                                                                                                 |
| **Perp (perpetual future)** | A contract that tracks an asset's price without ever expiring. Long or short, with leverage. It's how the harness trades crypto with leverage — and how it trades stocks and commodities. |
| **Spot**                    | Buying the actual asset (you own the Bitcoin). No leverage, no liquidation.                                                                                                               |
| **Gas**                     | The small network fee blockchains charge per transaction. Sponsored here — ignore it entirely.                                                                                            |
| **Bridging**                | Moving funds from one blockchain to another. The agent does this for you when funding from the "wrong" chain.                                                                             |
| **Wallet**                  | Your on-chain account. The agent controls one for you, with the keys sealed in a vault.                                                                                                   |

### Trading terms, as they apply here

| Term                        | How it works here                                                                                                                                           |
| --------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Long / short**            | Long profits when price rises; short when it falls. Both available on any perp.                                                                             |
| **Leverage**                | 5x means $100 of your money controls $500 of exposure. Multiplies gains _and_ losses.                                                                       |
| **Margin**                  | The cash backing a leveraged position — your deposited USDC.                                                                                                |
| **Isolated margin**         | Only the margin assigned to that one trade is at risk. A blow-up there can't drain the rest of your account.                                                |
| **Cross margin**            | Your whole balance backs the position — lower liquidation risk on that trade, more of your account on the line.                                             |
| **Liquidation**             | If a leveraged position moves too far against you and margin runs out, the exchange force-closes it. Higher leverage puts liquidation closer to your entry. |
| **Stop-loss / take-profit** | Automatic exits at levels you set. Always placed reduce-only.                                                                                               |
| **Bracket (OCO)**           | Take-profit + stop-loss attached to one position; whichever fires first cancels the other.                                                                  |
| **TWAP**                    | An order sliced into small pieces over a set time, to trade size without moving the price.                                                                  |
| **Scale / ladder**          | A series of orders across a price range, to average in or out.                                                                                              |
| **Notional**                | The total dollar size of a position (margin × leverage), as opposed to the cash you put up.                                                                 |

---

## FAQ / troubleshooting

**Do I need to hold ETH (or any coin) for gas?**

> No. Network fees are sponsored by the harness. You never fund gas — ignore it entirely.

**A trade failed saying "insufficient balance" — what happened?**

> That's about your _trading balance_, not gas. Your Hyperliquid account needs enough USDC margin to support the position. Fund a bit more (see [Putting money in](#part-1--putting-money-in)) and try again — the agent will usually offer to do exactly that and name funds it found in your wallet.

**Why am I asked to open a link and approve something?**

> That's the one-time login. Approving the link authorizes the agent to trade on your behalf. It completes automatically once you approve — there's nothing else to click afterward.

**The login link stopped working.**

> Each link is live for a few minutes. If it expired, just ask to log in again — the agent issues a fresh link, and the old one is dead.

**Are my private keys safe?**

> Yes. Keys are held in a secure vault (Privy) and are never shown, exported, or pasted anywhere. The agent signs trades through the vault without ever exposing the key.

**Can it really trade stocks?**

> Yes — as Hyperliquid perps. You say _"go long Microsoft"_; it routes the order to the venue that lists MSFT. It feels like a stock trade; underneath it's a perp.

**What's the minimum to get started?**

> The deposit minimum for funding Hyperliquid is **5 USDC**. Realistically, give yourself more headroom than that so orders have room to fill.

**How current is the price it uses?**

> For sizing and orders, the agent reads Hyperliquid's live mark price at the moment you trade, so _"$500 of BTC"_ is converted using the price right then.

---

_Ready? Try:_

> 💬 "Show me my balances and tell me what's interesting in the market today."
