require('dotenv').config();

const config = {
  // The Graph API configuration
  subgraphUrl: process.env.SUBGRAPH_URL || 'https://gateway.thegraph.com/api/subgraphs/id/5zvR82QoaXYFyDEKLZ9t6v9adgnptxYpKpSbxtgVENFV',
  
  // Optional: The Graph API key for higher rate limits
  theGraphApiKey: process.env.THE_GRAPH_API_KEY || '',
  
  // AMP Configuration
  ampQueryUrl: process.env.AMP_QUERY_URL || 'https://gateway.amp.staging.thegraph.com',
  ampQueryToken: process.env.AMP_QUERY_TOKEN || '',
  
  // OpenAI Configuration
  openaiApiKey: process.env.OPENAI_API_KEY || '',
  openaiModel: process.env.OPENAI_MODEL || 'gpt-4o-mini',
  
  // Server configuration
  host: process.env.HOST || 'localhost',
  port: parseInt(process.env.PORT || '3000', 10),
  
  // Query limits
  maxDays: 30,
  queryTimeout: 30000, // milliseconds
  ampMaxRows: parseInt(process.env.AMP_MAX_ROWS || '10000', 10),
  
  // Logging
  logLevel: process.env.LOG_LEVEL || 'INFO'
};

module.exports = config;

