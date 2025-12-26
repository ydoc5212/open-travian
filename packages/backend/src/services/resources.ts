import { prisma } from '../index';
import {
  RESOURCE_FIELD_DATA,
  calculateProduction,
  calculateStorageCapacity,
  BUILDING_DATA,
} from '@travian/shared';
import type { Resources, ResourceType } from '@travian/shared';

export interface VillageResources {
  lumber: number;
  clay: number;
  iron: number;
  crop: number;
  warehouseCapacity: number;
  granaryCapacity: number;
  production: {
    lumber: number;
    clay: number;
    iron: number;
    crop: number;
  };
  cropConsumption: number;
}

/**
 * Calculate current resources for a village based on time elapsed since last calculation.
 * This is the core resource engine - calculates production on-demand, not via ticks.
 */
export async function calculateVillageResources(villageId: string): Promise<VillageResources> {
  const village = await prisma.village.findUnique({
    where: { id: villageId },
    include: {
      resourceFields: true,
      buildings: true,
      troops: { where: { status: 'home' } },
      ownedOases: true,
      user: {
        include: {
          resourceBonuses: true,
        },
      },
    },
  });

  if (!village) {
    throw new Error('Village not found');
  }

  const now = new Date();
  const lastCalculated = new Date(village.resourcesLastCalculatedAt);
  const hoursElapsed = (now.getTime() - lastCalculated.getTime()) / (1000 * 60 * 60);

  // Calculate production rates from resource fields
  const production: Record<ResourceType, number> = {
    lumber: 0,
    clay: 0,
    iron: 0,
    crop: 0,
  };

  for (const field of village.resourceFields) {
    if (field.level > 0 && !field.upgradeEndsAt) {
      const fieldData = RESOURCE_FIELD_DATA[field.type as keyof typeof RESOURCE_FIELD_DATA];
      if (fieldData) {
        const hourlyProduction = calculateProduction(fieldData.baseProduction, field.level);
        production[fieldData.produces] += hourlyProduction;
      }
    }
  }

  // Apply oasis bonuses (maximum 3 oases per village)
  const oasesToApply = village.ownedOases.slice(0, 3);
  const oasisBonuses: Record<ResourceType, number> = {
    lumber: 0,
    clay: 0,
    iron: 0,
    crop: 0,
  };

  for (const oasis of oasesToApply) {
    // Parse oasis type to get resource and bonus percentage
    // Format: 'lumber25', 'lumber50', 'clay25', 'clay50', etc.
    const match = oasis.type.match(/^(lumber|clay|iron|crop)(\d+)$/);
    if (match) {
      const resourceType = match[1] as ResourceType;
      const bonusPercent = parseInt(match[2]);
      oasisBonuses[resourceType] += bonusPercent;
    }
  }

  // Apply oasis bonuses to production
  for (const resourceType of Object.keys(production) as ResourceType[]) {
    if (oasisBonuses[resourceType] > 0) {
      const baseProduction = production[resourceType];
      const bonusProduction = (baseProduction * oasisBonuses[resourceType]) / 100;
      production[resourceType] = baseProduction + bonusProduction;
    }
  }

  // Apply resource bonuses from gold purchases
  const activeResourceBonuses = village.user.resourceBonuses.filter(
    (bonus) => new Date(bonus.expiresAt) > now
  );

  for (const bonus of activeResourceBonuses) {
    const resourceType = bonus.resourceType as ResourceType;
    if (resourceType in production) {
      const baseProduction = production[resourceType];
      const bonusProduction = (baseProduction * bonus.bonusPercent) / 100;
      production[resourceType] = baseProduction + bonusProduction;
    }
  }

  // Calculate troop upkeep (crop consumption)
  let cropConsumption = village.population; // Base population consumption

  // Import UNIT_DATA for upkeep calculation
  const { UNIT_DATA } = await import('@travian/shared');

  // Calculate cavalry consumption separately for Horse Drinking Trough bonus
  const cavalryUnits = new Set([
    'equites_legati', 'equites_imperatoris', 'equites_caesaris',
    'pathfinder', 'theutates_thunder', 'druidrider', 'haeduan',
    'scout', 'paladin', 'teutonic_knight',
  ]);

  let cavalryConsumption = 0;
  let infantryConsumption = 0;

  for (const troop of village.troops) {
    const unitData = UNIT_DATA[troop.unitType];
    if (unitData) {
      const consumption = unitData.upkeep * troop.quantity;
      if (cavalryUnits.has(troop.unitType)) {
        cavalryConsumption += consumption;
      } else {
        infantryConsumption += consumption;
      }
    }
  }

  // Apply Horse Drinking Trough reduction for Romans only
  const horsedrinkingTrough = village.buildings.find((b) => b.type === 'horse_drinking_trough');
  if (horsedrinkingTrough && horsedrinkingTrough.level > 0) {
    // 1% reduction per level (max 20%)
    const reduction = horsedrinkingTrough.level / 100;
    cavalryConsumption *= (1 - reduction);
  }

  cropConsumption += infantryConsumption + cavalryConsumption;

  // Net crop production
  const netCropProduction = production.crop - cropConsumption;

  // Calculate storage capacities from warehouse/granary buildings
  let warehouseCapacity = village.warehouseCapacity;
  let granaryCapacity = village.granaryCapacity;

  for (const building of village.buildings) {
    if (building.type === 'warehouse' && building.level > 0) {
      warehouseCapacity = calculateStorageCapacity(building.level);
    }
    if (building.type === 'granary' && building.level > 0) {
      granaryCapacity = calculateStorageCapacity(building.level);
    }
  }

  // Calculate new resource amounts
  let newLumber = village.lumber + production.lumber * hoursElapsed;
  let newClay = village.clay + production.clay * hoursElapsed;
  let newIron = village.iron + production.iron * hoursElapsed;
  let newCrop = village.crop + netCropProduction * hoursElapsed;

  // Cap at storage limits
  newLumber = Math.min(newLumber, warehouseCapacity);
  newClay = Math.min(newClay, warehouseCapacity);
  newIron = Math.min(newIron, warehouseCapacity);
  newCrop = Math.min(Math.max(newCrop, 0), granaryCapacity); // Crop can go to 0 but not negative

  return {
    lumber: Math.floor(newLumber),
    clay: Math.floor(newClay),
    iron: Math.floor(newIron),
    crop: Math.floor(newCrop),
    warehouseCapacity,
    granaryCapacity,
    production: {
      lumber: Math.floor(production.lumber),
      clay: Math.floor(production.clay),
      iron: Math.floor(production.iron),
      crop: Math.floor(netCropProduction),
    },
    cropConsumption: Math.floor(cropConsumption),
  };
}

/**
 * Update village resources in the database
 */
export async function updateVillageResources(villageId: string): Promise<VillageResources> {
  const resources = await calculateVillageResources(villageId);

  await prisma.village.update({
    where: { id: villageId },
    data: {
      lumber: resources.lumber,
      clay: resources.clay,
      iron: resources.iron,
      crop: resources.crop,
      warehouseCapacity: resources.warehouseCapacity,
      granaryCapacity: resources.granaryCapacity,
      resourcesLastCalculatedAt: new Date(),
    },
  });

  return resources;
}

/**
 * Check if village has enough resources for a cost
 */
export async function hasEnoughResources(
  villageId: string,
  cost: Resources
): Promise<{ hasEnough: boolean; current: VillageResources }> {
  const current = await calculateVillageResources(villageId);

  const hasEnough =
    current.lumber >= cost.lumber &&
    current.clay >= cost.clay &&
    current.iron >= cost.iron &&
    current.crop >= cost.crop;

  return { hasEnough, current };
}

/**
 * Deduct resources from a village
 */
export async function deductResources(villageId: string, cost: Resources): Promise<void> {
  // First update to current calculated values
  const current = await updateVillageResources(villageId);

  // Then deduct cost
  await prisma.village.update({
    where: { id: villageId },
    data: {
      lumber: current.lumber - cost.lumber,
      clay: current.clay - cost.clay,
      iron: current.iron - cost.iron,
      crop: current.crop - cost.crop,
      resourcesLastCalculatedAt: new Date(),
    },
  });
}

/**
 * Add resources to a village (e.g., from raiding)
 */
export async function addResources(villageId: string, resources: Resources): Promise<void> {
  const current = await updateVillageResources(villageId);

  await prisma.village.update({
    where: { id: villageId },
    data: {
      lumber: Math.min(current.lumber + resources.lumber, current.warehouseCapacity),
      clay: Math.min(current.clay + resources.clay, current.warehouseCapacity),
      iron: Math.min(current.iron + resources.iron, current.warehouseCapacity),
      crop: Math.min(current.crop + resources.crop, current.granaryCapacity),
      resourcesLastCalculatedAt: new Date(),
    },
  });
}
