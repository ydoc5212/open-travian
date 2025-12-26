import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useGameStore } from '../stores/gameStore';
import { buildingApi } from '../services/api';
import { BUILDING_DATA, calculateCostMultiplier } from '@travian/shared';
import type { BuildingType, Resources } from '@travian/shared';
import { Timer } from '../components/Timer';
import { ResourceIcon, ResourceType } from '../components/ResourceIcon';
import styles from './VillageView.module.css';

// Travian bg0.jpg village center building slot positions
// Precisely calibrated to TravianZ bg0.jpg (556x406px)
const BUILDING_POSITIONS = [
  // Row 1 - top (4 slots)
  { slot: 1, x: 18, y: 8 },
  { slot: 2, x: 38, y: 5 },
  { slot: 3, x: 62, y: 5 },
  { slot: 4, x: 82, y: 8 },
  // Row 2 (5 slots)
  { slot: 5, x: 8, y: 22 },
  { slot: 6, x: 28, y: 18 },
  { slot: 7, x: 50, y: 15 },
  { slot: 8, x: 72, y: 18 },
  { slot: 9, x: 92, y: 22 },
  // Row 3 (4 slots)
  { slot: 10, x: 15, y: 38 },
  { slot: 11, x: 38, y: 35 },
  { slot: 12, x: 62, y: 35 },
  { slot: 13, x: 85, y: 38 },
  // Row 4 (5 slots) - includes rally point
  { slot: 14, x: 8, y: 55 },
  { slot: 15, x: 28, y: 52 },
  { slot: 16, x: 50, y: 50 }, // Rally Point (center)
  { slot: 17, x: 72, y: 52 },
  { slot: 18, x: 92, y: 55 },
  // Row 5 - bottom (4 slots)
  { slot: 19, x: 22, y: 72 },
  { slot: 20, x: 50, y: 88 }, // Wall position
  { slot: 21, x: 78, y: 72 },
  { slot: 22, x: 50, y: 68 },
];


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

        {/* Resource fields link - click to exit to resource view */}
        <Link to="/" className={styles.resourceFieldsLink} title="Exit to Resource Fields">
          Resource Fields
        </Link>
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

                {/* Special building navigation */}
                {selectedBuilding.type === 'town_hall' && selectedBuilding.level > 0 && (
                  <Link
                    to={`/town-hall/${currentVillage.id}`}
                    className="btn btn-primary mb-2"
                    style={{ display: 'block', textAlign: 'center' }}
                  >
                    Hold Celebration
                  </Link>
                )}
                {selectedBuilding.type === 'heros_mansion' && selectedBuilding.level > 0 && (
                  <Link
                    to="/adventures"
                    className="btn btn-primary mb-2"
                    style={{ display: 'block', textAlign: 'center' }}
                  >
                    View Adventures
                  </Link>
                )}

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
  const items: { type: ResourceType; value: number; current: number }[] = [
    { type: 'lumber', value: cost.lumber, current: resources.lumber },
    { type: 'clay', value: cost.clay, current: resources.clay },
    { type: 'iron', value: cost.iron, current: resources.iron },
    { type: 'crop', value: cost.crop, current: resources.crop },
  ];

  return (
    <div className={compact ? styles.costGridCompact : styles.costGrid}>
      {items.map((item) => (
        <div key={item.type} className={styles.costItem}>
          <ResourceIcon type={item.type} size="small" />
          <span className={item.current < item.value ? styles.notEnough : ''}>
            {item.value.toLocaleString()}
          </span>
        </div>
      ))}
    </div>
  );
}
