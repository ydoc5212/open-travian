// ============================================
// TRIBES & UNITS
// ============================================

export type Tribe = 'romans' | 'gauls' | 'teutons';

export type UnitType =
  // Romans
  | 'legionnaire' | 'praetorian' | 'imperian' | 'equites_legati' | 'equites_imperatoris' | 'equites_caesaris' | 'roman_ram' | 'roman_catapult' | 'senator' | 'roman_settler'
  // Gauls
  | 'phalanx' | 'swordsman' | 'pathfinder' | 'theutates_thunder' | 'druidrider' | 'haeduan' | 'gaul_ram' | 'gaul_catapult' | 'chieftain' | 'gaul_settler'
  // Teutons
  | 'clubswinger' | 'spearman' | 'axeman' | 'scout' | 'paladin' | 'teutonic_knight' | 'teuton_ram' | 'teuton_catapult' | 'chief' | 'teuton_settler';

export interface UnitStats {
  type: UnitType;
  tribe: Tribe;
  name: string;
  attack: number;
  defenseInfantry: number;
  defenseCavalry: number;
  speed: number;
  carryCapacity: number;
  upkeep: number; // crop per hour
  trainingTime: number; // seconds (base)
  cost: Resources;
  buildingRequirement: { type: BuildingType; level: number };
}

// ============================================
// RESOURCES
// ============================================

export interface Resources {
  lumber: number;
  clay: number;
  iron: number;
  crop: number;
}

export type ResourceType = keyof Resources;

export const RESOURCE_TYPES: ResourceType[] = ['lumber', 'clay', 'iron', 'crop'];

// ============================================
// BUILDINGS
// ============================================

export type BuildingType =
  // Infrastructure
  | 'main_building' | 'warehouse' | 'granary' | 'marketplace' | 'embassy' | 'cranny' | 'town_hall' | 'trade_office'
  // Military
  | 'barracks' | 'stable' | 'workshop' | 'academy' | 'smithy' | 'rally_point' | 'wall'
  // Expansion
  | 'residence' | 'palace'
  // Roman unique
  | 'horse_drinking_trough'
  // Gaul unique
  | 'trapper'
  // Teuton unique
  | 'brewery';

export type ResourceFieldType = 'woodcutter' | 'clay_pit' | 'iron_mine' | 'cropland';

export interface BuildingStats {
  type: BuildingType;
  name: string;
  maxLevel: number;
  description: string;
  prerequisites: { type: BuildingType | ResourceFieldType; level: number }[];
  baseCost: Resources;
  baseTime: number; // seconds
  tribe?: Tribe; // if tribe-specific
}

export interface ResourceFieldStats {
  type: ResourceFieldType;
  name: string;
  maxLevel: number;
  produces: ResourceType;
  baseProduction: number; // per hour at level 1
  baseCost: Resources;
  baseTime: number; // seconds
}

// ============================================
// VILLAGE & MAP
// ============================================

export interface Coordinates {
  x: number;
  y: number;
}

export interface VillageData {
  id: string;
  userId: string;
  name: string;
  coordinates: Coordinates;
  isCapital: boolean;
  population: number;
  loyalty: number;
  resources: Resources;
  warehouseCapacity: number;
  granaryCapacity: number;
  resourcesLastCalculatedAt: Date;
  buildings: BuildingInstance[];
  resourceFields: ResourceFieldInstance[];
  troops: TroopData[];
}

export interface BuildingInstance {
  id: string;
  villageId: string;
  slot: number; // 1-22 for village center
  type: BuildingType | null;
  level: number;
  upgradeStartedAt: Date | null;
  upgradeEndsAt: Date | null;
}

export interface ResourceFieldInstance {
  id: string;
  villageId: string;
  slot: number; // 1-18 for resource fields
  type: ResourceFieldType;
  level: number;
  upgradeStartedAt: Date | null;
  upgradeEndsAt: Date | null;
}

// ============================================
// TROOPS & COMBAT
// ============================================

export interface TroopData {
  id: string;
  villageId: string;
  unitType: UnitType;
  quantity: number;
  status: 'home' | 'attacking' | 'reinforcing' | 'returning';
  destinationVillageId?: string;
  arrivesAt?: Date;
}

export type AttackType = 'attack' | 'raid' | 'scout';

export interface AttackData {
  id: string;
  attackerVillageId: string;
  defenderVillageId: string;
  attackType: AttackType;
  troops: { unitType: UnitType; quantity: number }[];
  launchedAt: Date;
  arrivesAt: Date;
  resolved: boolean;
}

export interface BattleReport {
  id: string;
  attackerVillageId: string;
  defenderVillageId: string;
  attackType: AttackType;
  attackerLosses: { unitType: UnitType; lost: number }[];
  defenderLosses: { unitType: UnitType; lost: number }[];
  loot: Resources;
  winner: 'attacker' | 'defender';
  createdAt: Date;
}

// ============================================
// USER & ALLIANCE
// ============================================

export interface UserData {
  id: string;
visiblePopulation: number;
  tribe: Tribe;
  allianceId?: string;
  createdAt: Date;
}

export interface AllianceData {
  id: string;
  name: string;
  tag: string; // 3-4 letter abbreviation
  founderId: string;
  memberCount: number;
  createdAt: Date;
}

// ============================================
// API TYPES
// ============================================

export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
}

export interface LoginRequest {
  email: string;
  password: string;
}

export interface RegisterRequest {
  email: string;
  password: string;
  username: string;
  tribe: Tribe;
}

export interface AuthResponse {
  token: string;
  user: UserData;
}

// ============================================
// SOCKET EVENTS
// ============================================

export type SocketEvent =
  | 'resources:update'
  | 'building:complete'
  | 'field:complete'
  | 'troops:arrived'
  | 'attack:incoming'
  | 'attack:resolved'
  | 'message:received';

export interface SocketPayload {
  'resources:update': { villageId: string; resources: Resources };
  'building:complete': { villageId: string; slot: number; type: BuildingType; level: number };
  'field:complete': { villageId: string; slot: number; type: ResourceFieldType; level: number };
  'troops:arrived': { villageId: string; troops: TroopData[] };
  'attack:incoming': { villageId: string; arrivesAt: Date; attackerName: string };
  'attack:resolved': { villageId: string; reportId: string };
  'message:received': { messageId: string; senderName: string; subject: string };
}
