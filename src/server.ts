import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { registerSearchTools } from "./tools/search.js";
import { registerLookupTools } from "./tools/lookup.js";
import { registerSchemaTools } from "./tools/schema.js";
import { getDatabase } from "./db/index.js";

export function createServer(): McpServer {
  const server = new McpServer({
    name: "starbound-mcp",
    version: "0.1.0",
  });

  const db = getDatabase();

  registerSearchTools(server, db);
  registerLookupTools(server, db);
  registerSchemaTools(server, db);

  return server;
}
