import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type Database from "better-sqlite3";
import { z } from "zod";

export function registerSearchTools(server: McpServer, db: Database.Database): void {
  server.tool(
    "search",
    "Search the Starbound modding knowledge base. Use this for broad queries like 'how do projectiles work' or 'bee mechanics'. Searches across Lua API docs, asset schemas, recipes, and FU mechanics.",
    {
      query: z.string().describe("Natural language search query"),
      source: z.enum(["all", "vanilla", "frackin-universe"]).default("all").describe("Filter by source mod"),
      limit: z.number().min(1).max(50).default(10).describe("Max results to return"),
    },
    async ({ query, source, limit }) => {
      let sql = `
        SELECT entity_type, entity_id, name, content, source,
               rank
        FROM search_index
        WHERE search_index MATCH ?
      `;
      const params: (string | number)[] = [query];

      if (source !== "all") {
        sql += ` AND source = ?`;
        params.push(source);
      }

      sql += ` ORDER BY rank LIMIT ?`;
      params.push(limit);

      const results = db.prepare(sql).all(...params) as Array<{
        entity_type: string;
        entity_id: number;
        name: string;
        content: string;
        source: string;
      }>;

      if (results.length === 0) {
        return {
          content: [{ type: "text" as const, text: `No results found for "${query}". Try broader terms or check spelling.` }],
        };
      }

      const formatted = results.map((r, i) =>
        `${i + 1}. [${r.source}/${r.entity_type}] **${r.name}**\n   ${r.content?.substring(0, 200) ?? "(no description)"}`,
      ).join("\n\n");

      return {
        content: [{ type: "text" as const, text: `Found ${results.length} results for "${query}":\n\n${formatted}` }],
      };
    },
  );

  server.tool(
    "search_lua_api",
    "Search Lua API functions by name or description. Use this when looking for specific Starbound Lua functions like world.entityQuery or player.isAdmin.",
    {
      query: z.string().describe("Function name or keyword to search for"),
      table_name: z.string().optional().describe("Filter to a specific Lua table (e.g. 'world', 'player', 'entity')"),
      context: z.string().optional().describe("Filter by script context (e.g. 'player', 'npc', 'monster', 'object', 'activeitem', 'universal')"),
    },
    async ({ query, table_name, context }) => {
      let sql = `
        SELECT lf.name, lf.signature, lf.description, lf.return_type, lf.parameters, lf.examples, lf.notes,
               lt.name as table_name, lt.context, s.name as source_name
        FROM lua_functions lf
        JOIN lua_tables lt ON lf.table_id = lt.id
        JOIN sources s ON lt.source_id = s.id
        WHERE (lf.name LIKE ? OR lf.description LIKE ?)
      `;
      const likeQuery = `%${query}%`;
      const params: string[] = [likeQuery, likeQuery];

      if (table_name) {
        sql += ` AND lt.name = ?`;
        params.push(table_name);
      }
      if (context) {
        sql += ` AND lt.context LIKE ?`;
        params.push(`%${context}%`);
      }

      sql += ` ORDER BY lf.name LIMIT 20`;

      const results = db.prepare(sql).all(...params) as Array<{
        name: string;
        signature: string;
        description: string;
        return_type: string;
        parameters: string;
        examples: string;
        notes: string;
        table_name: string;
        context: string;
        source_name: string;
      }>;

      if (results.length === 0) {
        return {
          content: [{ type: "text" as const, text: `No Lua functions found matching "${query}".` }],
        };
      }

      const formatted = results.map((fn) => {
        let entry = `### ${fn.table_name}.${fn.name}\n`;
        if (fn.signature) entry += `\`${fn.signature}\`\n`;
        if (fn.description) entry += `${fn.description}\n`;
        if (fn.return_type) entry += `**Returns:** ${fn.return_type}\n`;
        if (fn.context) entry += `**Context:** ${fn.context}\n`;
        if (fn.parameters) {
          try {
            const params = JSON.parse(fn.parameters);
            entry += `**Parameters:**\n${params.map((p: { name: string; type: string; description: string; optional: boolean }) =>
              `  - \`${p.name}\` (${p.type})${p.optional ? " [optional]" : ""}: ${p.description}`,
            ).join("\n")}\n`;
          } catch { /* skip malformed params */ }
        }
        if (fn.examples) {
          try {
            const examples = JSON.parse(fn.examples);
            entry += `**Examples:**\n\`\`\`lua\n${examples.join("\n")}\n\`\`\`\n`;
          } catch { /* skip malformed examples */ }
        }
        if (fn.notes) entry += `**Notes:** ${fn.notes}\n`;
        entry += `*Source: ${fn.source_name}*`;
        return entry;
      }).join("\n\n---\n\n");

      return {
        content: [{ type: "text" as const, text: formatted }],
      };
    },
  );
}
