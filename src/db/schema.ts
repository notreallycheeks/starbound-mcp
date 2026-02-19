import type Database from "better-sqlite3";

export function initializeSchema(db: Database.Database): void {
  db.exec(`
    -- Which mod/source the data comes from
    CREATE TABLE IF NOT EXISTS sources (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,          -- 'vanilla', 'frackin-universe', 'openstarbound', etc.
      version TEXT,                        -- game/mod version this data was extracted from
      description TEXT,
      url TEXT                             -- link to source (github, wiki, etc.)
    );

    -- Lua API tables (world, entity, player, root, etc.)
    CREATE TABLE IF NOT EXISTS lua_tables (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      source_id INTEGER NOT NULL REFERENCES sources(id),
      name TEXT NOT NULL,                  -- e.g. 'world', 'entity', 'player'
      description TEXT,
      context TEXT,                        -- where this table is available: 'universal', 'player', 'npc', 'monster', 'object', 'activeitem', etc.
      UNIQUE(source_id, name)
    );

    -- Lua API functions
    CREATE TABLE IF NOT EXISTS lua_functions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      table_id INTEGER NOT NULL REFERENCES lua_tables(id),
      name TEXT NOT NULL,                  -- e.g. 'entityQuery'
      signature TEXT,                      -- e.g. 'world.entityQuery(Vec2F position, Float range, [EntityFilter options])'
      description TEXT,
      return_type TEXT,                    -- e.g. 'EntityId[]', 'Bool', 'Json'
      parameters TEXT,                     -- JSON array of {name, type, description, optional}
      examples TEXT,                       -- JSON array of code examples
      notes TEXT,                          -- additional notes, caveats, gotchas
      deprecated INTEGER DEFAULT 0,
      added_in TEXT,                       -- version when this was added (if known)
      UNIQUE(table_id, name)
    );

    -- Asset types (items, objects, monsters, biomes, etc.)
    CREATE TABLE IF NOT EXISTS asset_types (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      source_id INTEGER NOT NULL REFERENCES sources(id),
      name TEXT NOT NULL,                  -- e.g. 'activeitem', 'object', 'biome', 'monster'
      file_extension TEXT,                 -- e.g. '.activeitem', '.object', '.monstertype'
      description TEXT,
      base_path TEXT,                      -- typical path in assets, e.g. '/items/active/'
      UNIQUE(source_id, name)
    );

    -- JSON schema fields for each asset type
    CREATE TABLE IF NOT EXISTS asset_fields (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      asset_type_id INTEGER NOT NULL REFERENCES asset_types(id),
      field_path TEXT NOT NULL,            -- dot-notation path, e.g. 'animation', 'scripts[].param'
      type TEXT NOT NULL,                  -- 'string', 'number', 'boolean', 'array', 'object', 'Vec2F', etc.
      description TEXT,
      required INTEGER DEFAULT 0,
      default_value TEXT,                  -- JSON-encoded default
      enum_values TEXT,                    -- JSON array of valid values (if restricted)
      examples TEXT,                       -- JSON array of example values
      UNIQUE(asset_type_id, field_path)
    );

    -- Crafting recipes
    CREATE TABLE IF NOT EXISTS recipes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      source_id INTEGER NOT NULL REFERENCES sources(id),
      output_item TEXT NOT NULL,
      output_count INTEGER DEFAULT 1,
      station TEXT,                        -- crafting station required
      groups TEXT,                         -- JSON array of recipe groups
      inputs TEXT NOT NULL,                -- JSON array of {item, count}
      duration REAL,                       -- craft time in seconds
      notes TEXT
    );

    -- FU-specific: Research tree entries
    CREATE TABLE IF NOT EXISTS fu_research (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      tree TEXT NOT NULL,                  -- research tree name
      node_id TEXT NOT NULL UNIQUE,
      name TEXT NOT NULL,
      description TEXT,
      cost TEXT,                           -- JSON: research cost
      prerequisites TEXT,                  -- JSON array of prerequisite node_ids
      unlocks TEXT                         -- JSON array of what this unlocks
    );

    -- FU-specific: Extraction/centrifuge recipes
    CREATE TABLE IF NOT EXISTS fu_extraction (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      input_item TEXT NOT NULL,
      method TEXT NOT NULL,                -- 'centrifuge', 'sifter', 'extractor', 'blastfurnace', etc.
      outputs TEXT NOT NULL,               -- JSON array of {item, count, chance}
      notes TEXT
    );

    -- Tags for flexible categorization/search
    CREATE TABLE IF NOT EXISTS tags (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      entity_type TEXT NOT NULL,           -- 'lua_function', 'asset_type', 'recipe', etc.
      entity_id INTEGER NOT NULL,
      tag TEXT NOT NULL,
      UNIQUE(entity_type, entity_id, tag)
    );

    -- Full-text search virtual table for broad queries
    CREATE VIRTUAL TABLE IF NOT EXISTS search_index USING fts5(
      entity_type,                         -- what kind of thing this is
      entity_id UNINDEXED,                 -- FK back to the source table
      name,                                -- searchable name
      content,                             -- searchable description/content
      source,                              -- 'vanilla' or 'frackin-universe'
      tokenize='porter unicode61'
    );

    -- Indexes for common queries
    CREATE INDEX IF NOT EXISTS idx_lua_functions_name ON lua_functions(name);
    CREATE INDEX IF NOT EXISTS idx_asset_fields_path ON asset_fields(field_path);
    CREATE INDEX IF NOT EXISTS idx_recipes_output ON recipes(output_item);
    CREATE INDEX IF NOT EXISTS idx_recipes_station ON recipes(station);
    CREATE INDEX IF NOT EXISTS idx_tags_tag ON tags(tag);
    CREATE INDEX IF NOT EXISTS idx_tags_entity ON tags(entity_type, entity_id);
  `);
}
