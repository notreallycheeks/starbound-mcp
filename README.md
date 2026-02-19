# starbound-mcp

An [MCP (Model Context Protocol)](https://modelcontextprotocol.io/) server that gives AI assistants deep knowledge of the **Starbound** and **Frackin Universe** modding APIs.

Stop guessing at JSON schemas and Lua functions. Let your AI *know* them.

## What is this?

When you use an AI assistant (Claude, etc.) to help create Starbound mods, the AI typically guesses at the modding API based on scattered web results. This MCP server provides a curated, structured database of:

- **Lua API functions** — every `world.*`, `player.*`, `entity.*`, `status.*`, `mcontroller.*`, `activeItem.*`, `animator.*`, `root.*`, `config.*` function with parameters, return types, and examples
- **Asset schemas** — valid JSON fields for `.activeitem`, `.object`, `.item`, `.monstertype`, `.statuseffect`, `.biome`, `.projectile`, `.recipe`, `.tech`, and more
- **Crafting recipes** — searchable recipe database
- **Frackin Universe extensions** — FU-specific Lua APIs, custom damage types, research trees, extraction recipes, and additional asset fields

The result: your AI assistant gives you **correct, specific answers** instead of educated guesses.

## Quick Start

```bash
# Clone
git clone https://github.com/cheeks/starbound-mcp.git
cd starbound-mcp

# Install
npm install

# Build the database
npm run seed

# Build the server
npm run build
```

### Add to Claude Code

Add to your Claude Code MCP settings (`~/.claude/claude_desktop_config.json` or project `.mcp.json`):

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

### Add to Claude Desktop

Add to Claude Desktop's config (`claude_desktop_config.json`):

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

## Available Tools

Once connected, your AI assistant gains these tools:

| Tool | Description |
|---|---|
| `search` | Broad natural language search across all modding knowledge |
| `search_lua_api` | Search Lua API functions by name, table, or context |
| `get_asset_schema` | Get the full JSON schema for any asset type |
| `list_asset_types` | List all known asset types and file extensions |
| `list_lua_tables` | List all Lua API tables and their available contexts |
| `lookup_recipe` | Search crafting recipes by item or station |
| `lookup_fu_extraction` | Search FU extraction/centrifuge recipes |
| `lookup_fu_research` | Search FU research tree entries |

## Works Offline

The entire knowledge base is stored in a local SQLite database. No internet required — perfect for modding sessions on the go.

## Contributing

This project is community-driven. The database is only as good as the data in it.

### Adding data

The seed script (`src/db/seed.ts`) contains all the curated data. To add new entries:

1. Fork the repo
2. Add entries to `src/db/seed.ts` using the helper functions
3. Run `npm run seed` to verify
4. Submit a PR

### Data sources we're pulling from

- [starbound-unofficial.readthedocs.io](https://starbound-unofficial.readthedocs.io/) — Lua API docs
- [xStarbound Lua API docs](https://github.com/xStarbound/xStarbound) — Most current API reference
- [Starbounder Wiki](https://starbounder.org/Modding:Portal) — Community modding wiki
- [FrackinUniverse source](https://github.com/sayterdarkwynd/FrackinUniverse) — Full FU mod source
- [fudocgenerator](https://github.com/edwardspec/fudocgenerator) — Structured FU data extractor

### Extraction scripts

For bulk data import from your Starbound installation:

```bash
# Extract vanilla asset schemas from unpacked assets
npm run extract:vanilla -- --assets-path "/path/to/Starbound/assets/packed"

# Extract FU data from the FU mod folder
npm run extract:fu -- --fu-path "/path/to/FrackinUniverse"
```

## Roadmap

- [ ] Core Lua API coverage (vanilla)
- [ ] Complete asset schema coverage (all vanilla asset types)
- [ ] Frackin Universe Lua API extensions
- [ ] FU crafting recipe database
- [ ] FU extraction/centrifuge recipe database
- [ ] FU research tree data
- [ ] Auto-extraction from game assets
- [ ] Auto-extraction from FU source
- [ ] Patch/merge documentation (how `.patch` files work)
- [ ] Common modding patterns and examples
- [ ] OpenStarbound/xStarbound extended API coverage

## License

MIT
