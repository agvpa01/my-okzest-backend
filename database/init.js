import pkg from 'pg';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import fs from 'fs';

const { Pool } = pkg;

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Create generated images directory
const generatedDir = join(__dirname, '..', 'generated');
if (!fs.existsSync(generatedDir)) {
  fs.mkdirSync(generatedDir, { recursive: true });
}

// PostgreSQL connection configuration
// Use environment variable if available, otherwise fallback to default
const connectionString = process.env.DATABASE_URL || 
  'postgres://postgres:UNAP7BAjtSjKOco31ARIKAqqCD6fzlmEMmi1SlyXxWI8AFRMP5K4nLAVnaK1X6iI@194.195.120.254:5433/postgres';

console.log('🔗 Database connection info:');
console.log(`   Host: ${connectionString.split('@')[1]?.split('/')[0] || 'Unknown'}`);
console.log(`   Database: ${connectionString.split('/').pop() || 'Unknown'}`);
console.log(`   Using environment variable: ${process.env.DATABASE_URL ? 'Yes' : 'No'}`);

export const db = new Pool({
  connectionString,
  ssl: false, // Set to true if SSL is required
  max: 20, // Maximum number of clients in the pool
  min: 2, // Minimum number of clients in the pool
  idleTimeoutMillis: 30000, // Close idle clients after 30 seconds
  connectionTimeoutMillis: 10000, // Return an error after 10 seconds if connection could not be established
  acquireTimeoutMillis: 60000, // Return an error after 60 seconds if a client could not be checked out
  statement_timeout: 30000, // Number of milliseconds before a statement in query will time out
  query_timeout: 30000, // Number of milliseconds before a query call will timeout
  application_name: 'dynamic-canvas-backend'
});

// Test database connection with retry logic
const testConnection = async (retries = 3, delay = 5000) => {
  for (let i = 0; i < retries; i++) {
    try {
      console.log(`🔄 Testing database connection (attempt ${i + 1}/${retries})...`);
      const client = await db.connect();
      await client.query('SELECT NOW()');
      client.release();
      console.log('✅ Database connection successful');
      return true;
    } catch (err) {
      console.error(`❌ Connection attempt ${i + 1} failed:`, err.message);
      if (i < retries - 1) {
        console.log(`⏳ Retrying in ${delay/1000} seconds...`);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
  }
  return false;
};

export const initDatabase = async () => {
  try {
    // Test connection first
    const isConnected = await testConnection();
    if (!isConnected) {
      throw new Error('Failed to establish database connection after multiple attempts');
    }

    console.log('🏗️  Initializing database tables...');

    // Create categories table
    await db.query(`
      CREATE TABLE IF NOT EXISTS categories (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL UNIQUE,
        color TEXT DEFAULT '#3B82F6',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Create canvas_templates table
    await db.query(`
      CREATE TABLE IF NOT EXISTS canvas_templates (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        config TEXT NOT NULL,
        elements TEXT NOT NULL,
        category_id TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (category_id) REFERENCES categories (id) ON DELETE SET NULL
      )
    `);

    // Create canvas_variables table to track variables used in templates
    await db.query(`
      CREATE TABLE IF NOT EXISTS canvas_variables (
        id SERIAL PRIMARY KEY,
        template_id TEXT NOT NULL,
        variable_name TEXT NOT NULL,
        element_id TEXT NOT NULL,
        element_type TEXT NOT NULL,
        default_value TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (template_id) REFERENCES canvas_templates (id) ON DELETE CASCADE
      )
    `);

    // Create index for faster lookups
    await db.query(`
      CREATE INDEX IF NOT EXISTS idx_template_variables 
      ON canvas_variables (template_id, variable_name)
    `);

    console.log('✅ PostgreSQL Database initialized successfully');
  } catch (err) {
    console.error('❌ Database initialization error:', err);
    console.error('💡 Troubleshooting tips:');
    console.error('   - Check if the PostgreSQL server is running');
    console.error('   - Verify the connection string and credentials');
    console.error('   - Ensure the server allows connections from your IP');
    console.error('   - Check firewall settings on port 5433');
    throw err;
  }
};

// Helper function to run database queries with promises
export const runQuery = async (sql, params = []) => {
  try {
    const result = await db.query(sql, params);
    return { 
      id: result.rows[0]?.id || null, 
      changes: result.rowCount,
      rows: result.rows
    };
  } catch (err) {
    throw err;
  }
};

// Helper function to get data from database
export const getQuery = async (sql, params = []) => {
  try {
    const result = await db.query(sql, params);
    return result.rows[0] || null;
  } catch (err) {
    throw err;
  }
};

// Helper function to get all rows from database
export const getAllQuery = async (sql, params = []) => {
  try {
    const result = await db.query(sql, params);
    return result.rows;
  } catch (err) {
    throw err;
  }
};

// Graceful shutdown
process.on('SIGINT', async () => {
  console.log('Closing database connection...');
  await db.end();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  console.log('Closing database connection...');
  await db.end();
  process.exit(0);
});