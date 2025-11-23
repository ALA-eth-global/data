# 🚀 ALA Data Service

<div align="center">

**High-Performance Blockchain Data API for Uniswap V3 & DeFi Analytics**

[![Node.js](https://img.shields.io/badge/Node.js-18+-green.svg)](https://nodejs.org/)
[![Express](https://img.shields.io/badge/Express-4.18-blue.svg)](https://expressjs.com/)
[![License](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![The Graph](https://img.shields.io/badge/The%20Graph-AMP-orange.svg)](https://thegraph.com/)

*Powering AI-driven liquidity strategies with real-time and historical blockchain data*

</div>

---

## 📋 Table of Contents

- [Overview](#-overview)
- [Features](#-features)
- [Quick Start](#-quick-start)
- [Architecture](#-architecture)
- [API Endpoints](#-api-endpoints)
- [Data Output](#-data-output)
- [Configuration](#-configuration)
- [Use Cases](#-use-cases)
- [Examples](#-examples)
- [Troubleshooting](#-troubleshooting)

---

## 🎯 Overview

The **ALA Data Service** is a comprehensive Node.js/Express API that provides access to historical and real-time Uniswap V3 data from The Graph. Designed specifically for AI/ML model training and DeFi analytics, it offers:

- 📊 **Historical Data Export**: Complete pool data in CSV format (swaps, LP actions, positions, fees)
- ⚡ **Real-time Monitoring**: Live swap feeds and price updates
- 🤖 **AI-Powered Analytics**: Natural language queries powered by OpenAI + The Graph AMP
- 💰 **Yield Data**: AAVE V3 lending APY for capital allocation strategies

### Why This Service?

- ✅ **Automated Pool Discovery**: Just provide a token address - we find the most liquid pool
- ✅ **Complete Data**: 6 CSV files with everything you need for ML training
- ✅ **Ground Truth Data**: Real LP positions with actual collected fees
- ✅ **AI Integration**: Query blockchain data in plain English
- ✅ **Production Ready**: Built for reliability and performance

---

## ✨ Features

| Feature | Description |
|---------|-------------|
| 🔍 **Smart Pool Discovery** | Automatically finds the most liquid pool for any token |
| 📦 **Complete Data Export** | 6 CSV files: swaps, LP actions, pool stats, positions, collects, ticks |
| 💎 **Ground Truth Fees** | Real collected fees from actual LP positions |
| ⚡ **Real-time Feeds** | Live swap monitoring (5 seconds to 10 minutes) |
| 🤖 **AI-Powered Queries** | Natural language → SQL using OpenAI + The Graph AMP |
| 📈 **Yield Analytics** | AAVE V3 APY data (current + historical) |
| 🎯 **ML-Ready Format** | Optimized CSV structure for training models |
| 🔐 **Secure & Scalable** | API key support, rate limiting, error handling |

---

## 🚀 Quick Start

### Prerequisites

- **Node.js** 18+ ([Download](https://nodejs.org/))
- **npm** or **yarn**

### Installation

```bash
# Clone the repository
git clone https://github.com/ALA-eth-global/data.git
cd data

# Install dependencies
npm install

# Create environment file
cp .env.example .env
# Edit .env with your API keys (optional for basic usage)

# Start the server
npm start
```

The server will start at `http://localhost:3000` 🎉

### Quick Test

```bash
# Test the API
curl "http://localhost:3000/api/recent-swaps?tokenAddress=0xdd3b11ef34cd511a2da159034a05fcb94d806686"
```

---

## 🏗️ Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    ALA Data Service                          │
│                  (Express.js API Server)                     │
└─────────────────────────────────────────────────────────────┘
                            │
        ┌───────────────────┼───────────────────┐
        │                   │                   │
        ▼                   ▼                   ▼
┌──────────────┐    ┌──────────────┐    ┌──────────────┐
│  The Graph   │    │  The Graph   │    │  DefiLlama   │
│  Subgraph    │    │     AMP      │    │  Yields API  │
│  (--------)  │    │  (Ethereum)  │    │  (AAVE APY)  │
└──────────────┘    └──────────────┘    └──────────────┘
        │                   │                   │
        │                   │                   │
        ▼                   ▼                   ▼
┌─────────────────────────────────────────────────────────────┐
│                    OpenAI GPT-5                              │
│              (SQL Generation from NL)                        │
└─────────────────────────────────────────────────────────────┘
```

### Data Flow

1. **Historical Data**: Token Address → The Graph Subgraph → CSV Export
2. **Real-time Data**: Token Address → The Graph Subgraph → JSON Response
3. **AI Analytics**: Natural Language → OpenAI → SQL → The Graph AMP → Results
4. **Yield Data**: DefiLlama API → AAVE V3 APY → JSON Response

---

## 📡 API Endpoints

### 1. 📦 Historical Data Export

**`GET /api/pool-data`**

Download complete historical data as a ZIP file containing 6 CSV files.

**Parameters:**
- `tokenAddress` (required): Token address (any network)
- `days` (optional): Number of days (1-30, default: 1)

**Example:**
```bash
curl "http://localhost:3000/api/pool-data?tokenAddress=0xdd3b11ef34cd511a2da159034a05fcb94d806686&days=7" \
  -o historical_data.zip
```

**Response:** ZIP file with 6 CSVs (see [Data Output](#-data-output))

---

### 2. ⚡ Recent Swaps (10 Minutes)

**`GET /api/recent-swaps`**

Get swaps from the last 10 minutes for real-time monitoring.

**Parameters:**
- `tokenAddress` (required): Token address

**Example:**
```bash
curl "http://localhost:3000/api/recent-swaps?tokenAddress=0xdd3b11ef34cd511a2da159034a05fcb94d806686"
```

**Response:**
```json
{
  "token_address": "0xdd3b11ef34cd511a2da159034a05fcb94d806686",
  "token_symbol": "REKT",
  "pool_address": "0x...",
  "pool_info": {
    "pair": "REKT/WETH",
    "fee_tier": "0.3%",
    "tvl_usd": "1234567.89"
  },
  "swaps": [
    {
      "timestamp": 1700000000,
      "amount_usd": 5000.50,
      "gas_cost_eth": 0.001,
      "tick": 12345
    }
  ]
}
```

---

### 3. 🔥 Latest Swaps (5 Seconds)

**`GET /api/latest-swaps`**

Ultra-fast endpoint for live price tracking and arbitrage detection.

**Parameters:**
- `tokenAddress` (required): Token address

**Example:**
```bash
curl "http://localhost:3000/api/latest-swaps?tokenAddress=0xdd3b11ef34cd511a2da159034a05fcb94d806686"
```

---

### 4. 🤖 AI-Powered Analytics

**`POST /api/processed-data`**

Query blockchain data using natural language! Powered by OpenAI GPT + The Graph AMP.

**Requirements:**
- `AMP_QUERY_TOKEN` in `.env`
- `OPENAI_API_KEY` in `.env`

**Request:**
```json
{
  "tokenAddress": "0x88e6a0c2ddd26feeb64f039a2c41296fcb3f5640",
  "query": "Show me the top 20 traders by volume in the last 24 hours"
}
```

**Example:**
```bash
curl -X POST http://localhost:3000/api/processed-data \
  -H "Content-Type: application/json" \
  -d '{
    "tokenAddress": "0x88e6a0c2ddd26feeb64f039a2c41296fcb3f5640",
    "query": "Find all swaps larger than $100,000 in the last 48 hours"
  }'
```

**Response:**
```json
{
  "success": true,
  "pool_address": "0x88e6a0c2ddd26feeb64f039a2c41296fcb3f5640",
  "user_query": "Find all swaps larger than $100,000...",
  "generated_sql": "SELECT ...",
  "row_count": 15,
  "data": [...],
  "metadata": {
    "timestamp": "2025-11-22T19:08:51.678Z",
    "model_used": "gpt-4o-mini",
    "amp_url": "https://gateway.amp.staging.thegraph.com"
  }
}
```

**💡 Example Queries:**
- `"Top 50 traders by volume in the last 7 days"`
- `"Hourly trading volume for the last 30 days"`
- `"Find all swaps above $1M in the last week"`
- `"Count unique traders per day for the last month"`
- `"Show average price changes by hour for the last 24 hours"`

---

### 5. 💰 Current AAVE APY

**`GET /api/aave-apy/current`**

Get current AAVE V3 WETH lending APY for real-time yield comparisons.

**Example:**
```bash
curl "http://localhost:3000/api/aave-apy/current"
```

**Response:**
```json
{
  "success": true,
  "pool_info": {
    "protocol": "aave-v3",
    "chain": "Ethereum",
    "asset": "WETH"
  },
  "current": {
    "apy": 1.23721,
    "tvl_usd": 2287093156,
    "apy_change_1d": 0.00614,
    "apy_change_7d": -0.1636,
    "apy_mean_30d": 1.64241
  }
}
```

---

### 6. 📈 Historical AAVE APY

**`GET /api/aave-apy/history`**

Get full historical AAVE V3 APY data (1000+ data points since 2023) for ML training.

**Example:**
```bash
curl "http://localhost:3000/api/aave-apy/history"
```

**Response:**
```json
{
  "success": true,
  "historical": {
    "count": 1021,
    "first_date": "2023-02-06T23:01:24.670Z",
    "last_date": "2025-11-22T18:01:37.516Z",
    "statistics": {
      "apy": {
        "min": 1.22648,
        "max": 5.84,
        "avg": 1.90052
      }
    },
    "data": [...]
  }
}
```

---

## 📊 Data Output

The `/api/pool-data` endpoint returns a ZIP file with **6 CSV files** optimized for ML training:

### 📄 File Structure

```
historical_data.zip
├── swaps.csv              # Granular trade data
├── lp_actions.csv         # Mint/burn events
├── pool_stats.csv         # Pool state per block
├── positions.csv          # LP positions with collected fees ⭐
├── collects.csv           # Fee collection events
└── ticks.csv              # Liquidity distribution by tick
```

### 📋 CSV Details

#### 1. **swaps.csv** - Trade Data
| Field | Description |
|-------|-------------|
| `swap_id` | Unique swap identifier |
| `block_number` | Block number |
| `timestamp` | Unix timestamp |
| `amount_usd` | USD value of swap |
| `sqrt_price_x96` | Price in Q96 format |
| `tick` | Pool tick after swap |
| `gas_cost_eth` | Gas cost in ETH |
| `sender`, `recipient`, `origin` | Addresses |

#### 2. **lp_actions.csv** - Liquidity Events
| Field | Description |
|-------|-------------|
| `event_type` | "MINT" or "BURN" |
| `tick_lower`, `tick_upper` | Position range |
| `tick_range` | Computed width |
| `amount_usd` | USD value |
| `gas_cost_eth` | Gas cost |

#### 3. **pool_stats.csv** - Pool State
| Field | Description |
|-------|-------------|
| `liquidity` | Total active liquidity |
| `sqrt_price` | Current pool price |
| `tvl_usd` | Total value locked |
| `volume_usd` | Cumulative volume |
| `fees_usd` | Cumulative fees |
| `fee_tier` | Pool fee (e.g., 500 = 0.05%) |

#### 4. **positions.csv** ⭐ - Ground Truth Data
| Field | Description |
|-------|-------------|
| `position_id` | Unique position ID |
| `owner` | Position owner |
| `tick_lower`, `tick_upper` | Position range |
| `collected_fees_token0` | **Actual fees earned** ⭐ |
| `collected_fees_token1` | **Actual fees earned** ⭐ |
| `deposited_token0`, `deposited_token1` | Deposits |
| `withdrawn_token0`, `withdrawn_token1` | Withdrawals |

**Use Case:** Validate your fee calculations against real LP positions!

#### 5. **collects.csv** - Fee Collections
| Field | Description |
|-------|-------------|
| `collect_id` | Unique collect event ID |
| `owner` | Position owner |
| `amount0`, `amount1` | Fees collected |
| `amount_usd` | USD value |

#### 6. **ticks.csv** - Liquidity Distribution
| Field | Description |
|-------|-------------|
| `tick_idx` | Tick index |
| `liquidity_gross` | Total liquidity at tick |
| `volume_usd` | Volume at tick |
| `fees_usd` | Fees generated at tick |
| `collected_fees_token0`, `collected_fees_token1` | Fees collected |

---

## ⚙️ Configuration

Create a `.env` file in the project root:

### Basic Configuration (Required)

```bash
PORT=3000
HOST=localhost
LOG_LEVEL=INFO
```

### The Graph Subgraph (Optional)

```bash
# For higher rate limits
THE_GRAPH_API_KEY=your_api_key_here

# Custom subgraph URL (default: Arbitrum Uniswap V3)
SUBGRAPH_URL=https://gateway.thegraph.com/api/subgraphs/id/...
```

### AI-Powered Analytics (Optional)

```bash
# Get AMP token at: https://thegraph.com/studio/
AMP_QUERY_URL=https://gateway.amp.staging.thegraph.com
AMP_QUERY_TOKEN=amp_xxx...

# Get OpenAI key at: https://platform.openai.com/api-keys
OPENAI_API_KEY=sk-xxx...
OPENAI_MODEL=gpt-4o-mini

# Safety limits
AMP_MAX_ROWS=10000
```

### Getting API Keys

| Service | Link | Purpose |
|---------|------|---------|
| **The Graph API Key** | [Get Key](https://thegraph.com/studio/apikeys/) | Higher rate limits |
| **AMP Query Token** | [Get Token](https://thegraph.com/studio/) | AI-powered analytics |
| **OpenAI API Key** | [Get Key](https://platform.openai.com/api-keys) | SQL generation |

---

## 🎯 Use Cases

### 🤖 Machine Learning Training

1. **Price Prediction Models**
   - Train on `swaps.csv` with price, volume, liquidity
   - Use `pool_stats.csv` for time-series features

2. **Liquidity Provision Strategy**
   - Analyze `positions.csv` for optimal tick ranges
   - Compare your strategy vs. real LP performance
   - Use `ticks.csv` to find most profitable ranges

3. **Gas Cost Optimization**
   - Train on `gas_cost_eth` across different transaction types
   - Correlate with swap sizes and market conditions

4. **Capital Allocation Models**
   - Compare LP fees vs. AAVE APY (`/api/aave-apy`)
   - Train models to optimize allocation between LP and lending

### 📊 Analytics & Research

1. **Trading Analysis**
   - Identify top traders and whale activity
   - Analyze swap patterns and volume trends

2. **Market Making**
   - Real-time price feeds (`/api/latest-swaps`)
   - Historical patterns for backtesting

3. **Risk Assessment**
   - Track TVL changes and volume spikes
   - Analyze LP behavior patterns

---

## 💻 Examples

### Run Example Scripts

```bash
# Standard endpoints example
npm run example

# AI-powered AMP analytics example
npm run amp-example
```

### Example Token Addresses

**Arbitrum One** (for Subgraph endpoints):
- REKT: `0xdd3b11ef34cd511a2da159034a05fcb94d806686`
- USDC: `0xaf88d065e77c8cC2239327C5EDb3A432268e5831`
- WETH: `0x82aF49447D8a07e3bd95BD0d56f35241523fBab1`

**Ethereum Mainnet** (for AMP endpoint):
- USDC/WETH Pool: `0x88e6a0c2ddd26feeb64f039a2c41296fcb3f5640`
- WBTC/ETH Pool: `0xcbcdf9626bc03e24f779434178a73a0b4bad62ed`

### Code Example

```javascript
const axios = require('axios');

// Fetch historical data
const response = await axios.get('http://localhost:3000/api/pool-data', {
  params: {
    tokenAddress: '0xdd3b11ef34cd511a2da159034a05fcb94d806686',
    days: 7
  },
  responseType: 'arraybuffer'
});

// Save ZIP file
const fs = require('fs');
fs.writeFileSync('data.zip', response.data);
console.log('✅ Data downloaded!');
```

---

## 🐛 Troubleshooting

### Server Issues

**Port already in use?**
```bash
# Change port in .env
PORT=3001
```

**Server not starting?**
- Check Node.js version: `node --version` (need 18+)
- Verify dependencies: `npm install`

### Data Issues

**No data returned?**
- Verify token address is correct
- Token must have at least one pool with liquidity
- For Subgraph: Use Arbitrum One addresses
- For AMP: Use Ethereum Mainnet pool addresses

### Rate Limiting

**Getting rate limited?**
- Add `THE_GRAPH_API_KEY` to `.env`
- Get key at: https://thegraph.com/studio/apikeys/

### AMP Analytics Issues

**"AMP service not configured"?**
- Set `AMP_QUERY_TOKEN` in `.env`
- Get token at: https://thegraph.com/studio/

**"OpenAI service not configured"?**
- Set `OPENAI_API_KEY` in `.env`
- Get key at: https://platform.openai.com/api-keys

**SQL generation fails?**
- Try rephrasing your query
- Include time ranges (e.g., "last 24 hours")
- Check OpenAI API quota

---

## 📚 Resources

### Documentation
- [The Graph Documentation](https://thegraph.com/docs/)
- [The Graph AMP](https://thegraph.com/docs/en/querying/querying-with-amp/)
- [Uniswap V3 Subgraph](https://github.com/Uniswap/v3-subgraph)
- [Express.js Docs](https://expressjs.com/)

### APIs & Keys
- [Get The Graph API Key](https://thegraph.com/studio/apikeys/)
- [Get AMP Query Token](https://thegraph.com/studio/)
- [Get OpenAI API Key](https://platform.openai.com/api-keys)

### Datasets
- [Uniswap V3 Ethereum Dataset on AMP](https://thegraph.com/explorer/datasets/edgeandnode/uniswap_v3_ethereum)

---

## 📝 Scripts

```bash
npm start            # Start server
npm run dev          # Start with auto-reload (nodemon)
npm run example      # Run standard endpoints example
npm run amp-example  # Run AI-powered analytics example
```

---

## 🤝 Contributing

This is part of the **ALA (Autonomous Liquidity Agents)** project. For contributions, please see the main repository.

---

## 📄 License

MIT License - see LICENSE file for details

---

<div align="center">

**Built with ❤️ for the DeFi community**

[ALA Project](https://github.com/ALA-eth-global) • [Documentation](https://github.com/ALA-eth-global) • [Report Issue](https://github.com/ALA-eth-global/data/issues)

</div>
