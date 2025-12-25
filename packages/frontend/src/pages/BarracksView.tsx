import { useState, useEffect } from 'react';
import { useGameStore } from '../stores/gameStore';
import { troopsApi } from '../services/api';
import { UNIT_DATA, UNIT_IMAGE_IDS } from '@travian/shared';
import type { Resources } from '@travian/shared';
import { Timer } from '../components/Timer';
import { ResourceIcon } from '../components/ResourceIcon';
import styles from './BarracksView.module.css';

// Helper to get unit image path
function getUnitImagePath(unitType: string): string {
  const imageId = UNIT_IMAGE_IDS[unitType];
  if (imageId) {
    return `/assets/units/travian/${imageId}.gif`;
  }
  return `/assets/units/${unitType}.svg`;
}

interface AvailableUnit {
  type: string;
  name: string;
  attack: number;
  defenseInfantry: number;
  defenseCavalry: number;
  speed: number;
  carryCapacity: number;
  upkeep: number;
  cost: Resources;
  trainingTime: number;
  buildingType: string;
}

interface TrainingQueueItem {
  unitType: string;
  quantity: number;
  completesAt: string;
}

interface CurrentTroop {
  unitType: string;
  quantity: number;
}

export function BarracksView() {
  const currentVillage = useGameStore((state) => state.currentVillage);
  const [availableUnits, setAvailableUnits] = useState<AvailableUnit[]>([]);
  const [currentTroops, setCurrentTroops] = useState<CurrentTroop[]>([]);
  const [trainingQueue, setTrainingQueue] = useState<TrainingQueueItem[]>([]);
  const [selectedUnit, setSelectedUnit] = useState<string | null>(null);
  const [quantity, setQuantity] = useState(1);
  const [isTraining, setIsTraining] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (currentVillage) {
      loadTroopData();
    }
  }, [currentVillage?.id]);

  async function loadTroopData() {
    if (!currentVillage) return;

    try {
      setLoading(true);
      const response = await troopsApi.getAvailable(currentVillage.id);
      setAvailableUnits(response.data.availableUnits);
      setCurrentTroops(response.data.currentTroops);
      setTrainingQueue(response.data.trainingQueue);
    } catch (err) {
      console.error('Failed to load troop data:', err);
    } finally {
      setLoading(false);
    }
  }

  async function handleTrain() {
    if (!selectedUnit || !currentVillage || quantity < 1) return;

    setIsTraining(true);
    setError(null);

    try {
      await troopsApi.train(currentVillage.id, selectedUnit, quantity);
      await loadTroopData();
      setQuantity(1);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Training failed');
    } finally {
      setIsTraining(false);
    }
  }

  function canAfford(cost: Resources, qty: number): boolean {
    if (!currentVillage) return false;
    return (
      currentVillage.resources.lumber >= cost.lumber * qty &&
      currentVillage.resources.clay >= cost.clay * qty &&
      currentVillage.resources.iron >= cost.iron * qty &&
      currentVillage.resources.crop >= cost.crop * qty
    );
  }

  function getMaxAffordable(cost: Resources): number {
    if (!currentVillage) return 0;
    return Math.min(
      Math.floor(currentVillage.resources.lumber / cost.lumber),
      Math.floor(currentVillage.resources.clay / cost.clay),
      Math.floor(currentVillage.resources.iron / cost.iron),
      Math.floor(currentVillage.resources.crop / cost.crop)
    );
  }

  function formatTime(seconds: number): string {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = seconds % 60;
    return `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  }

  if (!currentVillage) {
    return <div className={styles.loading}>Loading village...</div>;
  }

  if (loading) {
    return <div className={styles.loading}>Loading troops...</div>;
  }

  const selectedUnitData = selectedUnit ? availableUnits.find((u) => u.type === selectedUnit) : null;

  return (
    <div className={styles.container}>
      <div className={styles.mainPanel}>
        <div className="panel">
          <div className="panel-header">Barracks - Train Troops</div>
          <div className="panel-body">
            {error && <div className="alert alert-error">{error}</div>}

            {availableUnits.length === 0 ? (
              <div className={styles.noUnits}>
                <p>No units available for training.</p>
                <p className="text-muted">Build a Barracks, Stable, or Workshop to train troops.</p>
              </div>
            ) : (
              <div className={styles.unitsGrid}>
                {availableUnits.map((unit) => {
                  const isSelected = selectedUnit === unit.type;
                  const affordable = canAfford(unit.cost, 1);

                  return (
                    <button
                      key={unit.type}
                      className={`${styles.unitCard} ${isSelected ? styles.selected : ''} ${
                        !affordable ? styles.cantAfford : ''
                      }`}
                      onClick={() => setSelectedUnit(isSelected ? null : unit.type)}
                    >
                      <div className={styles.unitIcon}>
                        <img
                          src={getUnitImagePath(unit.type)}
                          alt={unit.name}
                          onError={(e) => {
                            (e.target as HTMLImageElement).src = '/assets/units/default.svg';
                          }}
                        />
                      </div>
                      <div className={styles.unitInfo}>
                        <span className={styles.unitName}>{unit.name}</span>
                        <span className={styles.unitStats}>
                          ATK: {unit.attack} | DEF: {unit.defenseInfantry}/{unit.defenseCavalry}
                        </span>
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* Training Queue */}
        {trainingQueue.length > 0 && (
          <div className="panel">
            <div className="panel-header">Training Queue</div>
            <div className="panel-body">
              <div className={styles.queue}>
                {trainingQueue.map((item, idx) => {
                  const unitData = UNIT_DATA[item.unitType];
                  return (
                    <div key={idx} className={styles.queueItem}>
                      <span className={styles.queueUnitName}>
                        {unitData?.name || item.unitType} x{item.quantity}
                      </span>
                      <Timer endsAt={item.completesAt} />
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Selected Unit Detail Panel */}
      {selectedUnitData && (
        <div className={`panel ${styles.detailPanel}`}>
          <div className="panel-header">{selectedUnitData.name}</div>
          <div className="panel-body">
            <div className={styles.statsGrid}>
              <div className={styles.statRow}>
                <span>Attack:</span>
                <strong>{selectedUnitData.attack}</strong>
              </div>
              <div className={styles.statRow}>
                <span>Defense (Infantry):</span>
                <strong>{selectedUnitData.defenseInfantry}</strong>
              </div>
              <div className={styles.statRow}>
                <span>Defense (Cavalry):</span>
                <strong>{selectedUnitData.defenseCavalry}</strong>
              </div>
              <div className={styles.statRow}>
                <span>Speed:</span>
                <strong>{selectedUnitData.speed} fields/h</strong>
              </div>
              <div className={styles.statRow}>
                <span>Carry Capacity:</span>
                <strong>{selectedUnitData.carryCapacity}</strong>
              </div>
              <div className={styles.statRow}>
                <span>Upkeep:</span>
                <strong>{selectedUnitData.upkeep} crop/h</strong>
              </div>
              <div className={styles.statRow}>
                <span>Training Time:</span>
                <strong>{formatTime(selectedUnitData.trainingTime)}</strong>
              </div>
            </div>

            <div className={styles.costSection}>
              <h4>Cost per Unit</h4>
              <div className={styles.costGrid}>
                <div className={styles.costItem}>
                  <ResourceIcon type="lumber" size="small" />
                  <span>{selectedUnitData.cost.lumber}</span>
                </div>
                <div className={styles.costItem}>
                  <ResourceIcon type="clay" size="small" />
                  <span>{selectedUnitData.cost.clay}</span>
                </div>
                <div className={styles.costItem}>
                  <ResourceIcon type="iron" size="small" />
                  <span>{selectedUnitData.cost.iron}</span>
                </div>
                <div className={styles.costItem}>
                  <ResourceIcon type="crop" size="small" />
                  <span>{selectedUnitData.cost.crop}</span>
                </div>
              </div>
            </div>

            <div className={styles.trainSection}>
              <h4>Train Units</h4>
              <div className={styles.quantityRow}>
                <input
                  type="number"
                  min={1}
                  max={getMaxAffordable(selectedUnitData.cost)}
                  value={quantity}
                  onChange={(e) => setQuantity(Math.max(1, parseInt(e.target.value) || 1))}
                  className={styles.quantityInput}
                />
                <button
                  className="btn btn-secondary btn-sm"
                  onClick={() => setQuantity(getMaxAffordable(selectedUnitData.cost))}
                >
                  Max ({getMaxAffordable(selectedUnitData.cost)})
                </button>
              </div>

              <div className={styles.totalCost}>
                <span>Total Cost:</span>
                <div className={styles.costGrid}>
                  <div className={styles.costItem}>
                    <ResourceIcon type="lumber" size="small" />
                    <span
                      className={
                        currentVillage.resources.lumber < selectedUnitData.cost.lumber * quantity
                          ? styles.notEnough
                          : ''
                      }
                    >
                      {(selectedUnitData.cost.lumber * quantity).toLocaleString()}
                    </span>
                  </div>
                  <div className={styles.costItem}>
                    <ResourceIcon type="clay" size="small" />
                    <span
                      className={
                        currentVillage.resources.clay < selectedUnitData.cost.clay * quantity
                          ? styles.notEnough
                          : ''
                      }
                    >
                      {(selectedUnitData.cost.clay * quantity).toLocaleString()}
                    </span>
                  </div>
                  <div className={styles.costItem}>
                    <ResourceIcon type="iron" size="small" />
                    <span
                      className={
                        currentVillage.resources.iron < selectedUnitData.cost.iron * quantity
                          ? styles.notEnough
                          : ''
                      }
                    >
                      {(selectedUnitData.cost.iron * quantity).toLocaleString()}
                    </span>
                  </div>
                  <div className={styles.costItem}>
                    <ResourceIcon type="crop" size="small" />
                    <span
                      className={
                        currentVillage.resources.crop < selectedUnitData.cost.crop * quantity
                          ? styles.notEnough
                          : ''
                      }
                    >
                      {(selectedUnitData.cost.crop * quantity).toLocaleString()}
                    </span>
                  </div>
                </div>
              </div>

              <div className={styles.totalTime}>
                <span>Total Training Time:</span>
                <strong>{formatTime(selectedUnitData.trainingTime * quantity)}</strong>
              </div>

              <button
                className="btn btn-primary"
                onClick={handleTrain}
                disabled={!canAfford(selectedUnitData.cost, quantity) || isTraining || quantity < 1}
              >
                {isTraining ? 'Training...' : `Train ${quantity} ${selectedUnitData.name}`}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Current Troops Panel */}
      <div className={`panel ${styles.troopsPanel}`}>
        <div className="panel-header">Troops in Village</div>
        <div className="panel-body">
          {currentTroops.length === 0 ? (
            <div className={styles.noTroops}>No troops stationed in this village.</div>
          ) : (
            <div className={styles.troopsList}>
              {currentTroops.map((troop) => {
                const unitData = UNIT_DATA[troop.unitType];
                return (
                  <div key={troop.unitType} className={styles.troopRow}>
                    <span className={styles.troopName}>{unitData?.name || troop.unitType}</span>
                    <span className={styles.troopCount}>{troop.quantity}</span>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
