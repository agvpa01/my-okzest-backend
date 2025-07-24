import sqlite3 from 'sqlite3';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import fs from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Create database directory if it doesn't exist
const dbDir = join(__dirname);
if (!fs.existsSync(dbDir)) {
  fs.mkdirSync(dbDir, { recursive: true });
}

// Create generated images directory
const generatedDir = join(__dirname, '..', 'generated');
if (!fs.existsSync(generatedDir)) {
  fs.mkdirSync(generatedDir, { recursive: true });
}

const dbPath = join(__dirname, 'canvas.db');

export const db = new sqlite3.Database(dbPath);

export const initDatabase = () => {
  return new Promise((resolve, reject) => {
    db.serialize(() => {
      // Create categories table
      db.run(`
        CREATE TABLE IF NOT EXISTS categories (
          id TEXT PRIMARY KEY,
          name TEXT NOT NULL UNIQUE,
          color TEXT DEFAULT '#3B82F6',
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
      `);

      // Create canvas_templates table
      db.run(`
        CREATE TABLE IF NOT EXISTS canvas_templates (
          id TEXT PRIMARY KEY,
          name TEXT NOT NULL,
          config TEXT NOT NULL,
          elements TEXT NOT NULL,
          category_id TEXT,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (category_id) REFERENCES categories (id) ON DELETE SET NULL
        )
      `);

      // Create canvas_variables table to track variables used in templates
      db.run(`
        CREATE TABLE IF NOT EXISTS canvas_variables (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          template_id TEXT NOT NULL,
          variable_name TEXT NOT NULL,
          element_id TEXT NOT NULL,
          element_type TEXT NOT NULL,
          default_value TEXT,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (template_id) REFERENCES canvas_templates (id) ON DELETE CASCADE
        )
      `);

      // Create index for faster lookups
      db.run(`
        CREATE INDEX IF NOT EXISTS idx_template_variables 
        ON canvas_variables (template_id, variable_name)
      `);

      console.log('✅ Database initialized successfully');
      resolve();
    });

    db.on('error', (err) => {
      console.error('Database error:', err);
      reject(err);
    });
  });
};

// Helper function to run database queries with promises
export const runQuery = (sql, params = []) => {
  return new Promise((resolve, reject) => {
    db.run(sql, params, function(err) {
      if (err) {
        reject(err);
      } else {
        resolve({ id: this.lastID, changes: this.changes });
      }
    });
  });
};

// Helper function to get data from database
export const getQuery = (sql, params = []) => {
  return new Promise((resolve, reject) => {
    db.get(sql, params, (err, row) => {
      if (err) {
        reject(err);
      } else {
        resolve(row);
      }
    });
  });
};

// Helper function to get all rows from database
export const getAllQuery = (sql, params = []) => {
  return new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => {
      if (err) {
        reject(err);
      } else {
        resolve(rows);
      }
    });
  });
};