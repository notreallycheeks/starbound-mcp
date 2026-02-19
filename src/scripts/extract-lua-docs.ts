/**
 * Extract Lua API documentation from OpenStarbound's doc/lua/*.md files.
 *
 * Parses function signatures, parameters, return types, and descriptions
 * into our SQLite database.
 *
 * Usage: npm run extract:lua-docs -- --source-path "F:/repositories/cheeks/OpenStarbound"
 */

import fs from "fs";
import path from "path";
import { getDatabase } from "../db/index.js";

// ─── Types ──────────────────────────────────────────────────────────────────────

interface ParsedParam {
  name: string;
  type: string;
  optional: boolean;
}

interface ParsedFunction {
  tableName: string;
  functionName: string;
  returnType: string;
  parameters: ParsedParam[];
  signature: string;         // the full signature line
  description: string;
  isOverload: boolean;
  sourceFile: string;
  lineNumber: number;
}

// ─── Context mapping: which Lua tables are available in which script contexts ──

const TABLE_CONTEXTS: Record<string, string> = {
  "world":                    "universal",
  "entity":                   "universal",
  "config":                   "universal",
  "animator":                 "universal",
  "message":                  "universal",
  "root":                     "universal",
  "utility":                  "universal",
  "physics":                  "universal",
  "player":                   "player",
  "activeItem":               "activeitem",
  "activeitemanimation":      "activeitem",
  "item":                     "activeitem,object",
  "monster":                  "monster",
  "npc":                      "npc",
  "object":                   "object",
  "objectanimator":           "object",
  "projectile":               "projectile",
  "stagehand":                "stagehand",
  "statuscontroller":         "player,npc,monster",
  "statuseffect":             "statuseffect",
  "tech":                     "tech",
  "vehicle":                  "vehicle",
  "quest":                    "quest",
  "celestial":                "universal",
  "commandprocessor":         "universal",
  "containerpane":            "pane",
  "localanimator":            "deployable",
  "movementcontroller":       "tech,vehicle",
  "actormovementcontroller":  "player,npc,monster",
  "playercompanions":         "player",
  "scriptedanimator":         "deployable",
  "scriptpane":               "pane",
  "updatablescript":          "universal",
  "widget":                   "pane",
  // OpenStarbound extensions
  "assets":                   "universal",
  "camera":                   "universal",
  "chat":                     "universal",
  "clipboard":                "pane",
  "effect":                   "statuseffect",
  "http":                     "universal",
  "input":                    "universal",
  "interface":                "pane",
  "itemdrop":                 "itemdrop",
  "renderer":                 "universal",
  "songbook":                 "activeitem",
  "threads":                  "universal",
  "universe":                 "universal",
};

// ─── Parsing ────────────────────────────────────────────────────────────────────

function parseSignatureLine(line: string): { returnType: string; tableName: string; functionName: string; rawParams: string } | null {
  // Match: #### `ReturnType` tableName.functionName(params)
  // Also handles ### variant
  const match = line.match(/^#{3,4}\s+`([^`]+)`\s+(\w+)\.(\w+)\(([^)]*)\)\s*$/);
  if (match) {
    return {
      returnType: match[1],
      tableName: match[2],
      functionName: match[3],
      rawParams: match[4],
    };
  }

  // Some signatures have no return type (callbacks/hooks)
  const noReturnMatch = line.match(/^#{3,4}\s+(\w+)\.(\w+)\(([^)]*)\)\s*$/);
  if (noReturnMatch) {
    return {
      returnType: "void",
      tableName: noReturnMatch[1],
      functionName: noReturnMatch[2],
      rawParams: noReturnMatch[3],
    };
  }

  return null;
}

function parseParameters(rawParams: string): ParsedParam[] {
  if (!rawParams.trim()) return [];

  const params: ParsedParam[] = [];

  // Match each parameter: optional `[` then `Type` name then optional `]`
  // Handle the comma-separated list
  const paramRegex = /(\[?)\s*`([^`]+)`\s+(\w+)\s*\]?/g;
  let match: RegExpExecArray | null;

  while ((match = paramRegex.exec(rawParams)) !== null) {
    params.push({
      name: match[3],
      type: match[2],
      optional: match[1] === "[",
    });
  }

  return params;
}

function parseMarkdownFile(filePath: string): ParsedFunction[] {
  const content = fs.readFileSync(filePath, "utf-8");
  const lines = content.split("\n");
  const fileName = path.basename(filePath);
  const functions: ParsedFunction[] = [];

  let i = 0;
  while (i < lines.length) {
    const line = lines[i];

    // Skip non-heading lines and section headings (## or # without backtick signature)
    if (!line.startsWith("###") && !line.startsWith("####")) {
      i++;
      continue;
    }

    // Skip section headings that don't look like function signatures
    if (!line.includes("`") || !line.includes("(")) {
      i++;
      continue;
    }

    const parsed = parseSignatureLine(line);
    if (!parsed) {
      i++;
      continue;
    }

    const lineNumber = i + 1;
    i++;

    // Collect description — everything until the next heading or horizontal rule
    const descriptionLines: string[] = [];
    while (i < lines.length) {
      const nextLine = lines[i];

      // Stop at next function heading
      if ((nextLine.startsWith("###") || nextLine.startsWith("####")) && nextLine.includes("`") && nextLine.includes("(")) {
        break;
      }

      // Stop at horizontal rule (but consume it)
      if (nextLine.trim() === "---") {
        i++;
        break;
      }

      descriptionLines.push(nextLine);
      i++;
    }

    const description = descriptionLines.join("\n").trim();
    const parameters = parseParameters(parsed.rawParams);

    // Build the clean signature string
    const paramStr = parameters.map((p) =>
      `${p.optional ? "[" : ""}${p.type} ${p.name}${p.optional ? "]" : ""}`,
    ).join(", ");
    const signature = `${parsed.tableName}.${parsed.functionName}(${paramStr})`;

    // Check if this is an overload of the previous function
    const isOverload = functions.length > 0 &&
      functions[functions.length - 1].tableName === parsed.tableName &&
      functions[functions.length - 1].functionName === parsed.functionName;

    functions.push({
      tableName: parsed.tableName,
      functionName: parsed.functionName,
      returnType: parsed.returnType,
      parameters,
      signature,
      description,
      isOverload,
      sourceFile: fileName,
      lineNumber,
    });
  }

  return functions;
}

// ─── Database insertion ─────────────────────────────────────────────────────────

function insertLuaData(allFunctions: ParsedFunction[], isOpenStarboundExtension: boolean): void {
  const db = getDatabase();

  const sourceName = isOpenStarboundExtension ? "openstarbound" : "vanilla";
  const sourceDescription = isOpenStarboundExtension
    ? "OpenStarbound C++ source — authoritative asset schema definitions"
    : "Base Starbound game";

  // Get or create source
  let sourceRow = db.prepare("SELECT id FROM sources WHERE name = ?").get(sourceName) as { id: number } | undefined;
  if (!sourceRow) {
    const result = db.prepare(
      "INSERT INTO sources (name, version, description, url) VALUES (?, ?, ?, ?)"
    ).run(
      sourceName,
      isOpenStarboundExtension ? null : "1.4.4",
      sourceDescription,
      isOpenStarboundExtension ? "https://github.com/OpenStarbound/OpenStarbound" : "https://starbounder.org/Modding:Portal",
    );
    sourceRow = { id: Number(result.lastInsertRowid) };
  }
  const sourceId = sourceRow.id;

  // Group functions by table
  const tableMap = new Map<string, ParsedFunction[]>();
  for (const fn of allFunctions) {
    const existing = tableMap.get(fn.tableName) ?? [];
    existing.push(fn);
    tableMap.set(fn.tableName, existing);
  }

  const insertTable = db.prepare(`
    INSERT OR IGNORE INTO lua_tables (source_id, name, description, context)
    VALUES (?, ?, ?, ?)
  `);

  const getTable = db.prepare("SELECT id FROM lua_tables WHERE source_id = ? AND name = ?");

  const insertFunction = db.prepare(`
    INSERT OR REPLACE INTO lua_functions (table_id, name, signature, description, return_type, parameters, examples, notes)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const insertSearch = db.prepare(`
    INSERT INTO search_index (entity_type, entity_id, name, content, source)
    VALUES (?, ?, ?, ?, ?)
  `);

  let totalTables = 0;
  let totalFunctions = 0;

  const transaction = db.transaction(() => {
    for (const [tableName, functions] of tableMap) {
      const context = TABLE_CONTEXTS[tableName] ?? "unknown";
      const tableDescription = `Lua ${tableName} table — ${functions.length} functions. Available in: ${context}`;

      insertTable.run(sourceId, tableName, tableDescription, context);

      const tableRow = getTable.get(sourceId, tableName) as { id: number } | undefined;
      if (!tableRow) continue;

      totalTables++;

      // For overloaded functions, merge them
      const mergedFunctions = new Map<string, ParsedFunction>();
      for (const fn of functions) {
        if (fn.isOverload && mergedFunctions.has(fn.functionName)) {
          // Append the overload signature and description to the existing entry
          const existing = mergedFunctions.get(fn.functionName)!;
          existing.signature += `\n${fn.signature}`;
          if (fn.description) {
            existing.description += `\n\n**Overload:**\n${fn.description}`;
          }
          // Use the overload with more parameters as the "primary"
          if (fn.parameters.length > existing.parameters.length) {
            existing.parameters = fn.parameters;
            existing.returnType = fn.returnType;
          }
        } else {
          mergedFunctions.set(fn.functionName, { ...fn });
        }
      }

      for (const fn of mergedFunctions.values()) {
        const params = fn.parameters.map((p) => ({
          name: p.name,
          type: p.type,
          description: "",
          optional: p.optional,
        }));

        // Extract code examples from description
        const examples: string[] = [];
        const codeBlockRegex = /```(?:lua|js)?\n([\s\S]*?)```/g;
        let codeMatch: RegExpExecArray | null;
        while ((codeMatch = codeBlockRegex.exec(fn.description)) !== null) {
          examples.push(codeMatch[1].trim());
        }

        // Clean description — remove code blocks for the main description
        const cleanDescription = fn.description
          .replace(/```(?:lua|js)?\n[\s\S]*?```/g, "")
          .trim();

        insertFunction.run(
          tableRow.id,
          fn.functionName,
          fn.signature,
          cleanDescription,
          fn.returnType,
          JSON.stringify(params),
          examples.length > 0 ? JSON.stringify(examples) : null,
          `Source: ${fn.sourceFile}:${fn.lineNumber}`,
        );

        totalFunctions++;
      }
    }
  });

  transaction();

  // Index functions in search
  const allDbFunctions = db.prepare(`
    SELECT lf.id, lf.name, lf.description, lt.name as table_name
    FROM lua_functions lf
    JOIN lua_tables lt ON lf.table_id = lt.id
    JOIN sources s ON lt.source_id = s.id
    WHERE s.name = ?
  `).all(sourceName) as Array<{ id: number; name: string; description: string; table_name: string }>;

  const searchTransaction = db.transaction(() => {
    for (const fn of allDbFunctions) {
      insertSearch.run("lua_function", fn.id, `${fn.table_name}.${fn.name}`, fn.description ?? "", sourceName);
    }
  });

  searchTransaction();

  console.log(`Inserted ${totalTables} Lua tables with ${totalFunctions} functions from ${sourceName}.`);
  console.log(`Indexed ${allDbFunctions.length} functions in full-text search.`);
}

// ─── Main ───────────────────────────────────────────────────────────────────────

function main() {
  const args = process.argv.slice(2);
  const sourcePathIdx = args.indexOf("--source-path");

  if (sourcePathIdx === -1 || !args[sourcePathIdx + 1]) {
    console.error("Usage: npm run extract:lua-docs -- --source-path <path>");
    console.error("  <path> should point to the OpenStarbound repository root");
    process.exit(1);
  }

  const sourcePath = args[sourcePathIdx + 1];
  const luaDocDir = path.join(sourcePath, "doc", "lua");
  const osbLuaDocDir = path.join(luaDocDir, "openstarbound");

  if (!fs.existsSync(luaDocDir)) {
    console.error(`Could not find doc/lua/ directory at: ${luaDocDir}`);
    process.exit(1);
  }

  // Parse base Starbound Lua docs
  console.log("═══ Base Starbound Lua API ═══");
  console.log(`Reading from: ${luaDocDir}`);
  console.log("");

  const baseFiles = fs.readdirSync(luaDocDir)
    .filter((f) => f.endsWith(".md"))
    .map((f) => path.join(luaDocDir, f));

  let baseFunctions: ParsedFunction[] = [];
  for (const file of baseFiles) {
    const functions = parseMarkdownFile(file);
    baseFunctions = baseFunctions.concat(functions);
    if (functions.length > 0) {
      console.log(`  ${path.basename(file)}: ${functions.length} functions`);
    }
  }

  console.log(`\nTotal base functions: ${baseFunctions.length}`);
  console.log("");

  // Parse OpenStarbound extension Lua docs
  let osbFunctions: ParsedFunction[] = [];
  if (fs.existsSync(osbLuaDocDir)) {
    console.log("═══ OpenStarbound Extended Lua API ═══");
    console.log(`Reading from: ${osbLuaDocDir}`);
    console.log("");

    const osbFiles = fs.readdirSync(osbLuaDocDir)
      .filter((f) => f.endsWith(".md"))
      .map((f) => path.join(osbLuaDocDir, f));

    for (const file of osbFiles) {
      const functions = parseMarkdownFile(file);
      osbFunctions = osbFunctions.concat(functions);
      if (functions.length > 0) {
        console.log(`  ${path.basename(file)}: ${functions.length} functions`);
      }
    }

    console.log(`\nTotal OpenStarbound extension functions: ${osbFunctions.length}`);
    console.log("");
  }

  // Check for --dry-run flag
  if (args.includes("--dry-run")) {
    console.log("Dry run — not inserting into database.");
    console.log("\n═══ Base API Sample ═══");
    for (const fn of baseFunctions.slice(0, 10)) {
      console.log(`  ${fn.returnType} ${fn.tableName}.${fn.functionName}(${fn.parameters.map((p) => `${p.optional ? "?" : ""}${p.type} ${p.name}`).join(", ")})`);
      if (fn.description) console.log(`    ${fn.description.substring(0, 100)}...`);
    }
    if (osbFunctions.length > 0) {
      console.log("\n═══ OpenStarbound Extensions Sample ═══");
      for (const fn of osbFunctions.slice(0, 10)) {
        console.log(`  ${fn.returnType} ${fn.tableName}.${fn.functionName}(${fn.parameters.map((p) => `${p.optional ? "?" : ""}${p.type} ${p.name}`).join(", ")})`);
      }
    }
    return;
  }

  // Insert into database
  console.log("Inserting base Lua API into database...");
  insertLuaData(baseFunctions, false);

  if (osbFunctions.length > 0) {
    console.log("\nInserting OpenStarbound extensions into database...");
    insertLuaData(osbFunctions, true);
  }

  console.log("\nDone!");
}

main();
