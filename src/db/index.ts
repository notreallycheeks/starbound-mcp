import Database from "better-sqlite3";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { initializeSchema } from "./schema.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/**
 * Resolve the database path. Checks multiple locations to support:
 * - Development: starbound.db in project root (../../ from dist/db/)
 * - npm package: starbound.db shipped alongside dist/
 * - Standalone EXE: starbound.db next to the executable
 * - Custom: STARBOUND_MCP_DB environment variable
 */
function resolveDbPath(): string {
  // 1. Environment variable override
  if (process.env.STARBOUND_MCP_DB) {
    return process.env.STARBOUND_MCP_DB;
  }

  // 2. Check common locations
  const candidates = [
    path.resolve(__dirname, "../../starbound.db"),       // dev: project root from dist/db/
    path.resolve(__dirname, "../starbound.db"),           // npm: alongside dist/
    path.resolve(process.cwd(), "starbound.db"),          // cwd
    path.resolve(process.execPath, "../starbound.db"),    // next to EXE
  ];

  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) {
      return candidate;
    }
  }

  // 3. Default to project root (will be created by seed script)
  return path.resolve(__dirname, "../../starbound.db");
}

const DB_PATH = resolveDbPath();

let db: Database.Database | null = null;

export function getDatabase(): Database.Database {
  if (!db) {
    db = new Database(DB_PATH);
    db.pragma("journal_mode = WAL");
    db.pragma("foreign_keys = ON");
    initializeSchema(db);
  }
  return db;
}
