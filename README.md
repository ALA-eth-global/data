# ALA Data Service - Node.js/Express

A Node.js/Express API that provides historical Uniswap V3 data from The Graph for AI model training.

## 🚀 Quick Start

```bash
# Install dependencies
npm install

# Create .env file (optional)
cp .env.example .env

# Start server
npm start
```

Server runs at `http://localhost:3000`

## 📡 API Endpoints

### 1. GET `/api/pool-data` - Historical Data (ZIP)

Returns a ZIP file with 3 CSVs: swaps, LP actions, and pool stats.

**Parameters:**
- `tokenAddress` (required): Token address (automatically finds most liquid pool)
- `days` (optional): Number of days (1-30, default: 1)

**Example:**
```bash
curl "http://localhost:3000/api/pool-data?tokenAddress=0xdd3b11ef34cd511a2da159034a05fcb94d806686&days=1" -o data.zip
```

**How it works:**
The API automatically queries The Graph to find the pool with the highest TVL for the given token, then fetches all historical data for that pool.

### 2. GET `/api/recent-swaps` - Last 10 Minutes (JSON)

Returns recent swaps for real-time monitoring.

**Parameters:**
- `tokenAddress` (required): Token address

**Example:**
```bash
curl "http://localhost:3000/api/recent-swaps?tokenAddress=0xdd3b11ef34cd511a2da159034a05fcb94d806686"
```

**Response includes:**
- Token info (symbol, address)
- Pool info (pair, fee tier, TVL)
- Swap data with gas costs

### 3. GET `/api/latest-swaps` - Last 5 Seconds (JSON)

Returns latest swaps for live price updates.

**Parameters:**
- `tokenAddress` (required): Token address

**Example:**
```bash
curl "http://localhost:3000/api/latest-swaps?tokenAddress=0xdd3b11ef34cd511a2da159034a05fcb94d806686"
```

### 4. POST `/api/processed-data` - 🤖 AI-Powered AMP Analytics (NEW!)

**The most powerful endpoint** - Use natural language to query blockchain data! 

This endpoint uses **OpenAI GPT** to convert your natural language query into valid SQL, then executes it on **The Graph's AMP** (Analytics & Metrics Platform) for ultra-fast results.

**Requirements:**
- `AMP_QUERY_TOKEN` configured in `.env`
- `OPENAI_API_KEY` configured in `.env`

**Request Body:**
```json
{
  "tokenAddress": "0x88e6a0c2ddd26feeb64f039a2c41296fcb3f5640",
  "query": "Show me the top 20 traders by volume in the last 24 hours"
}
```

**Note:** For AMP queries, provide an Ethereum Mainnet pool address (not Arbitrum).

**Example queries you can use:**
- "Top 20 traders by volume in the last 24 hours"
- "Hourly trading volume for the last 7 days"
- "Find all swaps larger than 10 ETH in the last 48 hours"
- "Count unique traders per day for the last 30 days"
- "Show average tick and price changes in the last 24 hours by hour"

**Response:**
```json
{
  "success": true,
  "pool_address": "0xc31e...",
  "user_query": "Top 20 traders...",
  "generated_sql": "SELECT ... (the AI-generated SQL)",
  "row_count": 20,
  "data": [...],
  "metadata": {
    "timestamp": "2025-11-22T...",
    "model_used": "gpt-4o-mini",
    "amp_url": "https://gateway.amp..."
  }
}
```

**Example with curl:**
```bash
curl -X POST http://localhost:3000/api/processed-data \
  -H "Content-Type: application/json" \
  -d '{
    "tokenAddress": "0x88e6a0c2ddd26feeb64f039a2c41296fcb3f5640",
    "query": "Show me the top 10 traders by volume in the last 24 hours"
  }'
```

### 5. GET `/api/aave-apy/current` - 📊 Current AAVE V3 Lending APY (NEW!)

Returns **current AAVE V3 WETH lending APY** data from DefiLlama. Fast and lightweight for real-time monitoring.

**No parameters required** - fetches current data for AAVE V3 WETH on Ethereum Mainnet.

**Example:**
```bash
curl "http://localhost:3000/api/aave-apy/current"
```

**Response includes:**
- **Pool Info**: Protocol, chain, asset, pool ID, underlying token
- **Current APY**: Live APY metrics
  - APY percentage (base + rewards)
  - TVL in USD
  - APY changes (1D, 7D, 30D)
  - Mean APY (30D)
  - AI predictions (trend, probability, confidence)

**Use Cases:**
- ⚡ **Real-time monitoring**: Check current lending APY quickly
- 🔄 **Live comparisons**: Compare with current LP yields
- 🤖 **Trading bots**: Make real-time allocation decisions
- 📊 **Dashboard displays**: Show current rates

**Example Response:**
```json
{
  "success": true,
  "pool_info": {
    "pool_id": "e880e828-ca59-4ec6-8d4f-27182a4dc23d",
    "protocol": "aave-v3",
    "chain": "Ethereum",
    "asset": "WETH",
    "underlying_token": "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2"
  },
  "current": {
    "timestamp": "2025-11-22T19:08:51.678Z",
    "apy": 1.23721,
    "apy_base": 1.23721,
    "apy_reward": null,
    "tvl_usd": 2287093156,
    "apy_change_1d": 0.00614,
    "apy_change_7d": -0.1636,
    "apy_change_30d": -0.67104,
    "apy_mean_30d": 1.64241,
    "stablecoin": false,
    "il_risk": "no",
    "exposure": "single",
    "predictions": {
      "predictedClass": "Stable/Up",
      "predictedProbability": 89,
      "binnedConfidence": 3
    }
  },
  "metadata": {
    "source": "DefiLlama Yields API",
    "fetched_at": "2025-11-22T19:08:51.678Z",
    "use_case": "Real-time APY for quick comparisons",
    "note": "Use /api/aave-apy/history for historical data"
  }
}
```

---

### 6. GET `/api/aave-apy/history` - 📈 Historical AAVE V3 Lending APY (NEW!)

Returns **historical AAVE V3 WETH lending APY** data (1000+ data points from 2023). Perfect for ML training and trend analysis.

**No parameters required** - fetches full historical data for AAVE V3 WETH on Ethereum Mainnet.

**Example:**
```bash
curl "http://localhost:3000/api/aave-apy/history"
```

**Response includes:**
- **Pool Info**: Protocol, chain, asset, pool ID
- **Historical Data**: Full APY history with timestamps (1000+ records)
- **Statistics**: Comprehensive stats
  - APY: min, max, avg, first, latest
  - TVL: min, max, avg, first, latest
  - Total data points

**Use Cases:**
- 🧠 **ML Training**: Train models on historical APY trends
- 📊 **Trend Analysis**: Identify long-term patterns
- 📉 **Backtesting**: Test capital allocation strategies
- 🔬 **Research**: Analyze lending market dynamics

**Example Response:**
```json
{
  "success": true,
  "pool_info": {
    "pool_id": "e880e828-ca59-4ec6-8d4f-27182a4dc23d",
    "protocol": "aave-v3",
    "chain": "Ethereum",
    "asset": "WETH"
  },
  "historical": {
    "count": 1021,
    "first_date": "2023-02-06T23:01:24.670Z",
    "last_date": "2025-11-22T18:01:37.516Z",
    "statistics": {
      "apy": {
        "min": 1.22648,
        "max": 5.84,
        "avg": 1.90052,
        "latest": 1.23721,
        "first": 1.66533
      },
      "tvl": {
        "min": 20915064,
        "max": 2619476018,
        "avg": 856234567,
        "latest": 2287093156,
        "first": 27616924
      },
      "data_points": 1021
    },
    "data": [
      { "timestamp": "2023-02-06T23:01:24.670Z", "apy": 1.66533, "tvlUsd": 27616924, ... },
      { "timestamp": "2023-02-07T23:01:03.756Z", "apy": 1.3746, "tvlUsd": 32034230, ... },
      ...
      { "timestamp": "2025-11-22T18:01:37.516Z", "apy": 1.23721, "tvlUsd": 2287093156, ... }
    ]
  },
  "metadata": {
    "source": "DefiLlama Yields API",
    "fetched_at": "2025-11-22T19:08:51.678Z",
    "use_case": "Historical APY analysis and ML training",
    "note": "Use /api/aave-apy/current for real-time data"
  }
}
```

**🔥 ML Model Ideas:**

1. **Capital Allocation Optimizer:**
   - **Input**: APY spread (LP - Lending), volatility, gas costs, TVL changes
   - **Output**: Optimal allocation % (0-100% to LP)
   - **Training**: Historical APY + positions.csv (real LP fees)

2. **APY Trend Predictor:**
   - **Input**: Recent APY history, TVL trends, market conditions
   - **Output**: Predicted APY for next 7/30 days
   - **Training**: 1000+ historical data points

3. **Yield Strategy Switcher:**
   - **Input**: Current conditions + predictions
   - **Output**: "LP", "Lending", or "Mixed" strategy
   - **Training**: Backtest on historical data

## 📦 Output Data

The ZIP contains 6 CSV files optimized for AI/ML model training:

### 1. **swaps.csv** - Granular Trade Data
Contains detailed swap/trade information:
- **Transaction info**: block_number, timestamp, tx_hash, log_index
- **Actors**: sender, recipient, origin (EOA that initiated the tx)
- **Amounts**: amount0, amount1, amount_usd
- **Price**: sqrt_price_x96, tick
- **Gas costs**: gas_used, gas_price, gas_cost_eth (computed)

### 2. **lp_actions.csv** - Liquidity Provider Actions
Mint and burn events for LP position tracking:
- **Event info**: event_type (MINT/BURN), block_number, timestamp, tx_hash
- **Position details**: tick_lower, tick_upper, tick_range (computed width)
- **Amounts**: amount, amount0, amount1, amount_usd
- **Actors**: owner, sender, origin
- **Gas costs**: gas_used, gas_price, gas_cost_eth

### 3. **pool_stats.csv** - Pool State Per Block
Pool-level metrics at each block (useful for time-series models):
- **Price/Liquidity**: liquidity, sqrt_price, tick, token0_price, token1_price
- **TVL**: tvl_usd, tvl_token0, tvl_token1
- **Volume**: volume_usd, volume_token0, volume_token1
- **Fees**: fees_usd, collected_fees_token0, collected_fees_token1
- **Metadata**: fee_tier, tx_count, token symbols and decimals

### 4. **positions.csv** - 🆕 LP Positions with Fee Data (GROUND TRUTH)
Individual LP positions with their actual collected fees:
- **Position details**: position_id, owner, tick_lower, tick_upper, liquidity
- **Deposits/Withdrawals**: deposited_token0, deposited_token1, withdrawn_token0, withdrawn_token1
- **Collected Fees**: collected_fees_token0, collected_fees_token1 (ACTUAL fees earned)
- **Fee Growth**: fee_growth_inside_0, fee_growth_inside_1 (for precise calculations)
- **Timing**: created_timestamp

**Use case**: Validate your fee calculations, benchmark against real positions, train ML models on successful strategies

### 5. **collects.csv** - 🆕 Fee Collection Events
Records of LPs collecting their earned fees:
- **Event info**: collect_id, timestamp, tx_hash, log_index
- **Position**: owner, tick_lower, tick_upper
- **Amounts collected**: amount0, amount1, amount_usd

**Use case**: Analyze when and how much LPs collect, identify profitable strategies, timing analysis

### 6. **ticks.csv** - 🆕 Liquidity Distribution by Tick
Detailed breakdown of liquidity and fees across all tick ranges:
- **Tick info**: tick_idx, liquidity_gross, liquidity_net, price0, price1
- **Volume**: volume_token0, volume_token1, volume_usd
- **Fees**: fees_usd, collected_fees_token0, collected_fees_token1
- **Fee Growth**: fee_growth_outside_0, fee_growth_outside_1

**Use case**: Identify most profitable tick ranges, optimize position placement, understand liquidity distribution

## 🧪 Example Usage

### Standard Endpoints (The Graph Subgraph)

Run the example script to test all endpoints:

```bash
npm run example
```

This will:
- Fetch historical data and save as ZIP (with all enhanced fields)
- Display recent swaps (last 10 min) with gas costs
- Display latest swaps (last 5 sec) for live price tracking
- Live monitoring for 30 seconds with real-time updates

### 🤖 AMP Analytics (AI-Powered)

Run the AMP example script to test AI-powered queries:

```bash
npm run amp-example
```

This will run 5 example natural language queries, demonstrating:
- Top traders analysis
- Hourly volume aggregation
- Large swap detection
- Unique trader counting
- Price change analysis

**Or run a custom query:**
```bash
npm run amp-example "Find the biggest swaps in the last hour"
```

## 🤖 Use Cases for AI/ML Models

The enhanced data supports various model training scenarios:

1. **Price Prediction Models**
   - Use `sqrt_price_x96`, `tick`, and `liquidity` from swaps.csv
   - Combine with `pool_stats.csv` for time-series features

2. **Gas Cost Optimization**
   - Train on `gas_used`, `gas_price`, `gas_cost_eth` across different tx types
   - Correlate with swap sizes and market conditions

3. **Liquidity Provision Strategy** 🔥
   - Analyze `lp_actions.csv` for optimal tick ranges
   - **Validate with `positions.csv`** - see actual fees earned by real LPs
   - Compare `tick_range` widths vs. fee collection (ground truth from positions.csv)
   - Use `ticks.csv` to identify most profitable ranges

4. **Market Making / Arbitrage**
   - Real-time endpoints (`/api/latest-swaps`) for live price feeds
   - Historical patterns from `swaps.csv` with sender/recipient analysis

5. **Risk Assessment**
   - Track TVL changes and volume spikes in `pool_stats.csv`
   - Analyze LP behavior patterns (mint/burn frequency)

6. **Fee Calculation & IL Simulation** 🆕
   - Calculate fees per swap: `amount * (fee_tier / 1000000)`
   - **Validate against `positions.csv` collected_fees** (ground truth)
   - Use `collects.csv` to see when successful LPs collected
   - Simulate different tick ranges and compare to real positions

7. **Optimal Position Placement** 🆕
   - Use `ticks.csv` to see where most fees are generated
   - Analyze liquidity distribution vs. fee generation
   - Train models to predict best tick ranges based on historical data

8. **LP vs Lending Yield Comparison** 🆕
   - Compare Uniswap V3 LP fees vs AAVE lending APY (`/api/aave-apy`)
   - Calculate when LP is worth the IL risk
   - Train models to optimize capital allocation
   - Real-world yields for strategy validation

## 📋 Example Token Addresses

### Arbitrum One (for Subgraph endpoints)
Simply provide any token address, and the API will automatically find the most liquid pool!

Examples:
- **REKT**: `0xdd3b11ef34cd511a2da159034a05fcb94d806686`
- **USDC**: `0xaf88d065e77c8cC2239327C5EDb3A432268e5831`
- **WETH**: `0x82aF49447D8a07e3bd95BD0d56f35241523fBab1`
- **ARB**: `0x912CE59144191C1204E64559FE8253a0e49E6548`

### Ethereum Mainnet (for AMP endpoint)
For AMP, provide the pool address directly:
- **USDC/WETH Pool (0.05%)**: `0x88e6a0c2ddd26feeb64f039a2c41296fcb3f5640`
- **WBTC/ETH Pool (0.3%)**: `0xcbcdf9626bc03e24f779434178a73a0b4bad62ed`

## 🔧 Configuration

Create a `.env` file in the project root with the following variables:

### Required for Basic Endpoints
```bash
PORT=3000                    # Server port
HOST=localhost               # Server host
LOG_LEVEL=INFO               # Logging level (INFO, DEBUG, ERROR)
```

### Optional - The Graph Subgraph
```bash
SUBGRAPH_URL=https://...     # Custom subgraph URL
THE_GRAPH_API_KEY=           # For higher rate limits
```

### Required for AMP Analytics (AI-Powered)
```bash
# Get AMP token at: https://thegraph.com/studio/
AMP_QUERY_URL=https://gateway.amp.staging.thegraph.com
AMP_QUERY_TOKEN=amp_xxx...   # REQUIRED for /api/processed-data

# Get OpenAI key at: https://platform.openai.com/api-keys
OPENAI_API_KEY=sk-xxx...     # REQUIRED for /api/processed-data
OPENAI_MODEL=gpt-4o-mini     # Model to use (gpt-4o-mini recommended)

# Safety limits
AMP_MAX_ROWS=10000           # Max rows to return from AMP
```

**Copy the template:**
```bash
# A .env.example file is provided in the repo
# Note: You'll need to manually create a .env file with your keys
```

## 🛠️ Scripts

```bash
npm start            # Start server
npm run dev          # Start with auto-reload (nodemon)
npm run example      # Run example usage (standard endpoints)
npm run amp-example  # Run AMP analytics examples (AI-powered)
```

## 📚 Dependencies

### Core
- **express**: Web framework
- **axios**: HTTP client for GraphQL queries
- **dotenv**: Environment variables
- **cors**: CORS support

### Data Processing
- **archiver**: ZIP file creation for historical data

### AMP Analytics (Optional)
- **@edgeandnode/amp**: The Graph AMP client
- **@connectrpc/connect-node**: gRPC transport for AMP
- **openai**: OpenAI API client for SQL generation

## 🤖 AMP Analytics Architecture

The `/api/processed-data` endpoint uses a powerful AI pipeline:

```
Natural Language Query
        ↓
    OpenAI GPT (SQL Generator)
        ↓
    AMP SQL Query
        ↓
    The Graph AMP Platform
        ↓
    Processed Results
```

**Benefits:**
- 🚀 **Lightning Fast**: AMP provides sub-second queries on massive datasets
- 🧠 **AI-Powered**: No SQL knowledge required - just ask in plain English
- 📊 **Flexible**: Any analytics query you can imagine
- 🔍 **Transparent**: See the generated SQL and understand what's happening

**Example Use Cases:**
1. **Trading Strategy Analysis**: "Show me traders who made more than 10 swaps in the last hour"
2. **Market Monitoring**: "What's the hourly volume trend for the last 3 days?"
3. **Whale Tracking**: "Find all swaps above $1M equivalent in the last week"
4. **Pattern Detection**: "Show me the distribution of swap sizes grouped by time of day"

## 🐛 Troubleshooting

### General Issues

**Server not starting?** 
- Check if port 3000 is available
- Verify Node.js version (v16+ recommended)

**No data returned?** 
- Verify the token address is correct and exists on the network
- For The Graph subgraph endpoints: Use Arbitrum One token addresses  
- For AMP endpoints: Use Ethereum Mainnet pool addresses
- Token must have at least one whitelisted pool with liquidity

### The Graph Subgraph Issues

**Rate limiting?** 
- Add a The Graph API key to `.env` as `THE_GRAPH_API_KEY`
- Get one at: https://thegraph.com/studio/apikeys/

### AMP Analytics Issues

**"AMP service not configured" error?**
- Set `AMP_QUERY_TOKEN` in your `.env` file
- Generate token at: https://thegraph.com/studio/

**"OpenAI service not configured" error?**
- Set `OPENAI_API_KEY` in your `.env` file
- Get API key at: https://platform.openai.com/api-keys

**SQL generation fails?**
- Try rephrasing your query to be more specific
- Include time ranges (e.g., "last 24 hours")
- Check OpenAI API quota and billing

**AMP query timeout?**
- Reduce the time range in your query
- Limit the number of rows (add "LIMIT 100" to your request)
- Increase `AMP_MAX_ROWS` in `.env` if needed

**Wrong pool address format?**
- AMP uses **Ethereum Mainnet** addresses
- The Graph subgraph uses **Arbitrum One** addresses
- Make sure you're using the correct network's pool address

## 📊 Data Fields Reference

### Swaps CSV Fields
| Field | Type | Description |
|-------|------|-------------|
| swap_id | string | Unique swap identifier |
| block_number | int | Block number |
| timestamp | int | Unix timestamp |
| tx_hash | string | Transaction hash |
| sender | address | Swap initiator contract |
| recipient | address | Swap recipient |
| origin | address | Original EOA |
| amount0 | float | Token0 amount (can be negative) |
| amount1 | float | Token1 amount (can be negative) |
| amount_usd | float | USD value |
| sqrt_price_x96 | string | Price in Q96 format |
| tick | int | Pool tick after swap |
| gas_used | int | Gas units consumed |
| gas_price | int | Gas price in wei |
| gas_cost_eth | float | Total gas cost in ETH |

### LP Actions CSV Fields
| Field | Type | Description |
|-------|------|-------------|
| event_type | string | "MINT" or "BURN" |
| tick_lower | int | Position lower tick |
| tick_upper | int | Position upper tick |
| tick_range | int | Computed: upper - lower |
| amount | float | Liquidity amount |
| amount0 | float | Token0 amount |
| amount1 | float | Token1 amount |
| amount_usd | float | USD value |

### Positions CSV Fields 🆕
| Field | Type | Description |
|-------|------|-------------|
| position_id | string | Unique position identifier |
| owner | address | Position owner address |
| tick_lower | int | Lower tick boundary |
| tick_upper | int | Upper tick boundary |
| liquidity | string | Current liquidity amount |
| deposited_token0 | float | Total token0 deposited |
| deposited_token1 | float | Total token1 deposited |
| withdrawn_token0 | float | Total token0 withdrawn |
| withdrawn_token1 | float | Total token1 withdrawn |
| **collected_fees_token0** | **float** | **Total fees earned (token0)** ⭐ |
| **collected_fees_token1** | **float** | **Total fees earned (token1)** ⭐ |
| fee_growth_inside_0 | string | Fee growth inside range (token0) |
| fee_growth_inside_1 | string | Fee growth inside range (token1) |
| created_timestamp | int | When position was created |

### Collects CSV Fields 🆕
| Field | Type | Description |
|-------|------|-------------|
| collect_id | string | Unique collect event ID |
| timestamp | int | Unix timestamp |
| tx_hash | string | Transaction hash |
| owner | address | Position owner |
| tick_lower | int | Position lower tick |
| tick_upper | int | Position upper tick |
| amount0 | float | Token0 collected |
| amount1 | float | Token1 collected |
| amount_usd | float | USD value collected |

### Ticks CSV Fields 🆕
| Field | Type | Description |
|-------|------|-------------|
| tick_idx | int | Tick index |
| liquidity_gross | string | Total liquidity at tick |
| liquidity_net | string | Net liquidity change |
| price0 | float | Price of token0 |
| price1 | float | Price of token1 |
| volume_token0 | float | Volume in token0 |
| volume_token1 | float | Volume in token1 |
| volume_usd | float | Volume in USD |
| fees_usd | float | Total fees in USD |
| **collected_fees_token0** | **float** | **Fees collected (token0)** |
| **collected_fees_token1** | **float** | **Fees collected (token1)** |
| fee_growth_outside_0 | string | Fee growth outside range |
| fee_growth_outside_1 | string | Fee growth outside range |

### Pool Stats CSV Fields
| Field | Type | Description |
|-------|------|-------------|
| liquidity | string | Total active liquidity |
| sqrt_price | string | Current pool price |
| token0_price | float | Token0 price in token1 |
| token1_price | float | Token1 price in token0 |
| tvl_usd | float | Total value locked (USD) |
| volume_usd | float | Cumulative volume |
| fees_usd | float | Cumulative fees |
| fee_tier | int | Pool fee tier (e.g., 500 = 0.05%) |
| token0_symbol | string | Token0 symbol |
| token1_symbol | string | Token1 symbol |

## 💡 AMP Query Examples

Here are some powerful queries you can try with the `/api/processed-data` endpoint:

### Trading Analysis
```
"Show me the top 50 traders by total volume in the last 7 days"
"Find all trades larger than $100,000 in the last 24 hours"
"What are the average swap sizes per hour for the last 3 days?"
```

### Volume & Liquidity
```
"Calculate daily trading volume for the last 30 days"
"Show me hourly volume distribution for the last week"
"What's the total volume by unique traders in the last 24 hours?"
```

### Pattern Analysis
```
"Count the number of swaps per hour for the last 2 days"
"Show me the distribution of swap sizes (small, medium, large)"
"Find the most active trading hours in the last week"
```

### Whale Tracking
```
"Show me all swaps above $500k in the last month"
"Find traders who made more than 20 swaps in the last day"
"What are the largest single swaps in the last 48 hours?"
```

### Price & Tick Analysis
```
"Show average tick changes by hour for the last 24 hours"
"Calculate price volatility (tick stddev) per day for the last week"
"Find all swaps that moved the price by more than 1% in the last day"
```

## 📖 Resources

### Documentation
- [The Graph Documentation](https://thegraph.com/docs/)
- [The Graph AMP](https://thegraph.com/docs/en/querying/querying-with-amp/)
- [Uniswap V3 Subgraph](https://github.com/Uniswap/v3-subgraph)
- [Express Documentation](https://expressjs.com/)
- [Uniswap V3 Math](https://docs.uniswap.org/contracts/v3/reference/core/libraries/TickMath)

### APIs & Keys
- [Get The Graph API Key](https://thegraph.com/studio/apikeys/)
- [Get AMP Query Token](https://thegraph.com/studio/)
- [Get OpenAI API Key](https://platform.openai.com/api-keys)

### Datasets
- [Uniswap V3 Ethereum Dataset on AMP](https://thegraph.com/explorer/datasets/edgeandnode/uniswap_v3_ethereum)

