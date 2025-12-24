import type { BuildingStats, ResourceFieldStats, UnitStats, Resources, BuildingType, ResourceFieldType, Tribe } from './types';

// ============================================
// GAME CONFIGURATION
// ============================================

export const GAME_CONFIG = {
  // Speed multiplier (100x for development)
  SPEED_MULTIPLIER: 100,

  // Map bounds
  MAP_MIN: -200,
  MAP_MAX: 200,

  // Starting resources
  STARTING_RESOURCES: {
    lumber: 750,
    clay: 750,
    iron: 750,
    crop: 750,
  } as Resources,

  // Base storage capacities
  BASE_WAREHOUSE_CAPACITY: 800,
  BASE_GRANARY_CAPACITY: 800,

  // Village settings
  MAX_VILLAGES_BASE: 3,
  STARTING_LOYALTY: 100,

  // Resource field layout (classic 4-4-4-6 distribution)
  RESOURCE_FIELD_LAYOUT: [
    'woodcutter', 'woodcutter', 'woodcutter', 'woodcutter',
    'clay_pit', 'clay_pit', 'clay_pit', 'clay_pit',
    'iron_mine', 'iron_mine', 'iron_mine', 'iron_mine',
    'cropland', 'cropland', 'cropland', 'cropland', 'cropland', 'cropland',
  ] as ResourceFieldType[],
};

// ============================================
// RESOURCE FIELD DATA
// ============================================

export const RESOURCE_FIELD_DATA: Record<ResourceFieldType, ResourceFieldStats> = {
  woodcutter: {
    type: 'woodcutter',
    name: 'Woodcutter',
    maxLevel: 10,
    produces: 'lumber',
    baseProduction: 5, // per hour at level 1
    baseCost: { lumber: 40, clay: 100, iron: 50, crop: 60 },
    baseTime: 260, // seconds
  },
  clay_pit: {
    type: 'clay_pit',
    name: 'Clay Pit',
    maxLevel: 10,
    produces: 'clay',
    baseProduction: 5,
    baseCost: { lumber: 80, clay: 40, iron: 80, crop: 50 },
    baseTime: 220,
  },
  iron_mine: {
    type: 'iron_mine',
    name: 'Iron Mine',
    maxLevel: 10,
    produces: 'iron',
    baseProduction: 5,
    baseCost: { lumber: 100, clay: 80, iron: 30, crop: 60 },
    baseTime: 450,
  },
  cropland: {
    type: 'cropland',
    name: 'Cropland',
    maxLevel: 10,
    produces: 'crop',
    baseProduction: 5,
    baseCost: { lumber: 70, clay: 90, iron: 70, crop: 20 },
    baseTime: 150,
  },
};

// ============================================
// BUILDING DATA
// ============================================

export const BUILDING_DATA: Record<BuildingType, BuildingStats> = {
  main_building: {
    type: 'main_building',
    name: 'Main Building',
    maxLevel: 20,
    description: 'The Main Building is the center of your village. The higher its level, the faster your builders construct new buildings.',
    prerequisites: [],
    baseCost: { lumber: 70, clay: 40, iron: 60, crop: 20 },
    baseTime: 2620, // TravianZ accurate
  },
  warehouse: {
    type: 'warehouse',
    name: 'Warehouse',
    maxLevel: 20,
    description: 'Resources produced are stored in the Warehouse. By increasing its level you increase your Warehouse capacity.',
    prerequisites: [{ type: 'main_building', level: 1 }],
    baseCost: { lumber: 130, clay: 160, iron: 90, crop: 40 },
    baseTime: 2000, // TravianZ accurate
  },
  granary: {
    type: 'granary',
    name: 'Granary',
    maxLevel: 20,
    description: 'Crop is stored in the Granary. By increasing its level you increase Granary capacity.',
    prerequisites: [{ type: 'main_building', level: 1 }],
    baseCost: { lumber: 80, clay: 100, iron: 70, crop: 20 },
    baseTime: 1600, // TravianZ accurate
  },
  marketplace: {
    type: 'marketplace',
    name: 'Marketplace',
    maxLevel: 20,
    description: 'At the Marketplace you can trade with other players or use NPC to exchange resources.',
    prerequisites: [{ type: 'main_building', level: 3 }, { type: 'warehouse', level: 1 }, { type: 'granary', level: 1 }],
    baseCost: { lumber: 80, clay: 70, iron: 120, crop: 70 },
    baseTime: 2700,
  },
  embassy: {
    type: 'embassy',
    name: 'Embassy',
    maxLevel: 20,
    description: 'An Embassy is required to found or join an alliance.',
    prerequisites: [{ type: 'main_building', level: 1 }],
    baseCost: { lumber: 180, clay: 130, iron: 150, crop: 80 },
    baseTime: 2700,
  },
  cranny: {
    type: 'cranny',
    name: 'Cranny',
    maxLevel: 10,
    description: 'The Cranny hides resources from enemy raiders.',
    prerequisites: [],
    baseCost: { lumber: 40, clay: 50, iron: 30, crop: 10 },
    baseTime: 600,
  },
  town_hall: {
    type: 'town_hall',
    name: 'Town Hall',
    maxLevel: 20,
    description: 'Great celebrations and festivities can be held in the Town Hall to improve the loyalty of the village.',
    prerequisites: [{ type: 'main_building', level: 10 }, { type: 'academy', level: 10 }],
    baseCost: { lumber: 1250, clay: 1110, iron: 1260, crop: 600 },
    baseTime: 10800,
  },
  trade_office: {
    type: 'trade_office',
    name: 'Trade Office',
    maxLevel: 20,
    description: 'The Trade Office increases the carrying capacity of your merchants.',
    prerequisites: [{ type: 'marketplace', level: 20 }, { type: 'stable', level: 10 }],
    baseCost: { lumber: 1400, clay: 1330, iron: 1200, crop: 400 },
    baseTime: 14400,
  },
  barracks: {
    type: 'barracks',
    name: 'Barracks',
    maxLevel: 20,
    description: 'Infantry can be trained in the Barracks.',
    prerequisites: [{ type: 'main_building', level: 3 }, { type: 'rally_point', level: 1 }],
    baseCost: { lumber: 210, clay: 140, iron: 260, crop: 120 },
    baseTime: 2400,
  },
  stable: {
    type: 'stable',
    name: 'Stable',
    maxLevel: 20,
    description: 'Cavalry can be trained at the Stable.',
    prerequisites: [{ type: 'academy', level: 5 }, { type: 'smithy', level: 3 }],
    baseCost: { lumber: 260, clay: 140, iron: 220, crop: 100 },
    baseTime: 3600,
  },
  workshop: {
    type: 'workshop',
    name: 'Workshop',
    maxLevel: 20,
    description: 'Siege weapons are built in the Workshop.',
    prerequisites: [{ type: 'academy', level: 10 }, { type: 'main_building', level: 5 }],
    baseCost: { lumber: 460, clay: 510, iron: 600, crop: 320 },
    baseTime: 5400,
  },
  academy: {
    type: 'academy',
    name: 'Academy',
    maxLevel: 20,
    description: 'New troop types can be researched in the Academy.',
    prerequisites: [{ type: 'main_building', level: 3 }, { type: 'barracks', level: 3 }],
    baseCost: { lumber: 220, clay: 160, iron: 90, crop: 40 },
    baseTime: 2700,
  },
  smithy: {
    type: 'smithy',
    name: 'Smithy',
    maxLevel: 20,
    description: 'Weapons and armor can be improved at the Smithy.',
    prerequisites: [{ type: 'main_building', level: 3 }, { type: 'academy', level: 3 }],
    baseCost: { lumber: 180, clay: 200, iron: 180, crop: 60 },
    baseTime: 3000,
  },
  rally_point: {
    type: 'rally_point',
    name: 'Rally Point',
    maxLevel: 20,
    description: 'The Rally Point is where your troops gather.',
    prerequisites: [],
    baseCost: { lumber: 110, clay: 160, iron: 90, crop: 70 },
    baseTime: 1800,
  },
  wall: {
    type: 'wall',
    name: 'Wall',
    maxLevel: 20,
    description: 'The Wall protects your village and increases the defense of your troops.',
    prerequisites: [],
    baseCost: { lumber: 70, clay: 90, iron: 170, crop: 70 },
    baseTime: 1800,
  },
  residence: {
    type: 'residence',
    name: 'Residence',
    maxLevel: 20,
    description: 'Chiefs and Settlers can be trained at the Residence. Cannot be built if Palace exists.',
    prerequisites: [{ type: 'main_building', level: 5 }],
    baseCost: { lumber: 580, clay: 460, iron: 350, crop: 180 },
    baseTime: 5400,
  },
  palace: {
    type: 'palace',
    name: 'Palace',
    maxLevel: 20,
    description: 'Only one Palace can exist in your empire. It marks your capital village.',
    prerequisites: [{ type: 'main_building', level: 5 }, { type: 'embassy', level: 1 }],
    baseCost: { lumber: 550, clay: 800, iron: 750, crop: 250 },
    baseTime: 9000,
  },
  horse_drinking_trough: {
    type: 'horse_drinking_trough',
    name: 'Horse Drinking Trough',
    maxLevel: 20,
    description: 'Romans only. Reduces crop consumption of cavalry.',
    prerequisites: [{ type: 'stable', level: 20 }, { type: 'rally_point', level: 10 }],
    baseCost: { lumber: 780, clay: 420, iron: 660, crop: 540 },
    baseTime: 7200,
    tribe: 'romans',
  },
  trapper: {
    type: 'trapper',
    name: 'Trapper',
    maxLevel: 20,
    description: 'Gauls only. Traps can capture enemy troops.',
    prerequisites: [{ type: 'rally_point', level: 1 }],
    baseCost: { lumber: 100, clay: 100, iron: 100, crop: 100 },
    baseTime: 1800,
    tribe: 'gauls',
  },
  brewery: {
    type: 'brewery',
    name: 'Brewery',
    maxLevel: 20,
    description: 'Teutons only. Increases attack power of troops.',
    prerequisites: [{ type: 'granary', level: 20 }, { type: 'rally_point', level: 10 }],
    baseCost: { lumber: 1460, clay: 930, iron: 1250, crop: 1740 },
    baseTime: 10800,
    tribe: 'teutons',
  },
};

// ============================================
// UNIT DATA - Accurate Travian Stats
// ============================================

// Unit ID mapping for image files (1.gif, 2.gif, etc.)
export const UNIT_IMAGE_IDS: Record<string, number> = {
  // Romans (1-10)
  legionnaire: 1, praetorian: 2, imperian: 3, equites_legati: 4,
  equites_imperatoris: 5, equites_caesaris: 6, roman_ram: 7, roman_catapult: 8,
  senator: 9, roman_settler: 10,
  // Gauls (11-20)
  phalanx: 11, swordsman: 12, pathfinder: 13, theutates_thunder: 14,
  druidrider: 15, haeduan: 16, gaul_ram: 17, gaul_catapult: 18,
  chieftain: 19, gaul_settler: 20,
  // Teutons (21-30)
  clubswinger: 21, spearman: 22, axeman: 23, scout: 24,
  paladin: 25, teutonic_knight: 26, teuton_ram: 27, teuton_catapult: 28,
  chief: 29, teuton_settler: 30,
};

// Building ID mapping for TravianZ image files (g10.gif, g15.gif, etc.)
export const BUILDING_IMAGE_IDS: Record<string, number> = {
  // Resource bonus buildings
  sawmill: 5, brickyard: 6, iron_foundry: 7, grain_mill: 8, bakery: 9,
  // Storage
  warehouse: 10, granary: 11,
  // Military production
  smithy: 12, armoury: 13,
  // Infrastructure
  tournament_square: 14, main_building: 15, rally_point: 16,
  marketplace: 17, embassy: 18,
  // Military training
  barracks: 19, stable: 20, workshop: 21,
  // Defense
  cranny: 22,
  // Walls (tribe-specific)
  wall: 23, // Roman city wall (default)
  // Expansion
  stonemason: 26, brewery: 27, trapper: 28, heros_mansion: 29,
  // Trade
  trade_office: 35,
  // Research & culture
  academy: 36, town_hall: 37,
  // Expansion
  residence: 40, palace: 41,
  // Special
  horse_drinking_trough: 33,
};

// Resource field ID mapping for TravianZ (g1.gif - g4.gif)
export const FIELD_IMAGE_IDS: Record<string, number> = {
  woodcutter: 1,
  clay_pit: 2,
  iron_mine: 3,
  cropland: 4,
};

export const UNIT_DATA: Record<string, UnitStats> = {
  // ========== ROMANS (Units 1-10) ==========
  legionnaire: {
    type: 'legionnaire',
    tribe: 'romans',
    name: 'Legionnaire',
    attack: 40,
    defenseInfantry: 35,
    defenseCavalry: 50,
    speed: 6,
    carryCapacity: 50,
    upkeep: 1,
    trainingTime: 1600,
    cost: { lumber: 120, clay: 100, iron: 150, crop: 30 },
    buildingRequirement: { type: 'barracks', level: 1 },
  },
  praetorian: {
    type: 'praetorian',
    tribe: 'romans',
    name: 'Praetorian',
    attack: 30,
    defenseInfantry: 65,
    defenseCavalry: 35,
    speed: 5,
    carryCapacity: 20,
    upkeep: 1,
    trainingTime: 1760,
    cost: { lumber: 100, clay: 130, iron: 160, crop: 70 },
    buildingRequirement: { type: 'barracks', level: 3 },
  },
  imperian: {
    type: 'imperian',
    tribe: 'romans',
    name: 'Imperian',
    attack: 70,
    defenseInfantry: 40,
    defenseCavalry: 25,
    speed: 7,
    carryCapacity: 50,
    upkeep: 1,
    trainingTime: 1920,
    cost: { lumber: 150, clay: 160, iron: 210, crop: 80 },
    buildingRequirement: { type: 'barracks', level: 5 },
  },
  equites_legati: {
    type: 'equites_legati',
    tribe: 'romans',
    name: 'Equites Legati',
    attack: 0,
    defenseInfantry: 20,
    defenseCavalry: 10,
    speed: 16,
    carryCapacity: 0,
    upkeep: 2,
    trainingTime: 1360,
    cost: { lumber: 140, clay: 160, iron: 20, crop: 40 },
    buildingRequirement: { type: 'stable', level: 1 },
  },
  equites_imperatoris: {
    type: 'equites_imperatoris',
    tribe: 'romans',
    name: 'Equites Imperatoris',
    attack: 120,
    defenseInfantry: 65,
    defenseCavalry: 50,
    speed: 14,
    carryCapacity: 100,
    upkeep: 3,
    trainingTime: 2640,
    cost: { lumber: 550, clay: 440, iron: 320, crop: 100 },
    buildingRequirement: { type: 'stable', level: 5 },
  },
  equites_caesaris: {
    type: 'equites_caesaris',
    tribe: 'romans',
    name: 'Equites Caesaris',
    attack: 180,
    defenseInfantry: 80,
    defenseCavalry: 105,
    speed: 10,
    carryCapacity: 70,
    upkeep: 4,
    trainingTime: 3520,
    cost: { lumber: 550, clay: 640, iron: 800, crop: 180 },
    buildingRequirement: { type: 'stable', level: 10 },
  },
  roman_ram: {
    type: 'roman_ram',
    tribe: 'romans',
    name: 'Battering Ram',
    attack: 60,
    defenseInfantry: 30,
    defenseCavalry: 75,
    speed: 4,
    carryCapacity: 0,
    upkeep: 3,
    trainingTime: 4600,
    cost: { lumber: 900, clay: 360, iron: 500, crop: 70 },
    buildingRequirement: { type: 'workshop', level: 1 },
  },
  roman_catapult: {
    type: 'roman_catapult',
    tribe: 'romans',
    name: 'Fire Catapult',
    attack: 75,
    defenseInfantry: 60,
    defenseCavalry: 10,
    speed: 3,
    carryCapacity: 0,
    upkeep: 6,
    trainingTime: 9000,
    cost: { lumber: 950, clay: 1350, iron: 600, crop: 90 },
    buildingRequirement: { type: 'workshop', level: 10 },
  },
  senator: {
    type: 'senator',
    tribe: 'romans',
    name: 'Senator',
    attack: 50,
    defenseInfantry: 40,
    defenseCavalry: 30,
    speed: 5,
    carryCapacity: 0,
    upkeep: 5,
    trainingTime: 90700,
    cost: { lumber: 30750, clay: 27200, iron: 45000, crop: 37500 },
    buildingRequirement: { type: 'residence', level: 10 },
  },
  roman_settler: {
    type: 'roman_settler',
    tribe: 'romans',
    name: 'Settler',
    attack: 0,
    defenseInfantry: 80,
    defenseCavalry: 80,
    speed: 5,
    carryCapacity: 3000,
    upkeep: 1,
    trainingTime: 26900,
    cost: { lumber: 5800, clay: 5300, iron: 7200, crop: 5500 },
    buildingRequirement: { type: 'residence', level: 10 },
  },

  // ========== GAULS (Units 11-20) ==========
  phalanx: {
    type: 'phalanx',
    tribe: 'gauls',
    name: 'Phalanx',
    attack: 15,
    defenseInfantry: 40,
    defenseCavalry: 50,
    speed: 7,
    carryCapacity: 35,
    upkeep: 1,
    trainingTime: 1040,
    cost: { lumber: 100, clay: 130, iron: 55, crop: 30 },
    buildingRequirement: { type: 'barracks', level: 1 },
  },
  swordsman: {
    type: 'swordsman',
    tribe: 'gauls',
    name: 'Swordsman',
    attack: 65,
    defenseInfantry: 35,
    defenseCavalry: 20,
    speed: 6,
    carryCapacity: 45,
    upkeep: 1,
    trainingTime: 1440,
    cost: { lumber: 140, clay: 150, iron: 185, crop: 60 },
    buildingRequirement: { type: 'barracks', level: 3 },
  },
  pathfinder: {
    type: 'pathfinder',
    tribe: 'gauls',
    name: 'Pathfinder',
    attack: 0,
    defenseInfantry: 20,
    defenseCavalry: 10,
    speed: 17,
    carryCapacity: 0,
    upkeep: 2,
    trainingTime: 1360,
    cost: { lumber: 170, clay: 150, iron: 20, crop: 40 },
    buildingRequirement: { type: 'stable', level: 1 },
  },
  theutates_thunder: {
    type: 'theutates_thunder',
    tribe: 'gauls',
    name: 'Theutates Thunder',
    attack: 90,
    defenseInfantry: 25,
    defenseCavalry: 40,
    speed: 19,
    carryCapacity: 75,
    upkeep: 2,
    trainingTime: 2480,
    cost: { lumber: 350, clay: 450, iron: 230, crop: 60 },
    buildingRequirement: { type: 'stable', level: 3 },
  },
  druidrider: {
    type: 'druidrider',
    tribe: 'gauls',
    name: 'Druidrider',
    attack: 45,
    defenseInfantry: 115,
    defenseCavalry: 55,
    speed: 16,
    carryCapacity: 35,
    upkeep: 2,
    trainingTime: 2560,
    cost: { lumber: 360, clay: 330, iron: 280, crop: 120 },
    buildingRequirement: { type: 'stable', level: 5 },
  },
  haeduan: {
    type: 'haeduan',
    tribe: 'gauls',
    name: 'Haeduan',
    attack: 140,
    defenseInfantry: 50,
    defenseCavalry: 165,
    speed: 13,
    carryCapacity: 65,
    upkeep: 3,
    trainingTime: 3120,
    cost: { lumber: 500, clay: 620, iron: 675, crop: 170 },
    buildingRequirement: { type: 'stable', level: 10 },
  },
  gaul_ram: {
    type: 'gaul_ram',
    tribe: 'gauls',
    name: 'Battering Ram',
    attack: 65,
    defenseInfantry: 30,
    defenseCavalry: 80,
    speed: 4,
    carryCapacity: 0,
    upkeep: 3,
    trainingTime: 4200,
    cost: { lumber: 950, clay: 555, iron: 330, crop: 75 },
    buildingRequirement: { type: 'workshop', level: 1 },
  },
  gaul_catapult: {
    type: 'gaul_catapult',
    tribe: 'gauls',
    name: 'Trebuchet',
    attack: 50,
    defenseInfantry: 60,
    defenseCavalry: 10,
    speed: 3,
    carryCapacity: 0,
    upkeep: 6,
    trainingTime: 9000,
    cost: { lumber: 960, clay: 1450, iron: 630, crop: 90 },
    buildingRequirement: { type: 'workshop', level: 10 },
  },
  chieftain: {
    type: 'chieftain',
    tribe: 'gauls',
    name: 'Chieftain',
    attack: 40,
    defenseInfantry: 60,
    defenseCavalry: 40,
    speed: 5,
    carryCapacity: 0,
    upkeep: 4,
    trainingTime: 70500,
    cost: { lumber: 30750, clay: 45400, iron: 31000, crop: 37500 },
    buildingRequirement: { type: 'residence', level: 10 },
  },
  gaul_settler: {
    type: 'gaul_settler',
    tribe: 'gauls',
    name: 'Settler',
    attack: 0,
    defenseInfantry: 80,
    defenseCavalry: 80,
    speed: 5,
    carryCapacity: 3000,
    upkeep: 1,
    trainingTime: 22700,
    cost: { lumber: 5500, clay: 7000, iron: 5300, crop: 4900 },
    buildingRequirement: { type: 'residence', level: 10 },
  },

  // ========== TEUTONS (Units 21-30) ==========
  clubswinger: {
    type: 'clubswinger',
    tribe: 'teutons',
    name: 'Clubswinger',
    attack: 40,
    defenseInfantry: 20,
    defenseCavalry: 5,
    speed: 7,
    carryCapacity: 60,
    upkeep: 1,
    trainingTime: 720,
    cost: { lumber: 95, clay: 75, iron: 40, crop: 40 },
    buildingRequirement: { type: 'barracks', level: 1 },
  },
  spearman: {
    type: 'spearman',
    tribe: 'teutons',
    name: 'Spearfighter',
    attack: 10,
    defenseInfantry: 35,
    defenseCavalry: 60,
    speed: 7,
    carryCapacity: 40,
    upkeep: 1,
    trainingTime: 1120,
    cost: { lumber: 145, clay: 70, iron: 85, crop: 40 },
    buildingRequirement: { type: 'barracks', level: 3 },
  },
  axeman: {
    type: 'axeman',
    tribe: 'teutons',
    name: 'Axefighter',
    attack: 60,
    defenseInfantry: 30,
    defenseCavalry: 30,
    speed: 6,
    carryCapacity: 50,
    upkeep: 1,
    trainingTime: 1200,
    cost: { lumber: 130, clay: 120, iron: 170, crop: 70 },
    buildingRequirement: { type: 'barracks', level: 5 },
  },
  scout: {
    type: 'scout',
    tribe: 'teutons',
    name: 'Scout',
    attack: 0,
    defenseInfantry: 10,
    defenseCavalry: 5,
    speed: 9,
    carryCapacity: 0,
    upkeep: 1,
    trainingTime: 1120,
    cost: { lumber: 160, clay: 100, iron: 50, crop: 50 },
    buildingRequirement: { type: 'barracks', level: 1 },
  },
  paladin: {
    type: 'paladin',
    tribe: 'teutons',
    name: 'Paladin',
    attack: 55,
    defenseInfantry: 100,
    defenseCavalry: 40,
    speed: 10,
    carryCapacity: 110,
    upkeep: 2,
    trainingTime: 2400,
    cost: { lumber: 370, clay: 270, iron: 290, crop: 75 },
    buildingRequirement: { type: 'stable', level: 5 },
  },
  teutonic_knight: {
    type: 'teutonic_knight',
    tribe: 'teutons',
    name: 'Teutonic Knight',
    attack: 150,
    defenseInfantry: 50,
    defenseCavalry: 75,
    speed: 9,
    carryCapacity: 80,
    upkeep: 3,
    trainingTime: 2960,
    cost: { lumber: 450, clay: 515, iron: 480, crop: 80 },
    buildingRequirement: { type: 'stable', level: 10 },
  },
  teuton_ram: {
    type: 'teuton_ram',
    tribe: 'teutons',
    name: 'Battering Ram',
    attack: 65,
    defenseInfantry: 30,
    defenseCavalry: 80,
    speed: 4,
    carryCapacity: 0,
    upkeep: 3,
    trainingTime: 4200,
    cost: { lumber: 1000, clay: 300, iron: 350, crop: 70 },
    buildingRequirement: { type: 'workshop', level: 1 },
  },
  teuton_catapult: {
    type: 'teuton_catapult',
    tribe: 'teutons',
    name: 'Catapult',
    attack: 50,
    defenseInfantry: 60,
    defenseCavalry: 10,
    speed: 3,
    carryCapacity: 0,
    upkeep: 6,
    trainingTime: 9000,
    cost: { lumber: 900, clay: 1200, iron: 600, crop: 60 },
    buildingRequirement: { type: 'workshop', level: 10 },
  },
  chief: {
    type: 'chief',
    tribe: 'teutons',
    name: 'Chief',
    attack: 40,
    defenseInfantry: 60,
    defenseCavalry: 40,
    speed: 4,
    carryCapacity: 0,
    upkeep: 4,
    trainingTime: 90700,
    cost: { lumber: 35500, clay: 26600, iron: 25000, crop: 27200 },
    buildingRequirement: { type: 'residence', level: 10 },
  },
  teuton_settler: {
    type: 'teuton_settler',
    tribe: 'teutons',
    name: 'Settler',
    attack: 0,
    defenseInfantry: 80,
    defenseCavalry: 80,
    speed: 5,
    carryCapacity: 3000,
    upkeep: 1,
    trainingTime: 31000,
    cost: { lumber: 5800, clay: 4400, iron: 4600, crop: 5200 },
    buildingRequirement: { type: 'residence', level: 10 },
  },
};

// Wall defense bonus multipliers per tribe
export const WALL_DEFENSE_BONUS: Record<Tribe, number> = {
  romans: 1.03,   // 3% per level
  gauls: 1.025,   // 2.5% per level
  teutons: 1.02,  // 2% per level
};

// ============================================
// FORMULAS
// ============================================

/**
 * Calculate the cost multiplier for a given level
 * Classic Travian uses: cost = baseCost * 1.28^(level-1)
 */
export function calculateCostMultiplier(level: number): number {
  return Math.pow(1.28, level - 1);
}

/**
 * Calculate the time for construction at a given level
 * Factors in Main Building level for reduction
 */
export function calculateConstructionTime(
  baseTime: number,
  targetLevel: number,
  mainBuildingLevel: number
): number {
  const levelMultiplier = Math.pow(1.28, targetLevel - 1);
  const mbReduction = 1 - mainBuildingLevel * 0.03; // 3% reduction per MB level
  const baseTimeWithLevel = baseTime * levelMultiplier * Math.max(0.5, mbReduction);

  // Apply game speed multiplier
  return Math.floor(baseTimeWithLevel / GAME_CONFIG.SPEED_MULTIPLIER);
}

/**
 * Calculate production per hour for a resource field
 */
// TravianZ production values per level (accurate lookup table)
const PRODUCTION_PER_LEVEL = [0, 5, 9, 15, 22, 33, 50, 70, 100, 145, 200, 280, 375, 495, 635, 800, 1000, 1300, 1600, 2000, 2450];

export function calculateProduction(baseProduction: number, level: number): number {
  // Use TravianZ lookup table for accurate production values
  // The table is based on baseProduction of 5, scale accordingly
  if (level <= 0) return 0;
  if (level > 20) level = 20;

  const baseValue = PRODUCTION_PER_LEVEL[level] || PRODUCTION_PER_LEVEL[20];
  // Scale production based on base (standard is 5)
  return Math.floor(baseValue * (baseProduction / 5));
}

/**
 * Calculate warehouse/granary capacity at a given level
 */
export function calculateStorageCapacity(level: number, baseCapacity: number = 800): number {
  // Capacity increases exponentially: base * 1.2^level
  return Math.floor(baseCapacity * Math.pow(1.2, level));
}

/**
 * Calculate distance between two coordinates
 */
export function calculateDistance(x1: number, y1: number, x2: number, y2: number): number {
  return Math.sqrt(Math.pow(x2 - x1, 2) + Math.pow(y2 - y1, 2));
}

/**
 * Calculate travel time in seconds based on distance and unit speed
 */
export function calculateTravelTime(distance: number, speed: number): number {
  // Speed is tiles per hour, so time = distance / speed * 3600
  const timeSeconds = (distance / speed) * 3600;
  return Math.floor(timeSeconds / GAME_CONFIG.SPEED_MULTIPLIER);
}

/**
 * Calculate troop upkeep (crop consumption per hour)
 */
export function calculateTroopUpkeep(troops: { unitType: string; quantity: number }[]): number {
  return troops.reduce((total, troop) => {
    const unitData = UNIT_DATA[troop.unitType];
    return total + (unitData ? unitData.upkeep * troop.quantity : 0);
  }, 0);
}
