# starbound-mcp

An [MCP (Model Context Protocol)](https://modelcontextprotocol.io/) server that gives AI assistants deep knowledge of the **Starbound** and **Frackin Universe** modding APIs.

Stop guessing at JSON schemas and Lua functions. Let your AI *know* them.

## What is this?

When you use an AI assistant (Claude, etc.) to help create Starbound mods, the AI typically guesses at the modding API based on scattered web results. This MCP server provides a curated, structured database of:

- **1,200+ Lua API functions** — `world`, `player`, `entity`, `status`, `activeItem`, `animator`, `root`, and 48 more tables with full parameter docs and return types
- **665 asset schema fields** — valid JSON fields for `.activeitem`, `.object`, `.monstertype`, `.projectile`, `.biome`, `.statuseffect`, and 33 more asset types
- **7,180 crafting recipes** — every FU recipe, searchable by item or station
- **2,636 extraction recipes** — centrifuge, sifter, rock crusher, extraction lab, and more
- **395 research tree nodes** — FU research trees with costs, prerequisites, and unlocks

All sourced from the actual game's C++ parsers (OpenStarbound), official Lua API docs, and the FrackinUniverse mod source. Works **completely offline**.

---

## Installation

Choose the method that works best for you:

### Option 1: Standalone executable (easiest)

No programming experience needed. Just download and configure.

1. Go to the [latest release](https://github.com/notreallycheeks/starbound-mcp/releases/latest)
2. Download the executable for your platform:
   - **Windows:** `starbound-mcp-win.exe`
   - **macOS:** `starbound-mcp-macos`
   - **Linux:** `starbound-mcp-linux`
3. Also download `starbound.db` (the knowledge database)
4. Place both files in the same folder (e.g., `C:\starbound-mcp\`)
5. Add to your MCP config (see [Configuration](#configuration) below)

### Option 2: npm (for developers)

Requires [Node.js](https://nodejs.org/) 20+.

```bash
npm install -g starbound-mcp
```

Or run without installing:

```bash
npx starbound-mcp
```

### Option 3: Build from source (for contributors)

```bash
git clone https://github.com/notreallycheeks/starbound-mcp.git
cd starbound-mcp
npm install
npm run build
```

To build the database yourself (requires cloning OpenStarbound and FrackinUniverse):

```bash
# Seed curated base data
npm run seed

# Extract from OpenStarbound C++ source (asset schemas + Lua API)
npm run extract:openstarbound -- --source-path /path/to/OpenStarbound
npm run extract:lua-docs -- --source-path /path/to/OpenStarbound

# Extract from FrackinUniverse (recipes, research, extraction)
npm run extract:fu -- --fu-path /path/to/FrackinUniverse
```

---

## Configuration

### Claude Code

Add to your project's `.mcp.json` or `~/.claude.json`:

**If using the standalone executable:**
```json
{
  "mcpServers": {
    "starbound": {
      "command": "C:/starbound-mcp/starbound-mcp-win.exe"
    }
  }
}
```

**If using npm (global install):**
```json
{
  "mcpServers": {
    "starbound": {
      "command": "starbound-mcp"
    }
  }
}
```

**If using npx:**
```json
{
  "mcpServers": {
    "starbound": {
      "command": "npx",
      "args": ["-y", "starbound-mcp"]
    }
  }
}
```

**If built from source:**
```json
{
  "mcpServers": {
    "starbound": {
      "command": "node",
      "args": ["/path/to/starbound-mcp/dist/index.js"]
    }
  }
}
```

### Claude Desktop

Add to your `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "starbound": {
      "command": "starbound-mcp"
    }
  }
}
```

### Custom database location

Set the `STARBOUND_MCP_DB` environment variable to use a database at a custom path:

```json
{
  "mcpServers": {
    "starbound": {
      "command": "starbound-mcp",
      "env": {
        "STARBOUND_MCP_DB": "/path/to/my/starbound.db"
      }
    }
  }
}
```

---

## Available Tools

Once connected, your AI assistant gains these tools:

| Tool | Description |
|---|---|
| `search` | Broad natural language search across all modding knowledge |
| `search_lua_api` | Search Lua API functions by name, table, or script context |
| `get_asset_schema` | Get the full JSON schema for any asset type (.object, .activeitem, etc.) |
| `list_asset_types` | List all known asset types and file extensions |
| `list_lua_tables` | List all Lua API tables and their available contexts |
| `lookup_recipe` | Search crafting recipes by item or station |
| `lookup_fu_extraction` | Search FU extraction/centrifuge/sifter recipes |
| `lookup_fu_research` | Search FU research tree entries |

### Example usage

Just ask your AI naturally:

- *"What fields are valid in a .activeitem file?"*
- *"How do I spawn a projectile in Lua?"*
- *"What's the recipe for an iron axe?"*
- *"What can I get from centrifuging oystershellmaterial?"*
- *"Show me all world.entityQuery parameters"*

---

## Database contents

| Category | Count |
|---|---|
| Lua API functions | 1,203 |
| Lua API tables | 55 |
| Asset types | 39 |
| Asset schema fields | 665 |
| Crafting recipes (FU) | 7,180 |
| Extraction/centrifuge recipes | 2,636 |
| Research nodes | 395 |
| Full-text search entries | 12,184 |

### Data sources

All data is extracted from authoritative sources — not scraped from wikis:

- **[OpenStarbound](https://github.com/OpenStarbound/OpenStarbound)** C++ source — the actual game parsers that define every JSON field, type, and default value
- **[OpenStarbound](https://github.com/OpenStarbound/OpenStarbound)** `doc/lua/` — 55 markdown files documenting every Lua API function
- **[FrackinUniverse](https://github.com/sayterdarkwynd/FrackinUniverse)** mod source — all recipes, extraction configs, and research trees

---

## Contributing

This project is community-driven. The database is only as good as the data in it.

### Adding curated data

The seed script (`src/db/seed.ts`) contains hand-curated data with descriptions and examples. To improve it:

1. Fork the repo
2. Add entries to `src/db/seed.ts`
3. Run `npm run seed` to verify
4. Submit a PR

### Improving extraction scripts

The extraction scripts in `src/scripts/` parse data from OpenStarbound and FU source automatically. If you find missing fields or incorrect parsing:

1. Check the relevant `Star*Database.cpp` file in OpenStarbound
2. Update the regex patterns or parsing logic in the extraction script
3. Submit a PR

### Reporting issues

If the MCP server gives your AI wrong information about Starbound modding, [open an issue](https://github.com/notreallycheeks/starbound-mcp/issues) with:
- What you asked
- What the AI said
- What the correct answer is

---

## Roadmap

- [x] Core Lua API coverage (vanilla + OpenStarbound extensions)
- [x] Asset schema extraction from C++ source
- [x] FU crafting recipe database
- [x] FU extraction/centrifuge recipe database
- [x] FU research tree data
- [x] Full-text search across everything
- [ ] Standalone executables (Windows, macOS, Linux)
- [ ] npm package publishing
- [ ] Auto-extraction from unpacked game assets
- [ ] Patch/merge documentation (how `.patch` files work)
- [ ] Common modding patterns and examples
- [ ] OpenStarbound/xStarbound extended API coverage
- [ ] Interactive database explorer web UI

## License

MIT
