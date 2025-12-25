import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useGameStore } from '../stores/gameStore';
import { resourceApi } from '../services/api';
import { RESOURCE_FIELD_DATA, calculateCostMultiplier } from '@travian/shared';
import type { ResourceFieldType, Resources } from '@travian/shared';
import { Timer } from '../components/Timer';
import { ResourceIcon } from '../components/ResourceIcon';
import styles from './ResourceFieldsView.module.css';

// Travian f1.jpg resource field layout positions (4-4-4-6 village type)
// Precisely calibrated to TravianZ f1.jpg (556x408px)
const FIELD_POSITIONS = [
  // Top row - 3 fields
  { slot: 1, x: 28, y: 6 },
  { slot: 2, x: 50, y: 3 },
  { slot: 3, x: 72, y: 6 },
  // Upper left/right
  { slot: 4, x: 8, y: 18 },
  { slot: 5, x: 92, y: 18 },
  // Mid-upper left/right
  { slot: 6, x: 15, y: 35 },
  { slot: 7, x: 85, y: 35 },
  // Middle row - 4 fields around center
  { slot: 8, x: 6, y: 52 },
  { slot: 9, x: 30, y: 50 },
  { slot: 10, x: 70, y: 50 },
  { slot: 11, x: 94, y: 52 },
  // Lower left/right
  { slot: 12, x: 15, y: 68 },
  { slot: 13, x: 85, y: 68 },
  // Bottom row - 5 fields (croplands)
  { slot: 14, x: 8, y: 85 },
  { slot: 15, x: 28, y: 90 },
  { slot: 16, x: 50, y: 93 },
  { slot: 17, x: 72, y: 90 },
  { slot: 18, x: 92, y: 85 },
];

// Field type for tooltip display
const FIELD_NAMES: Record<ResourceFieldType, string> = {
  woodcutter: 'Woodcutter',
  clay_pit: 'Clay Pit',
  iron_mine: 'Iron Mine',
  cropland: 'Cropland',
};

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
        {/* Village center - clickable to go to village view */}
        <Link to="/village" className={styles.villageCenter} title="Enter Village">
          <span className={styles.villageName}>{currentVillage.name}</span>
        </Link>

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
              title={`${FIELD_NAMES[fieldType]} (Level ${field.level})`}
            >
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
                              <ResourceIcon type="lumber" size="small" />
                              <span className={currentVillage.resources.lumber < cost.lumber ? styles.notEnough : ''}>
                                {cost.lumber.toLocaleString()}
                              </span>
                            </div>
                            <div className={styles.costItem}>
                              <ResourceIcon type="clay" size="small" />
                              <span className={currentVillage.resources.clay < cost.clay ? styles.notEnough : ''}>
                                {cost.clay.toLocaleString()}
                              </span>
                            </div>
                            <div className={styles.costItem}>
                              <ResourceIcon type="iron" size="small" />
                              <span className={currentVillage.resources.iron < cost.iron ? styles.notEnough : ''}>
                                {cost.iron.toLocaleString()}
                              </span>
                            </div>
                            <div className={styles.costItem}>
                              <ResourceIcon type="crop" size="small" />
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
