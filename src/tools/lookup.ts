import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type Database from "better-sqlite3";
import { z } from "zod";

export function registerLookupTools(server: McpServer, db: Database.Database): void {
  server.tool(
    "lookup_recipe",
    "Look up crafting recipes by item name or crafting station. Use this to find how to craft specific items or what a station can craft.",
    {
      item: z.string().optional().describe("Item name to look up recipes for (output item)"),
      station: z.string().optional().describe("Crafting station to list recipes for"),
      source: z.enum(["all", "vanilla", "frackin-universe"]).default("all"),
    },
    async ({ item, station, source }) => {
      if (!item && !station) {
        return {
          content: [{ type: "text" as const, text: "Please provide either an item name or a crafting station." }],
        };
      }

      let sql = `
        SELECT r.output_item, r.output_count, r.station, r.inputs, r.duration, r.groups, r.notes,
               s.name as source_name
        FROM recipes r
        JOIN sources s ON r.source_id = s.id
        WHERE 1=1
      `;
      const params: string[] = [];

      if (item) {
        sql += ` AND r.output_item LIKE ?`;
        params.push(`%${item}%`);
      }
      if (station) {
        sql += ` AND r.station LIKE ?`;
        params.push(`%${station}%`);
      }
      if (source !== "all") {
        sql += ` AND s.name = ?`;
        params.push(source);
      }

      sql += ` ORDER BY r.output_item LIMIT 25`;

      const results = db.prepare(sql).all(...params) as Array<{
        output_item: string;
        output_count: number;
        station: string;
        inputs: string;
        duration: number;
        groups: string;
        notes: string;
        source_name: string;
      }>;

      if (results.length === 0) {
        return {
          content: [{ type: "text" as const, text: `No recipes found${item ? ` for "${item}"` : ""}${station ? ` at "${station}"` : ""}.` }],
        };
      }

      const formatted = results.map((r) => {
        let entry = `### ${r.output_item}${r.output_count > 1 ? ` x${r.output_count}` : ""}\n`;
        if (r.station) entry += `**Station:** ${r.station}\n`;
        try {
          const inputs = JSON.parse(r.inputs);
          entry += `**Inputs:** ${inputs.map((i: { item: string; count: number }) => `${i.item} x${i.count}`).join(", ")}\n`;
        } catch { /* skip malformed inputs */ }
        if (r.duration) entry += `**Craft time:** ${r.duration}s\n`;
        if (r.notes) entry += `**Notes:** ${r.notes}\n`;
        entry += `*Source: ${r.source_name}*`;
        return entry;
      }).join("\n\n---\n\n");

      return {
        content: [{ type: "text" as const, text: formatted }],
      };
    },
  );

  server.tool(
    "lookup_fu_extraction",
    "Look up Frackin Universe extraction/centrifuge/sifting recipes. Use this to find what resources can be extracted from items.",
    {
      item: z.string().describe("Item name to look up extraction recipes for"),
      method: z.string().optional().describe("Extraction method: centrifuge, sifter, extractor, blastfurnace, etc."),
    },
    async ({ item, method }) => {
      let sql = `
        SELECT input_item, method, outputs, notes
        FROM fu_extraction
        WHERE input_item LIKE ?
      `;
      const params: string[] = [`%${item}%`];

      if (method) {
        sql += ` AND method = ?`;
        params.push(method);
      }

      sql += ` ORDER BY input_item LIMIT 25`;

      const results = db.prepare(sql).all(...params) as Array<{
        input_item: string;
        method: string;
        outputs: string;
        notes: string;
      }>;

      if (results.length === 0) {
        return {
          content: [{ type: "text" as const, text: `No extraction recipes found for "${item}".` }],
        };
      }

      const formatted = results.map((r) => {
        let entry = `### ${r.input_item} (${r.method})\n`;
        try {
          const outputs = JSON.parse(r.outputs);
          entry += `**Outputs:**\n${outputs.map((o: { item: string; count: number; chance: number }) =>
            `  - ${o.item} x${o.count}${o.chance < 1 ? ` (${(o.chance * 100).toFixed(0)}% chance)` : ""}`,
          ).join("\n")}\n`;
        } catch { /* skip malformed outputs */ }
        if (r.notes) entry += `**Notes:** ${r.notes}\n`;
        return entry;
      }).join("\n\n---\n\n");

      return {
        content: [{ type: "text" as const, text: formatted }],
      };
    },
  );

  server.tool(
    "lookup_fu_research",
    "Look up Frackin Universe research tree entries. Find what research nodes unlock and their prerequisites.",
    {
      query: z.string().describe("Research node name or keyword to search for"),
      tree: z.string().optional().describe("Filter to a specific research tree"),
    },
    async ({ query, tree }) => {
      let sql = `
        SELECT tree, node_id, name, description, cost, prerequisites, unlocks
        FROM fu_research
        WHERE (name LIKE ? OR description LIKE ?)
      `;
      const params: string[] = [`%${query}%`, `%${query}%`];

      if (tree) {
        sql += ` AND tree = ?`;
        params.push(tree);
      }

      sql += ` ORDER BY tree, name LIMIT 25`;

      const results = db.prepare(sql).all(...params) as Array<{
        tree: string;
        node_id: string;
        name: string;
        description: string;
        cost: string;
        prerequisites: string;
        unlocks: string;
      }>;

      if (results.length === 0) {
        return {
          content: [{ type: "text" as const, text: `No research nodes found matching "${query}".` }],
        };
      }

      const formatted = results.map((r) => {
        let entry = `### ${r.name} (${r.tree})\n`;
        if (r.description) entry += `${r.description}\n`;
        if (r.cost) entry += `**Cost:** ${r.cost}\n`;
        if (r.prerequisites) {
          try {
            const prereqs = JSON.parse(r.prerequisites);
            if (prereqs.length > 0) entry += `**Prerequisites:** ${prereqs.join(", ")}\n`;
          } catch { /* skip */ }
        }
        if (r.unlocks) {
          try {
            const unlocks = JSON.parse(r.unlocks);
            if (unlocks.length > 0) entry += `**Unlocks:** ${unlocks.join(", ")}\n`;
          } catch { /* skip */ }
        }
        return entry;
      }).join("\n\n---\n\n");

      return {
        content: [{ type: "text" as const, text: formatted }],
      };
    },
  );
}
