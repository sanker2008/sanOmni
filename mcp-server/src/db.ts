/**
 * SQLite database connection manager for SanOmni MCP Server.
 *
 * Opens the same `database.sqlite` that the Tauri desktop client uses.
 * Enables WAL mode for safe concurrent reads alongside the Tauri process.
 */

import Database from "better-sqlite3";
import path from "node:path";
import fs from "node:fs";

let _db: Database.Database | null = null;

/**
 * Resolve the path to the SanOmni SQLite database.
 *
 * Priority:
 *   1. `SANOMNI_DB_PATH` environment variable (absolute path)
 *   2. Default: `D:/sanomnidata/data/database.sqlite`
 */
function resolveDbPath(): string {
  if (process.env.SANOMNI_DB_PATH) {
    return process.env.SANOMNI_DB_PATH;
  }

  // Default path used by the Tauri client
  const defaultPath = path.join("D:", "sanomnidata", "data", "database.sqlite");

  if (!fs.existsSync(defaultPath)) {
    throw new Error(
      `SanOmni database not found at ${defaultPath}. ` +
        `Set SANOMNI_DB_PATH environment variable to the correct path.`
    );
  }

  return defaultPath;
}

/**
 * Get (or lazily create) the singleton database connection.
 * Enables WAL mode and foreign keys on first connection.
 */
export function getDb(): Database.Database {
  if (_db) return _db;

  const dbPath = resolveDbPath();

  _db = new Database(dbPath);

  // Enable WAL for safe concurrent access with the Tauri client process
  _db.pragma("journal_mode = WAL");
  // Enable foreign key constraint enforcement
  _db.pragma("foreign_keys = ON");
  // Reasonable busy timeout to handle lock contention with the Tauri client
  _db.pragma("busy_timeout = 5000");

  return _db;
}

/**
 * Close the database connection (for graceful shutdown).
 */
export function closeDb(): void {
  if (_db) {
    _db.close();
    _db = null;
  }
}
