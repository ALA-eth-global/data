/**
 * ALA (Autonomous Liquidity Agents) - Express Backend
 * Provides historical Uniswap V3 data for AI model training
 */

const express = require('express');
const axios = require('axios');
const archiver = require('archiver');
const cors = require('cors');
const config = require('./config');
const { createClient, createAuthInterceptor } = require('@edgeandnode/amp');
const { createConnectTransport } = require('@connectrpc/connect-node');
const OpenAI = require('openai');

const app = express();

// Middleware
app.use(cors());
app.use(express.json());

// Logging utility
const logger = {
  info: (msg) => console.log(`[INFO] ${msg}`),
  error: (msg) => console.error(`[ERROR] ${msg}`),
  debug: (msg) => config.logLevel === 'DEBUG' && console.log(`[DEBUG] ${msg}`)
};

// Initialize AMP client (only if token is configured)
let ampClient = null;
if (config.ampQueryToken) {
  try {
    const transport = createConnectTransport({
      baseUrl: config.ampQueryUrl,
      httpVersion: "2",
      interceptors: [createAuthInterceptor(config.ampQueryToken)]
    });
    ampClient = createClient(transport);
    logger.info('AMP client initialized successfully');
  } catch (error) {
    logger.error(`Failed to initialize AMP client: ${error.message}`);
  }
}

// Initialize OpenAI client (only if API key is configured)
let openaiClient = null;
if (config.openaiApiKey) {
  try {
    openaiClient = new OpenAI({ apiKey: config.openaiApiKey });
    logger.info('OpenAI client initialized successfully');
  } catch (error) {
    logger.error(`Failed to initialize OpenAI client: ${error.message}`);
  }
}

/**
 * Generate SQL query using OpenAI based on natural language input
 */
async function generateSQLWithLLM(userQuery, poolAddress) {
  if (!openaiClient) {
    throw new Error('OpenAI client not initialized. Please set OPENAI_API_KEY in environment.');
  }

  const systemPrompt = `You are an expert SQL generator for The Graph AMP Playground.
Your job is: given a natural language instruction from the user, generate a SINGLE valid SQL query that runs on AMP over the dataset
"edgeandnode/uniswap_v3_ethereum@0.0.1".

IMPORTANT RULES ABOUT AMP SQL AND THIS DATASET
----------------------------------------------

1) GENERAL STYLE
- Always return ONLY the SQL query, no explanations, no comments.
- Use standard SQL as in the AMP examples (Postgres/Arrow-SQL-like).
- Use double quotes around table names, for example:
  "edgeandnode/uniswap_v3_ethereum@0.0.1".event__swap

2) TABLES AND IMPORTANT COLUMNS

Main tables you will use:

- "edgeandnode/uniswap_v3_ethereum@0.0.1".event__swap  AS s
  Columns:
    - s.timestamp          (timestamp)
    - s.tx_hash            (transaction hash)
    - s.pool_address       (address of the pool, stored as FixedSizeBinary(20))
    - s.event              (struct/object with swap event fields)
  
  Inside s.event (these are strings that need casting):
    - s.event['recipient']   : address of trader/recipient
    - s.event['sender']      : address of sender
    - s.event['amount0']     : signed number as string
    - s.event['amount1']     : signed number as string
    - s.event['sqrtPriceX96']
    - s.event['liquidity']
    - s.event['tick']

- "edgeandnode/uniswap_v3_ethereum@0.0.1".event__factory_pool_created  AS p
  Columns:
    - p.event['pool']    : address of the pool (FixedSizeBinary(20))
    - p.event['token0']  : address of token0
    - p.event['token1']  : address of token1
    - p.event['fee']     : fee tier

3) ADDRESS / POOL_ADDRESS RULES (CRITICAL)
-----------------------------------------
- Addresses (like pool_address) are stored as Arrow type FixedSizeBinary(20).
- You MUST NOT compare them directly to string literals like '0xabc...'.
- Instead, you MUST:
  1) Remove the "0x" prefix.
  2) Use a hex literal of the form: x'ABCDEF...'
  3) Cast it with arrow_cast(..., 'FixedSizeBinary(20)').

Example for pool 0xAe4045ffeDdF61D570E6d1fE2D71DED1A2E85a88:
  WHERE s.pool_address = arrow_cast(
      x'ae4045ffedf61d570e6d1fe2d71ded1a2e85a88',
      'FixedSizeBinary(20)'
  )

4) CASTING NUMERIC FIELDS FROM EVENT
------------------------------------
- Numeric values inside event are stored as strings and MUST be cast using arrow_cast.
- For swap amounts:
  ABS(arrow_cast(s.event['amount0'], 'Float64')) AS amount0
  ABS(arrow_cast(s.event['amount1'], 'Float64')) AS amount1
- If a signed value is needed (direction of trade), do NOT use ABS().
  Just use arrow_cast(s.event['amount0'], 'Float64').

5) TIME FILTERS
---------------
- Use the s.timestamp column for time constraints.
- To filter the last 24 hours, use:
  WHERE s.timestamp >= now() - INTERVAL '24 hours'
- To aggregate by day, use:
  DATE_TRUNC('day', s.timestamp) AS date

6) TYPICAL PATTERNS YOU SHOULD FOLLOW
-------------------------------------

A) Top traders by volume in a given pool in the last 24 hours:
  WITH swaps AS (
      SELECT
          s.event['recipient'] AS trader,
          ABS(arrow_cast(s.event['amount0'], 'Float64')) AS amount0,
          ABS(arrow_cast(s.event['amount1'], 'Float64')) AS amount1
      FROM "edgeandnode/uniswap_v3_ethereum@0.0.1".event__swap s
      WHERE s.pool_address = arrow_cast(
                x'<POOL_HEX_WITHOUT_0X>',
                'FixedSizeBinary(20)'
            )
        AND s.timestamp >= now() - INTERVAL '24 hours'
  )
  SELECT
      trader,
      COUNT(*) AS swap_count,
      SUM(amount0) AS total_volume_amount0,
      SUM(amount1) AS total_volume_amount1,
      (SUM(amount0) + SUM(amount1)) AS total_volume
  FROM swaps
  GROUP BY trader
  ORDER BY total_volume DESC
  LIMIT 30;

OUTPUT FORMAT
-------------
- Output MUST be only the SQL query, with no backticks, no markdown, no explanations.
- The query MUST be syntactically valid and follow all the typing rules above.`;

  const userPrompt = `Generate a SQL query for pool address ${poolAddress}.
User request: ${userQuery}

Remember to:
1. Remove "0x" from the pool address and use lowercase
2. Use arrow_cast(x'hex', 'FixedSizeBinary(20)') for the pool address
3. Cast numeric fields with arrow_cast(..., 'Float64')
4. Return ONLY the SQL query, no explanations`;

  try {
    logger.info(`Generating SQL query with OpenAI for: "${userQuery}"`);
    
    const response = await openaiClient.chat.completions.create({
      model: config.openaiModel,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt }
      ],
      temperature: 1,
      max_completion_tokens: 20000
    });

    const generatedSQL = response.choices[0].message.content.trim();
    logger.debug(`Generated SQL: ${generatedSQL.substring(0, 200)}...`);
    
    return generatedSQL;
  } catch (error) {
    logger.error(`Error generating SQL with OpenAI: ${error.message}`);
    throw new Error(`Failed to generate SQL query: ${error.message}`);
  }
}

/**
 * Execute AMP SQL query
 */
async function executeAMPQuery(sql) {
  if (!ampClient) {
    throw new Error('AMP client not initialized. Please set AMP_QUERY_TOKEN in environment.');
  }

  try {
    logger.info('Executing AMP query...');
    const results = [];
    
    for await (const batch of ampClient.query(sql)) {
      results.push(...batch);
      
      // Safety limit to prevent memory issues
      if (results.length > config.ampMaxRows) {
        logger.info(`Reached max rows limit (${config.ampMaxRows}), stopping...`);
        break;
      }
    }
    
    logger.info(`AMP query returned ${results.length} rows`);
    return results;
  } catch (error) {
    logger.error(`Error executing AMP query: ${error.message}`);
    throw new Error(`AMP query failed: ${error.message}`);
  }
}

/**
 * Execute a GraphQL query against The Graph endpoint
 */
async function executeGraphQLQuery(query, variables) {
  const headers = { 'Content-Type': 'application/json' };
  if (config.theGraphApiKey) {
    headers['Authorization'] = `Bearer ${config.theGraphApiKey}`;
  }

  try {
    const response = await axios.post(
      config.subgraphUrl,
      { query, variables },
      { headers, timeout: config.queryTimeout }
    );

    if (response.data.errors) {
      logger.error(`GraphQL errors: ${JSON.stringify(response.data.errors)}`);
      throw new Error(`GraphQL query failed: ${JSON.stringify(response.data.errors)}`);
    }

    return response.data.data || {};
  } catch (error) {
    logger.error(`Request failed: ${error.message}`);
    throw new Error(`Failed to query subgraph: ${error.message}`);
  }
}

/**
 * Get the most liquid pool for a given token address
 */
async function getPoolFromToken(tokenAddress) {
  const query = `
    query GetPoolForToken($tokenId: ID!) {
      token(id: $tokenId) {
        id
        symbol
        name
        whitelistPools(
          first: 1
          orderBy: totalValueLockedUSD
          orderDirection: desc
        ) {
          id
          feeTier
          totalValueLockedUSD
          token0 {
            id
            symbol
            name
          }
          token1 {
            id
            symbol
            name
          }
        }
      }
    }
  `;

  const tokenId = tokenAddress.toLowerCase();
  logger.info(`Looking up most liquid pool for token ${tokenId}`);

  try {
    const data = await executeGraphQLQuery(query, { tokenId });
    
    if (!data.token) {
      throw new Error(`Token ${tokenAddress} not found in subgraph`);
    }

    if (!data.token.whitelistPools || data.token.whitelistPools.length === 0) {
      throw new Error(`No pools found for token ${tokenAddress}`);
    }

    const pool = data.token.whitelistPools[0];
    
    logger.info(`Found pool ${pool.id} for token ${data.token.symbol}`);
    logger.info(`  Pool: ${pool.token0.symbol}/${pool.token1.symbol} (${parseInt(pool.feeTier) / 10000}%)`);
    logger.info(`  TVL: $${parseFloat(pool.totalValueLockedUSD).toLocaleString()}`);

    return {
      poolAddress: pool.id,
      token: {
        address: data.token.id,
        symbol: data.token.symbol,
        name: data.token.name
      },
      pool: {
        feeTier: pool.feeTier,
        tvlUSD: pool.totalValueLockedUSD,
        token0: pool.token0,
        token1: pool.token1
      }
    };
  } catch (error) {
    logger.error(`Failed to get pool for token: ${error.message}`);
    throw error;
  }
}

/**
 * Fetch all swaps for a pool with automatic pagination
 */
async function fetchSwapsWithPagination(poolAddress, minTimestamp) {
  const query = `
    query GetSwaps($pool: String!, $last_timestamp: Int!) {
      swaps(
        first: 1000
        orderBy: timestamp
        orderDirection: asc
        where: { pool: $pool, timestamp_gte: $last_timestamp }
      ) {
        id
        transaction {
          id
          blockNumber
          gasUsed
          gasPrice
        }
        timestamp
        logIndex
        sender
        recipient
        origin
        amount0
        amount1
        amountUSD
        sqrtPriceX96
        tick
      }
    }
  `;

  const allSwaps = [];
  let lastTimestamp = minTimestamp;

  logger.info(`Fetching swaps for pool ${poolAddress} from timestamp ${minTimestamp}`);

  while (true) {
    const variables = { pool: poolAddress, last_timestamp: lastTimestamp };
    const data = await executeGraphQLQuery(query, variables);
    const swaps = data.swaps || [];

    if (swaps.length === 0) break;

    allSwaps.push(...swaps);
    logger.info(`Fetched ${swaps.length} swaps, total: ${allSwaps.length}`);

    lastTimestamp = parseInt(swaps[swaps.length - 1].timestamp) + 1;

    if (swaps.length < 1000) break;
  }

  logger.info(`Total swaps fetched: ${allSwaps.length}`);
  return allSwaps;
}

/**
 * Fetch all mints for a pool with automatic pagination
 */
async function fetchMintsWithPagination(poolAddress, minTimestamp) {
  const query = `
    query GetMints($pool: String!, $last_timestamp: Int!) {
      mints(
        first: 1000
        orderBy: timestamp
        orderDirection: asc
        where: { pool: $pool, timestamp_gte: $last_timestamp }
      ) {
        id
        transaction {
          id
          blockNumber
          gasUsed
          gasPrice
        }
        timestamp
        owner
        sender
        origin
        tickLower
        tickUpper
        amount
        amount0
        amount1
        amountUSD
        logIndex
      }
    }
  `;

  const allMints = [];
  let lastTimestamp = minTimestamp;

  logger.info(`Fetching mints for pool ${poolAddress}`);

  while (true) {
    const variables = { pool: poolAddress, last_timestamp: lastTimestamp };
    const data = await executeGraphQLQuery(query, variables);
    const mints = data.mints || [];

    if (mints.length === 0) break;

    allMints.push(...mints);
    logger.info(`Fetched ${mints.length} mints, total: ${allMints.length}`);

    lastTimestamp = parseInt(mints[mints.length - 1].timestamp) + 1;

    if (mints.length < 1000) break;
  }

  logger.info(`Total mints fetched: ${allMints.length}`);
  return allMints;
}

/**
 * Fetch all burns for a pool with automatic pagination
 */
async function fetchBurnsWithPagination(poolAddress, minTimestamp) {
  const query = `
    query GetBurns($pool: String!, $last_timestamp: Int!) {
      burns(
        first: 1000
        orderBy: timestamp
        orderDirection: asc
        where: { pool: $pool, timestamp_gte: $last_timestamp }
      ) {
        id
        transaction {
          id
          blockNumber
          gasUsed
          gasPrice
        }
        timestamp
        owner
        origin
        tickLower
        tickUpper
        amount
        amount0
        amount1
        amountUSD
        logIndex
      }
    }
  `;

  const allBurns = [];
  let lastTimestamp = minTimestamp;

  logger.info(`Fetching burns for pool ${poolAddress}`);

  while (true) {
    const variables = { pool: poolAddress, last_timestamp: lastTimestamp };
    const data = await executeGraphQLQuery(query, variables);
    const burns = data.burns || [];

    if (burns.length === 0) break;

    allBurns.push(...burns);
    logger.info(`Fetched ${burns.length} burns, total: ${allBurns.length}`);

    lastTimestamp = parseInt(burns[burns.length - 1].timestamp) + 1;

    if (burns.length < 1000) break;
  }

  logger.info(`Total burns fetched: ${allBurns.length}`);
  return allBurns;
}

/**
 * Fetch all positions for a pool
 */
async function fetchPositions(poolAddress) {
  const query = `
    query GetPositions($pool: String!) {
      positions(
        first: 1000
        where: { pool: $pool }
        orderBy: id
      ) {
        id
        owner
        tickLower
        tickUpper
        liquidity
        depositedToken0
        depositedToken1
        withdrawnToken0
        withdrawnToken1
        collectedFeesToken0
        collectedFeesToken1
        feeGrowthInside0LastX128
        feeGrowthInside1LastX128
        transaction {
          timestamp
        }
      }
    }
  `;

  const allPositions = [];
  logger.info(`Fetching positions for pool ${poolAddress}`);

  const variables = { pool: poolAddress };
  const data = await executeGraphQLQuery(query, variables);
  const positions = data.positions || [];

  allPositions.push(...positions);
  logger.info(`Total positions fetched: ${positions.length}`);
  
  return allPositions;
}

/**
 * Fetch all collect events for a pool
 */
async function fetchCollects(poolAddress, minTimestamp) {
  const query = `
    query GetCollects($pool: String!, $last_timestamp: Int!) {
      collects(
        first: 1000
        orderBy: timestamp
        orderDirection: asc
        where: { pool: $pool, timestamp_gte: $last_timestamp }
      ) {
        id
        transaction {
          id
          timestamp
        }
        owner
        tickLower
        tickUpper
        amount0
        amount1
        amountUSD
        logIndex
      }
    }
  `;

  const allCollects = [];
  let lastTimestamp = minTimestamp;

  logger.info(`Fetching collect events for pool ${poolAddress}`);

  while (true) {
    const variables = { pool: poolAddress, last_timestamp: lastTimestamp };
    const data = await executeGraphQLQuery(query, variables);
    const collects = data.collects || [];

    if (collects.length === 0) break;

    allCollects.push(...collects);
    logger.info(`Fetched ${collects.length} collects, total: ${allCollects.length}`);

    lastTimestamp = parseInt(collects[collects.length - 1].transaction.timestamp) + 1;

    if (collects.length < 1000) break;
  }

  logger.info(`Total collects fetched: ${allCollects.length}`);
  return allCollects;
}

/**
 * Fetch tick data for a pool
 */
async function fetchTicks(poolAddress) {
  const query = `
    query GetTicks($pool: String!) {
      ticks(
        first: 1000
        where: { poolAddress: $pool }
        orderBy: tickIdx
        orderDirection: asc
      ) {
        tickIdx
        liquidityGross
        liquidityNet
        price0
        price1
        volumeToken0
        volumeToken1
        volumeUSD
        untrackedVolumeUSD
        feesUSD
        collectedFeesToken0
        collectedFeesToken1
        collectedFeesUSD
        createdAtTimestamp
        createdAtBlockNumber
        feeGrowthOutside0X128
        feeGrowthOutside1X128
      }
    }
  `;

  const allTicks = [];
  logger.info(`Fetching ticks for pool ${poolAddress}`);

  const variables = { pool: poolAddress };
  const data = await executeGraphQLQuery(query, variables);
  const ticks = data.ticks || [];

  allTicks.push(...ticks);
  logger.info(`Total ticks fetched: ${ticks.length}`);
  
  return allTicks;
}

/**
 * Fetch pool state data at each swap (block level granularity)
 */
async function fetchPoolStateByBlock(poolAddress, minTimestamp) {
  const query = `
    query GetPoolStateBySwap($pool: String!, $last_timestamp: Int!) {
      swaps(
        first: 1000
        orderBy: timestamp
        orderDirection: asc
        where: { pool: $pool, timestamp_gte: $last_timestamp }
      ) {
        transaction {
          blockNumber
        }
        timestamp
        pool {
          liquidity
          sqrtPrice
          token0Price
          token1Price
          totalValueLockedUSD
          totalValueLockedToken0
          totalValueLockedToken1
          volumeUSD
          volumeToken0
          volumeToken1
          feesUSD
          txCount
          collectedFeesToken0
          collectedFeesToken1
          feeTier
          token0 {
            id
            symbol
            name
            decimals
          }
          token1 {
            id
            symbol
            name
            decimals
          }
        }
        tick
      }
    }
  `;

  const allPoolStates = [];
  let lastTimestamp = minTimestamp;

  logger.info(`Fetching pool state by block for pool ${poolAddress}`);

  while (true) {
    const variables = { pool: poolAddress, last_timestamp: lastTimestamp };
    const data = await executeGraphQLQuery(query, variables);
    const swaps = data.swaps || [];

    if (swaps.length === 0) break;

    allPoolStates.push(...swaps);
    logger.info(`Fetched ${swaps.length} pool states, total: ${allPoolStates.length}`);

    lastTimestamp = parseInt(swaps[swaps.length - 1].timestamp) + 1;

    if (swaps.length < 1000) break;
  }

  logger.info(`Total pool states fetched: ${allPoolStates.length}`);
  return allPoolStates;
}

/**
 * Process swaps data to CSV format
 */
function processSwapsToCSV(swaps) {
  if (!swaps || swaps.length === 0) {
    return 'swap_id,block_number,timestamp,timestamp_readable,tx_hash,log_index,sender,recipient,origin,amount0,amount1,amount_usd,sqrt_price_x96,tick,gas_used,gas_price,gas_cost_eth\n';
  }

  const headers = 'swap_id,block_number,timestamp,timestamp_readable,tx_hash,log_index,sender,recipient,origin,amount0,amount1,amount_usd,sqrt_price_x96,tick,gas_used,gas_price,gas_cost_eth\n';
  const rows = swaps.map(swap => {
    const blockNumber = swap.transaction.blockNumber;
    const timestamp = swap.timestamp;
    const timestampReadable = new Date(parseInt(timestamp) * 1000).toISOString();
    const txHash = swap.transaction.id;
    const logIndex = swap.logIndex || 0;
    const gasUsed = swap.transaction.gasUsed || 0;
    const gasPrice = swap.transaction.gasPrice || 0;
    const gasCostEth = (parseFloat(gasUsed) * parseFloat(gasPrice)) / 1e18;
    
    return `"${swap.id}",${blockNumber},${timestamp},"${timestampReadable}","${txHash}",${logIndex},"${swap.sender}","${swap.recipient || ''}","${swap.origin}",${swap.amount0},${swap.amount1},${swap.amountUSD},"${swap.sqrtPriceX96}",${swap.tick},${gasUsed},${gasPrice},${gasCostEth}`;
  }).join('\n');

  return headers + rows;
}

/**
 * Process LP actions (mints and burns) to CSV format
 */
function processLPActionsToCSV(mints, burns) {
  const processed = [];

  // Process mints
  for (const mint of mints) {
    const gasUsed = mint.transaction.gasUsed || 0;
    const gasPrice = mint.transaction.gasPrice || 0;
    const gasCostEth = (parseFloat(gasUsed) * parseFloat(gasPrice)) / 1e18;
    
    processed.push({
      event_id: mint.id,
      event_type: 'MINT',
      block_number: mint.transaction.blockNumber,
      timestamp: mint.timestamp,
      timestamp_readable: new Date(parseInt(mint.timestamp) * 1000).toISOString(),
      tx_hash: mint.transaction.id,
      log_index: mint.logIndex || 0,
      owner: mint.owner,
      sender: mint.sender || '',
      origin: mint.origin || '',
      tick_lower: mint.tickLower,
      tick_upper: mint.tickUpper,
      tick_range: parseInt(mint.tickUpper) - parseInt(mint.tickLower),
      amount: mint.amount,
      amount0: mint.amount0 || 0,
      amount1: mint.amount1 || 0,
      amount_usd: mint.amountUSD,
      gas_used: gasUsed,
      gas_price: gasPrice,
      gas_cost_eth: gasCostEth
    });
  }

  // Process burns
  for (const burn of burns) {
    const gasUsed = burn.transaction.gasUsed || 0;
    const gasPrice = burn.transaction.gasPrice || 0;
    const gasCostEth = (parseFloat(gasUsed) * parseFloat(gasPrice)) / 1e18;
    
    processed.push({
      event_id: burn.id,
      event_type: 'BURN',
      block_number: burn.transaction.blockNumber,
      timestamp: burn.timestamp,
      timestamp_readable: new Date(parseInt(burn.timestamp) * 1000).toISOString(),
      tx_hash: burn.transaction.id,
      log_index: burn.logIndex || 0,
      owner: burn.owner,
      sender: '',
      origin: burn.origin || '',
      tick_lower: burn.tickLower,
      tick_upper: burn.tickUpper,
      tick_range: parseInt(burn.tickUpper) - parseInt(burn.tickLower),
      amount: burn.amount,
      amount0: burn.amount0 || 0,
      amount1: burn.amount1 || 0,
      amount_usd: burn.amountUSD,
      gas_used: gasUsed,
      gas_price: gasPrice,
      gas_cost_eth: gasCostEth
    });
  }

  // Sort by timestamp
  processed.sort((a, b) => parseInt(a.timestamp) - parseInt(b.timestamp));

  if (processed.length === 0) {
    return 'event_id,event_type,block_number,timestamp,timestamp_readable,tx_hash,log_index,owner,sender,origin,tick_lower,tick_upper,tick_range,amount,amount0,amount1,amount_usd,gas_used,gas_price,gas_cost_eth\n';
  }

  const headers = 'event_id,event_type,block_number,timestamp,timestamp_readable,tx_hash,log_index,owner,sender,origin,tick_lower,tick_upper,tick_range,amount,amount0,amount1,amount_usd,gas_used,gas_price,gas_cost_eth\n';
  const rows = processed.map(item => 
    `"${item.event_id}","${item.event_type}",${item.block_number},${item.timestamp},"${item.timestamp_readable}","${item.tx_hash}",${item.log_index},"${item.owner}","${item.sender}","${item.origin}",${item.tick_lower},${item.tick_upper},${item.tick_range},${item.amount},${item.amount0},${item.amount1},${item.amount_usd},${item.gas_used},${item.gas_price},${item.gas_cost_eth}`
  ).join('\n');

  return headers + rows;
}

/**
 * Process pool stats to CSV format
 */
function processPoolStatsToCSV(poolStates) {
  if (!poolStates || poolStates.length === 0) {
    return 'block_number,timestamp,timestamp_readable,liquidity,sqrt_price,tick,token0_price,token1_price,tvl_usd,tvl_token0,tvl_token1,volume_usd,volume_token0,volume_token1,fees_usd,collected_fees_token0,collected_fees_token1,fee_tier,tx_count,token0_symbol,token0_decimals,token1_symbol,token1_decimals\n';
  }

  const headers = 'block_number,timestamp,timestamp_readable,liquidity,sqrt_price,tick,token0_price,token1_price,tvl_usd,tvl_token0,tvl_token1,volume_usd,volume_token0,volume_token1,fees_usd,collected_fees_token0,collected_fees_token1,fee_tier,tx_count,token0_symbol,token0_decimals,token1_symbol,token1_decimals\n';
  const rows = poolStates.map(state => {
    const pool = state.pool || {};
    const timestamp = state.timestamp;
    const timestampReadable = new Date(parseInt(timestamp) * 1000).toISOString();
    const token0 = pool.token0 || {};
    const token1 = pool.token1 || {};
    
    return `${state.transaction.blockNumber},${timestamp},"${timestampReadable}",${pool.liquidity || 0},${pool.sqrtPrice || 0},${state.tick || 0},${pool.token0Price || 0},${pool.token1Price || 0},${pool.totalValueLockedUSD || 0},${pool.totalValueLockedToken0 || 0},${pool.totalValueLockedToken1 || 0},${pool.volumeUSD || 0},${pool.volumeToken0 || 0},${pool.volumeToken1 || 0},${pool.feesUSD || 0},${pool.collectedFeesToken0 || 0},${pool.collectedFeesToken1 || 0},${pool.feeTier || 0},${pool.txCount || 0},"${token0.symbol || ''}",${token0.decimals || 0},"${token1.symbol || ''}",${token1.decimals || 0}`;
  }).join('\n');

  return headers + rows;
}

/**
 * Process positions to CSV format
 */
function processPositionsToCSV(positions) {
  if (!positions || positions.length === 0) {
    return 'position_id,owner,tick_lower,tick_upper,liquidity,deposited_token0,deposited_token1,withdrawn_token0,withdrawn_token1,collected_fees_token0,collected_fees_token1,fee_growth_inside_0,fee_growth_inside_1,created_timestamp,created_timestamp_readable\n';
  }

  const headers = 'position_id,owner,tick_lower,tick_upper,liquidity,deposited_token0,deposited_token1,withdrawn_token0,withdrawn_token1,collected_fees_token0,collected_fees_token1,fee_growth_inside_0,fee_growth_inside_1,created_timestamp,created_timestamp_readable\n';
  const rows = positions.map(pos => {
    const timestamp = pos.transaction?.timestamp || 0;
    const timestampReadable = timestamp ? new Date(parseInt(timestamp) * 1000).toISOString() : '';
    
    return `"${pos.id}","${pos.owner}",${pos.tickLower},${pos.tickUpper},${pos.liquidity},${pos.depositedToken0 || 0},${pos.depositedToken1 || 0},${pos.withdrawnToken0 || 0},${pos.withdrawnToken1 || 0},${pos.collectedFeesToken0 || 0},${pos.collectedFeesToken1 || 0},"${pos.feeGrowthInside0LastX128 || '0'}","${pos.feeGrowthInside1LastX128 || '0'}",${timestamp},"${timestampReadable}"`;
  }).join('\n');

  return headers + rows;
}

/**
 * Process collect events to CSV format
 */
function processCollectsToCSV(collects) {
  if (!collects || collects.length === 0) {
    return 'collect_id,timestamp,timestamp_readable,tx_hash,log_index,owner,tick_lower,tick_upper,amount0,amount1,amount_usd\n';
  }

  const headers = 'collect_id,timestamp,timestamp_readable,tx_hash,log_index,owner,tick_lower,tick_upper,amount0,amount1,amount_usd\n';
  const rows = collects.map(collect => {
    const timestamp = collect.transaction.timestamp;
    const timestampReadable = new Date(parseInt(timestamp) * 1000).toISOString();
    const txHash = collect.transaction.id;
    const logIndex = collect.logIndex || 0;
    
    return `"${collect.id}",${timestamp},"${timestampReadable}","${txHash}",${logIndex},"${collect.owner}",${collect.tickLower},${collect.tickUpper},${collect.amount0 || 0},${collect.amount1 || 0},${collect.amountUSD || 0}`;
  }).join('\n');

  return headers + rows;
}

/**
 * Process ticks to CSV format
 */
function processTicksToCSV(ticks) {
  if (!ticks || ticks.length === 0) {
    return 'tick_idx,liquidity_gross,liquidity_net,price0,price1,volume_token0,volume_token1,volume_usd,fees_usd,collected_fees_token0,collected_fees_token1,collected_fees_usd,fee_growth_outside_0,fee_growth_outside_1,created_timestamp,created_block\n';
  }

  const headers = 'tick_idx,liquidity_gross,liquidity_net,price0,price1,volume_token0,volume_token1,volume_usd,fees_usd,collected_fees_token0,collected_fees_token1,collected_fees_usd,fee_growth_outside_0,fee_growth_outside_1,created_timestamp,created_block\n';
  const rows = ticks.map(tick => {
    return `${tick.tickIdx},${tick.liquidityGross || 0},${tick.liquidityNet || 0},${tick.price0 || 0},${tick.price1 || 0},${tick.volumeToken0 || 0},${tick.volumeToken1 || 0},${tick.volumeUSD || 0},${tick.feesUSD || 0},${tick.collectedFeesToken0 || 0},${tick.collectedFeesToken1 || 0},${tick.collectedFeesUSD || 0},"${tick.feeGrowthOutside0X128 || '0'}","${tick.feeGrowthOutside1X128 || '0'}",${tick.createdAtTimestamp || 0},${tick.createdAtBlockNumber || 0}`;
  }).join('\n');

  return headers + rows;
}

// Routes

/**
 * Health check endpoint
 */
app.get('/', (req, res) => {
  res.json({
    status: 'healthy',
    timestamp: new Date().toISOString()
  });
});

/**
 * Helper function to fetch all pool data
 */
async function fetchAllPoolData(tokenAddress, days = 1) {
  const daysNum = parseInt(days);
  if (isNaN(daysNum) || daysNum < 1 || daysNum > config.maxDays) {
    throw new Error(`days must be between 1 and ${config.maxDays}`);
  }

  // Get the most liquid pool for this token
  const poolInfo = await getPoolFromToken(tokenAddress);
  const pool = poolInfo.poolAddress.toLowerCase();

  // Calculate timestamp for N days ago
  const now = new Date();
  const minDate = new Date(now.getTime() - daysNum * 24 * 60 * 60 * 1000);
  const minTimestamp = Math.floor(minDate.getTime() / 1000);

  logger.info(`Fetching data for pool ${pool} from ${minDate.toISOString()}`);

  // Fetch all data with pagination
  const [swaps, mints, burns, poolStates, positions, collects, ticks] = await Promise.all([
    fetchSwapsWithPagination(pool, minTimestamp),
    fetchMintsWithPagination(pool, minTimestamp),
    fetchBurnsWithPagination(pool, minTimestamp),
    fetchPoolStateByBlock(pool, minTimestamp),
    fetchPositions(pool),
    fetchCollects(pool, minTimestamp),
    fetchTicks(pool)
  ]);

  return {
    poolInfo,
    swaps,
    mints,
    burns,
    poolStates,
    positions,
    collects,
    ticks,
    daysNum
  };
}

/**
 * Helper function to fetch all pool data
 */
async function fetchAllPoolData(tokenAddress, days = 1) {
    const daysNum = parseInt(days);
    if (isNaN(daysNum) || daysNum < 1 || daysNum > config.maxDays) {
    throw new Error(`days must be between 1 and ${config.maxDays}`);
    }

    // Get the most liquid pool for this token
    const poolInfo = await getPoolFromToken(tokenAddress);
    const pool = poolInfo.poolAddress.toLowerCase();

    // Calculate timestamp for N days ago
    const now = new Date();
    const minDate = new Date(now.getTime() - daysNum * 24 * 60 * 60 * 1000);
    const minTimestamp = Math.floor(minDate.getTime() / 1000);

    logger.info(`Fetching data for pool ${pool} from ${minDate.toISOString()}`);

    // Fetch all data with pagination
    const [swaps, mints, burns, poolStates, positions, collects, ticks] = await Promise.all([
      fetchSwapsWithPagination(pool, minTimestamp),
      fetchMintsWithPagination(pool, minTimestamp),
      fetchBurnsWithPagination(pool, minTimestamp),
      fetchPoolStateByBlock(pool, minTimestamp),
      fetchPositions(pool),
      fetchCollects(pool, minTimestamp),
      fetchTicks(pool)
    ]);

  return {
    poolInfo,
    swaps,
    mints,
    burns,
    poolStates,
    positions,
    collects,
    ticks,
    daysNum
  };
}

/**
 * GET /api/pool-data - Historical Data
 * Fetches historical Uniswap V3 pool data and returns as ZIP
 */
app.get('/api/pool-data', async (req, res) => {
  try {
    const { tokenAddress, days = 1 } = req.query;

    if (!tokenAddress) {
      return res.status(400).json({ error: 'tokenAddress is required' });
    }

    const data = await fetchAllPoolData(tokenAddress, days);

    // Process data to CSV
    const swapsCSV = processSwapsToCSV(data.swaps);
    const lpActionsCSV = processLPActionsToCSV(data.mints, data.burns);
    const poolStatsCSV = processPoolStatsToCSV(data.poolStates);
    const positionsCSV = processPositionsToCSV(data.positions);
    const collectsCSV = processCollectsToCSV(data.collects);
    const ticksCSV = processTicksToCSV(data.ticks);

    logger.info(`Processed data - Swaps: ${data.swaps.length}, Mints: ${data.mints.length}, Burns: ${data.burns.length}, Pool Stats: ${data.poolStates.length}, Positions: ${data.positions.length}, Collects: ${data.collects.length}, Ticks: ${data.ticks.length}`);

    // Create ZIP file
    const archive = archiver('zip', { zlib: { level: 9 } });
    
    const filename = `uniswap_v3_${data.poolInfo.token.symbol}_${data.daysNum}days_${new Date().toISOString().replace(/[:.]/g, '-')}.zip`;
    
    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);

    archive.on('error', (err) => {
      logger.error(`Archive error: ${err.message}`);
      res.status(500).json({ error: 'Failed to create ZIP file' });
    });

    archive.pipe(res);

    // Add CSV files to archive
    archive.append(swapsCSV, { name: 'swaps.csv' });
    archive.append(lpActionsCSV, { name: 'lp_actions.csv' });
    archive.append(poolStatsCSV, { name: 'pool_stats.csv' });
    archive.append(positionsCSV, { name: 'positions.csv' });
    archive.append(collectsCSV, { name: 'collects.csv' });
    archive.append(ticksCSV, { name: 'ticks.csv' });

    await archive.finalize();

  } catch (error) {
    logger.error(`Error processing request: ${error.message}`);
    res.status(500).json({ error: `Failed to fetch pool data: ${error.message}` });
  }
});

/**
 * GET /api/csv/swaps - Download swaps.csv
 */
app.get('/api/csv/swaps', async (req, res) => {
  try {
    const { tokenAddress, days = 1 } = req.query;

    if (!tokenAddress) {
      return res.status(400).json({ error: 'tokenAddress is required' });
    }

    const data = await fetchAllPoolData(tokenAddress, days);
    const swapsCSV = processSwapsToCSV(data.swaps);

    const filename = `swaps_${data.poolInfo.token.symbol}_${data.daysNum}days_${new Date().toISOString().replace(/[:.]/g, '-')}.csv`;
    
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(swapsCSV);

  } catch (error) {
    logger.error(`Error fetching swaps CSV: ${error.message}`);
    res.status(500).json({ error: `Failed to fetch swaps data: ${error.message}` });
  }
});

/**
 * GET /api/csv/lp-actions - Download lp_actions.csv
 */
app.get('/api/csv/lp-actions', async (req, res) => {
  try {
    const { tokenAddress, days = 1 } = req.query;

    if (!tokenAddress) {
      return res.status(400).json({ error: 'tokenAddress is required' });
    }

    const data = await fetchAllPoolData(tokenAddress, days);
    const lpActionsCSV = processLPActionsToCSV(data.mints, data.burns);

    const filename = `lp_actions_${data.poolInfo.token.symbol}_${data.daysNum}days_${new Date().toISOString().replace(/[:.]/g, '-')}.csv`;
    
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(lpActionsCSV);

  } catch (error) {
    logger.error(`Error fetching LP actions CSV: ${error.message}`);
    res.status(500).json({ error: `Failed to fetch LP actions data: ${error.message}` });
  }
});

/**
 * GET /api/csv/pool-stats - Download pool_stats.csv
 */
app.get('/api/csv/pool-stats', async (req, res) => {
  try {
    const { tokenAddress, days = 1 } = req.query;

    if (!tokenAddress) {
      return res.status(400).json({ error: 'tokenAddress is required' });
    }

    const data = await fetchAllPoolData(tokenAddress, days);
    const poolStatsCSV = processPoolStatsToCSV(data.poolStates);

    const filename = `pool_stats_${data.poolInfo.token.symbol}_${data.daysNum}days_${new Date().toISOString().replace(/[:.]/g, '-')}.csv`;
    
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(poolStatsCSV);

  } catch (error) {
    logger.error(`Error fetching pool stats CSV: ${error.message}`);
    res.status(500).json({ error: `Failed to fetch pool stats data: ${error.message}` });
  }
});

/**
 * GET /api/csv/positions - Download positions.csv
 */
app.get('/api/csv/positions', async (req, res) => {
  try {
    const { tokenAddress, days = 1 } = req.query;

    if (!tokenAddress) {
      return res.status(400).json({ error: 'tokenAddress is required' });
    }

    const data = await fetchAllPoolData(tokenAddress, days);
    const positionsCSV = processPositionsToCSV(data.positions);

    const filename = `positions_${data.poolInfo.token.symbol}_${data.daysNum}days_${new Date().toISOString().replace(/[:.]/g, '-')}.csv`;
    
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(positionsCSV);

  } catch (error) {
    logger.error(`Error fetching positions CSV: ${error.message}`);
    res.status(500).json({ error: `Failed to fetch positions data: ${error.message}` });
  }
});

/**
 * GET /api/csv/collects - Download collects.csv
 */
app.get('/api/csv/collects', async (req, res) => {
  try {
    const { tokenAddress, days = 1 } = req.query;

    if (!tokenAddress) {
      return res.status(400).json({ error: 'tokenAddress is required' });
    }

    const data = await fetchAllPoolData(tokenAddress, days);
    const collectsCSV = processCollectsToCSV(data.collects);

    const filename = `collects_${data.poolInfo.token.symbol}_${data.daysNum}days_${new Date().toISOString().replace(/[:.]/g, '-')}.csv`;
    
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(collectsCSV);

  } catch (error) {
    logger.error(`Error fetching collects CSV: ${error.message}`);
    res.status(500).json({ error: `Failed to fetch collects data: ${error.message}` });
  }
});

/**
 * GET /api/csv/ticks - Download ticks.csv
 */
app.get('/api/csv/ticks', async (req, res) => {
  try {
    const { tokenAddress, days = 1 } = req.query;

    if (!tokenAddress) {
      return res.status(400).json({ error: 'tokenAddress is required' });
    }

    const data = await fetchAllPoolData(tokenAddress, days);
    const ticksCSV = processTicksToCSV(data.ticks);

    const filename = `ticks_${data.poolInfo.token.symbol}_${data.daysNum}days_${new Date().toISOString().replace(/[:.]/g, '-')}.csv`;
    
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(ticksCSV);

  } catch (error) {
    logger.error(`Error fetching ticks CSV: ${error.message}`);
    res.status(500).json({ error: `Failed to fetch ticks data: ${error.message}` });
  }
});

/**
 * GET /api/recent-swaps - Last 10 Minutes
 * Get recent swaps in JSON format for real-time monitoring
 */
app.get('/api/recent-swaps', async (req, res) => {
  try {
    const { tokenAddress } = req.query;

    if (!tokenAddress) {
      return res.status(400).json({ error: 'tokenAddress is required' });
    }

    // Get the most liquid pool for this token
    const poolInfo = await getPoolFromToken(tokenAddress);
    const pool = poolInfo.poolAddress.toLowerCase();

    // Calculate timestamp for 10 minutes ago
    const now = new Date();
    const tenMinutesAgo = new Date(now.getTime() - 10 * 60 * 1000);
    const minTimestamp = Math.floor(tenMinutesAgo.getTime() / 1000);

    logger.info(`Fetching recent swaps (10 min) for pool ${pool}`);

    // Fetch swaps from last 10 minutes
    const swaps = await fetchSwapsWithPagination(pool, minTimestamp);

    // Process swaps to clean format
    const processedSwaps = swaps.map(swap => {
      const gasUsed = parseFloat(swap.transaction.gasUsed || 0);
      const gasPrice = parseFloat(swap.transaction.gasPrice || 0);
      const gasCostEth = (gasUsed * gasPrice) / 1e18;
      
      return {
        swap_id: swap.id,
        block_number: parseInt(swap.transaction.blockNumber),
        timestamp: parseInt(swap.timestamp),
        timestamp_readable: new Date(parseInt(swap.timestamp) * 1000).toISOString(),
        tx_hash: swap.transaction.id,
        log_index: parseInt(swap.logIndex || 0),
        sender: swap.sender,
        recipient: swap.recipient || '',
        origin: swap.origin,
        amount0: parseFloat(swap.amount0),
        amount1: parseFloat(swap.amount1),
        amount_usd: parseFloat(swap.amountUSD),
        sqrt_price_x96: swap.sqrtPriceX96,
        tick: parseInt(swap.tick),
        gas_used: gasUsed,
        gas_price: gasPrice,
        gas_cost_eth: gasCostEth
      };
    });

    const result = {
      token_address: tokenAddress,
      token_symbol: poolInfo.token.symbol,
      pool_address: poolInfo.poolAddress,
      pool_info: {
        pair: `${poolInfo.pool.token0.symbol}/${poolInfo.pool.token1.symbol}`,
        fee_tier: `${parseInt(poolInfo.pool.feeTier) / 10000}%`,
        tvl_usd: parseFloat(poolInfo.pool.tvlUSD)
      },
      time_range: 'last_10_minutes',
      from_timestamp: minTimestamp,
      to_timestamp: Math.floor(now.getTime() / 1000),
      from_time: tenMinutesAgo.toISOString(),
      to_time: now.toISOString(),
      swap_count: processedSwaps.length,
      swaps: processedSwaps
    };

    if (processedSwaps.length > 0) {
      const amounts = processedSwaps.map(s => s.amount_usd);
      const origins = new Set(processedSwaps.map(s => s.origin));
      
      result.summary = {
        total_volume_usd: amounts.reduce((a, b) => a + b, 0),
        avg_swap_size_usd: amounts.reduce((a, b) => a + b, 0) / amounts.length,
        min_swap_usd: Math.min(...amounts),
        max_swap_usd: Math.max(...amounts),
        unique_traders: origins.size
      };
    }

    logger.info(`Returning ${processedSwaps.length} recent swaps`);
    res.json(result);

  } catch (error) {
    logger.error(`Error fetching recent swaps: ${error.message}`);
    res.status(500).json({ error: `Failed to fetch recent swaps: ${error.message}` });
  }
});

/**
 * GET /api/latest-swaps - Last 5 Seconds
 * Get ultra-recent swaps for live price updates
 */
app.get('/api/latest-swaps', async (req, res) => {
  try {
    const { tokenAddress } = req.query;

    if (!tokenAddress) {
      return res.status(400).json({ error: 'tokenAddress is required' });
    }

    // Get the most liquid pool for this token
    const poolInfo = await getPoolFromToken(tokenAddress);
    const pool = poolInfo.poolAddress.toLowerCase();

    // Calculate timestamp for 5 seconds ago
    const now = new Date();
    const fiveSecondsAgo = new Date(now.getTime() - 5 * 1000);
    const minTimestamp = Math.floor(fiveSecondsAgo.getTime() / 1000);

    logger.info(`Fetching latest swaps (5 sec) for pool ${pool}`);

    // Fetch swaps from last 5 seconds
    const swaps = await fetchSwapsWithPagination(pool, minTimestamp);

    // Process swaps to clean format
    const processedSwaps = swaps.map(swap => {
      const gasUsed = parseFloat(swap.transaction.gasUsed || 0);
      const gasPrice = parseFloat(swap.transaction.gasPrice || 0);
      const gasCostEth = (gasUsed * gasPrice) / 1e18;
      
      return {
        swap_id: swap.id,
        block_number: parseInt(swap.transaction.blockNumber),
        timestamp: parseInt(swap.timestamp),
        timestamp_readable: new Date(parseInt(swap.timestamp) * 1000).toISOString(),
        tx_hash: swap.transaction.id,
        log_index: parseInt(swap.logIndex || 0),
        sender: swap.sender,
        recipient: swap.recipient || '',
        origin: swap.origin,
        amount0: parseFloat(swap.amount0),
        amount1: parseFloat(swap.amount1),
        amount_usd: parseFloat(swap.amountUSD),
        sqrt_price_x96: swap.sqrtPriceX96,
        tick: parseInt(swap.tick),
        gas_used: gasUsed,
        gas_price: gasPrice,
        gas_cost_eth: gasCostEth
      };
    });

    const result = {
      token_address: tokenAddress,
      token_symbol: poolInfo.token.symbol,
      pool_address: poolInfo.poolAddress,
      pool_info: {
        pair: `${poolInfo.pool.token0.symbol}/${poolInfo.pool.token1.symbol}`,
        fee_tier: `${parseInt(poolInfo.pool.feeTier) / 10000}%`,
        tvl_usd: parseFloat(poolInfo.pool.tvlUSD)
      },
      time_range: 'last_5_seconds',
      from_timestamp: minTimestamp,
      to_timestamp: Math.floor(now.getTime() / 1000),
      from_time: fiveSecondsAgo.toISOString(),
      to_time: now.toISOString(),
      swap_count: processedSwaps.length,
      swaps: processedSwaps
    };

    if (processedSwaps.length > 0) {
      const lastSwap = processedSwaps[processedSwaps.length - 1];
      result.latest_price = {
        sqrt_price_x96: lastSwap.sqrt_price_x96,
        tick: lastSwap.tick,
        timestamp: lastSwap.timestamp,
        amount_usd: lastSwap.amount_usd
      };
      
      const amounts = processedSwaps.map(s => s.amount_usd);
      result.summary = {
        total_volume_usd: amounts.reduce((a, b) => a + b, 0),
        swap_count: processedSwaps.length
      };
    }

    logger.info(`Returning ${processedSwaps.length} latest swaps`);
    res.json(result);

  } catch (error) {
    logger.error(`Error fetching latest swaps: ${error.message}`);
    res.status(500).json({ error: `Failed to fetch latest swaps: ${error.message}` });
  }
});

/**
 * POST /api/processed-data - AMP Analytics with LLM-Generated SQL
 * Generate and execute custom SQL queries using natural language
 * Note: This endpoint uses Ethereum Mainnet pools via AMP
 */
app.post('/api/processed-data', async (req, res) => {
  try {
    const { tokenAddress, query: userQuery } = req.body;

    if (!tokenAddress) {
      return res.status(400).json({ error: 'tokenAddress is required' });
    }

    if (!userQuery) {
      return res.status(400).json({ error: 'query is required (natural language description)' });
    }

    // Check if AMP and OpenAI are configured
    if (!ampClient) {
      return res.status(503).json({ 
        error: 'AMP service not configured', 
        details: 'Please set AMP_QUERY_TOKEN in environment variables' 
      });
    }

    if (!openaiClient) {
      return res.status(503).json({ 
        error: 'OpenAI service not configured', 
        details: 'Please set OPENAI_API_KEY in environment variables' 
      });
    }

    logger.info(`Processing AMP query request for token ${tokenAddress}`);
    logger.info(`User query: "${userQuery}"`);

    // Get the most liquid pool for this token from subgraph
    const poolInfo = await getPoolFromToken(tokenAddress);
    const poolAddress = poolInfo.poolAddress.toLowerCase();
    
    logger.info(`Found pool ${poolAddress} for token ${poolInfo.token.symbol}`);
    logger.info(`  Pool: ${poolInfo.pool.token0.symbol}/${poolInfo.pool.token1.symbol} (${parseInt(poolInfo.pool.feeTier) / 10000}%)`);

    // Generate SQL using OpenAI with the pool address
    const generatedSQL = await generateSQLWithLLM(userQuery, poolAddress);

    // Execute the generated SQL on AMP
    const results = await executeAMPQuery(generatedSQL);

    // Return results
    res.json({
      success: true,
      token_address: tokenAddress,
      token_symbol: poolInfo.token.symbol,
      pool_address: poolAddress,
      pool_info: {
        pair: `${poolInfo.pool.token0.symbol}/${poolInfo.pool.token1.symbol}`,
        fee_tier: `${parseInt(poolInfo.pool.feeTier) / 10000}%`,
        tvl_usd: parseFloat(poolInfo.pool.tvlUSD)
      },
      user_query: userQuery,
      generated_sql: generatedSQL,
      row_count: results.length,
      data: results,
      metadata: {
        timestamp: new Date().toISOString(),
        model_used: config.openaiModel,
        amp_url: config.ampQueryUrl,
        note: 'Pool address obtained from subgraph query'
      }
    });

    logger.info(`Successfully processed AMP query, returned ${results.length} rows`);

  } catch (error) {
    logger.error(`Error processing AMP query: ${error.message}`);
    res.status(500).json({ 
      error: 'Failed to process query', 
      details: error.message 
    });
  }
});

// ============================================================================
// ENDPOINT: GET /api/aave-apy/current
// Fetches current AAVE V3 WETH lending APY data (fast, lightweight)
// ============================================================================
app.get('/api/aave-apy/current', async (req, res) => {
  try {
    const AAVE_WETH_POOL_ID = 'e880e828-ca59-4ec6-8d4f-27182a4dc23d';
    
    logger.info('Fetching current AAVE V3 WETH APY data...');

    // Fetch current pool data with all metadata
    const currentPoolsResponse = await axios.get(
      'https://yields.llama.fi/pools',
      { timeout: 30000 }
    );

    // Find the specific WETH pool
    const currentPoolData = currentPoolsResponse.data.data.find(
      pool => pool.pool === AAVE_WETH_POOL_ID
    );

    if (!currentPoolData) {
      return res.status(404).json({
        error: 'AAVE V3 WETH pool not found',
        pool_id: AAVE_WETH_POOL_ID
      });
    }

    // Format response
    const response = {
      success: true,
      pool_info: {
        pool_id: AAVE_WETH_POOL_ID,
        protocol: currentPoolData.project,
        chain: currentPoolData.chain,
        asset: currentPoolData.symbol,
        underlying_token: currentPoolData.underlyingTokens?.[0] || null
      },
      current: {
        timestamp: new Date().toISOString(),
        apy: currentPoolData.apy,
        apy_base: currentPoolData.apyBase,
        apy_reward: currentPoolData.apyReward,
        tvl_usd: currentPoolData.tvlUsd,
        apy_change_1d: currentPoolData.apyPct1D,
        apy_change_7d: currentPoolData.apyPct7D,
        apy_change_30d: currentPoolData.apyPct30D,
        apy_mean_30d: currentPoolData.apyMean30d,
        stablecoin: currentPoolData.stablecoin,
        il_risk: currentPoolData.ilRisk,
        exposure: currentPoolData.exposure,
        predictions: currentPoolData.predictions || null
      },
      metadata: {
        source: 'DefiLlama Yields API',
        fetched_at: new Date().toISOString(),
        use_case: 'Real-time APY for quick comparisons',
        note: 'Use /api/aave-apy/history for historical data'
      }
    };

    logger.info('Successfully fetched current AAVE APY data');
    
    res.json(response);

  } catch (error) {
    logger.error(`Error fetching current AAVE APY data: ${error.message}`);
    res.status(500).json({
      error: 'Failed to fetch current AAVE APY data',
      details: error.message
    });
  }
});

// ============================================================================
// ENDPOINT: GET /api/aave-apy/history
// Fetches historical AAVE V3 WETH lending APY data (1000+ data points)
// ============================================================================
app.get('/api/aave-apy/history', async (req, res) => {
  try {
    const AAVE_WETH_POOL_ID = 'e880e828-ca59-4ec6-8d4f-27182a4dc23d';
    
    logger.info('Fetching historical AAVE V3 WETH APY data...');

    // Fetch historical APY data
    const historicalResponse = await axios.get(
      `https://yields.llama.fi/chart/${AAVE_WETH_POOL_ID}`,
      { timeout: 30000 }
    );

    // Process historical data
    const historicalData = historicalResponse.data.data || [];
    const historicalCount = historicalData.length;

    if (historicalCount === 0) {
      return res.status(404).json({
        error: 'No historical data found',
        pool_id: AAVE_WETH_POOL_ID
      });
    }

    // Calculate statistics from historical data
    const apyValues = historicalData
      .filter(d => d.apy !== null)
      .map(d => d.apy);

    const tvlValues = historicalData
      .filter(d => d.tvlUsd !== null)
      .map(d => d.tvlUsd);

    const stats = {
      apy: {
        min: Math.min(...apyValues),
        max: Math.max(...apyValues),
        avg: apyValues.reduce((a, b) => a + b, 0) / apyValues.length,
        latest: apyValues[apyValues.length - 1],
        first: apyValues[0]
      },
      tvl: {
        min: Math.min(...tvlValues),
        max: Math.max(...tvlValues),
        avg: tvlValues.reduce((a, b) => a + b, 0) / tvlValues.length,
        latest: tvlValues[tvlValues.length - 1],
        first: tvlValues[0]
      },
      data_points: apyValues.length
    };

    // Format response
    const response = {
      success: true,
      pool_info: {
        pool_id: AAVE_WETH_POOL_ID,
        protocol: 'aave-v3',
        chain: 'Ethereum',
        asset: 'WETH'
      },
      historical: {
        count: historicalCount,
        first_date: historicalData[0]?.timestamp || null,
        last_date: historicalData[historicalCount - 1]?.timestamp || null,
        statistics: stats,
        data: historicalData
      },
      metadata: {
        source: 'DefiLlama Yields API',
        fetched_at: new Date().toISOString(),
        use_case: 'Historical APY analysis and ML training',
        note: 'Use /api/aave-apy/current for real-time data'
      }
    };

    logger.info(`Successfully fetched ${historicalCount} historical AAVE APY data points`);
    
    res.json(response);

  } catch (error) {
    logger.error(`Error fetching historical AAVE APY data: ${error.message}`);
    res.status(500).json({
      error: 'Failed to fetch historical AAVE APY data',
      details: error.message
    });
  }
});

// Start server
// Listen on all interfaces (0.0.0.0) but show localhost in logs for clarity
app.listen(config.port, '0.0.0.0', () => {
  logger.info(`ALA Data Service running at http://localhost:${config.port}`);
  logger.info(`Server listening on all interfaces (0.0.0.0:${config.port})`);
  logger.info(`API Documentation: Check README.md`);
  
  // Show AMP/OpenAI status
  if (ampClient && openaiClient) {
    logger.info(`AMP Analytics: ✓ Enabled (${config.ampQueryUrl})`);
    logger.info(`OpenAI LLM: ✓ Enabled (${config.openaiModel})`);
  } else {
    logger.info(`AMP Analytics: ${ampClient ? '✓' : '✗'} | OpenAI LLM: ${openaiClient ? '✓' : '✗'}`);
  }
});

module.exports = app;

