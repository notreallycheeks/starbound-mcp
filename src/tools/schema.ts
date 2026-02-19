import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type Database from "better-sqlite3";
import { z } from "zod";

export function registerSchemaTools(server: McpServer, db: Database.Database): void {
  server.tool(
    "get_asset_schema",
    "Get the JSON schema/structure for a Starbound asset type. Use this when you need to know what fields are valid in a .activeitem, .object, .monstertype, .biome, or other asset file.",
    {
      asset_type: z.string().describe("Asset type name, e.g. 'activeitem', 'object', 'biome', 'monster', 'npc', 'statuseffect', 'tech', 'quest'"),
      source: z.enum(["all", "vanilla", "frackin-universe"]).default("all"),
    },
    async ({ asset_type, source }) => {
      let sql = `
        SELECT at.name, at.file_extension, at.description, at.base_path, s.name as source_name
        FROM asset_types at
        JOIN sources s ON at.source_id = s.id
        WHERE at.name LIKE ?
      `;
      const params: string[] = [`%${asset_type}%`];

      if (source !== "all") {
        sql += ` AND s.name = ?`;
        params.push(source);
      }

      const assetTypes = db.prepare(sql).all(...params) as Array<{
        name: string;
        file_extension: string;
        description: string;
        base_path: string;
        source_name: string;
      }>;

      if (assetTypes.length === 0) {
        return {
          content: [{ type: "text" as const, text: `No asset type found matching "${asset_type}". Try: activeitem, object, biome, monster, npc, statuseffect, tech, quest, item, matitem, liquid, projectile, vehicle, codex.` }],
        };
      }

      const results = await Promise.all(assetTypes.map((at) => {
        const fields = db.prepare(`
          SELECT af.field_path, af.type, af.description, af.required, af.default_value, af.enum_values, af.examples
          FROM asset_fields af
          JOIN asset_types at2 ON af.asset_type_id = at2.id
          JOIN sources s ON at2.source_id = s.id
          WHERE at2.name = ? AND s.name = ?
          ORDER BY af.required DESC, af.field_path
        `).all(at.name, at.source_name) as Array<{
          field_path: string;
          type: string;
          description: string;
          required: number;
          default_value: string;
          enum_values: string;
          examples: string;
        }>;

        let entry = `## ${at.name} (${at.source_name})\n`;
        if (at.file_extension) entry += `**File extension:** ${at.file_extension}\n`;
        if (at.base_path) entry += `**Typical path:** ${at.base_path}\n`;
        if (at.description) entry += `${at.description}\n`;

        if (fields.length > 0) {
          entry += `\n### Fields\n\n`;
          entry += fields.map((f) => {
            let fieldEntry = `- **\`${f.field_path}\`** (${f.type})${f.required ? " **REQUIRED**" : ""}`;
            if (f.description) fieldEntry += `\n  ${f.description}`;
            if (f.default_value) fieldEntry += `\n  Default: \`${f.default_value}\``;
            if (f.enum_values) {
              try {
                const values = JSON.parse(f.enum_values);
                fieldEntry += `\n  Valid values: ${values.map((v: string) => `\`${v}\``).join(", ")}`;
              } catch { /* skip */ }
            }
            if (f.examples) {
              try {
                const examples = JSON.parse(f.examples);
                fieldEntry += `\n  Examples: ${examples.map((e: string) => `\`${e}\``).join(", ")}`;
              } catch { /* skip */ }
            }
            return fieldEntry;
          }).join("\n");
        } else {
          entry += `\n*No fields documented yet for this asset type.*`;
        }

        return entry;
      }));

      return {
        content: [{ type: "text" as const, text: results.join("\n\n---\n\n") }],
      };
    },
  );

  server.tool(
    "list_asset_types",
    "List all known Starbound asset types. Use this to discover what asset types exist and what file extensions they use.",
    {
      source: z.enum(["all", "vanilla", "frackin-universe"]).default("all"),
    },
    async ({ source }) => {
      let sql = `
        SELECT at.name, at.file_extension, at.description, s.name as source_name
        FROM asset_types at
        JOIN sources s ON at.source_id = s.id
      `;
      const params: string[] = [];

      if (source !== "all") {
        sql += ` WHERE s.name = ?`;
        params.push(source);
      }

      sql += ` ORDER BY s.name, at.name`;

      const results = db.prepare(sql).all(...params) as Array<{
        name: string;
        file_extension: string;
        description: string;
        source_name: string;
      }>;

      if (results.length === 0) {
        return {
          content: [{ type: "text" as const, text: "No asset types in the database yet. Run the seed script to populate data." }],
        };
      }

      const formatted = results.map((r) =>
        `- **${r.name}** (\`${r.file_extension}\`) — ${r.description ?? "No description"} *[${r.source_name}]*`,
      ).join("\n");

      return {
        content: [{ type: "text" as const, text: `## Known Asset Types\n\n${formatted}` }],
      };
    },
  );

  server.tool(
    "list_lua_tables",
    "List all known Starbound Lua API tables and their available contexts. Use this to discover what Lua APIs are available.",
    {
      context: z.string().optional().describe("Filter by script context: 'player', 'npc', 'monster', 'object', 'activeitem', 'universal'"),
    },
    async ({ context }) => {
      let sql = `
        SELECT lt.name, lt.description, lt.context, s.name as source_name,
               COUNT(lf.id) as function_count
        FROM lua_tables lt
        JOIN sources s ON lt.source_id = s.id
        LEFT JOIN lua_functions lf ON lf.table_id = lt.id
        WHERE 1=1
      `;
      const params: string[] = [];

      if (context) {
        sql += ` AND lt.context LIKE ?`;
        params.push(`%${context}%`);
      }

      sql += ` GROUP BY lt.id ORDER BY s.name, lt.name`;

      const results = db.prepare(sql).all(...params) as Array<{
        name: string;
        description: string;
        context: string;
        source_name: string;
        function_count: number;
      }>;

      if (results.length === 0) {
        return {
          content: [{ type: "text" as const, text: "No Lua tables in the database yet. Run the seed script to populate data." }],
        };
      }

      const formatted = results.map((r) =>
        `- **${r.name}** (${r.function_count} functions) — ${r.description ?? "No description"}\n  Context: ${r.context ?? "unknown"} | Source: ${r.source_name}`,
      ).join("\n");

      return {
        content: [{ type: "text" as const, text: `## Lua API Tables\n\n${formatted}` }],
      };
    },
  );
}
