import { useState } from 'react';
import { useGameStore } from '../stores/gameStore';
import { buildingApi } from '../services/api';
import { BUILDING_DATA, calculateCostMultiplier } from '@travian/shared';
import type { BuildingType, Resources } from '@travian/shared';
import { Timer } from '../components/Timer';
import styles from './VillageView.module.css';

// Classic Travian village center layout (22 building slots in a grid)
const BUILDING_POSITIONS = [
  { slot: 1, x: 20, y: 15 },
  { slot: 2, x: 40, y: 10 },
  { slot: 3, x: 60, y: 10 },
  { slot: 4, x: 80, y: 15 },
  { slot: 5, x: 10, y: 30 },
  { slot: 6, x: 30, y: 25 },
  { slot: 7, x: 50, y: 22 },
  { slot: 8, x: 70, y: 25 },
  { slot: 9, x: 90, y: 30 },
  { slot: 10, x: 15, y: 48 },
  { slot: 11, x: 35, y: 45 },
  { slot: 12, x: 65, y: 45 },
  { slot: 13, x: 85, y: 48 },
  { slot: 14, x: 10, y: 65 },
  { slot: 15, x: 30, y: 62 },
  { slot: 16, x: 50, y: 58 }, // Rally Point (center)
  { slot: 17, x: 70, y: 62 },
  { slot: 18, x: 90, y: 65 },
  { slot: 19, x: 25, y: 80 },
  { slot: 20, x: 50, y: 85 }, // Wall position
  { slot: 21, x: 75, y: 80 },
  { slot: 22, x: 50, y: 75 },
];

// Building sprite paths
function getBuildingSprite(type: BuildingType | null): string {
  if (!type) return '/assets/buildings/empty.svg';

  const spriteMap: Partial<Record<BuildingType, string>> = {
    main_building: '/assets/buildings/main_building.svg',
    warehouse: '/assets/buildings/warehouse.svg',
    granary: '/assets/buildings/granary.svg',
    barracks: '/assets/buildings/barracks.svg',
    stable: '/assets/buildings/stable.svg',
    workshop: '/assets/buildings/workshop.svg',
    academy: '/assets/buildings/academy.svg',
    smithy: '/assets/buildings/smithy.svg',
    rally_point: '/assets/buildings/rally_point.svg',
    marketplace: '/assets/buildings/marketplace.svg',
    embassy: '/assets/buildings/embassy.svg',
    wall: '/assets/buildings/wall.svg',
    residence: '/assets/buildings/residence.svg',
    cranny: '/assets/buildings/cranny.svg',
  };

  return spriteMap[type] || '/assets/buildings/empty.svg';
}

export function VillageView() {
  const currentVillage = useGameStore((state) => state.currentVillage);
  const updateBuilding = useGameStore((state) => state.updateBuilding);
  const [selectedSlot, setSelectedSlot] = useState<number | null>(null);
  const [isUpgrading, setIsUpgrading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [availableBuildings, setAvailableBuildings] = useState<any[]>([]);

  if (!currentVillage) {
    return <div className={styles.loading}>Loading village...</div>;
  }

  const selectedBuilding = selectedSlot
    ? currentVillage.buildings.find((b) => b.slot === selectedSlot)
    : null;

  const buildingInfo = selectedBuilding?.type
    ? BUILDING_DATA[selectedBuilding.type as BuildingType]
    : null;

  async function handleSelectSlot(slot: number) {
    if (selectedSlot === slot) {
      setSelectedSlot(null);
      return;
    }

    setSelectedSlot(slot);
    setError(null);

    // Load available buildings for empty slots
    const building = currentVillage!.buildings.find((b) => b.slot === slot);
    if (!building?.type) {
      try {
        const response = await buildingApi.getSlot(currentVillage!.id, slot);
        setAvailableBuildings(response.data.availableBuildings || []);
      } catch (err) {
        console.error('Failed to load available buildings:', err);
      }
    }
  }

  async function handleUpgrade(buildingType?: string) {
    if (!selectedSlot || !currentVillage) return;

    setIsUpgrading(true);
    setError(null);

    try {
      const response = await buildingApi.upgrade(currentVillage.id, selectedSlot, buildingType);

      updateBuilding(currentVillage.id, selectedSlot, {
        type: response.data.type,
        upgradeEndsAt: response.data.endsAt,
      });

      setSelectedSlot(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Upgrade failed');
    } finally {
      setIsUpgrading(false);
    }
  }

  function calculateUpgradeCost(baseCost: Resources, targetLevel: number): Resources {
    const multiplier = calculateCostMultiplier(targetLevel);
    return {
      lumber: Math.floor(baseCost.lumber * multiplier),
      clay: Math.floor(baseCost.clay * multiplier),
      iron: Math.floor(baseCost.iron * multiplier),
      crop: Math.floor(baseCost.crop * multiplier),
    };
  }

  function canAfford(cost: Resources): boolean {
    return (
      currentVillage!.resources.lumber >= cost.lumber &&
      currentVillage!.resources.clay >= cost.clay &&
      currentVillage!.resources.iron >= cost.iron &&
      currentVillage!.resources.crop >= cost.crop
    );
  }

  // Check if any construction is in progress
  const constructionInProgress = currentVillage.buildings.some((b) => b.upgradeEndsAt);

  return (
    <div className={styles.container}>
      <div className={styles.villageMap}>
        {/* Building slots */}
        {BUILDING_POSITIONS.map((pos) => {
          const building = currentVillage.buildings.find((b) => b.slot === pos.slot);
          if (!building) return null;

          const isSelected = selectedSlot === pos.slot;
          const isUpgradingSlot = building.upgradeEndsAt !== null;
          const isEmpty = !building.type;

          return (
            <button
              key={pos.slot}
              className={`${styles.buildingSlot} ${isSelected ? styles.selected : ''} ${
                isUpgradingSlot ? styles.upgrading : ''
              } ${isEmpty ? styles.empty : ''}`}
              style={{
                left: `${pos.x}%`,
                top: `${pos.y}%`,
              }}
              onClick={() => handleSelectSlot(pos.slot)}
              title={
                building.type
                  ? `${BUILDING_DATA[building.type as BuildingType]?.name} (Level ${building.level})`
                  : 'Empty slot'
              }
            >
              <img
                src={getBuildingSprite(building.type as BuildingType)}
                alt={building.type || 'empty'}
                className={styles.buildingSprite}
              />
              {!isEmpty && (
                <span className={styles.buildingLevel}>{building.level}</span>
              )}
              {isUpgradingSlot && (
                <div className={styles.slotTimer}>
                  <Timer endsAt={building.upgradeEndsAt!} />
                </div>
              )}
            </button>
          );
        })}

        {/* Village name overlay */}
        <div className={styles.villageLabel}>
          <h2>{currentVillage.name}</h2>
          <span>Village Center</span>
        </div>
      </div>

      {/* Selected building info panel */}
      {selectedBuilding && (
        <div className={`panel ${styles.infoPanel}`}>
          <div className="panel-header">
            {buildingInfo ? `${buildingInfo.name} (Level ${selectedBuilding.level})` : 'Empty Building Slot'}
          </div>
          <div className="panel-body">
            {error && <div className="alert alert-error m-2">{error}</div>}

            {selectedBuilding.upgradeEndsAt ? (
              <div className={styles.upgradingInfo}>
                <p>
                  {buildingInfo
                    ? `Upgrading to level ${selectedBuilding.level + 1}`
                    : 'Building in progress'}
                </p>
                <Timer endsAt={selectedBuilding.upgradeEndsAt} showLabel />
              </div>
            ) : buildingInfo ? (
              // Existing building - show upgrade option
              <>
                <p className={styles.description}>{buildingInfo.description}</p>

                {selectedBuilding.level < buildingInfo.maxLevel && (
                  <div className={styles.upgradeSection}>
                    {constructionInProgress ? (
                      <div className="alert alert-warning">
                        Another construction is in progress
                      </div>
                    ) : (
                      <>
                        <h4>Upgrade to Level {selectedBuilding.level + 1}</h4>
                        <CostDisplay
                          cost={calculateUpgradeCost(buildingInfo.baseCost, selectedBuilding.level + 1)}
                          resources={currentVillage.resources}
                        />
                        <button
                          className="btn btn-primary"
                          onClick={() => handleUpgrade()}
                          disabled={
                            !canAfford(
                              calculateUpgradeCost(buildingInfo.baseCost, selectedBuilding.level + 1)
                            ) || isUpgrading
                          }
                        >
                          {isUpgrading ? 'Building...' : 'Upgrade'}
                        </button>
                      </>
                    )}
                  </div>
                )}

                {selectedBuilding.level >= buildingInfo.maxLevel && (
                  <div className={styles.maxLevel}>Maximum level reached!</div>
                )}
              </>
            ) : (
              // Empty slot - show available buildings
              <div className={styles.buildingList}>
                {constructionInProgress ? (
                  <div className="alert alert-warning">
                    Another construction is in progress
                  </div>
                ) : (
                  <>
                    <h4>Construct a Building</h4>
                    {availableBuildings.map((b) => {
                      const affordable = canAfford(b.cost);
                      return (
                        <div
                          key={b.type}
                          className={`${styles.buildingOption} ${!affordable ? styles.cantAfford : ''}`}
                        >
                          <div className={styles.buildingOptionHeader}>
                            <img
                              src={getBuildingSprite(b.type as BuildingType)}
                              alt={b.type}
                              className={styles.buildingOptionSprite}
                            />
                            <strong>{b.name}</strong>
                          </div>
                          <CostDisplay cost={b.cost} resources={currentVillage.resources} compact />
                          <button
                            className="btn btn-primary btn-sm"
                            onClick={() => handleUpgrade(b.type)}
                            disabled={!affordable || isUpgrading}
                          >
                            Build
                          </button>
                        </div>
                      );
                    })}
                  </>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// Cost display component
function CostDisplay({
  cost,
  resources,
  compact,
}: {
  cost: Resources;
  resources: Resources;
  compact?: boolean;
}) {
  const items = [
    { type: 'lumber', value: cost.lumber, current: resources.lumber, color: '#8B4513' },
    { type: 'clay', value: cost.clay, current: resources.clay, color: '#CD853F' },
    { type: 'iron', value: cost.iron, current: resources.iron, color: '#708090' },
    { type: 'crop', value: cost.crop, current: resources.crop, color: '#DAA520' },
  ];

  return (
    <div className={compact ? styles.costGridCompact : styles.costGrid}>
      {items.map((item) => (
        <div key={item.type} className={styles.costItem}>
          <span className={styles.costIcon} style={{ backgroundColor: item.color }} />
          <span className={item.current < item.value ? styles.notEnough : ''}>
            {item.value.toLocaleString()}
          </span>
        </div>
      ))}
    </div>
  );
}
