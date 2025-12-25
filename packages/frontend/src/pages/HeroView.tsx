import { useState, useEffect } from 'react';
import { useGameStore } from '../stores/gameStore';
import { heroApi } from '../services/api';
import styles from './HeroView.module.css';

interface Hero {
  id: string;
  name: string;
  level: number;
  experience: number;
  health: number;
  strength: number;
  offBonus: number;
  defBonus: number;
  productionBonus: number;
  status: 'home' | 'adventure' | 'dead';
  revivedAt: string | null;
  village: {
    id: string;
    name: string;
    coordinates: { x: number; y: number };
  } | null;
  items: Array<{
    id: string;
    type: string;
    name: string;
    bonus: any;
  }>;
}

export function HeroView() {
  const { villages } = useGameStore();
  const [hero, setHero] = useState<Hero | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [createName, setCreateName] = useState('');
  const [selectedVillageId, setSelectedVillageId] = useState('');
  const [actionLoading, setActionLoading] = useState(false);

  useEffect(() => {
    loadHero();
  }, []);

  async function loadHero() {
    try {
      setLoading(true);
      const response = await heroApi.get();
      setHero(response.data.hero);
      if (response.data.hero?.village) {
        setSelectedVillageId(response.data.hero.village.id);
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  async function handleCreateHero(e: React.FormEvent) {
    e.preventDefault();
    if (!createName.trim()) return;

    try {
      setActionLoading(true);
      setError(null);
      const response = await heroApi.create(createName);
      setHero(response.data.hero);
      setCreateName('');
    } catch (err: any) {
      setError(err.message);
    } finally {
      setActionLoading(false);
    }
  }

  async function handleAssignVillage() {
    if (!selectedVillageId || !hero) return;

    try {
      setActionLoading(true);
      setError(null);
      const response = await heroApi.assign(selectedVillageId);
      setHero(response.data.hero);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setActionLoading(false);
    }
  }

  async function handleRevive() {
    if (!hero) return;

    try {
      setActionLoading(true);
      setError(null);
      const response = await heroApi.revive();
      setHero(response.data.hero);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setActionLoading(false);
    }
  }

  function getNextLevelXP(level: number): number {
    return level * 100;
  }

  if (loading) {
    return (
      <div className={styles.container}>
        <div className={styles.loading}>Loading hero...</div>
      </div>
    );
  }

  if (!hero) {
    return (
      <div className={styles.container}>
        <div className={styles.card}>
          <h1>Create Your Hero</h1>
          <p>Heroes provide powerful bonuses to your villages and can go on adventures.</p>

          <form onSubmit={handleCreateHero} className={styles.createForm}>
            <div className={styles.formGroup}>
              <label htmlFor="heroName">Hero Name:</label>
              <input
                id="heroName"
                type="text"
                value={createName}
                onChange={(e) => setCreateName(e.target.value)}
                placeholder="Enter hero name"
                minLength={2}
                maxLength={20}
                required
                className={styles.input}
              />
            </div>

            {error && <div className={styles.error}>{error}</div>}

            <button
              type="submit"
              className="btn btn-primary"
              disabled={actionLoading || createName.length < 2}
            >
              {actionLoading ? 'Creating...' : 'Create Hero'}
            </button>
          </form>
        </div>
      </div>
    );
  }

  const xpProgress = (hero.experience / getNextLevelXP(hero.level)) * 100;
  const isDead = hero.status === 'dead';
  const isOnAdventure = hero.status === 'adventure';

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <h1>{hero.name}</h1>
        <div className={styles.statusBadge} data-status={hero.status}>
          {hero.status === 'home' && 'At Home'}
          {hero.status === 'adventure' && 'On Adventure'}
          {hero.status === 'dead' && 'Dead'}
        </div>
      </div>

      {error && <div className={styles.error}>{error}</div>}

      <div className={styles.mainContent}>
        {/* Hero Stats */}
        <div className={styles.card}>
          <h2>Hero Stats</h2>

          <div className={styles.statsGrid}>
            <div className={styles.statItem}>
              <span className={styles.statLabel}>Level:</span>
              <span className={styles.statValue}>{hero.level}</span>
            </div>

            <div className={styles.statItem}>
              <span className={styles.statLabel}>Health:</span>
              <span className={styles.statValue}>{hero.health}%</span>
            </div>

            <div className={styles.statItem}>
              <span className={styles.statLabel}>Strength:</span>
              <span className={styles.statValue}>{hero.strength}</span>
            </div>

            <div className={styles.statItem}>
              <span className={styles.statLabel}>Attack Bonus:</span>
              <span className={styles.statValue}>+{hero.offBonus}%</span>
            </div>

            <div className={styles.statItem}>
              <span className={styles.statLabel}>Defense Bonus:</span>
              <span className={styles.statValue}>+{hero.defBonus}%</span>
            </div>

            <div className={styles.statItem}>
              <span className={styles.statLabel}>Production Bonus:</span>
              <span className={styles.statValue}>+{hero.productionBonus}%</span>
            </div>
          </div>

          <div className={styles.xpSection}>
            <div className={styles.xpLabel}>
              Experience: {hero.experience} / {getNextLevelXP(hero.level)}
            </div>
            <div className={styles.xpBar}>
              <div
                className={styles.xpProgress}
                style={{ width: `${xpProgress}%` }}
              />
            </div>
          </div>
        </div>

        {/* Location & Assignment */}
        <div className={styles.card}>
          <h2>Current Location</h2>

          {hero.village ? (
            <div className={styles.locationInfo}>
              <p>
                <strong>{hero.village.name}</strong> ({hero.village.coordinates.x}|{hero.village.coordinates.y})
              </p>
            </div>
          ) : (
            <p className={styles.noLocation}>No current location</p>
          )}

          {!isDead && !isOnAdventure && villages.length > 0 && (
            <div className={styles.assignSection}>
              <h3>Assign to Village</h3>
              <div className={styles.assignControls}>
                <select
                  value={selectedVillageId}
                  onChange={(e) => setSelectedVillageId(e.target.value)}
                  className={styles.select}
                >
                  {villages.map((village) => (
                    <option key={village.id} value={village.id}>
                      {village.name} ({village.coordinates.x}|{village.coordinates.y})
                    </option>
                  ))}
                </select>
                <button
                  onClick={handleAssignVillage}
                  className="btn btn-primary"
                  disabled={actionLoading || selectedVillageId === hero.village?.id}
                >
                  {actionLoading ? 'Assigning...' : 'Assign'}
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Equipment */}
        <div className={styles.card}>
          <h2>Equipment</h2>

          {hero.items.length > 0 ? (
            <div className={styles.itemsList}>
              {hero.items.map((item) => (
                <div key={item.id} className={styles.itemCard}>
                  <div className={styles.itemHeader}>
                    <span className={styles.itemName}>{item.name}</span>
                    <span className={styles.itemType}>{item.type}</span>
                  </div>
                  <div className={styles.itemBonus}>
                    {JSON.stringify(item.bonus)}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className={styles.noItems}>No items equipped</p>
          )}
        </div>

        {/* Revival Section */}
        {isDead && (
          <div className={styles.card}>
            <h2>Revive Hero</h2>
            <p className={styles.revivalInfo}>
              Your hero has fallen in battle. You can revive them for a resource cost.
            </p>
            <button
              onClick={handleRevive}
              className="btn btn-primary"
              disabled={actionLoading}
            >
              {actionLoading ? 'Reviving...' : 'Revive Hero'}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
