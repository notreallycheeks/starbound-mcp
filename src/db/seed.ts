/**
 * Seed script — populates the database with known Starbound and Frackin Universe data.
 *
 * Run with: npm run seed
 *
 * This is the starting point. Data here is curated from:
 * - starbound-unofficial.readthedocs.io
 * - xStarbound Lua API docs
 * - Starbounder wiki
 * - FrackinUniverse GitHub source
 * - Community knowledge
 *
 * Contributions welcome! Add new entries and submit a PR.
 */

import { getDatabase } from "./index.js";

const db = getDatabase();

// ─── Sources ───────────────────────────────────────────────────────────────────

function insertSource(name: string, version: string | null, description: string, url: string): number {
  const existing = db.prepare("SELECT id FROM sources WHERE name = ?").get(name) as { id: number } | undefined;
  if (existing) return existing.id;
  const result = db.prepare("INSERT INTO sources (name, version, description, url) VALUES (?, ?, ?, ?)").run(name, version, description, url);
  return Number(result.lastInsertRowid);
}

const vanillaId = insertSource("vanilla", "1.4.4", "Base Starbound game", "https://starbounder.org/Modding:Portal");
const fuId = insertSource("frackin-universe", "6.4.x", "Frackin Universe overhaul mod", "https://github.com/sayterdarkwynd/FrackinUniverse");

// ─── Lua Tables (Vanilla) ─────────────────────────────────────────────────────

function insertLuaTable(sourceId: number, name: string, description: string, context: string): number {
  const existing = db.prepare("SELECT id FROM lua_tables WHERE source_id = ? AND name = ?").get(sourceId, name) as { id: number } | undefined;
  if (existing) return existing.id;
  const result = db.prepare("INSERT INTO lua_tables (source_id, name, description, context) VALUES (?, ?, ?, ?)").run(sourceId, name, description, context);
  return Number(result.lastInsertRowid);
}

function insertLuaFunction(tableId: number, name: string, signature: string, description: string, returnType: string, parameters: object[], examples: string[] = [], notes: string = ""): void {
  db.prepare(`
    INSERT OR IGNORE INTO lua_functions (table_id, name, signature, description, return_type, parameters, examples, notes)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(tableId, name, signature, description, returnType, JSON.stringify(parameters), JSON.stringify(examples), notes);
}

// -- world table --
const worldTable = insertLuaTable(vanillaId, "world", "Functions for interacting with the game world — querying entities, tiles, spawning objects, raycasting, etc.", "universal");

insertLuaFunction(worldTable, "entityQuery", "world.entityQuery(Vec2F position, Float range, [EntityFilter options])", "Returns a list of entity IDs within range of a position, optionally filtered.", "EntityId[]", [
  { name: "position", type: "Vec2F", description: "Center position to search from", optional: false },
  { name: "range", type: "Float", description: "Search radius in tiles", optional: false },
  { name: "options", type: "EntityFilter", description: "Filter options: {includedTypes, excludedTypes, withoutEntityId, lineCollision, order}", optional: true },
], ["local nearby = world.entityQuery(entity.position(), 20, {includedTypes = {\"player\", \"npc\"}})"]);

insertLuaFunction(worldTable, "spawnItem", "world.spawnItem(String itemName, Vec2F position, [Int count], [Json parameters])", "Spawns an item drop in the world.", "EntityId", [
  { name: "itemName", type: "String", description: "Item identifier", optional: false },
  { name: "position", type: "Vec2F", description: "Where to spawn the item", optional: false },
  { name: "count", type: "Int", description: "Number of items in the stack", optional: true },
  { name: "parameters", type: "Json", description: "Additional item parameters", optional: true },
], ["world.spawnItem(\"diamond\", entity.position(), 5)"]);

insertLuaFunction(worldTable, "spawnMonster", "world.spawnMonster(String monsterType, Vec2F position, [Json parameters])", "Spawns a monster in the world.", "EntityId", [
  { name: "monsterType", type: "String", description: "Monster type identifier", optional: false },
  { name: "position", type: "Vec2F", description: "Where to spawn", optional: false },
  { name: "parameters", type: "Json", description: "Monster overrides (level, aggressive, etc.)", optional: true },
], ["world.spawnMonster(\"smallbiped\", {100, 200}, {level = 5, aggressive = true})"]);

insertLuaFunction(worldTable, "spawnNpc", "world.spawnNpc(Vec2F position, String species, String npcType, Float level, [Int seed], [Json parameters])", "Spawns an NPC in the world.", "EntityId", [
  { name: "position", type: "Vec2F", description: "Where to spawn", optional: false },
  { name: "species", type: "String", description: "NPC species (human, avian, floran, etc.)", optional: false },
  { name: "npcType", type: "String", description: "NPC type (guard, merchant, villager, etc.)", optional: false },
  { name: "level", type: "Float", description: "NPC level", optional: false },
  { name: "seed", type: "Int", description: "Random seed for NPC generation", optional: true },
  { name: "parameters", type: "Json", description: "Additional NPC parameters", optional: true },
]);

insertLuaFunction(worldTable, "spawnProjectile", "world.spawnProjectile(String projectileName, Vec2F position, [EntityId source], [Vec2F direction], [Bool trackSource], [Json parameters])", "Spawns a projectile.", "EntityId", [
  { name: "projectileName", type: "String", description: "Projectile type identifier", optional: false },
  { name: "position", type: "Vec2F", description: "Starting position", optional: false },
  { name: "source", type: "EntityId", description: "Source entity (for damage attribution)", optional: true },
  { name: "direction", type: "Vec2F", description: "Direction vector", optional: true },
  { name: "trackSource", type: "Bool", description: "Whether the projectile tracks the source entity", optional: true },
  { name: "parameters", type: "Json", description: "Additional projectile parameters (power, speed, etc.)", optional: true },
]);

insertLuaFunction(worldTable, "placeMaterial", "world.placeMaterial(Vec2I position, String layer, String materialName, [Int hueShift], [Bool allowOverlap])", "Places a block/material at the given position.", "Bool", [
  { name: "position", type: "Vec2I", description: "Tile position", optional: false },
  { name: "layer", type: "String", description: "'foreground' or 'background'", optional: false },
  { name: "materialName", type: "String", description: "Material identifier", optional: false },
  { name: "hueShift", type: "Int", description: "Hue shift value (0-255)", optional: true },
  { name: "allowOverlap", type: "Bool", description: "Allow placing over existing material", optional: true },
]);

insertLuaFunction(worldTable, "damageTiles", "world.damageTiles(List<Vec2I> positions, String layer, Vec2F sourcePosition, String damageType, Float amount, [Int harvestLevel])", "Damages tiles at the specified positions.", "Bool", [
  { name: "positions", type: "List<Vec2I>", description: "List of tile positions to damage", optional: false },
  { name: "layer", type: "String", description: "'foreground' or 'background'", optional: false },
  { name: "sourcePosition", type: "Vec2F", description: "Position damage originates from", optional: false },
  { name: "damageType", type: "String", description: "'plantish', 'blockish', 'beamish', 'explosive', 'fire', 'tilling'", optional: false },
  { name: "amount", type: "Float", description: "Amount of damage to deal", optional: false },
  { name: "harvestLevel", type: "Int", description: "Harvest level (determines what can be broken)", optional: true },
]);

insertLuaFunction(worldTable, "material", "world.material(Vec2I position, String layer)", "Returns the material at a tile position.", "String|false", [
  { name: "position", type: "Vec2I", description: "Tile position to check", optional: false },
  { name: "layer", type: "String", description: "'foreground' or 'background'", optional: false },
]);

insertLuaFunction(worldTable, "lineCollision", "world.lineCollision(Vec2F startPosition, Vec2F endPosition, [CollisionSet collisionKinds])", "Casts a ray between two points and returns the collision point, or nil if no collision.", "Vec2F|nil", [
  { name: "startPosition", type: "Vec2F", description: "Ray start", optional: false },
  { name: "endPosition", type: "Vec2F", description: "Ray end", optional: false },
  { name: "collisionKinds", type: "CollisionSet", description: "Which collision types to check (default: {\"Block\", \"Dynamic\"})", optional: true },
], ["local hit = world.lineCollision(mcontroller.position(), {mcontroller.position()[1] + 10, mcontroller.position()[2]})"]);

insertLuaFunction(worldTable, "time", "world.time()", "Returns the current world time (time of day, 0.0 to 1.0).", "Float", []);
insertLuaFunction(worldTable, "day", "world.day()", "Returns the current day number.", "Int", []);
insertLuaFunction(worldTable, "timeOfDay", "world.timeOfDay()", "Returns the time of day as a value from 0.0 (midnight) to 1.0 (next midnight).", "Float", []);
insertLuaFunction(worldTable, "threatLevel", "world.threatLevel()", "Returns the threat level of the current world.", "Float", []);
insertLuaFunction(worldTable, "inSurfaceLayer", "world.inSurfaceLayer(Vec2F position)", "Returns whether the position is in the surface layer.", "Bool", [
  { name: "position", type: "Vec2F", description: "Position to check", optional: false },
]);
insertLuaFunction(worldTable, "terrestrial", "world.terrestrial()", "Returns whether the current world is a terrestrial (planet) world.", "Bool", []);
insertLuaFunction(worldTable, "gravity", "world.gravity(Vec2F position)", "Returns the gravity at a given position.", "Float", [
  { name: "position", type: "Vec2F", description: "Position to check gravity at", optional: false },
]);

// -- entity table --
const entityTable = insertLuaTable(vanillaId, "entity", "Functions available to all entities — position, ID, type, damage, etc.", "universal");

insertLuaFunction(entityTable, "id", "entity.id()", "Returns the entity's unique ID.", "EntityId", []);
insertLuaFunction(entityTable, "position", "entity.position()", "Returns the entity's current position.", "Vec2F", []);
insertLuaFunction(entityTable, "entityType", "entity.entityType()", "Returns the entity type string.", "String", [],
  [], "Returns one of: 'player', 'npc', 'monster', 'object', 'vehicle', 'itemDrop', 'projectile', 'stagehand', 'plant'");
insertLuaFunction(entityTable, "uniqueId", "entity.uniqueId()", "Returns the entity's unique string ID (if it has one), or nil.", "String|nil", []);
insertLuaFunction(entityTable, "persistent", "entity.persistent()", "Returns whether the entity is persistent (saved with the world).", "Bool", []);

// -- player table --
const playerTable = insertLuaTable(vanillaId, "player", "Functions available only in player context — inventory, quests, techs, warping, etc.", "player");

insertLuaFunction(playerTable, "id", "player.id()", "Returns the player's entity ID.", "EntityId", []);
insertLuaFunction(playerTable, "species", "player.species()", "Returns the player's species.", "String", []);
insertLuaFunction(playerTable, "gender", "player.gender()", "Returns the player's gender.", "String", []);
insertLuaFunction(playerTable, "isAdmin", "player.isAdmin()", "Returns whether the player is in admin mode.", "Bool", []);
insertLuaFunction(playerTable, "interact", "player.interact(String interactionType, Json config, [EntityId sourceEntity])", "Triggers a player interaction (open GUI, cinematic, etc.).", "nil", [
  { name: "interactionType", type: "String", description: "Type: 'OpenCraftingInterface', 'OpenMerchantInterface', 'OpenContainer', 'ScriptPane', etc.", optional: false },
  { name: "config", type: "Json", description: "Interaction-specific config", optional: false },
  { name: "sourceEntity", type: "EntityId", description: "Source entity for the interaction", optional: true },
]);
insertLuaFunction(playerTable, "giveItem", "player.giveItem(ItemDescriptor item)", "Gives an item to the player.", "nil", [
  { name: "item", type: "ItemDescriptor", description: "Item to give: {name, count, parameters}", optional: false },
]);
insertLuaFunction(playerTable, "consumeItem", "player.consumeItem(ItemDescriptor item, [Bool consumePartial])", "Consumes/removes an item from the player's inventory.", "ItemDescriptor", [
  { name: "item", type: "ItemDescriptor", description: "Item to consume: {name, count}", optional: false },
  { name: "consumePartial", type: "Bool", description: "If true, consume as many as possible even if full amount not available", optional: true },
]);
insertLuaFunction(playerTable, "hasItem", "player.hasItem(ItemDescriptor item, [Bool exactMatch])", "Checks if the player has the specified item.", "Bool", [
  { name: "item", type: "ItemDescriptor", description: "Item to check for: {name, count}", optional: false },
  { name: "exactMatch", type: "Bool", description: "If true, parameters must match exactly", optional: true },
]);

// -- status table --
const statusTable = insertLuaTable(vanillaId, "status", "Functions for entity status effects, health, energy, stats, and resistances.", "universal");

insertLuaFunction(statusTable, "stat", "status.stat(String statName)", "Returns the current value of a stat.", "Float", [
  { name: "statName", type: "String", description: "Stat name: 'maxHealth', 'maxEnergy', 'powerMultiplier', 'protection', etc.", optional: false },
]);
insertLuaFunction(statusTable, "setStatusProperty", "status.setStatusProperty(String name, Json value)", "Sets a persistent status property on the entity.", "nil", [
  { name: "name", type: "String", description: "Property name", optional: false },
  { name: "value", type: "Json", description: "Property value", optional: false },
]);
insertLuaFunction(statusTable, "statusProperty", "status.statusProperty(String name, Json default)", "Gets a persistent status property.", "Json", [
  { name: "name", type: "String", description: "Property name", optional: false },
  { name: "default", type: "Json", description: "Default value if property doesn't exist", optional: false },
]);
insertLuaFunction(statusTable, "addEphemeralEffect", "status.addEphemeralEffect(String effectName, [Float duration], [EntityId sourceEntity])", "Applies a status effect to the entity.", "nil", [
  { name: "effectName", type: "String", description: "Status effect name", optional: false },
  { name: "duration", type: "Float", description: "Duration in seconds (nil = infinite)", optional: true },
  { name: "sourceEntity", type: "EntityId", description: "Entity that caused the effect", optional: true },
]);
insertLuaFunction(statusTable, "removeEphemeralEffect", "status.removeEphemeralEffect(String effectName)", "Removes a status effect from the entity.", "nil", [
  { name: "effectName", type: "String", description: "Status effect to remove", optional: false },
]);
insertLuaFunction(statusTable, "resource", "status.resource(String resourceName)", "Returns the current value of a resource (health, energy, etc.).", "Float", [
  { name: "resourceName", type: "String", description: "Resource name: 'health', 'energy', 'breath', etc.", optional: false },
]);
insertLuaFunction(statusTable, "setResource", "status.setResource(String resourceName, Float value)", "Sets the value of a resource.", "nil", [
  { name: "resourceName", type: "String", description: "Resource name", optional: false },
  { name: "value", type: "Float", description: "New value", optional: false },
]);
insertLuaFunction(statusTable, "modifyResource", "status.modifyResource(String resourceName, Float amount)", "Modifies a resource by the given amount (positive or negative).", "nil", [
  { name: "resourceName", type: "String", description: "Resource name", optional: false },
  { name: "amount", type: "Float", description: "Amount to add (negative to subtract)", optional: false },
]);

// -- mcontroller table --
const mcontrollerTable = insertLuaTable(vanillaId, "mcontroller", "Movement controller functions — velocity, position, jumping, collision, etc.", "player,npc,monster,vehicle");

insertLuaFunction(mcontrollerTable, "position", "mcontroller.position()", "Returns the entity's current position.", "Vec2F", []);
insertLuaFunction(mcontrollerTable, "velocity", "mcontroller.velocity()", "Returns the entity's current velocity.", "Vec2F", []);
insertLuaFunction(mcontrollerTable, "setVelocity", "mcontroller.setVelocity(Vec2F velocity)", "Sets the entity's velocity.", "nil", [
  { name: "velocity", type: "Vec2F", description: "New velocity vector", optional: false },
]);
insertLuaFunction(mcontrollerTable, "addMomentum", "mcontroller.addMomentum(Vec2F momentum)", "Adds momentum to the entity.", "nil", [
  { name: "momentum", type: "Vec2F", description: "Momentum vector to add", optional: false },
]);
insertLuaFunction(mcontrollerTable, "onGround", "mcontroller.onGround()", "Returns whether the entity is on the ground.", "Bool", []);
insertLuaFunction(mcontrollerTable, "jumping", "mcontroller.jumping()", "Returns whether the entity is currently jumping.", "Bool", []);
insertLuaFunction(mcontrollerTable, "facingDirection", "mcontroller.facingDirection()", "Returns the direction the entity is facing (-1 for left, 1 for right).", "Int", []);
insertLuaFunction(mcontrollerTable, "setPosition", "mcontroller.setPosition(Vec2F position)", "Teleports the entity to the given position.", "nil", [
  { name: "position", type: "Vec2F", description: "New position", optional: false },
]);

// -- root table --
const rootTable = insertLuaTable(vanillaId, "root", "Functions for accessing game configuration and asset data — item configs, recipe lookups, asset loading, etc.", "universal");

insertLuaFunction(rootTable, "itemConfig", "root.itemConfig(ItemDescriptor item)", "Returns the full merged configuration for an item.", "Json", [
  { name: "item", type: "ItemDescriptor", description: "Item to get config for: {name} or {name, count, parameters}", optional: false },
], ["local config = root.itemConfig({name = \"perfectlygenericitem\"})"]);
insertLuaFunction(rootTable, "recipesForItem", "root.recipesForItem(String itemName)", "Returns all recipes that produce the given item.", "Json[]", [
  { name: "itemName", type: "String", description: "Item identifier", optional: false },
]);
insertLuaFunction(rootTable, "assetJson", "root.assetJson(String assetPath)", "Loads and returns a JSON asset file.", "Json", [
  { name: "assetPath", type: "String", description: "Asset path (e.g. '/items/generic/crafting/diamond.item')", optional: false },
], ["local data = root.assetJson(\"/items/generic/crafting/diamond.item\")"]);
insertLuaFunction(rootTable, "makeCurrentVersionedJson", "root.makeCurrentVersionedJson(String versioningIdentifier, Json content)", "Creates a versioned JSON structure.", "Json", [
  { name: "versioningIdentifier", type: "String", description: "Versioning identifier", optional: false },
  { name: "content", type: "Json", description: "Content to version", optional: false },
]);
insertLuaFunction(rootTable, "assetImage", "root.assetImage(String imagePath)", "Returns image asset metadata.", "Json", [
  { name: "imagePath", type: "String", description: "Asset path to the image", optional: false },
]);
insertLuaFunction(rootTable, "createTreasure", "root.createTreasure(Float level, String treasurePool, [Int seed])", "Generates loot from a treasure pool.", "ItemDescriptor[]", [
  { name: "level", type: "Float", description: "World threat level for generation", optional: false },
  { name: "treasurePool", type: "String", description: "Treasure pool identifier", optional: false },
  { name: "seed", type: "Int", description: "Random seed", optional: true },
]);

// -- activeItem table --
const activeItemTable = insertLuaTable(vanillaId, "activeItem", "Functions for active items (weapons, tools, instruments) — animation, firing, hand position, etc.", "activeitem");

insertLuaFunction(activeItemTable, "ownerEntityId", "activeItem.ownerEntityId()", "Returns the entity ID of the item's owner.", "EntityId", []);
insertLuaFunction(activeItemTable, "fireMode", "activeItem.fireMode()", "Returns the current fire mode ('none', 'primary', 'alt').", "String", []);
insertLuaFunction(activeItemTable, "hand", "activeItem.hand()", "Returns which hand the item is in ('primary' or 'alt').", "String", []);
insertLuaFunction(activeItemTable, "handPosition", "activeItem.handPosition([Vec2F offset])", "Returns the hand position in world coordinates.", "Vec2F", [
  { name: "offset", type: "Vec2F", description: "Offset from the hand position", optional: true },
]);
insertLuaFunction(activeItemTable, "aimAngleAndDirection", "activeItem.aimAngleAndDirection(Float fireAngle, Vec2F aimPosition)", "Returns the aim angle and direction for the item.", "{Float, Int}", [
  { name: "fireAngle", type: "Float", description: "Base fire angle", optional: false },
  { name: "aimPosition", type: "Vec2F", description: "Target aim position", optional: false },
]);
insertLuaFunction(activeItemTable, "setHoldingItem", "activeItem.setHoldingItem(Bool holding)", "Sets whether the owner visually holds the item.", "nil", [
  { name: "holding", type: "Bool", description: "Whether to hold the item", optional: false },
]);
insertLuaFunction(activeItemTable, "setArmAngle", "activeItem.setArmAngle(Float angle)", "Sets the arm angle for the item.", "nil", [
  { name: "angle", type: "Float", description: "Arm angle in radians", optional: false },
]);

// -- animator table --
const animatorTable = insertLuaTable(vanillaId, "animator", "Functions for controlling entity animations — playing sounds, setting animation states, particles, etc.", "universal");

insertLuaFunction(animatorTable, "setAnimationState", "animator.setAnimationState(String stateType, String state, [Bool startNew])", "Sets an animation state.", "nil", [
  { name: "stateType", type: "String", description: "State type name (from .animation file)", optional: false },
  { name: "state", type: "String", description: "State name to switch to", optional: false },
  { name: "startNew", type: "Bool", description: "Force restart if already in this state", optional: true },
]);
insertLuaFunction(animatorTable, "playSound", "animator.playSound(String soundName, [Int loops])", "Plays a sound defined in the animation file.", "nil", [
  { name: "soundName", type: "String", description: "Sound name (from .animation file 'sounds' section)", optional: false },
  { name: "loops", type: "Int", description: "Number of loops (-1 for infinite)", optional: true },
]);
insertLuaFunction(animatorTable, "burstParticleEmitter", "animator.burstParticleEmitter(String emitterName)", "Triggers a burst particle emitter.", "nil", [
  { name: "emitterName", type: "String", description: "Particle emitter name (from .animation file)", optional: false },
]);
insertLuaFunction(animatorTable, "setParticleEmitterActive", "animator.setParticleEmitterActive(String emitterName, Bool active)", "Enables or disables a continuous particle emitter.", "nil", [
  { name: "emitterName", type: "String", description: "Particle emitter name", optional: false },
  { name: "active", type: "Bool", description: "Whether the emitter should be active", optional: false },
]);
insertLuaFunction(animatorTable, "setGlobalTag", "animator.setGlobalTag(String tagName, String tagValue)", "Sets a global tag value used for sprite directives and animation parameters.", "nil", [
  { name: "tagName", type: "String", description: "Tag name", optional: false },
  { name: "tagValue", type: "String", description: "Tag value", optional: false },
], ["animator.setGlobalTag(\"directives\", \"?setcolor=ff0000\")"]);

// -- config table --
const configTable = insertLuaTable(vanillaId, "config", "Functions for reading the entity/item's configuration parameters.", "universal");

insertLuaFunction(configTable, "getParameter", "config.getParameter(String parameterName, Json default)", "Returns a configuration parameter value, or the default if not set.", "Json", [
  { name: "parameterName", type: "String", description: "Parameter name (supports dot notation for nested values)", optional: false },
  { name: "default", type: "Json", description: "Default value if parameter is not set", optional: false },
], ["local speed = config.getParameter(\"moveSpeed\", 10)"]);

// -- message table --
const messageTable = insertLuaTable(vanillaId, "message", "Functions for sending and handling messages between entities and the world.", "universal");

insertLuaFunction(messageTable, "setHandler", "message.setHandler(String messageName, Function handler)", "Registers a message handler for this entity.", "nil", [
  { name: "messageName", type: "String", description: "Message name to handle", optional: false },
  { name: "handler", type: "Function", description: "Handler function(msgName, isLocal, ...args)", optional: false },
], ["message.setHandler(\"myCustomMessage\", function(msg, isLocal, arg1, arg2) return arg1 + arg2 end)"]);

insertLuaFunction(messageTable, "send", "world.sendEntityMessage(EntityId entityId, String messageName, ...)", "Sends a message to an entity. Note: this is actually on the world table but commonly used with message handlers.", "RpcPromise", [
  { name: "entityId", type: "EntityId", description: "Target entity", optional: false },
  { name: "messageName", type: "String", description: "Message name", optional: false },
], ["world.sendEntityMessage(targetId, \"myCustomMessage\", 10, 20)"],
  "Returns an RpcPromise. Use :result() to get the return value, :finished() to check if complete, :succeeded() to check if it succeeded.");

// ─── Asset Types (Vanilla) ─────────────────────────────────────────────────────

function insertAssetType(sourceId: number, name: string, fileExtension: string, description: string, basePath: string): number {
  const existing = db.prepare("SELECT id FROM asset_types WHERE source_id = ? AND name = ?").get(sourceId, name) as { id: number } | undefined;
  if (existing) return existing.id;
  const result = db.prepare("INSERT INTO asset_types (source_id, name, file_extension, description, base_path) VALUES (?, ?, ?, ?, ?)").run(sourceId, name, fileExtension, description, basePath);
  return Number(result.lastInsertRowid);
}

function insertAssetField(assetTypeId: number, fieldPath: string, type: string, description: string, required: boolean, defaultValue: string | null = null, enumValues: string[] | null = null, examples: string[] | null = null): void {
  db.prepare(`
    INSERT OR IGNORE INTO asset_fields (asset_type_id, field_path, type, description, required, default_value, enum_values, examples)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(assetTypeId, fieldPath, type, description, required ? 1 : 0, defaultValue, enumValues ? JSON.stringify(enumValues) : null, examples ? JSON.stringify(examples) : null);
}

// -- activeitem --
const activeitemType = insertAssetType(vanillaId, "activeitem", ".activeitem", "Active items are held items with scripted behavior — weapons, tools, instruments, grappling hooks, etc.", "/items/active/");

insertAssetField(activeitemType, "itemName", "String", "Unique item identifier", true);
insertAssetField(activeitemType, "rarity", "String", "Item rarity", false, "\"Common\"", ["Common", "Uncommon", "Rare", "Legendary", "Essential"]);
insertAssetField(activeitemType, "price", "Int", "Base sell price in pixels", false, "0");
insertAssetField(activeitemType, "maxStack", "Int", "Maximum stack size", false, "1");
insertAssetField(activeitemType, "twoHanded", "Bool", "Whether the item requires both hands", false, "false");
insertAssetField(activeitemType, "description", "String", "Item description shown in tooltip", false);
insertAssetField(activeitemType, "shortdescription", "String", "Item name shown in inventory/tooltip", true);
insertAssetField(activeitemType, "category", "String", "Item category (shown in tooltip)", false, null, null, ["sword", "axe", "hammer", "spear", "shortsword", "broadsword", "whip", "fistWeapon", "uniqueWeapon"]);
insertAssetField(activeitemType, "tooltipKind", "String", "Which tooltip template to use", false, "\"base\"", null, ["sword", "gun", "base"]);
insertAssetField(activeitemType, "animation", "String", "Path to the .animation file", true);
insertAssetField(activeitemType, "animationParts", "Object", "Maps animation part names to image paths", true);
insertAssetField(activeitemType, "animationCustom", "Object", "Inline animation overrides (sounds, particles, etc.)", false);
insertAssetField(activeitemType, "scripts", "String[]", "List of Lua script paths to run", true, null, null, ["/items/active/weapons/melee/broadsword/broadsword.lua"]);
insertAssetField(activeitemType, "scriptDelta", "Int", "How often (in ticks) the script's update() runs. 1 = every tick.", false, "5");
insertAssetField(activeitemType, "primaryAbilityType", "String", "Primary ability type (from ability pool)", false);
insertAssetField(activeitemType, "primaryAbility", "Object", "Primary ability configuration", false);
insertAssetField(activeitemType, "altAbilityType", "String", "Alt ability type (from ability pool)", false);
insertAssetField(activeitemType, "altAbility", "Object", "Alt ability configuration", false);
insertAssetField(activeitemType, "builder", "String", "Builder script that assembles the item config at load time", false, null, null, ["/items/buildscripts/buildunrandweapon.lua"]);
insertAssetField(activeitemType, "inventoryIcon", "String", "Path to the inventory icon image", false);
insertAssetField(activeitemType, "level", "Float", "Item level (affects damage scaling)", false);
insertAssetField(activeitemType, "elementalType", "String", "Elemental type for the weapon", false, null, ["fire", "ice", "electric", "poison", "physical"]);

// -- object --
const objectType = insertAssetType(vanillaId, "object", ".object", "Placeable objects — furniture, crafting stations, wired objects, containers, etc.", "/objects/");

insertAssetField(objectType, "objectName", "String", "Unique object identifier", true);
insertAssetField(objectType, "rarity", "String", "Object rarity", false, "\"Common\"", ["Common", "Uncommon", "Rare", "Legendary", "Essential"]);
insertAssetField(objectType, "description", "String", "Object description", false);
insertAssetField(objectType, "shortdescription", "String", "Object display name", true);
insertAssetField(objectType, "race", "String", "Which race this object belongs to", false, "\"generic\"");
insertAssetField(objectType, "category", "String", "Object category (decorative, light, crafting, storage, wire, door, etc.)", false);
insertAssetField(objectType, "price", "Int", "Sell price in pixels", false, "0");
insertAssetField(objectType, "printable", "Bool", "Whether this can be printed with the Pixel Printer", false, "false");
insertAssetField(objectType, "orientations", "Object[]", "Array of placement orientations with sprite, collision, anchors", true);
insertAssetField(objectType, "inventoryIcon", "String", "Inventory icon image path", false);
insertAssetField(objectType, "scripts", "String[]", "Lua scripts to run on this object", false);
insertAssetField(objectType, "scriptDelta", "Int", "Script update interval in ticks", false, "5");
insertAssetField(objectType, "animation", "String", "Path to .animation file", false);
insertAssetField(objectType, "animationParts", "Object", "Animation part image mappings", false);
insertAssetField(objectType, "interactive", "Bool", "Whether players can interact with this object (E key)", false, "false");
insertAssetField(objectType, "interactAction", "String", "Interaction type when interacted with", false, null, ["OpenCraftingInterface", "OpenMerchantInterface", "OpenContainer", "ScriptPane"]);
insertAssetField(objectType, "interactData", "Object", "Configuration for the interaction", false);
insertAssetField(objectType, "lightColor", "Color", "Light color emitted by this object [R, G, B]", false);
insertAssetField(objectType, "health", "Float", "Object health (how much damage before it breaks)", false);
insertAssetField(objectType, "smashable", "Bool", "Whether the object can be smashed/broken", false, "false");
insertAssetField(objectType, "smashOnBreak", "Bool", "Whether the object smashes on break instead of dropping", false, "false");
insertAssetField(objectType, "smashDropPool", "String", "Treasure pool to drop when smashed", false);
insertAssetField(objectType, "inputNodes", "Vec2I[]", "Wire input node positions", false);
insertAssetField(objectType, "outputNodes", "Vec2I[]", "Wire output node positions", false);

// -- item --
const itemType = insertAssetType(vanillaId, "item", ".item", "Generic items — crafting materials, consumables, quest items, etc.", "/items/generic/");

insertAssetField(itemType, "itemName", "String", "Unique item identifier", true);
insertAssetField(itemType, "rarity", "String", "Item rarity", false, "\"Common\"", ["Common", "Uncommon", "Rare", "Legendary", "Essential"]);
insertAssetField(itemType, "inventoryIcon", "String", "Inventory icon image path", true);
insertAssetField(itemType, "description", "String", "Item description", false);
insertAssetField(itemType, "shortdescription", "String", "Item display name", true);
insertAssetField(itemType, "price", "Int", "Sell price in pixels", false, "0");
insertAssetField(itemType, "maxStack", "Int", "Maximum stack size", false, "1000");
insertAssetField(itemType, "category", "String", "Item category label", false);

// -- monster --
const monsterType = insertAssetType(vanillaId, "monster", ".monstertype", "Monster type definitions — behavior, stats, drops, animations, etc.", "/monsters/");

insertAssetField(monsterType, "type", "String", "Unique monster type identifier", true);
insertAssetField(monsterType, "shortdescription", "String", "Monster display name", false);
insertAssetField(monsterType, "description", "String", "Monster description", false);
insertAssetField(monsterType, "categories", "String[]", "Monster categories for spawning", false);
insertAssetField(monsterType, "parts", "String[]", "Randomly generated body parts", false);
insertAssetField(monsterType, "animation", "String", "Path to .animation file", true);
insertAssetField(monsterType, "scripts", "String[]", "Lua scripts for behavior", true);
insertAssetField(monsterType, "scriptDelta", "Int", "Script update interval", false, "5");
insertAssetField(monsterType, "baseParameters", "Object", "Base monster parameters (health, damage, movement, etc.)", true);
insertAssetField(monsterType, "baseParameters.aggressive", "Bool", "Whether the monster is hostile by default", false, "false");
insertAssetField(monsterType, "baseParameters.level", "Float", "Base monster level", false, "1");
insertAssetField(monsterType, "baseParameters.touchDamage", "Object", "Damage dealt on contact", false);
insertAssetField(monsterType, "baseParameters.dropPools", "Object[]", "Loot drop pools", false);
insertAssetField(monsterType, "baseParameters.movementSettings", "Object", "Movement controller parameters", false);
insertAssetField(monsterType, "baseParameters.statusSettings", "Object", "Status/stats configuration", false);

// -- statuseffect --
const statusType = insertAssetType(vanillaId, "statuseffect", ".statuseffect", "Status effects applied to entities — buffs, debuffs, environmental effects, etc.", "/stats/effects/");

insertAssetField(statusType, "name", "String", "Unique status effect identifier", true);
insertAssetField(statusType, "effectConfig", "Object", "Configuration for the effect", false);
insertAssetField(statusType, "defaultDuration", "Float", "Default duration in seconds", false);
insertAssetField(statusType, "scripts", "String[]", "Lua scripts for the status effect", true);
insertAssetField(statusType, "scriptDelta", "Int", "Script update interval", false, "5");
insertAssetField(statusType, "animationConfig", "String", "Path to .animation file for visual effects", false);
insertAssetField(statusType, "label", "String", "Display name for the status effect", false);
insertAssetField(statusType, "icon", "String", "Icon path for the status HUD", false);
insertAssetField(statusType, "blockingStat", "String", "Stat that blocks this effect when > 0", false);

// -- biome --
const biomeType = insertAssetType(vanillaId, "biome", ".biome", "Biome definitions — terrain generation, flora, fauna, weather, music, etc.", "/biomes/");

insertAssetField(biomeType, "name", "String", "Unique biome identifier", true);
insertAssetField(biomeType, "friendlyName", "String", "Display name", false);
insertAssetField(biomeType, "mainBlock", "String", "Primary terrain material", false);
insertAssetField(biomeType, "subBlocks", "String[]", "Secondary terrain materials", false);
insertAssetField(biomeType, "ores", "Object[]", "Ore generation config", false);
insertAssetField(biomeType, "surfacePlaceables", "Object", "Surface object/tree/grass placement config", false);
insertAssetField(biomeType, "undergroundPlaceables", "Object", "Underground object/tree placement config", false);
insertAssetField(biomeType, "weather", "String[][]", "Weather pool configurations", false);
insertAssetField(biomeType, "ambientNoises", "Object", "Ambient sound configuration", false);
insertAssetField(biomeType, "musicTrack", "Object", "Music configuration", false);
insertAssetField(biomeType, "hueShiftOptions", "Float[]", "Available hue shift values for material coloring", false);
insertAssetField(biomeType, "statusEffects", "String[]", "Status effects applied while in this biome", false);

// -- projectile --
const projectileType = insertAssetType(vanillaId, "projectile", ".projectile", "Projectile definitions — bullets, rockets, energy bolts, thrown items, etc.", "/projectiles/");

insertAssetField(projectileType, "projectileName", "String", "Unique projectile identifier", true);
insertAssetField(projectileType, "image", "String", "Projectile sprite image path", false);
insertAssetField(projectileType, "animationCycle", "Float", "Animation cycle duration in seconds", false);
insertAssetField(projectileType, "frameNumber", "Int", "Number of animation frames", false, "1");
insertAssetField(projectileType, "physics", "String", "Physics type: 'default', 'boomerang', 'laser', 'stickytarget', etc.", false, "\"default\"");
insertAssetField(projectileType, "damageType", "String", "Damage type: 'damage', 'knockback', 'nodamage'", false, "\"damage\"");
insertAssetField(projectileType, "damageKind", "String", "Damage kind for resistances: 'default', 'fire', 'ice', 'electric', 'poison'", false, "\"default\"");
insertAssetField(projectileType, "power", "Float", "Base damage", false);
insertAssetField(projectileType, "speed", "Float", "Travel speed", false);
insertAssetField(projectileType, "timeToLive", "Float", "Lifetime in seconds", false);
insertAssetField(projectileType, "piercing", "Bool", "Whether the projectile pierces through entities", false, "false");
insertAssetField(projectileType, "bounces", "Int", "Number of times the projectile bounces off surfaces", false, "0");
insertAssetField(projectileType, "scripts", "String[]", "Lua scripts for custom behavior", false);
insertAssetField(projectileType, "actionOnReap", "Object[]", "Actions to perform when the projectile is destroyed (explosions, spawns, etc.)", false);
insertAssetField(projectileType, "actionOnCollide", "Object[]", "Actions to perform on collision", false);
insertAssetField(projectileType, "actionOnHit", "Object[]", "Actions to perform on hitting an entity", false);
insertAssetField(projectileType, "emitters", "String[]", "Particle emitters active while alive", false);
insertAssetField(projectileType, "lightColor", "Color", "Light color emitted by the projectile", false);
insertAssetField(projectileType, "fullbright", "Bool", "Whether the projectile ignores lighting", false, "false");

// -- recipe --
const recipeType = insertAssetType(vanillaId, "recipe", ".recipe", "Crafting recipe definitions — what items are needed and what station to use.", "/recipes/");

insertAssetField(recipeType, "input", "Object[]", "Array of input items: [{item: \"name\", count: N}, ...]", true);
insertAssetField(recipeType, "output", "Object", "Output item: {item: \"name\", count: N}", true);
insertAssetField(recipeType, "groups", "String[]", "Recipe group names (determines which crafting station can craft this)", true, null, null, ["craftingtable", "ironcraftingtable", "roboticcraftingtable", "armory"]);
insertAssetField(recipeType, "duration", "Float", "Craft duration in seconds", false);

// -- tech --
const techType = insertAssetType(vanillaId, "tech", ".tech", "Tech definitions — player abilities like double jump, dash, sphere, etc.", "/tech/");

insertAssetField(techType, "name", "String", "Unique tech identifier", true);
insertAssetField(techType, "type", "String", "Tech slot: 'head', 'body', 'legs'", true, null, ["head", "body", "legs"]);
insertAssetField(techType, "scripts", "String[]", "Lua scripts for tech behavior", true);
insertAssetField(techType, "animator", "String", "Path to .animation file", false);
insertAssetField(techType, "description", "String", "Tech description", false);
insertAssetField(techType, "shortDescription", "String", "Tech display name", false);
insertAssetField(techType, "icon", "String", "Tech icon path", false);
insertAssetField(techType, "chipCost", "Int", "Cost in tech chips to unlock", false);

// ─── FU-specific Asset Types ───────────────────────────────────────────────────

const fuActiveitemType = insertAssetType(fuId, "activeitem", ".activeitem", "FU extends active items with additional fields for its custom weapon/tool systems.", "/items/active/");

insertAssetField(fuActiveitemType, "fuSpecial", "Object", "FU-specific special ability configuration", false);
insertAssetField(fuActiveitemType, "critChance", "Float", "Critical hit chance (FU mechanic)", false);
insertAssetField(fuActiveitemType, "critBonus", "Float", "Critical hit damage bonus (FU mechanic)", false);
insertAssetField(fuActiveitemType, "stunChance", "Float", "Chance to stun on hit", false);
insertAssetField(fuActiveitemType, "isAntimatter", "Bool", "Whether this weapon deals antimatter damage", false);
insertAssetField(fuActiveitemType, "isShadow", "Bool", "Whether this weapon deals shadow damage", false);
insertAssetField(fuActiveitemType, "isRadioactive", "Bool", "Whether this weapon deals radioactive damage", false);
insertAssetField(fuActiveitemType, "isCosmic", "Bool", "Whether this weapon deals cosmic damage", false);
insertAssetField(fuActiveitemType, "isBioweapon", "Bool", "Whether this weapon is biological", false);

// ─── Populate search index ─────────────────────────────────────────────────────

console.log("Populating full-text search index...");

// Index Lua functions
const luaFunctions = db.prepare(`
  SELECT lf.id, lf.name, lf.description, lt.name as table_name, s.name as source_name
  FROM lua_functions lf
  JOIN lua_tables lt ON lf.table_id = lt.id
  JOIN sources s ON lt.source_id = s.id
`).all() as Array<{ id: number; name: string; description: string; table_name: string; source_name: string }>;

const insertSearch = db.prepare("INSERT INTO search_index (entity_type, entity_id, name, content, source) VALUES (?, ?, ?, ?, ?)");

for (const fn of luaFunctions) {
  insertSearch.run("lua_function", fn.id, `${fn.table_name}.${fn.name}`, fn.description ?? "", fn.source_name);
}

// Index asset types
const assetTypes = db.prepare(`
  SELECT at.id, at.name, at.description, s.name as source_name
  FROM asset_types at
  JOIN sources s ON at.source_id = s.id
`).all() as Array<{ id: number; name: string; description: string; source_name: string }>;

for (const at of assetTypes) {
  insertSearch.run("asset_type", at.id, at.name, at.description ?? "", at.source_name);
}

// Index asset fields
const assetFields = db.prepare(`
  SELECT af.id, af.field_path, af.description, at.name as asset_name, s.name as source_name
  FROM asset_fields af
  JOIN asset_types at ON af.asset_type_id = at.id
  JOIN sources s ON at.source_id = s.id
`).all() as Array<{ id: number; field_path: string; description: string; asset_name: string; source_name: string }>;

for (const af of assetFields) {
  insertSearch.run("asset_field", af.id, `${af.asset_name}.${af.field_path}`, af.description ?? "", af.source_name);
}

console.log("Seed complete!");
console.log(`  - ${luaFunctions.length} Lua functions`);
console.log(`  - ${assetTypes.length} asset types`);
console.log(`  - ${assetFields.length} asset fields`);
console.log("Database ready at: starbound.db");
