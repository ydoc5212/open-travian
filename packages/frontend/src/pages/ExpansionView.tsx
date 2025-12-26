import { useState, useEffect } from 'react';
import { useGameStore } from '../stores/gameStore';
import { GAME_CONFIG } from '@travian/shared';
import styles from './ExpansionView.module.css';

interface ExpansionStatus {
  currentVillages: number;
  maxVillages: number;
  canFoundMore: boolean;
  villages: Array<{
    id: string;
    name: string;
    isCapital: boolean;
  }>;
}

export function ExpansionView() {
  const currentVillage = useGameStore((state) => state.currentVillage);
  const [status, setStatus] = useState<ExpansionStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedX, setSelectedX] = useState(0);
  const [selectedY, setSelectedY] = useState(0);
  const [villageName, setVillageName] = useState('');
  const [founding, setFounding] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  useEffect(() => {
    loadExpansionStatus();
  }, []);

  async function loadExpansionStatus() {
    try {
      const token = localStorage.getItem('token');
      const response = await fetch('http://localhost:3001/api/expansion/status', {
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      });

      if (!response.ok) {
        throw new Error('Failed to load expansion status');
      }

      const data = await response.json();
      setStatus(data.data);
    } catch (err) {
      console.error('Failed to load expansion status:', err);
      setError('Failed to load expansion status');
    } finally {
      setLoading(false);
    }
  }

  async function handleFoundVillage() {
    if (!currentVillage || !villageName) {
      setError('Please enter a village name');
      return;
    }

    setFounding(true);
    setError(null);
    setSuccessMessage(null);

    try {
      const token = localStorage.getItem('token');
      const response = await fetch('http://localhost:3001/api/expansion/found-village', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({
          fromVillageId: currentVillage.id,
          x: selectedX,
          y: selectedY,
          villageName,
        }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to send settlers');
      }

      const data = await response.json();
      setSuccessMessage(
        `Settlers sent to found "${villageName}" at (${selectedX}|${selectedY}). ` +
        `Arrival in ${Math.floor(data.data.travelTime / 60)} minutes.`
      );
      setVillageName('');
      await loadExpansionStatus();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to send settlers');
    } finally {
      setFounding(false);
    }
  }

  async function handleCelebrate(type: 'small' | 'large') {
    if (!currentVillage) return;

    try {
      const token = localStorage.getItem('token');
      const response = await fetch('http://localhost:3001/api/expansion/celebrate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({
          villageId: currentVillage.id,
          type,
        }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to start celebration');
      }

      const data = await response.json();
      setSuccessMessage(
        `${type === 'small' ? 'Small' : 'Large'} celebration started! ` +
        `Loyalty will increase in ${Math.floor(data.data.duration / 60)} minutes.`
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to start celebration');
    }
  }

  if (loading) {
    return <div className={styles.loading}>Loading...</div>;
  }

  if (!currentVillage) {
    return <div className={styles.loading}>Loading village...</div>;
  }

  const settlerCost = {
    romans: { lumber: 5800, clay: 5300, iron: 7200, crop: 5500 },
    gauls: { lumber: 5500, clay: 7000, iron: 5300, crop: 4900 },
    teutons: { lumber: 5800, clay: 4400, iron: 4600, crop: 5200 },
  };

  return (
    <div className={styles.container}>
      <div className="panel">
        <div className="panel-header">Village Expansion</div>
        <div className="panel-body">
          {error && <div className="alert alert-error">{error}</div>}
          {successMessage && <div className="alert alert-success">{successMessage}</div>}

          {status && (
            <div className={styles.statusSection}>
              <h3>Your Empire</h3>
              <p>
                Villages: {status.currentVillages} / {status.maxVillages}
              </p>
              <ul className={styles.villageList}>
                {status.villages.map((v) => (
                  <li key={v.id}>
                    {v.name} {v.isCapital && <span className={styles.capitalBadge}>(Capital)</span>}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {status?.canFoundMore && (
            <div className={styles.foundSection}>
              <h3>Found New Village</h3>
              <p>
                You need {GAME_CONFIG.SETTLERS_REQUIRED} settlers to found a new village.
                Settlers must be trained at your Residence or Palace (level 10+).
              </p>

              <div className={styles.formGroup}>
                <label>Village Name:</label>
                <input
                  type="text"
                  value={villageName}
                  onChange={(e) => setVillageName(e.target.value)}
                  placeholder="Enter village name"
                  maxLength={30}
                  className={styles.input}
                />
              </div>

              <div className={styles.formGroup}>
                <label>Coordinates:</label>
                <div className={styles.coordInputs}>
                  <input
                    type="number"
                    value={selectedX}
                    onChange={(e) => setSelectedX(parseInt(e.target.value) || 0)}
                    placeholder="X"
                    className={styles.coordInput}
                  />
                  <span>|</span>
                  <input
                    type="number"
                    value={selectedY}
                    onChange={(e) => setSelectedY(parseInt(e.target.value) || 0)}
                    placeholder="Y"
                    className={styles.coordInput}
                  />
                </div>
              </div>

              <button
                className="btn btn-primary"
                onClick={handleFoundVillage}
                disabled={founding || !villageName || villageName.length < 2}
              >
                {founding ? 'Sending Settlers...' : `Found Village (${GAME_CONFIG.SETTLERS_REQUIRED} settlers)`}
              </button>
            </div>
          )}

          {!status?.canFoundMore && (
            <div className="alert alert-info">
              You have reached the maximum number of villages ({GAME_CONFIG.MAX_VILLAGES_BASE}).
            </div>
          )}
        </div>
      </div>

      <div className="panel">
        <div className="panel-header">Loyalty & Celebrations</div>
        <div className="panel-body">
          <p>Current Loyalty: {currentVillage.loyalty}%</p>

          {currentVillage.celebrationEndsAt && (
            <div className="alert alert-info">
              {currentVillage.celebrationType === 'small' ? 'Small' : 'Large'} celebration in progress!
            </div>
          )}

          <div className={styles.celebrationButtons}>
            <div className={styles.celebrationOption}>
              <h4>Small Celebration</h4>
              <p>+{GAME_CONFIG.SMALL_CELEBRATION_LOYALTY_GAIN}% loyalty</p>
              <p className={styles.cost}>
                Cost: {GAME_CONFIG.SMALL_CELEBRATION_COST.lumber} lumber,{' '}
                {GAME_CONFIG.SMALL_CELEBRATION_COST.clay} clay,{' '}
                {GAME_CONFIG.SMALL_CELEBRATION_COST.iron} iron,{' '}
                {GAME_CONFIG.SMALL_CELEBRATION_COST.crop} crop
              </p>
              <button
                className="btn btn-secondary"
                onClick={() => handleCelebrate('small')}
                disabled={!!currentVillage.celebrationEndsAt}
              >
                Start Small Celebration
              </button>
            </div>

            <div className={styles.celebrationOption}>
              <h4>Large Celebration</h4>
              <p>+{GAME_CONFIG.LARGE_CELEBRATION_LOYALTY_GAIN}% loyalty (requires Town Hall level 10)</p>
              <p className={styles.cost}>
                Cost: {GAME_CONFIG.LARGE_CELEBRATION_COST.lumber} lumber,{' '}
                {GAME_CONFIG.LARGE_CELEBRATION_COST.clay} clay,{' '}
                {GAME_CONFIG.LARGE_CELEBRATION_COST.iron} iron,{' '}
                {GAME_CONFIG.LARGE_CELEBRATION_COST.crop} crop
              </p>
              <button
                className="btn btn-secondary"
                onClick={() => handleCelebrate('large')}
                disabled={!!currentVillage.celebrationEndsAt}
              >
                Start Large Celebration
              </button>
            </div>
          </div>

          <div className={styles.conquestInfo}>
            <h4>Village Conquest</h4>
            <p>
              Villages can be conquered using Chiefs, Senators, or Chieftains.
              Each attack reduces loyalty by 20-30%.
              When loyalty reaches 0%, the village changes ownership.
            </p>
            <p>
              <strong>Note:</strong> Capital villages cannot be conquered.
              Defend your villages by holding celebrations to restore loyalty.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
