import { useState } from 'react';
import { useGameStore } from '../stores/gameStore';
import { resourceApi } from '../services/api';
import { RESOURCE_FIELD_DATA, calculateCostMultiplier } from '@travian/shared';
import type { ResourceFieldType, Resources } from '@travian/shared';
import { Timer } from '../components/Timer';
import styles from './ResourceFieldsView.module.css';

// Classic Travian resource field layout (outer ring of village)
// The positions are arranged in a rough circle
const FIELD_POSITIONS = [
  { slot: 1, x: 50, y: 10 },   // Top
  { slot: 2, x: 75, y: 15 },
  { slot: 3, x: 90, y: 35 },
  { slot: 4, x: 95, y: 55 },  // Right
  { slot: 5, x: 90, y: 75 },
  { slot: 6, x: 75, y: 90 },
  { slot: 7, x: 50, y: 95 },  // Bottom
  { slot: 8, x: 25, y: 90 },
  { slot: 9, x: 10, y: 75 },
  { slot: 10, x: 5, y: 55 },  // Left
  { slot: 11, x: 10, y: 35 },
  { slot: 12, x: 25, y: 15 },
  { slot: 13, x: 35, y: 30 }, // Inner ring
  { slot: 14, x: 65, y: 30 },
  { slot: 15, x: 75, y: 50 },
  { slot: 16, x: 65, y: 70 },
  { slot: 17, x: 35, y: 70 },
  { slot: 18, x: 25, y: 50 },
];

const FIELD_COLORS: Record<ResourceFieldType, string> = {
  woodcutter: '#228B22',
  clay_pit: '#CD853F',
  iron_mine: '#708090',
  cropland: '#DAA520',
};

// Field sprite paths
function getFieldSprite(type: ResourceFieldType): string {
  const spriteMap: Record<ResourceFieldType, string> = {
    woodcutter: '/assets/fields/woodcutter.svg',
    clay_pit: '/assets/fields/clay_pit.svg',
    iron_mine: '/assets/fields/iron_mine.svg',
    cropland: '/assets/fields/cropland.svg',
  };
  return spriteMap[type];
}

export function ResourceFieldsView() {
  const currentVillage = useGameStore((state) => state.currentVillage);
  const updateResourceField = useGameStore((state) => state.updateResourceField);
  const [selectedField, setSelectedField] = useState<number | null>(null);
  const [isUpgrading, setIsUpgrading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!currentVillage) {
    return <div className={styles.loading}>Loading village...</div>;
  }

  const selectedFieldData = selectedField
    ? currentVillage.resourceFields.find((f) => f.slot === selectedField)
    : null;

  const fieldInfo = selectedFieldData
    ? RESOURCE_FIELD_DATA[selectedFieldData.type as ResourceFieldType]
    : null;

  async function handleUpgrade() {
    if (!selectedField || !currentVillage) return;

    setIsUpgrading(true);
    setError(null);

    try {
      const response = await resourceApi.upgradeField(currentVillage.id, selectedField);

      // Update local state with upgrade info
      updateResourceField(currentVillage.id, selectedField, {
        upgradeEndsAt: response.data.endsAt,
      });

      setSelectedField(null);
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

  return (
    <div className={styles.container}>
      <div className={styles.fieldMap}>
        {/* Village center icon */}
        <div className={styles.villageCenter}>
          <span>🏰</span>
          <span className={styles.villageName}>{currentVillage.name}</span>
        </div>

        {/* Resource fields */}
        {FIELD_POSITIONS.map((pos) => {
          const field = currentVillage.resourceFields.find((f) => f.slot === pos.slot);
          if (!field) return null;

          const isSelected = selectedField === pos.slot;
          const isUpgradingField = field.upgradeEndsAt !== null;
          const fieldType = field.type as ResourceFieldType;

          return (
            <button
              key={pos.slot}
              className={`${styles.field} ${isSelected ? styles.selected : ''} ${
                isUpgradingField ? styles.upgrading : ''
              }`}
              style={{
                left: `${pos.x}%`,
                top: `${pos.y}%`,
              }}
              onClick={() => setSelectedField(isSelected ? null : pos.slot)}
              title={`${RESOURCE_FIELD_DATA[fieldType].name} (Level ${field.level})`}
            >
              <img
                src={getFieldSprite(fieldType)}
                alt={fieldType}
                className={styles.fieldSprite}
              />
              <span className={styles.fieldLevel}>{field.level}</span>
              {isUpgradingField && (
                <div className={styles.fieldTimer}>
                  <Timer endsAt={field.upgradeEndsAt!} />
                </div>
              )}
            </button>
          );
        })}
      </div>

      {/* Selected field info panel */}
      {selectedFieldData && fieldInfo && (
        <div className={`panel ${styles.infoPanel}`}>
          <div className="panel-header">
            {fieldInfo.name} (Level {selectedFieldData.level})
          </div>
          <div className="panel-body">
            {error && <div className="alert alert-error m-2">{error}</div>}

            {selectedFieldData.upgradeEndsAt ? (
              <div className={styles.upgradingInfo}>
                <p>Upgrading to level {selectedFieldData.level + 1}</p>
                <Timer endsAt={selectedFieldData.upgradeEndsAt} showLabel />
              </div>
            ) : (
              <>
                <div className={styles.fieldStats}>
                  <div>
                    <span className="text-muted">Produces:</span>
                    <strong> {fieldInfo.produces}</strong>
                  </div>
                  <div>
                    <span className="text-muted">Current production:</span>
                    <strong> ~{Math.floor(fieldInfo.baseProduction * selectedFieldData.level * Math.pow(1.5, selectedFieldData.level / 5))}/h</strong>
                  </div>
                </div>

                {selectedFieldData.level < (currentVillage.isCapital ? 20 : 10) && (
                  <div className={styles.upgradeSection}>
                    <h4>Upgrade to Level {selectedFieldData.level + 1}</h4>
                    <div className={styles.costGrid}>
                      {(() => {
                        const cost = calculateUpgradeCost(
                          fieldInfo.baseCost,
                          selectedFieldData.level + 1
                        );
                        const canAfford =
                          currentVillage.resources.lumber >= cost.lumber &&
                          currentVillage.resources.clay >= cost.clay &&
                          currentVillage.resources.iron >= cost.iron &&
                          currentVillage.resources.crop >= cost.crop;

                        return (
                          <>
                            <div className={styles.costItem}>
                              <span className={styles.costIcon} style={{ backgroundColor: '#8B4513' }} />
                              <span className={currentVillage.resources.lumber < cost.lumber ? styles.notEnough : ''}>
                                {cost.lumber.toLocaleString()}
                              </span>
                            </div>
                            <div className={styles.costItem}>
                              <span className={styles.costIcon} style={{ backgroundColor: '#CD853F' }} />
                              <span className={currentVillage.resources.clay < cost.clay ? styles.notEnough : ''}>
                                {cost.clay.toLocaleString()}
                              </span>
                            </div>
                            <div className={styles.costItem}>
                              <span className={styles.costIcon} style={{ backgroundColor: '#708090' }} />
                              <span className={currentVillage.resources.iron < cost.iron ? styles.notEnough : ''}>
                                {cost.iron.toLocaleString()}
                              </span>
                            </div>
                            <div className={styles.costItem}>
                              <span className={styles.costIcon} style={{ backgroundColor: '#DAA520' }} />
                              <span className={currentVillage.resources.crop < cost.crop ? styles.notEnough : ''}>
                                {cost.crop.toLocaleString()}
                              </span>
                            </div>
                            <button
                              className="btn btn-primary"
                              onClick={handleUpgrade}
                              disabled={!canAfford || isUpgrading}
                            >
                              {isUpgrading ? 'Upgrading...' : 'Upgrade'}
                            </button>
                          </>
                        );
                      })()}
                    </div>
                  </div>
                )}

                {selectedFieldData.level >= (currentVillage.isCapital ? 20 : 10) && (
                  <div className={styles.maxLevel}>Maximum level reached!</div>
                )}
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
