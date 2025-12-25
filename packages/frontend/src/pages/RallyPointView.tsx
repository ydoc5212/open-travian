import { useState, useEffect } from 'react';
import { useGameStore } from '../stores/gameStore';
import { troopsApi, combatApi } from '../services/api';
import { UNIT_DATA } from '@travian/shared';
import { Timer } from '../components/Timer';
import styles from './RallyPointView.module.css';

interface TroopWithStatus {
  unitType: string;
  quantity: number;
}

interface Attack {
  id: string;
  attackType: string;
  troops?: { unitType: string; quantity: number }[];
  from?: { name: string; coordinates: { x: number; y: number } };
  to?: { name: string; coordinates: { x: number; y: number } };
  arrivesAt: string;
}

interface TargetInfo {
  village: {
    id: string;
    name: string;
    coordinates: { x: number; y: number };
    population: number;
    ownerName: string;
    ownerTribe: string;
    isOwnVillage: boolean;
  };
  distance: number;
}

export function RallyPointView() {
  const currentVillage = useGameStore((state) => state.currentVillage);
  const [activeTab, setActiveTab] = useState<'send' | 'incoming' | 'outgoing'>('send');
  const [troops, setTroops] = useState<{ home: TroopWithStatus[] }>({ home: [] });
  const [selectedTroops, setSelectedTroops] = useState<Record<string, number>>({});
  const [targetX, setTargetX] = useState('');
  const [targetY, setTargetY] = useState('');
  const [targetInfo, setTargetInfo] = useState<TargetInfo | null>(null);
  const [attackType, setAttackType] = useState<'attack' | 'raid' | 'reinforcement'>('raid');
  const [incomingAttacks, setIncomingAttacks] = useState<Attack[]>([]);
  const [outgoingAttacks, setOutgoingAttacks] = useState<Attack[]>([]);
  const [isSending, setIsSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (currentVillage) {
      loadData();
    }
  }, [currentVillage?.id]);

  async function loadData() {
    if (!currentVillage) return;

    try {
      setLoading(true);
      const [troopsRes, incomingRes, outgoingRes] = await Promise.all([
        troopsApi.getVillageTroops(currentVillage.id),
        combatApi.getIncoming(currentVillage.id),
        combatApi.getOutgoing(currentVillage.id),
      ]);
      setTroops(troopsRes.data.troops);
      setIncomingAttacks(incomingRes.data.attacks);
      setOutgoingAttacks(outgoingRes.data.attacks);
    } catch (err) {
      console.error('Failed to load rally point data:', err);
    } finally {
      setLoading(false);
    }
  }

  async function handleCheckTarget() {
    const x = parseInt(targetX);
    const y = parseInt(targetY);

    if (isNaN(x) || isNaN(y)) {
      setError('Please enter valid coordinates');
      return;
    }

    setError(null);

    try {
      const response = await combatApi.getTarget(x, y);
      setTargetInfo(response.data);

      // Auto-select reinforcement if targeting own village
      if (response.data.village.isOwnVillage) {
        setAttackType('reinforcement');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to find target');
      setTargetInfo(null);
    }
  }

  async function handleSendAttack() {
    if (!currentVillage || !targetInfo) return;

    const troopsToSend = Object.entries(selectedTroops)
      .filter(([, qty]) => qty > 0)
      .map(([unitType, quantity]) => ({ unitType, quantity }));

    if (troopsToSend.length === 0) {
      setError('Select troops to send');
      return;
    }

    setIsSending(true);
    setError(null);

    try {
      await combatApi.sendAttack(
        currentVillage.id,
        targetInfo.village.coordinates.x,
        targetInfo.village.coordinates.y,
        troopsToSend,
        attackType
      );

      // Reset and reload
      setSelectedTroops({});
      setTargetInfo(null);
      setTargetX('');
      setTargetY('');
      await loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to send attack');
    } finally {
      setIsSending(false);
    }
  }

  function handleTroopChange(unitType: string, value: number) {
    const maxAvailable = troops.home.find((t) => t.unitType === unitType)?.quantity || 0;
    setSelectedTroops((prev) => ({
      ...prev,
      [unitType]: Math.min(Math.max(0, value), maxAvailable),
    }));
  }

  function calculateTravelTime(): string {
    if (!targetInfo || !currentVillage) return '--:--:--';

    const selectedUnits = Object.entries(selectedTroops).filter(([, qty]) => qty > 0);
    if (selectedUnits.length === 0) return '--:--:--';

    // Find slowest unit
    let slowestSpeed = Infinity;
    for (const [unitType] of selectedUnits) {
      const unitData = UNIT_DATA[unitType];
      if (unitData && unitData.speed < slowestSpeed) {
        slowestSpeed = unitData.speed;
      }
    }

    if (slowestSpeed === Infinity) return '--:--:--';

    // Calculate time (distance / speed * 3600 / 10 for speed multiplier)
    const timeSeconds = (targetInfo.distance / slowestSpeed) * 3600 / 10;
    const h = Math.floor(timeSeconds / 3600);
    const m = Math.floor((timeSeconds % 3600) / 60);
    const s = Math.floor(timeSeconds % 60);
    return `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  }

  if (!currentVillage) {
    return <div className={styles.loading}>Loading village...</div>;
  }

  if (loading) {
    return <div className={styles.loading}>Loading rally point...</div>;
  }

  return (
    <div className={styles.container}>
      <div className="panel">
        <div className="panel-header">Rally Point</div>
        <div className="panel-body">
          {/* Tabs */}
          <div className={styles.tabs}>
            <button
              className={`${styles.tab} ${activeTab === 'send' ? styles.active : ''}`}
              onClick={() => setActiveTab('send')}
            >
              Send Troops
            </button>
            <button
              className={`${styles.tab} ${activeTab === 'incoming' ? styles.active : ''}`}
              onClick={() => setActiveTab('incoming')}
            >
              Incoming ({incomingAttacks.length})
            </button>
            <button
              className={`${styles.tab} ${activeTab === 'outgoing' ? styles.active : ''}`}
              onClick={() => setActiveTab('outgoing')}
            >
              Outgoing ({outgoingAttacks.length})
            </button>
          </div>

          {/* Tab Content */}
          {activeTab === 'send' && (
            <div className={styles.sendTab}>
              {error && <div className="alert alert-error">{error}</div>}

              {/* Target Selection */}
              <div className={styles.targetSection}>
                <h4>Target</h4>
                <div className={styles.coordsRow}>
                  <label>
                    X:
                    <input
                      type="number"
                      value={targetX}
                      onChange={(e) => setTargetX(e.target.value)}
                      className={styles.coordInput}
                    />
                  </label>
                  <label>
                    Y:
                    <input
                      type="number"
                      value={targetY}
                      onChange={(e) => setTargetY(e.target.value)}
                      className={styles.coordInput}
                    />
                  </label>
                  <button className="btn btn-secondary" onClick={handleCheckTarget}>
                    Check
                  </button>
                </div>

                {targetInfo && (
                  <div className={styles.targetInfo}>
                    <div className={styles.targetDetails}>
                      <span className={styles.targetName}>{targetInfo.village.name}</span>
                      <span className={styles.targetOwner}>
                        ({targetInfo.village.ownerName} - {targetInfo.village.ownerTribe})
                      </span>
                      {targetInfo.village.isOwnVillage && (
                        <span className={styles.ownVillageBadge}>Your Village</span>
                      )}
                    </div>
                    <div className={styles.targetStats}>
                      <span>Population: {targetInfo.village.population}</span>
                      <span>Distance: {targetInfo.distance} fields</span>
                    </div>
                  </div>
                )}
              </div>

              {/* Attack Type */}
              {targetInfo && (
                <>
                  <div className={styles.attackTypeSection}>
                    <h4>Mission Type</h4>
                    <div className={styles.attackTypeOptions}>
                      {!targetInfo.village.isOwnVillage && (
                        <>
                          <label className={styles.radioLabel}>
                            <input
                              type="radio"
                              name="attackType"
                              value="raid"
                              checked={attackType === 'raid'}
                              onChange={() => setAttackType('raid')}
                            />
                            <span className={styles.radioText}>
                              <strong>Raid</strong> - Focus on stealing resources, fewer losses
                            </span>
                          </label>
                          <label className={styles.radioLabel}>
                            <input
                              type="radio"
                              name="attackType"
                              value="attack"
                              checked={attackType === 'attack'}
                              onChange={() => setAttackType('attack')}
                            />
                            <span className={styles.radioText}>
                              <strong>Attack</strong> - Full assault, maximum damage to defenders
                            </span>
                          </label>
                        </>
                      )}
                      {targetInfo.village.isOwnVillage && (
                        <label className={styles.radioLabel}>
                          <input
                            type="radio"
                            name="attackType"
                            value="reinforcement"
                            checked={attackType === 'reinforcement'}
                            onChange={() => setAttackType('reinforcement')}
                          />
                          <span className={styles.radioText}>
                            <strong>Reinforcement</strong> - Send troops to defend this village
                          </span>
                        </label>
                      )}
                    </div>
                  </div>

                  {/* Troop Selection */}
                  <div className={styles.troopSection}>
                    <h4>Select Troops</h4>
                    {troops.home.length === 0 ? (
                      <div className={styles.noTroops}>No troops available</div>
                    ) : (
                      <div className={styles.troopGrid}>
                        {troops.home.map((troop) => {
                          const unitData = UNIT_DATA[troop.unitType];
                          return (
                            <div key={troop.unitType} className={styles.troopRow}>
                              <div className={styles.troopInfo}>
                                <span className={styles.troopName}>
                                  {unitData?.name || troop.unitType}
                                </span>
                                <span className={styles.troopAvailable}>
                                  Available: {troop.quantity}
                                </span>
                              </div>
                              <input
                                type="number"
                                min={0}
                                max={troop.quantity}
                                value={selectedTroops[troop.unitType] || 0}
                                onChange={(e) =>
                                  handleTroopChange(troop.unitType, parseInt(e.target.value) || 0)
                                }
                                className={styles.troopInput}
                              />
                              <button
                                className="btn btn-sm btn-secondary"
                                onClick={() => handleTroopChange(troop.unitType, troop.quantity)}
                              >
                                All
                              </button>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>

                  {/* Summary & Send */}
                  <div className={styles.summarySection}>
                    <div className={styles.travelTime}>
                      <span>Travel Time:</span>
                      <strong>{calculateTravelTime()}</strong>
                    </div>
                    <button
                      className="btn btn-primary btn-lg"
                      onClick={handleSendAttack}
                      disabled={
                        isSending ||
                        Object.values(selectedTroops).every((v) => v === 0)
                      }
                    >
                      {isSending ? 'Sending...' : `Send ${
                        attackType === 'raid' ? 'Raid' :
                        attackType === 'attack' ? 'Attack' :
                        'Reinforcement'
                      }`}
                    </button>
                  </div>
                </>
              )}
            </div>
          )}

          {activeTab === 'incoming' && (
            <div className={styles.attacksList}>
              {incomingAttacks.length === 0 ? (
                <div className={styles.noAttacks}>No incoming attacks</div>
              ) : (
                incomingAttacks.map((attack) => (
                  <div key={attack.id} className={styles.attackCard}>
                    <div className={styles.attackHeader}>
                      <span className={styles.attackType}>
                        {attack.attackType === 'raid' ? 'Raid' : 'Attack'}
                      </span>
                      <span className={styles.attackFrom}>
                        from {attack.from?.name} ({attack.from?.coordinates.x}|{attack.from?.coordinates.y})
                      </span>
                    </div>
                    <div className={styles.attackTimer}>
                      <span>Arrives in:</span>
                      <Timer endsAt={attack.arrivesAt} />
                    </div>
                  </div>
                ))
              )}
            </div>
          )}

          {activeTab === 'outgoing' && (
            <div className={styles.attacksList}>
              {outgoingAttacks.length === 0 ? (
                <div className={styles.noAttacks}>No outgoing attacks</div>
              ) : (
                outgoingAttacks.map((attack) => (
                  <div key={attack.id} className={styles.attackCard}>
                    <div className={styles.attackHeader}>
                      <span className={styles.attackType}>
                        {attack.attackType === 'raid' ? 'Raid' : 'Attack'}
                      </span>
                      <span className={styles.attackTo}>
                        to {attack.to?.name} ({attack.to?.coordinates.x}|{attack.to?.coordinates.y})
                      </span>
                    </div>
                    <div className={styles.attackTroops}>
                      {attack.troops?.map((t) => (
                        <span key={t.unitType}>
                          {UNIT_DATA[t.unitType]?.name || t.unitType}: {t.quantity}
                        </span>
                      ))}
                    </div>
                    <div className={styles.attackTimer}>
                      <span>Arrives in:</span>
                      <Timer endsAt={attack.arrivesAt} />
                    </div>
                  </div>
                ))
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
