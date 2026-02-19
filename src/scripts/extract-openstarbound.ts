/**
 * Extract asset schemas from OpenStarbound C++ source code.
 *
 * Parses Star*Database.cpp files to find all JSON field reads with their types and defaults.
 * This is the authoritative source — these are the actual game parsers.
 *
 * Usage: npm run extract:openstarbound -- --source-path "F:/repositories/cheeks/OpenStarbound"
 */

import fs from "fs";
import path from "path";
import { getDatabase } from "../db/index.js";

// ─── Types ──────────────────────────────────────────────────────────────────────

interface ExtractedField {
  fieldName: string;
  type: string;
  defaultValue: string | null;
  optional: boolean;
  sourceFile: string;
  lineNumber: number;
  context: string; // surrounding code for human review
}

interface DatabaseFileInfo {
  fileName: string;
  assetType: string;        // e.g. "object", "item", "projectile"
  fileExtension: string;    // e.g. ".object", ".item", ".projectile"
  fields: ExtractedField[];
}

// ─── Mapping from Database.cpp filenames to asset types ─────────────────────────

const DATABASE_TO_ASSET: Record<string, { assetType: string; extension: string; description: string }> = {
  "StarObjectDatabase.cpp":       { assetType: "object",       extension: ".object",       description: "Placeable objects — furniture, crafting stations, wired objects, containers, etc." },
  "StarItemDatabase.cpp":         { assetType: "item",         extension: ".item",         description: "Generic items — crafting materials, consumables, quest items. Also handles recipe files." },
  "StarProjectileDatabase.cpp":   { assetType: "projectile",   extension: ".projectile",   description: "Projectile definitions — bullets, rockets, energy bolts, thrown items, etc." },
  "StarMonsterDatabase.cpp":      { assetType: "monster",      extension: ".monstertype",  description: "Monster type definitions — behavior, stats, drops, animations, etc." },
  "StarNpcDatabase.cpp":          { assetType: "npc",          extension: ".npctype",      description: "NPC type definitions — scripts, items, behavior, spawning, etc." },
  "StarBiomeDatabase.cpp":        { assetType: "biome",        extension: ".biome",        description: "Biome definitions — terrain generation, flora, fauna, weather, music, etc." },
  "StarMaterialDatabase.cpp":     { assetType: "material",     extension: ".material",     description: "Material/block definitions — collision, health, rendering, interactions, etc." },
  "StarLiquidsDatabase.cpp":      { assetType: "liquid",       extension: ".liquid",       description: "Liquid definitions — color, physics, status effects, interactions, etc." },
  "StarStatusEffectDatabase.cpp": { assetType: "statuseffect", extension: ".statuseffect", description: "Status effect definitions — buffs, debuffs, environmental effects, etc." },
  "StarTechDatabase.cpp":         { assetType: "tech",         extension: ".tech",         description: "Tech definitions — player abilities like double jump, dash, sphere, etc." },
  "StarCodexDatabase.cpp":        { assetType: "codex",        extension: ".codex",        description: "Codex entries — lore books, data logs, blueprints, etc." },
  "StarVehicleDatabase.cpp":      { assetType: "vehicle",      extension: ".vehicle",      description: "Vehicle definitions — hoverbikes, boats, mechs, etc." },
  "StarStagehandDatabase.cpp":    { assetType: "stagehand",    extension: ".stagehand",    description: "Stagehand definitions — invisible world entities that run scripts (triggers, spawners, etc.)" },
  "StarTenantDatabase.cpp":       { assetType: "tenant",       extension: ".tenant",       description: "Tenant/colony deed definitions — what NPCs can move in based on furniture tags." },
  "StarQuestTemplateDatabase.cpp":{ assetType: "quest",        extension: ".questtemplate",description: "Quest template definitions — objectives, rewards, dialog, etc." },
  "StarDamageDatabase.cpp":       { assetType: "damagetype",   extension: ".damage",       description: "Damage type definitions — damage kinds, resistances, knockback, etc." },
  "StarParticleDatabase.cpp":     { assetType: "particle",     extension: ".particle",     description: "Particle effect definitions — visual effects, trails, explosions, etc." },
  "StarPlantDatabase.cpp":        { assetType: "plant",        extension: ".modularstem",  description: "Plant definitions — trees, saplings, growth stages, etc." },
  "StarSpeciesDatabase.cpp":      { assetType: "species",      extension: ".species",      description: "Species definitions — humanoid config, overrides, etc." },
  "StarDanceDatabase.cpp":        { assetType: "dance",        extension: ".dance",        description: "Dance emote definitions." },
  "StarEffectSourceDatabase.cpp": { assetType: "effectsource", extension: ".effectsource", description: "Effect source definitions — named effect emitters." },
  "StarSpawnTypeDatabase.cpp":    { assetType: "spawntype",    extension: ".spawntypes",   description: "Spawn type definitions — monster/NPC spawn profiles for biomes." },
  "StarRadioMessageDatabase.cpp": { assetType: "radiomessage", extension: ".radiomessages",description: "Radio message definitions — SAIL communications, popup messages." },
  "StarCollectionDatabase.cpp":   { assetType: "collection",   extension: ".collection",   description: "Collection definitions — in-game collectible tracking." },
  "StarTerrainDatabase.cpp":      { assetType: "terrain",      extension: ".terrain",      description: "Terrain generation selector definitions." },
  "StarAiDatabase.cpp":           { assetType: "ai",           extension: ".aimission",    description: "AI mission definitions — SAIL AI interface missions." },
  "StarBehaviorDatabase.cpp":     { assetType: "behavior",     extension: ".behavior",     description: "Behavior tree definitions — NPC/monster AI behavior trees." },
  "StarStatisticsDatabase.cpp":   { assetType: "statistics",   extension: ".event",        description: "Statistics/achievement event definitions." },
  "StarTilesetDatabase.cpp":      { assetType: "tileset",      extension: ".tileset",      description: "Tileset definitions for dungeon/structure generation." },
};

// ─── Type mapping from C++ getter methods to human-readable types ───────────────

const GETTER_TYPE_MAP: Record<string, string> = {
  "String":  "String",
  "Bool":    "Bool",
  "Float":   "Float",
  "Double":  "Float",
  "Int":     "Int",
  "UInt":    "UInt",
  "Array":   "Array",
  "Object":  "Object",
};

const CONVERTER_TYPE_MAP: Record<string, string> = {
  "jsonToVec2F":        "Vec2F",
  "jsonToVec2I":        "Vec2I",
  "jsonToVec2U":        "Vec2U",
  "jsonToVec3B":        "Vec3B",
  "jsonToVec4B":        "Vec4B",
  "jsonToColor":        "Color",
  "jsonToRectF":        "RectF",
  "jsonToPolyF":        "PolyF",
  "jsonToStringList":   "String[]",
  "jsonToStringSet":    "StringSet",
  "jsonToWeightedPool": "WeightedPool",
};

// ─── Regex patterns ─────────────────────────────────────────────────────────────

const PATTERNS = {
  // .getString("field", default), .getBool("field", false), etc.
  typedGetter: /\.get(String|Bool|Float|Double|Int|UInt|Array|Object)\s*\(\s*"([^"]+)"(?:\s*,\s*([^)]*))?\)/g,

  // .optString("field"), .optFloat("field"), etc.
  optGetter: /\.opt(String|Float|Int|UInt|Bool|Array|Object)\s*\(\s*"([^"]+)"\s*\)/g,

  // .opt("field") — generic optional
  genericOpt: /\.opt\s*\(\s*"([^"]+)"\s*\)/g,

  // .get("field") or .get("field", default) — generic get
  genericGet: /\.get\s*\(\s*"([^"]+)"(?:\s*,\s*([^)]*))?\)/g,

  // .contains("field") — conditional field check
  contains: /\.contains\s*\(\s*"([^"]+)"\s*\)/g,

  // jsonToX converter wrapping a field access
  converter: /(jsonTo(?:Vec2F|Vec2I|Vec2U|Vec3B|Vec4B|Color|RectF|PolyF|StringList|StringSet|WeightedPool))\s*\([^)]*\.get\w*\s*\(\s*"([^"]+)"/g,
};

// ─── Extraction logic ───────────────────────────────────────────────────────────

function extractFieldsFromFile(filePath: string): ExtractedField[] {
  const content = fs.readFileSync(filePath, "utf-8");
  const lines = content.split("\n");
  const fileName = path.basename(filePath);
  const fields: ExtractedField[] = [];
  const seen = new Set<string>();

  function addField(field: ExtractedField) {
    const key = `${field.fieldName}:${field.type}`;
    if (!seen.has(key)) {
      seen.add(key);
      fields.push(field);
    }
  }

  function getLineNumber(index: number): number {
    return content.substring(0, index).split("\n").length;
  }

  function getContext(index: number): string {
    const lineNum = getLineNumber(index);
    const start = Math.max(0, lineNum - 2);
    const end = Math.min(lines.length, lineNum + 1);
    return lines.slice(start, end).map((l) => l.trim()).join(" | ");
  }

  // Pattern 1: Typed getters
  let match: RegExpExecArray | null;
  const typedGetterRegex = new RegExp(PATTERNS.typedGetter.source, "g");
  while ((match = typedGetterRegex.exec(content)) !== null) {
    const [, cppType, fieldName, defaultValue] = match;
    addField({
      fieldName,
      type: GETTER_TYPE_MAP[cppType] ?? cppType,
      defaultValue: defaultValue?.trim() ?? null,
      optional: !!defaultValue,
      sourceFile: fileName,
      lineNumber: getLineNumber(match.index),
      context: getContext(match.index),
    });
  }

  // Pattern 2: Optional getters
  const optGetterRegex = new RegExp(PATTERNS.optGetter.source, "g");
  while ((match = optGetterRegex.exec(content)) !== null) {
    const [, cppType, fieldName] = match;
    addField({
      fieldName,
      type: GETTER_TYPE_MAP[cppType] ?? cppType,
      defaultValue: null,
      optional: true,
      sourceFile: fileName,
      lineNumber: getLineNumber(match.index),
      context: getContext(match.index),
    });
  }

  // Pattern 3: Generic opt
  const genericOptRegex = new RegExp(PATTERNS.genericOpt.source, "g");
  while ((match = genericOptRegex.exec(content)) !== null) {
    const [, fieldName] = match;
    // Try to determine type from surrounding converter
    const surroundingCode = content.substring(Math.max(0, match.index - 100), match.index + match[0].length + 100);
    let type = "Json";
    for (const [converterName, convertedType] of Object.entries(CONVERTER_TYPE_MAP)) {
      if (surroundingCode.includes(converterName)) {
        type = convertedType;
        break;
      }
    }
    addField({
      fieldName,
      type,
      defaultValue: null,
      optional: true,
      sourceFile: fileName,
      lineNumber: getLineNumber(match.index),
      context: getContext(match.index),
    });
  }

  // Pattern 4: Converter-wrapped fields (for type inference on .get calls)
  const converterRegex = new RegExp(PATTERNS.converter.source, "g");
  while ((match = converterRegex.exec(content)) !== null) {
    const [, converterFunc, fieldName] = match;
    const type = CONVERTER_TYPE_MAP[converterFunc] ?? "Json";
    addField({
      fieldName,
      type,
      defaultValue: null,
      optional: false,
      sourceFile: fileName,
      lineNumber: getLineNumber(match.index),
      context: getContext(match.index),
    });
  }

  // Pattern 5: Generic get (only for fields not already captured)
  const genericGetRegex = new RegExp(PATTERNS.genericGet.source, "g");
  while ((match = genericGetRegex.exec(content)) !== null) {
    const [fullMatch, fieldName, defaultValue] = match;
    // Skip if it's actually a typed getter (already caught above)
    if (/\.get(String|Bool|Float|Double|Int|UInt|Array|Object)\s*\(/.test(
      content.substring(match.index - 10, match.index + fullMatch.length)
    )) continue;

    // Try to infer type from surrounding context
    const surroundingCode = content.substring(Math.max(0, match.index - 150), match.index + fullMatch.length + 50);
    let type = "Json";

    // Check for converter wrappers
    for (const [converterName, convertedType] of Object.entries(CONVERTER_TYPE_MAP)) {
      if (surroundingCode.includes(converterName)) {
        type = convertedType;
        break;
      }
    }

    // Check for .toFloat(), .toInt(), .toBool(), .toString(), .toArray(), .toObject()
    const afterMatch = content.substring(match.index + fullMatch.length, match.index + fullMatch.length + 30);
    const toTypeMatch = afterMatch.match(/^\s*\)\s*\.\s*to(Float|Int|Bool|String|UInt|Array|Object)\s*\(/);
    if (toTypeMatch) {
      type = GETTER_TYPE_MAP[toTypeMatch[1]] ?? toTypeMatch[1];
    }

    // Check default value for type inference
    if (type === "Json" && defaultValue) {
      const dv = defaultValue.trim();
      if (dv === "true" || dv === "false") type = "Bool";
      else if (dv === "JsonArray()" || dv === "{}") type = "Array";
      else if (dv === "JsonObject()" || dv === "JsonObject{}") type = "Object";
      else if (/^\d+\.\d+f?$/.test(dv)) type = "Float";
      else if (/^\d+$/.test(dv)) type = "Int";
      else if (dv.startsWith('"')) type = "String";
    }

    const key = `${fieldName}:${type}`;
    if (!seen.has(key)) {
      seen.add(key);
      addField({
        fieldName,
        type,
        defaultValue: defaultValue?.trim() ?? null,
        optional: !!defaultValue,
        sourceFile: fileName,
        lineNumber: getLineNumber(match.index),
        context: getContext(match.index),
      });
    }
  }

  // Pattern 6: Contains checks (marks fields as conditionally present)
  const containsRegex = new RegExp(PATTERNS.contains.source, "g");
  while ((match = containsRegex.exec(content)) !== null) {
    const [, fieldName] = match;
    if (!seen.has(fieldName)) {
      addField({
        fieldName,
        type: "Json",
        defaultValue: null,
        optional: true,
        sourceFile: fileName,
        lineNumber: getLineNumber(match.index),
        context: getContext(match.index),
      });
    }
  }

  return fields;
}

// ─── Database insertion ─────────────────────────────────────────────────────────

function insertExtractedData(dbFiles: DatabaseFileInfo[]): void {
  const db = getDatabase();

  // Ensure the openstarbound source exists
  const existingSource = db.prepare("SELECT id FROM sources WHERE name = ?").get("openstarbound") as { id: number } | undefined;
  let sourceId: number;
  if (existingSource) {
    sourceId = existingSource.id;
  } else {
    const result = db.prepare(
      "INSERT INTO sources (name, version, description, url) VALUES (?, ?, ?, ?)"
    ).run("openstarbound", null, "OpenStarbound C++ source — authoritative asset schema definitions", "https://github.com/OpenStarbound/OpenStarbound");
    sourceId = Number(result.lastInsertRowid);
  }

  const insertAssetType = db.prepare(`
    INSERT OR IGNORE INTO asset_types (source_id, name, file_extension, description, base_path)
    VALUES (?, ?, ?, ?, ?)
  `);

  const getAssetType = db.prepare("SELECT id FROM asset_types WHERE source_id = ? AND name = ?");

  const insertField = db.prepare(`
    INSERT OR IGNORE INTO asset_fields (asset_type_id, field_path, type, description, required, default_value)
    VALUES (?, ?, ?, ?, ?, ?)
  `);

  const insertSearch = db.prepare(`
    INSERT INTO search_index (entity_type, entity_id, name, content, source)
    VALUES (?, ?, ?, ?, ?)
  `);

  let totalFields = 0;
  let totalAssetTypes = 0;

  const transaction = db.transaction(() => {
    for (const dbFile of dbFiles) {
      const mapping = DATABASE_TO_ASSET[dbFile.fileName];
      if (!mapping) continue;

      insertAssetType.run(sourceId, mapping.assetType, mapping.extension, mapping.description, "");

      const assetTypeRow = getAssetType.get(sourceId, mapping.assetType) as { id: number } | undefined;
      if (!assetTypeRow) continue;

      totalAssetTypes++;

      for (const field of dbFile.fields) {
        // Build a description from the context
        const description = `Extracted from ${field.sourceFile}:${field.lineNumber}. ${field.optional ? "Optional." : "Required."} ${field.defaultValue ? `Default: ${field.defaultValue}` : ""}`.trim();

        insertField.run(
          assetTypeRow.id,
          field.fieldName,
          field.type,
          description,
          field.optional ? 0 : 1,
          field.defaultValue,
        );

        totalFields++;
      }

      // Index this asset type in search
      insertSearch.run("asset_type", assetTypeRow.id, mapping.assetType, mapping.description, "openstarbound");
    }
  });

  transaction();

  // Now index all the fields
  const allFields = db.prepare(`
    SELECT af.id, af.field_path, af.description, at.name as asset_name
    FROM asset_fields af
    JOIN asset_types at ON af.asset_type_id = at.id
    JOIN sources s ON at.source_id = s.id
    WHERE s.name = 'openstarbound'
  `).all() as Array<{ id: number; field_path: string; description: string; asset_name: string }>;

  const searchTransaction = db.transaction(() => {
    for (const field of allFields) {
      insertSearch.run("asset_field", field.id, `${field.asset_name}.${field.field_path}`, field.description ?? "", "openstarbound");
    }
  });

  searchTransaction();

  console.log(`Inserted ${totalAssetTypes} asset types with ${totalFields} fields from OpenStarbound source.`);
  console.log(`Indexed ${allFields.length} fields in full-text search.`);
}

// ─── Main ───────────────────────────────────────────────────────────────────────

function main() {
  const args = process.argv.slice(2);
  const sourcePathIdx = args.indexOf("--source-path");

  if (sourcePathIdx === -1 || !args[sourcePathIdx + 1]) {
    console.error("Usage: npm run extract:openstarbound -- --source-path <path>");
    console.error("  <path> should point to the OpenStarbound repository root");
    process.exit(1);
  }

  const sourcePath = args[sourcePathIdx + 1];
  const gameSourceDir = path.join(sourcePath, "source", "game");

  if (!fs.existsSync(gameSourceDir)) {
    console.error(`Could not find source/game/ directory at: ${gameSourceDir}`);
    process.exit(1);
  }

  console.log(`Extracting schemas from: ${gameSourceDir}`);
  console.log("");

  // Find all Star*Database.cpp files
  const files = fs.readdirSync(gameSourceDir)
    .filter((f) => f.startsWith("Star") && f.endsWith("Database.cpp"));

  console.log(`Found ${files.length} database files to process.`);
  console.log("");

  const results: DatabaseFileInfo[] = [];

  for (const file of files) {
    const filePath = path.join(gameSourceDir, file);
    const fields = extractFieldsFromFile(filePath);
    const mapping = DATABASE_TO_ASSET[file];

    results.push({
      fileName: file,
      assetType: mapping?.assetType ?? file.replace("Star", "").replace("Database.cpp", "").toLowerCase(),
      fileExtension: mapping?.extension ?? "unknown",
      fields,
    });

    console.log(`  ${file}: ${fields.length} fields extracted`);

    // Show a sample of what was found
    if (fields.length > 0) {
      const sample = fields.slice(0, 3);
      for (const f of sample) {
        console.log(`    - ${f.fieldName} (${f.type})${f.defaultValue ? ` = ${f.defaultValue}` : ""}${f.optional ? " [optional]" : ""}`);
      }
      if (fields.length > 3) {
        console.log(`    ... and ${fields.length - 3} more`);
      }
    }
  }

  console.log("");
  const totalFields = results.reduce((sum, r) => sum + r.fields.length, 0);
  console.log(`Total: ${totalFields} fields from ${results.length} files.`);
  console.log("");

  // Check for --dry-run flag
  if (args.includes("--dry-run")) {
    console.log("Dry run — not inserting into database.");
    console.log("");

    // Print full report
    for (const result of results) {
      if (result.fields.length === 0) continue;
      console.log(`\n═══ ${result.fileName} → ${result.assetType} (${result.fileExtension}) ═══`);
      for (const field of result.fields) {
        const opt = field.optional ? "?" : "!";
        const def = field.defaultValue ? ` = ${field.defaultValue}` : "";
        console.log(`  ${opt} ${field.fieldName}: ${field.type}${def}`);
      }
    }
    return;
  }

  // Insert into database
  console.log("Inserting into database...");
  insertExtractedData(results);
  console.log("Done!");
}

main();
