/**
 * Example usage of the ALA Data Service API
 * 
 * This script demonstrates how to:
 * 1. Fetch historical pool data (ZIP with 3 CSVs)
 * 2. Fetch recent swaps (last 10 minutes)
 * 3. Fetch latest swaps (last 5 seconds)
 */

const axios = require('axios');
const fs = require('fs');
const path = require('path');

// Configuration
const API_BASE_URL = 'http://localhost:3000';
const TOKEN_ADDRESS = '0xdd3B11eF34cd511a2DA159034a05fcb94D806686'; // REKT token on Arbitrum
const DAYS = 1;

/**
 * Example 1: Fetch historical pool data as ZIP
 */
async function fetchHistoricalData() {
  console.log('\n=== Example 1: Fetch Historical Data ===');
  console.log(`Fetching ${DAYS} day(s) of data for token ${TOKEN_ADDRESS}...`);
  
  try {
    const response = await axios.get(`${API_BASE_URL}/api/pool-data`, {
      params: {
        tokenAddress: TOKEN_ADDRESS,
        days: DAYS
      },
      responseType: 'arraybuffer'
    });

    // Create data directory if it doesn't exist
    const dataDir = path.join(__dirname, 'data');
    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true });
    }

    // Save ZIP file
    const filename = `token_data_${TOKEN_ADDRESS.substring(0, 8)}_${DAYS}days.zip`;
    const filepath = path.join(dataDir, filename);
    fs.writeFileSync(filepath, response.data);

    console.log(`✅ Success! Data saved to: ${filepath}`);
    console.log(`   Extract the ZIP to get 6 CSV files:`);
    console.log(`   - swaps.csv: Granular trade data with gas costs, price, sender/recipient`);
    console.log(`   - lp_actions.csv: Mint and burn events with tick ranges, amounts, gas costs`);
    console.log(`   - pool_stats.csv: Pool state with TVL, volumes, fees, token info at each block`);
    console.log(`   - positions.csv: 🆕 All LP positions with collected fees (GROUND TRUTH)`);
    console.log(`   - collects.csv: 🆕 Fee collection events by LPs`);
    console.log(`   - ticks.csv: 🆕 Liquidity distribution and fees by tick range`);
  } catch (error) {
    console.error('❌ Error:', error.response?.data || error.message);
  }
}

/**
 * Example 2: Fetch recent swaps (last 10 minutes)
 */
async function fetchRecentSwaps() {
  console.log('\n=== Example 2: Fetch Recent Swaps (Last 10 Minutes) ===');
  console.log(`Fetching recent swaps for token ${TOKEN_ADDRESS}...`);
  
  try {
    const response = await axios.get(`${API_BASE_URL}/api/recent-swaps`, {
      params: {
        tokenAddress: TOKEN_ADDRESS
      }
    });

    const data = response.data;
    console.log(`✅ Success!`);
    console.log(`   Token: ${data.token_symbol} (${data.token_address})`);
    console.log(`   Pool: ${data.pool_info.pair} - Fee: ${data.pool_info.fee_tier}`);
    console.log(`   TVL: $${data.pool_info.tvl_usd.toLocaleString()}`);
    console.log(`   Time range: ${data.time_range}`);
    console.log(`   From: ${data.from_time}`);
    console.log(`   To: ${data.to_time}`);
    console.log(`   Swap count: ${data.swap_count}`);
    
    if (data.summary) {
      console.log(`   Total volume: $${data.summary.total_volume_usd.toLocaleString()}`);
      console.log(`   Avg swap size: $${data.summary.avg_swap_size_usd.toLocaleString()}`);
      console.log(`   Unique traders: ${data.summary.unique_traders}`);
    }

    // Show first 3 swaps
    if (data.swaps.length > 0) {
      console.log(`\n   First 3 swaps (with gas costs):`);
      data.swaps.slice(0, 3).forEach((swap, i) => {
        console.log(`   ${i + 1}. Block ${swap.block_number}, $${swap.amount_usd.toFixed(2)}, Tick ${swap.tick}, Gas: ${(swap.gas_cost_eth * 1000).toFixed(4)} mETH`);
      });
    }
  } catch (error) {
    console.error('❌ Error:', error.response?.data || error.message);
  }
}

/**
 * Example 3: Fetch latest swaps (last 5 seconds)
 */
async function fetchLatestSwaps() {
  console.log('\n=== Example 3: Fetch Latest Swaps (Last 5 Seconds) ===');
  console.log(`Fetching latest swaps for token ${TOKEN_ADDRESS}...`);
  
  try {
    const response = await axios.get(`${API_BASE_URL}/api/latest-swaps`, {
      params: {
        tokenAddress: TOKEN_ADDRESS
      }
    });

    const data = response.data;
    console.log(`✅ Success!`);
    console.log(`   Token: ${data.token_symbol}`);
    console.log(`   Pool: ${data.pool_info.pair}`);
    console.log(`   Time range: ${data.time_range}`);
    console.log(`   Swap count: ${data.swap_count}`);
    
    if (data.latest_price) {
      console.log(`   Latest price:`);
      console.log(`     - Tick: ${data.latest_price.tick}`);
      console.log(`     - Amount USD: $${data.latest_price.amount_usd.toFixed(2)}`);
      console.log(`     - Timestamp: ${new Date(data.latest_price.timestamp * 1000).toISOString()}`);
    }

    if (data.summary) {
      console.log(`   Total volume (5 sec): $${data.summary.total_volume_usd.toLocaleString()}`);
    }
  } catch (error) {
    console.error('❌ Error:', error.response?.data || error.message);
  }
}

/**
 * Example 4: Live monitoring (poll every 5 seconds for 30 seconds)
 */
async function liveMonitoring() {
  console.log('\n=== Example 4: Live Monitoring (30 seconds) ===');
  console.log(`Monitoring token ${TOKEN_ADDRESS} every 5 seconds...`);
  console.log('Press Ctrl+C to stop\n');
  
  let iterations = 0;
  const maxIterations = 6; // 30 seconds / 5 seconds

  const interval = setInterval(async () => {
    try {
      const response = await axios.get(`${API_BASE_URL}/api/latest-swaps`, {
        params: {
          tokenAddress: TOKEN_ADDRESS
        }
      });

      const data = response.data;
      const timestamp = new Date().toLocaleTimeString();
      
      if (data.swap_count > 0 && data.latest_price) {
        console.log(`[${timestamp}] Swaps: ${data.swap_count} | Latest Tick: ${data.latest_price.tick} | Volume: $${data.summary.total_volume_usd.toFixed(2)}`);
      } else {
        console.log(`[${timestamp}] No swaps in last 5 seconds`);
      }

      iterations++;
      if (iterations >= maxIterations) {
        clearInterval(interval);
        console.log('\n✅ Monitoring complete!');
      }
    } catch (error) {
      console.error(`[${new Date().toLocaleTimeString()}] Error:`, error.message);
    }
  }, 5000);

  // Initial call
  setTimeout(async () => {
    try {
      const response = await axios.get(`${API_BASE_URL}/api/latest-swaps`, {
        params: { tokenAddress: TOKEN_ADDRESS }
      });
      const data = response.data;
      const timestamp = new Date().toLocaleTimeString();
      
      if (data.swap_count > 0 && data.latest_price) {
        console.log(`[${timestamp}] ${data.token_symbol} | Swaps: ${data.swap_count} | Latest Tick: ${data.latest_price.tick} | Volume: $${data.summary.total_volume_usd.toFixed(2)}`);
      } else {
        console.log(`[${timestamp}] No swaps in last 5 seconds`);
      }
    } catch (error) {
      console.error(`[${new Date().toLocaleTimeString()}] Error:`, error.message);
    }
  }, 0);
}

/**
 * Main function
 */
async function main() {
  console.log('='.repeat(60));
  console.log('ALA Data Service - Example Usage');
  console.log('='.repeat(60));
  console.log(`API Base URL: ${API_BASE_URL}`);
  console.log(`Token Address: ${TOKEN_ADDRESS}`);
  console.log('='.repeat(60));

  // Check if server is running (with retry logic)
  let serverReady = false;
  let retries = 0;
  const maxRetries = 5;
  const retryDelay = 1000; // 1 second

  while (!serverReady && retries < maxRetries) {
    try {
      await axios.get(`${API_BASE_URL}/`, { timeout: 2000 });
      serverReady = true;
      console.log('✅ Server is ready!\n');
    } catch (error) {
      retries++;
      if (retries < maxRetries) {
        console.log(`⏳ Waiting for server to be ready... (attempt ${retries}/${maxRetries})`);
        await new Promise(resolve => setTimeout(resolve, retryDelay));
      }
    }
  }

  if (!serverReady) {
    console.error('\n❌ Server is not running or not responding!');
    console.error('   Please start the server first: npm start');
    console.error('   Then run this example: npm run example\n');
    process.exit(1);
  }

  // Run examples
  await fetchHistoricalData();
  await new Promise(resolve => setTimeout(resolve, 2000)); // Wait 2 seconds
  
  await fetchRecentSwaps();
  await new Promise(resolve => setTimeout(resolve, 2000)); // Wait 2 seconds
  
  await fetchLatestSwaps();
  await new Promise(resolve => setTimeout(resolve, 2000)); // Wait 2 seconds
  
  await liveMonitoring();
  await new Promise(resolve => setTimeout(resolve, 2000)); // Wait 2 seconds
  
  await fetchAAVEAPY();
}

/**
 * Example 5: Fetch AAVE V3 WETH Lending APY Data
 */
async function fetchAAVEAPY() {
  console.log('\n' + '='.repeat(60));
  console.log('EXAMPLE 5: AAVE V3 WETH LENDING APY DATA');
  console.log('='.repeat(60));

  try {
    // PART 1: Fetch current APY (fast)
    console.log('\n📊 Part 1: Fetching CURRENT AAVE APY (lightweight)...');
    
    const currentResponse = await axios.get(`${API_BASE_URL}/api/aave-apy/current`, {
      timeout: 10000
    });

    const currentData = currentResponse.data;

    console.log('✅ Current APY Retrieved!\n');

    // Pool Info
    console.log('🏦 Pool Information:');
    console.log(`   Protocol: ${currentData.pool_info.protocol}`);
    console.log(`   Chain: ${currentData.pool_info.chain}`);
    console.log(`   Asset: ${currentData.pool_info.asset}`);
    console.log(`   Pool ID: ${currentData.pool_info.pool_id}`);
    console.log(`   Underlying Token: ${currentData.pool_info.underlying_token}`);

    // Current APY
    console.log('\n📈 Current APY Data:');
    console.log(`   APY: ${currentData.current.apy.toFixed(2)}%`);
    console.log(`   APY Base: ${currentData.current.apy_base.toFixed(2)}%`);
    console.log(`   TVL: $${(currentData.current.tvl_usd / 1_000_000).toFixed(2)}M`);
    console.log(`   APY Change (1D): ${currentData.current.apy_change_1d >= 0 ? '+' : ''}${currentData.current.apy_change_1d.toFixed(3)}%`);
    console.log(`   APY Change (7D): ${currentData.current.apy_change_7d >= 0 ? '+' : ''}${currentData.current.apy_change_7d.toFixed(3)}%`);
    console.log(`   APY Change (30D): ${currentData.current.apy_change_30d >= 0 ? '+' : ''}${currentData.current.apy_change_30d.toFixed(3)}%`);
    console.log(`   APY Mean (30D): ${currentData.current.apy_mean_30d.toFixed(2)}%`);

    // Predictions (if available)
    if (currentData.current.predictions) {
      console.log('\n🔮 APY Predictions:');
      console.log(`   Class: ${currentData.current.predictions.predictedClass}`);
      console.log(`   Probability: ${currentData.current.predictions.predictedProbability}%`);
      console.log(`   Confidence: ${currentData.current.predictions.binnedConfidence}/5`);
    }

    // PART 2: Fetch historical APY (heavier)
    console.log('\n📊 Part 2: Fetching HISTORICAL AAVE APY (1000+ records)...');
    
    const historyResponse = await axios.get(`${API_BASE_URL}/api/aave-apy/history`, {
      timeout: 30000
    });

    const historyData = historyResponse.data;

    console.log('✅ Historical APY Retrieved!\n');

    // Historical Statistics
    console.log('📊 Historical Statistics:');
    if (historyData.historical.statistics) {
      const stats = historyData.historical.statistics;
      console.log('   APY Stats:');
      console.log(`     - Min: ${stats.apy.min.toFixed(2)}%`);
      console.log(`     - Max: ${stats.apy.max.toFixed(2)}%`);
      console.log(`     - Avg: ${stats.apy.avg.toFixed(2)}%`);
      console.log(`     - Latest: ${stats.apy.latest.toFixed(2)}%`);
      console.log(`     - First: ${stats.apy.first.toFixed(2)}%`);
      console.log('   TVL Stats:');
      console.log(`     - Min: $${(stats.tvl.min / 1_000_000).toFixed(2)}M`);
      console.log(`     - Max: $${(stats.tvl.max / 1_000_000).toFixed(2)}M`);
      console.log(`     - Avg: $${(stats.tvl.avg / 1_000_000).toFixed(2)}M`);
      console.log(`     - Latest: $${(stats.tvl.latest / 1_000_000).toFixed(2)}M`);
      console.log(`   Data Points: ${stats.data_points}`);
    }

    console.log('\n📅 Historical Data Range:');
    console.log(`   Total Records: ${historyData.historical.count}`);
    console.log(`   First Date: ${historyData.historical.first_date}`);
    console.log(`   Last Date: ${historyData.historical.last_date}`);
    console.log(`   Duration: ~${Math.floor(historyData.historical.count / 365)} years of data`);

    // Show last 5 historical data points
    console.log('\n📋 Last 5 Historical Data Points:');
    const lastFive = historyData.historical.data.slice(-5);
    lastFive.forEach((point, idx) => {
      console.log(`   ${idx + 1}. ${point.timestamp.split('T')[0]} | APY: ${point.apy?.toFixed(2) || 'N/A'}% | TVL: $${(point.tvlUsd / 1_000_000).toFixed(2)}M`);
    });

    // Use case notes
    console.log('\n💡 Use Cases:');
    console.log('   ✅ Compare LP yields vs lending APY (risk-adjusted)');
    console.log('   ✅ Train ML models on historical APY trends');
    console.log('   ✅ Optimize capital allocation strategies');
    console.log('   ✅ Predict optimal times to switch between LP and lending');

    console.log('\n📌 API Benefits:');
    console.log('   • /api/aave-apy/current - Fast, lightweight (real-time monitoring)');
    console.log('   • /api/aave-apy/history - Complete dataset (ML training)');

    console.log('\n' + '='.repeat(60));

  } catch (error) {
    console.error('\n❌ Error fetching AAVE APY data:');
    console.error(`   ${error.message}`);
    if (error.response) {
      console.error(`   Status: ${error.response.status}`);
      console.error(`   Details: ${JSON.stringify(error.response.data, null, 2)}`);
    }
  }
}

// Run the examples
if (require.main === module) {
  main().catch(error => {
    console.error('Fatal error:', error.message);
    process.exit(1);
  });
}

module.exports = { 
  fetchHistoricalData, 
  fetchRecentSwaps, 
  fetchLatestSwaps, 
  liveMonitoring,
  fetchAAVEAPY 
};

