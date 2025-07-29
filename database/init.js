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
const connectionString = 'postgres://postgres:UNAP7BAjtSjKOco31ARIKAqqCD6fzlmEMmi1SlyXxWI8AFRMP5K4nLAVnaK1X6iI@194.195.120.254:5433/postgres';

export const db = new Pool({
  connectionString,
  ssl: false // Set to true if SSL is required
});

export const initDatabase = async () => {
  try {
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
    console.error('Database initialization error:', err);
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