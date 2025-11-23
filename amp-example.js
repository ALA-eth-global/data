/**
 * AMP Analytics Example - Test the LLM-powered processed-data endpoint
 * 
 * This script demonstrates how to use natural language to query
 * Uniswap V3 data through AMP with AI-generated SQL
 */

const axios = require('axios');
const fs = require('fs');
const path = require('path');

// Configuration
const API_BASE_URL = 'http://localhost:3000';
const TOKEN_ADDRESS = '0xdd3B11eF34cd511a2DA159034a05fcb94D806686'; 

// Example queries to test
const EXAMPLE_QUERIES = [
  {
    name: 'Top Traders (Last 24h)',
    query: 'Show me the top 20 traders by volume in the last 24 hours with their swap count and total volumes'
  }
];

/**
 * Execute a custom AMP query using natural language
 */
async function executeAMPQuery(tokenAddress, naturalLanguageQuery) {
  console.log(`\n${'='.repeat(80)}`);
  console.log(`🤖 Executing Query`);
  console.log(`${'='.repeat(80)}`);
  console.log(`Token/Pool: ${tokenAddress}`);
  console.log(`Query: "${naturalLanguageQuery}"`);
  console.log(`${'='.repeat(80)}\n`);

  try {
    const response = await axios.post(`${API_BASE_URL}/api/processed-data`, {
      tokenAddress: tokenAddress,
      query: naturalLanguageQuery
    }, {
      timeout: 60000 // 60 second timeout for complex queries
    });

    const data = response.data;

    console.log('✅ Query executed successfully!\n');
    console.log(`📊 Results:`);
    console.log(`   - Rows returned: ${data.row_count}`);
    console.log(`   - Model used: ${data.metadata.model_used}`);
    console.log(`   - Timestamp: ${data.metadata.timestamp}`);
    
    console.log(`\n📝 Generated SQL:`);
    console.log(`${'─'.repeat(80)}`);
    console.log(data.generated_sql);
    console.log(`${'─'.repeat(80)}`);

    if (data.data && data.data.length > 0) {
      console.log(`\n📋 Sample Results (first 5 rows):`);
      console.log(JSON.stringify(data.data.slice(0, 5), null, 2));
      
      // Save full results to file
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const filename = `amp_query_results_${timestamp}.json`;
      const dataDir = path.join(__dirname, 'data');
      
      // Create data directory if it doesn't exist
      if (!fs.existsSync(dataDir)) {
        fs.mkdirSync(dataDir, { recursive: true });
      }
      
      const filepath = path.join(dataDir, filename);
      fs.writeFileSync(filepath, JSON.stringify({
        pool_address: data.pool_address,
        user_query: data.user_query,
        generated_sql: data.generated_sql,
        row_count: data.row_count,
        data: data.data,
        metadata: data.metadata
      }, null, 2));
      
      console.log(`\n💾 Full results saved to: ${filepath}`);
    } else {
      console.log(`\n⚠️  No data returned from query`);
    }

    return data;

  } catch (error) {
    console.error('❌ Error executing query:');
    if (error.response) {
      console.error('   Status:', error.response.status);
      console.error('   Error:', error.response.data.error);
      if (error.response.data.details) {
        console.error('   Details:', error.response.data.details);
      }
    } else {
      console.error('   Error:', error.message);
    }
    throw error;
  }
}

/**
 * Run all example queries
 */
async function runAllExamples() {
  console.log('\n╔═══════════════════════════════════════════════════════════════════════════════╗');
  console.log('║                    AMP Analytics - Example Queries                           ║');
  console.log('╚═══════════════════════════════════════════════════════════════════════════════╝');
  console.log(`\nAPI Base URL: ${API_BASE_URL}`);
  console.log(`Token/Pool Address: ${TOKEN_ADDRESS}`);
  console.log(`Total Examples: ${EXAMPLE_QUERIES.length}\n`);

  // Check if server is running
  try {
    await axios.get(`${API_BASE_URL}/`, { timeout: 2000 });
    console.log('✅ Server is ready!\n');
  } catch (error) {
    console.error('❌ Server is not running or not responding!');
    console.error('   Please start the server first: npm start');
    console.error('   Make sure AMP_QUERY_TOKEN and OPENAI_API_KEY are set in .env\n');
    process.exit(1);
  }

  let successCount = 0;
  let failCount = 0;

  for (let i = 0; i < EXAMPLE_QUERIES.length; i++) {
    const example = EXAMPLE_QUERIES[i];
    
    console.log(`\n┌${'─'.repeat(78)}┐`);
    console.log(`│ Example ${i + 1}/${EXAMPLE_QUERIES.length}: ${example.name.padEnd(67)}│`);
    console.log(`└${'─'.repeat(78)}┘`);

    try {
      await executeAMPQuery(TOKEN_ADDRESS, example.query);
      successCount++;
      
      // Wait 2 seconds between queries to avoid rate limiting
      if (i < EXAMPLE_QUERIES.length - 1) {
        console.log('\n⏳ Waiting 2 seconds before next query...');
        await new Promise(resolve => setTimeout(resolve, 2000));
      }
    } catch (error) {
      failCount++;
      console.log('\n⚠️  Continuing to next example...');
    }
  }

  console.log('\n╔═══════════════════════════════════════════════════════════════════════════════╗');
  console.log('║                              Summary                                          ║');
  console.log('╚═══════════════════════════════════════════════════════════════════════════════╝');
  console.log(`\n✅ Successful queries: ${successCount}`);
  console.log(`❌ Failed queries: ${failCount}`);
  console.log(`📊 Total queries: ${EXAMPLE_QUERIES.length}\n`);
}

/**
 * Run a single custom query
 */
async function runCustomQuery() {
  const customQuery = process.argv[2];
  
  if (!customQuery) {
    console.error('Error: Please provide a query as argument');
    console.error('Usage: node amp-example.js "your query here"');
    console.error('\nOr run without arguments to execute all example queries');
    process.exit(1);
  }

  console.log('\n╔═══════════════════════════════════════════════════════════════════════════════╗');
  console.log('║                    AMP Analytics - Custom Query                              ║');
  console.log('╚═══════════════════════════════════════════════════════════════════════════════╝');

  // Check if server is running
  try {
    await axios.get(`${API_BASE_URL}/`, { timeout: 2000 });
    console.log('\n✅ Server is ready!');
  } catch (error) {
    console.error('\n❌ Server is not running or not responding!');
    console.error('   Please start the server first: npm start');
    console.error('   Make sure AMP_QUERY_TOKEN and OPENAI_API_KEY are set in .env\n');
    process.exit(1);
  }

  await executeAMPQuery(TOKEN_ADDRESS, customQuery);
}

// Main execution
if (require.main === module) {
  const hasCustomQuery = process.argv.length > 2;
  
  if (hasCustomQuery) {
    runCustomQuery().catch(error => {
      console.error('\n❌ Fatal error:', error.message);
      process.exit(1);
    });
  } else {
    runAllExamples().catch(error => {
      console.error('\n❌ Fatal error:', error.message);
      process.exit(1);
    });
  }
}

module.exports = { executeAMPQuery };

