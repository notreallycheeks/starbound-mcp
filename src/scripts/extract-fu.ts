/**
 * Extract data from a FrackinUniverse installation or source checkout.
 *
 * Usage: npm run extract:fu -- --fu-path "/path/to/FrackinUniverse"
 *
 * Extracts:
 * - Crafting recipes (all .recipe files)
 * - Extraction lab recipes (extractionlab_recipes.config, etc.)
 * - Centrifuge/sifter recipes (centrifuge_recipes.config)
 * - Research tree definitions (configs with researchTree property)
 *
 * Data sources confirmed from fudocgenerator (github.com/edwardspec/fudocgenerator):
 * - Extraction configs: objects/generic/extractionlab_recipes.config, etc.
 * - Centrifuge configs: objects/generic/centrifuge_recipes.config
 * - Research trees: any .config file containing a "researchTree" property
 * - Recipes: all .recipe files throughout the mod
 */

import fs from "fs";
import path from "path";
import { getDatabase } from "../db/index.js";

// ─── Starbound JSON has comments — strip them ──────────────────────────────────

function stripJsonComments(text: string): string {
  // Remove // line comments (but not inside strings)
  // Remove /* block comments */
  let result = "";
  let inString = false;
  let stringChar = "";
  let i = 0;

  while (i < text.length) {
    if (inString) {
      if (text[i] === "\\" && i + 1 < text.length) {
        result += text[i] + text[i + 1];
        i += 2;
        continue;
      }
      if (text[i] === stringChar) {
        inString = false;
      }
      result += text[i];
      i++;
    } else {
      if (text[i] === '"' || text[i] === "'") {
        inString = true;
        stringChar = text[i];
        result += text[i];
        i++;
      } else if (text[i] === "/" && i + 1 < text.length && text[i + 1] === "/") {
        // Skip to end of line
        while (i < text.length && text[i] !== "\n") i++;
      } else if (text[i] === "/" && i + 1 < text.length && text[i + 1] === "*") {
        // Skip to end of block comment
        i += 2;
        while (i + 1 < text.length && !(text[i] === "*" && text[i + 1] === "/")) i++;
        i += 2;
      } else {
        result += text[i];
        i++;
      }
    }
  }

  return result;
}

function readJsonFile(filePath: string): unknown | null {
  try {
    const raw = fs.readFileSync(filePath, "utf-8");
    const cleaned = stripJsonComments(raw);
    return JSON.parse(cleaned);
  } catch {
    return null;
  }
}

// ─── Walk directory for files matching a pattern ────────────────────────────────

function walkDir(dir: string, extensions: string[]): string[] {
  const results: string[] = [];
  if (!fs.existsSync(dir)) return results;

  function walk(currentDir: string) {
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(currentDir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      const fullPath = path.join(currentDir, entry.name);
      if (entry.isDirectory()) {
        walk(fullPath);
      } else if (extensions.some((ext) => entry.name.endsWith(ext))) {
        results.push(fullPath);
      }
    }
  }

  walk(dir);
  return results;
}

// ─── Recipe extraction ──────────────────────────────────────────────────────────

interface ParsedRecipe {
  outputItem: string;
  outputCount: number;
  station: string | null;
  inputs: Array<{ item: string; count: number }>;
  groups: string[];
  duration: number | null;
}

function extractRecipes(fuPath: string): ParsedRecipe[] {
  console.log("  Scanning for .recipe files...");
  const recipeFiles = walkDir(fuPath, [".recipe"]);
  console.log(`  Found ${recipeFiles.length} recipe files.`);

  const recipes: ParsedRecipe[] = [];

  for (const file of recipeFiles) {
    const data = readJsonFile(file) as {
      input?: Array<{ item: string; count: number }>;
      output?: { item: string; count: number };
      groups?: string[];
      duration?: number;
    } | null;

    if (!data || !data.output || !data.input) continue;
    if (!data.output.item) continue;

    recipes.push({
      outputItem: data.output.item,
      outputCount: data.output.count ?? 1,
      station: data.groups?.[0] ?? null,
      inputs: data.input.map((i) => ({ item: i.item, count: i.count ?? 1 })),
      groups: data.groups ?? [],
      duration: data.duration ?? null,
    });
  }

  return recipes;
}

// ─── Centrifuge recipe extraction ───────────────────────────────────────────────

// Format: { itemMapFarm: { "inputItem": { "outputItem": ["rarity", count], ... } }, ... }
// Rarity tiers: "common", "uncommon", "rare", "rarest"

interface ParsedCentrifugeRecipe {
  inputItem: string;
  method: string;       // e.g. "centrifuge", "sifter", "rockCrusher"
  outputs: Array<{ item: string; count: number; rarity: string }>;
}

const CENTRIFUGE_GROUP_NAMES: Record<string, string> = {
  itemMapFarm: "centrifuge (farm)",
  itemMapBees: "centrifuge (bees)",
  itemMapLiquids: "centrifuge (liquids)",
  itemMapPowder: "sifter (powder)",
  itemMapRocks: "rock crusher",
  itemMapIsotopes: "centrifuge (isotopes)",
};

function extractCentrifugeRecipes(fuPath: string): ParsedCentrifugeRecipe[] {
  const configPath = path.join(fuPath, "objects", "generic", "centrifuge_recipes.config");

  if (!fs.existsSync(configPath)) {
    console.log("  centrifuge_recipes.config not found, skipping.");
    return [];
  }

  console.log("  Parsing centrifuge_recipes.config...");
  const data = readJsonFile(configPath) as Record<string, Record<string, Record<string, [string, number]>>> | null;
  if (!data) {
    console.log("  Failed to parse centrifuge_recipes.config.");
    return [];
  }

  const recipes: ParsedCentrifugeRecipe[] = [];

  for (const [groupKey, inputMap] of Object.entries(data)) {
    if (!groupKey.startsWith("itemMap")) continue;
    const method = CENTRIFUGE_GROUP_NAMES[groupKey] ?? groupKey;

    for (const [inputItem, outputMap] of Object.entries(inputMap)) {
      if (typeof outputMap !== "object" || outputMap === null) continue;

      const outputs: Array<{ item: string; count: number; rarity: string }> = [];
      for (const [outputItem, rarityAndCount] of Object.entries(outputMap)) {
        if (!Array.isArray(rarityAndCount) || rarityAndCount.length < 2) continue;
        outputs.push({
          item: outputItem,
          rarity: String(rarityAndCount[0]),
          count: Number(rarityAndCount[1]),
        });
      }

      if (outputs.length > 0) {
        recipes.push({ inputItem, method, outputs });
      }
    }
  }

  return recipes;
}

// ─── Extraction lab recipe extraction ───────────────────────────────────────────

// Format: array of { inputs: { "item": count }, outputs: { "item": [tier1, tier2, tier3] }, timeScale?: [...], reversible?: bool }

interface ParsedExtractionRecipe {
  inputItem: string;
  inputCount: number;
  method: string;
  outputs: Array<{ item: string; count: number; tier: string }>;
}

const EXTRACTION_CONFIGS: Array<{ file: string; method: string }> = [
  { file: "objects/generic/extractionlab_recipes.config",         method: "extraction lab" },
  { file: "objects/generic/extractionlabmadness_recipes.config",  method: "psionic amplifier" },
  { file: "objects/generic/xenostation_recipes.config",           method: "xeno research lab" },
  { file: "objects/power/fu_liquidmixer/fu_liquidmixer_recipes.config", method: "liquid mixer" },
  { file: "objects/generic/honeyjarrer_recipes.config",           method: "honey extractor" },
];

function extractExtractionRecipes(fuPath: string): ParsedExtractionRecipe[] {
  const allRecipes: ParsedExtractionRecipe[] = [];

  for (const { file, method } of EXTRACTION_CONFIGS) {
    const configPath = path.join(fuPath, file);
    if (!fs.existsSync(configPath)) {
      console.log(`  ${path.basename(file)} not found, skipping.`);
      continue;
    }

    console.log(`  Parsing ${path.basename(file)}...`);
    const raw = readJsonFile(configPath);
    if (!raw) {
      console.log(`  Failed to parse ${path.basename(file)}.`);
      continue;
    }

    // The file can be either an array of recipes or an object with a recipe array
    const recipes = Array.isArray(raw) ? raw : (raw as Record<string, unknown>).recipes;
    if (!Array.isArray(recipes)) {
      // Try treating the whole object as containing recipe entries
      console.log(`  Unexpected format in ${path.basename(file)}, skipping.`);
      continue;
    }

    for (const recipe of recipes) {
      if (!recipe.inputs || !recipe.outputs) continue;

      const inputs = recipe.inputs as Record<string, number>;
      const outputs = recipe.outputs as Record<string, number[]>;

      for (const [inputItem, inputCount] of Object.entries(inputs)) {
        const parsedOutputs: Array<{ item: string; count: number; tier: string }> = [];

        for (const [outputItem, tiers] of Object.entries(outputs)) {
          if (Array.isArray(tiers) && tiers.length >= 3) {
            // Three tiers: [basic, improved, advanced] extraction lab levels
            parsedOutputs.push({ item: outputItem, count: tiers[0], tier: "basic" });
            parsedOutputs.push({ item: outputItem, count: tiers[1], tier: "improved" });
            parsedOutputs.push({ item: outputItem, count: tiers[2], tier: "advanced" });
          } else if (Array.isArray(tiers) && tiers.length === 1) {
            parsedOutputs.push({ item: outputItem, count: tiers[0], tier: "all" });
          } else if (typeof tiers === "number") {
            parsedOutputs.push({ item: outputItem, count: tiers, tier: "all" });
          }
        }

        if (parsedOutputs.length > 0) {
          allRecipes.push({
            inputItem,
            inputCount: Number(inputCount),
            method,
            outputs: parsedOutputs,
          });
        }
      }
    }
  }

  return allRecipes;
}

// ─── Research tree extraction ───────────────────────────────────────────────────

interface ParsedResearchNode {
  tree: string;
  nodeId: string;
  name: string;
  description: string;
  cost: Array<{ item: string; count: number }>;
  prerequisites: string[];
  unlocks: string[];
}

function extractResearchTrees(fuPath: string): ParsedResearchNode[] {
  console.log("  Scanning for research tree configs...");

  // Research trees live in .config files that have a "researchTree" property
  const configFiles = walkDir(fuPath, [".config"]);
  const nodes: ParsedResearchNode[] = [];

  for (const file of configFiles) {
    const data = readJsonFile(file) as Record<string, unknown> | null;
    if (!data || !data.researchTree) continue;

    const researchTree = data.researchTree as Record<string, Record<string, unknown>>;
    const strings = (data.strings ?? {}) as {
      trees?: Record<string, string>;
      research?: Record<string, { name?: string; description?: string }>;
    };

    for (const [treeId, treeNodes] of Object.entries(researchTree)) {
      const treeName = strings?.trees?.[treeId] ?? treeId;

      for (const [nodeId, nodeData] of Object.entries(treeNodes as Record<string, Record<string, unknown>>)) {
        if (typeof nodeData !== "object" || nodeData === null) continue;

        const nodeStrings = strings?.research?.[nodeId] ?? {};
        const nodeName = (nodeStrings as Record<string, string>)?.name ?? nodeId;
        const description = (nodeStrings as Record<string, string>)?.description ?? "";

        // Parse price: [[itemCode, count], ...]
        const price = nodeData.price as Array<[string, number]> | undefined;
        const cost = (price ?? []).map(([item, count]) => ({ item, count }));

        // Parse children: [nodeId, ...]
        const children = (nodeData.children ?? []) as string[];

        // Parse unlocks: [itemCode, ...]
        const unlocks = (nodeData.unlocks ?? []) as string[];

        nodes.push({
          tree: treeName,
          nodeId: `${treeId}:${nodeId}`,
          name: nodeName,
          description,
          cost,
          prerequisites: [],  // filled in after all nodes parsed
          unlocks,
        });
      }
    }
  }

  // Build parent relationships from children
  const nodeMap = new Map(nodes.map((n) => [n.nodeId, n]));
  for (const node of nodes) {
    // Find nodes that list this node's ID in their children
    for (const other of nodes) {
      const otherData = nodeMap.get(other.nodeId);
      if (!otherData) continue;
      // We need to check the raw children data — let me use a different approach
    }
  }

  // Actually: children means "this node's children", so the parent of a child is this node
  // Re-read: iterate and set prerequisites
  const childToParent = new Map<string, string[]>();
  for (const configFile of configFiles) {
    const data = readJsonFile(configFile) as Record<string, unknown> | null;
    if (!data || !data.researchTree) continue;

    const researchTree = data.researchTree as Record<string, Record<string, Record<string, unknown>>>;
    for (const [treeId, treeNodes] of Object.entries(researchTree)) {
      for (const [nodeId, nodeData] of Object.entries(treeNodes)) {
        if (typeof nodeData !== "object" || nodeData === null) continue;
        const children = (nodeData.children ?? []) as string[];
        const fullNodeId = `${treeId}:${nodeId}`;

        for (const childId of children) {
          const fullChildId = `${treeId}:${childId}`;
          const existing = childToParent.get(fullChildId) ?? [];
          existing.push(fullNodeId);
          childToParent.set(fullChildId, existing);
        }
      }
    }
  }

  for (const node of nodes) {
    node.prerequisites = childToParent.get(node.nodeId) ?? [];
  }

  console.log(`  Found ${nodes.length} research nodes.`);
  return nodes;
}

// ─── Database insertion ─────────────────────────────────────────────────────────

function insertData(
  recipes: ParsedRecipe[],
  centrifugeRecipes: ParsedCentrifugeRecipe[],
  extractionRecipes: ParsedExtractionRecipe[],
  researchNodes: ParsedResearchNode[],
): void {
  const db = getDatabase();

  // Get or create FU source
  let sourceRow = db.prepare("SELECT id FROM sources WHERE name = ?").get("frackin-universe") as { id: number } | undefined;
  if (!sourceRow) {
    const result = db.prepare(
      "INSERT INTO sources (name, version, description, url) VALUES (?, ?, ?, ?)"
    ).run("frackin-universe", null, "Frackin Universe overhaul mod", "https://github.com/sayterdarkwynd/FrackinUniverse");
    sourceRow = { id: Number(result.lastInsertRowid) };
  }
  const sourceId = sourceRow.id;

  const insertRecipe = db.prepare(`
    INSERT INTO recipes (source_id, output_item, output_count, station, groups, inputs, duration)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `);

  const insertExtraction = db.prepare(`
    INSERT INTO fu_extraction (input_item, method, outputs, notes)
    VALUES (?, ?, ?, ?)
  `);

  const insertResearch = db.prepare(`
    INSERT OR REPLACE INTO fu_research (tree, node_id, name, description, cost, prerequisites, unlocks)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `);

  const insertSearch = db.prepare(`
    INSERT INTO search_index (entity_type, entity_id, name, content, source)
    VALUES (?, ?, ?, ?, ?)
  `);

  // Insert crafting recipes
  console.log(`  Inserting ${recipes.length} crafting recipes...`);
  const recipeTransaction = db.transaction(() => {
    for (const recipe of recipes) {
      const result = insertRecipe.run(
        sourceId,
        recipe.outputItem,
        recipe.outputCount,
        recipe.station,
        JSON.stringify(recipe.groups),
        JSON.stringify(recipe.inputs),
        recipe.duration,
      );

      insertSearch.run(
        "recipe",
        Number(result.lastInsertRowid),
        recipe.outputItem,
        `Crafts ${recipe.outputItem} x${recipe.outputCount} at ${recipe.station ?? "hand"}`,
        "frackin-universe",
      );
    }
  });
  recipeTransaction();

  // Insert centrifuge recipes into fu_extraction
  console.log(`  Inserting ${centrifugeRecipes.length} centrifuge recipes...`);
  const centrifugeTransaction = db.transaction(() => {
    for (const recipe of centrifugeRecipes) {
      const outputs = recipe.outputs.map((o) => ({
        item: o.item,
        count: o.count,
        chance: o.rarity === "common" ? 0.9 : o.rarity === "uncommon" ? 0.5 : o.rarity === "rare" ? 0.2 : 0.05,
        rarity: o.rarity,
      }));

      const result = insertExtraction.run(
        recipe.inputItem,
        recipe.method,
        JSON.stringify(outputs),
        null,
      );

      insertSearch.run(
        "fu_extraction",
        Number(result.lastInsertRowid),
        recipe.inputItem,
        `${recipe.method}: ${recipe.inputItem} → ${recipe.outputs.map((o) => o.item).join(", ")}`,
        "frackin-universe",
      );
    }
  });
  centrifugeTransaction();

  // Insert extraction lab recipes into fu_extraction
  console.log(`  Inserting ${extractionRecipes.length} extraction lab recipes...`);
  const extractionTransaction = db.transaction(() => {
    for (const recipe of extractionRecipes) {
      const outputs = recipe.outputs.map((o) => ({
        item: o.item,
        count: o.count,
        chance: 1.0,
        tier: o.tier,
      }));

      const result = insertExtraction.run(
        recipe.inputItem,
        recipe.method,
        JSON.stringify(outputs),
        `Input count: ${recipe.inputCount}`,
      );

      insertSearch.run(
        "fu_extraction",
        Number(result.lastInsertRowid),
        recipe.inputItem,
        `${recipe.method}: ${recipe.inputItem} → ${recipe.outputs.map((o) => o.item).join(", ")}`,
        "frackin-universe",
      );
    }
  });
  extractionTransaction();

  // Insert research nodes
  console.log(`  Inserting ${researchNodes.length} research nodes...`);
  const researchTransaction = db.transaction(() => {
    for (const node of researchNodes) {
      const result = insertResearch.run(
        node.tree,
        node.nodeId,
        node.name,
        node.description,
        JSON.stringify(node.cost),
        JSON.stringify(node.prerequisites),
        JSON.stringify(node.unlocks),
      );

      insertSearch.run(
        "fu_research",
        Number(result.lastInsertRowid),
        node.name,
        `Research: ${node.name} in ${node.tree}. ${node.description}`,
        "frackin-universe",
      );
    }
  });
  researchTransaction();
}

// ─── Main ───────────────────────────────────────────────────────────────────────

function main() {
  const args = process.argv.slice(2);
  const fuPathIdx = args.indexOf("--fu-path");

  if (fuPathIdx === -1 || !args[fuPathIdx + 1]) {
    console.error("Usage: npm run extract:fu -- --fu-path <path>");
    console.error("  <path> should point to the FrackinUniverse mod directory or source checkout");
    console.error("");
    console.error("  You can clone FU from: git clone https://github.com/sayterdarkwynd/FrackinUniverse.git");
    process.exit(1);
  }

  const fuPath = args[fuPathIdx + 1];
  if (!fs.existsSync(fuPath)) {
    console.error(`Path does not exist: ${fuPath}`);
    process.exit(1);
  }

  console.log(`Extracting FU data from: ${fuPath}`);
  console.log("");

  // 1. Crafting recipes
  console.log("═══ Crafting Recipes ═══");
  const recipes = extractRecipes(fuPath);
  console.log(`  Total: ${recipes.length} recipes`);
  console.log("");

  // 2. Centrifuge recipes
  console.log("═══ Centrifuge/Sifter Recipes ═══");
  const centrifugeRecipes = extractCentrifugeRecipes(fuPath);
  console.log(`  Total: ${centrifugeRecipes.length} centrifuge recipes`);
  console.log("");

  // 3. Extraction lab recipes
  console.log("═══ Extraction Lab Recipes ═══");
  const extractionRecipes = extractExtractionRecipes(fuPath);
  console.log(`  Total: ${extractionRecipes.length} extraction recipes`);
  console.log("");

  // 4. Research trees
  console.log("═══ Research Trees ═══");
  const researchNodes = extractResearchTrees(fuPath);
  console.log("");

  // Check for --dry-run
  if (args.includes("--dry-run")) {
    console.log("Dry run — not inserting into database.");
    console.log("");
    console.log(`Summary:`);
    console.log(`  Crafting recipes:    ${recipes.length}`);
    console.log(`  Centrifuge recipes:  ${centrifugeRecipes.length}`);
    console.log(`  Extraction recipes:  ${extractionRecipes.length}`);
    console.log(`  Research nodes:      ${researchNodes.length}`);

    // Show some samples
    if (recipes.length > 0) {
      console.log("\nSample recipes:");
      for (const r of recipes.slice(0, 5)) {
        console.log(`  ${r.outputItem} x${r.outputCount} ← ${r.inputs.map((i) => `${i.item} x${i.count}`).join(" + ")} [${r.groups.join(", ")}]`);
      }
    }
    if (centrifugeRecipes.length > 0) {
      console.log("\nSample centrifuge:");
      for (const r of centrifugeRecipes.slice(0, 3)) {
        console.log(`  ${r.inputItem} (${r.method}) → ${r.outputs.map((o) => `${o.item} x${o.count} [${o.rarity}]`).join(", ")}`);
      }
    }
    if (extractionRecipes.length > 0) {
      console.log("\nSample extraction:");
      for (const r of extractionRecipes.slice(0, 3)) {
        console.log(`  ${r.inputItem} x${r.inputCount} (${r.method}) → ${r.outputs.slice(0, 3).map((o) => `${o.item} x${o.count} [${o.tier}]`).join(", ")}`);
      }
    }
    return;
  }

  // Insert into database
  console.log("Inserting into database...");
  insertData(recipes, centrifugeRecipes, extractionRecipes, researchNodes);
  console.log("Done!");
}

main();
