import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { adventureApi } from '../services/api';
import { Timer } from '../components/Timer';
import styles from './AdventureView.module.css';

export function AdventureView() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<any>(null);
  const [starting, setStarting] = useState<string | null>(null);

  useEffect(() => {
    loadData();
    // Refresh data every 30 seconds
    const interval = setInterval(loadData, 30000);
    return () => clearInterval(interval);
  }, []);

  async function loadData() {
    try {
      setLoading(true);
      const response = await adventureApi.list();
      setData(response.data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load adventures');
    } finally {
      setLoading(false);
    }
  }

  async function handleStartAdventure(adventureId: string) {
    setStarting(adventureId);
    setError(null);

    try {
      await adventureApi.start(adventureId);
      await loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to start adventure');
    } finally {
      setStarting(null);
    }
  }

  if (loading) {
    return <div className={styles.container}>Loading...</div>;
  }

  if (!data) {
    return <div className={styles.container}>No data available</div>;
  }

  const { hero, herosMansionLevel, adventures } = data;

  if (!hero) {
    return (
      <div className={styles.container}>
        <div className="panel">
          <div className="panel-header">
            <button onClick={() => navigate(-1)} className="btn btn-secondary">
              Back
            </button>
            <h2>Adventures</h2>
          </div>
          <div className="panel-body">
            <p>You need to create a hero first to go on adventures.</p>
            <button onClick={() => navigate('/hero')} className="btn btn-primary">
              Create Hero
            </button>
          </div>
        </div>
      </div>
    );
  }

  const availableAdventures = adventures.filter((a) => a.status === 'available');
  const activeAdventures = adventures.filter((a) => a.status === 'in_progress' && a.isAssigned);

  return (
    <div className={styles.container}>
      <div className="panel">
        <div className="panel-header">
          <button onClick={() => navigate(-1)} className="btn btn-secondary">
            Back
          </button>
          <h2>Hero's Mansion Adventures</h2>
        </div>

        <div className="panel-body">
          {error && <div className="alert alert-error">{error}</div>}

          <div className={styles.heroInfo}>
            <h3>{hero.name}</h3>
            <div className={styles.heroStats}>
              <div>Level {hero.level}</div>
              <div>Health: {hero.health}%</div>
              <div>Status: {hero.status}</div>
            </div>
          </div>

          {hero.status !== 'home' && (
            <div className="alert alert-warning">
              Your hero is currently {hero.status}. Wait for them to return before starting a new
              adventure.
            </div>
          )}

          {activeAdventures.length > 0 && (
            <div className={styles.activeAdventures}>
              <h3>Active Adventures</h3>
              {activeAdventures.map((adventure) => (
                <div key={adventure.id} className={styles.adventureCard}>
                  <div className={styles.adventureHeader}>
                    <span className={styles.difficulty}>{adventure.difficulty}</span>
                    <span className={styles.coords}>
                      ({adventure.coordinates.x}|{adventure.coordinates.y})
                    </span>
                  </div>
                  <div className={styles.adventureInfo}>
                    <div>Distance: {adventure.distance} tiles</div>
                    {adventure.completesAt && (
                      <div>
                        <Timer endsAt={adventure.completesAt} showLabel />
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}

          <div className={styles.availableAdventures}>
            <h3>Available Adventures ({availableAdventures.length})</h3>
            {availableAdventures.length === 0 ? (
              <p className={styles.noAdventures}>No adventures available at the moment.</p>
            ) : (
              <div className={styles.adventureList}>
                {availableAdventures.map((adventure) => (
                  <div key={adventure.id} className={styles.adventureCard}>
                    <div className={styles.adventureHeader}>
                      <span
                        className={`${styles.difficulty} ${styles[adventure.difficulty]}`}
                      >
                        {adventure.difficulty}
                      </span>
                      <span className={styles.coords}>
                        ({adventure.coordinates.x}|{adventure.coordinates.y})
                      </span>
                    </div>
                    <div className={styles.adventureInfo}>
                      <div>Distance: {adventure.distance} tiles</div>
                      <div>
                        Travel time: {formatTime(adventure.travelTime * 2)}{' '}
                        <span className={styles.hint}>(round trip)</span>
                      </div>
                      <div className={styles.expires}>
                        Expires: <Timer endsAt={adventure.expiresAt} compact />
                      </div>
                    </div>
                    <button
                      className="btn btn-primary btn-sm"
                      onClick={() => handleStartAdventure(adventure.id)}
                      disabled={
                        hero.status !== 'home' ||
                        hero.health <= 0 ||
                        starting === adventure.id
                      }
                    >
                      {starting === adventure.id ? 'Starting...' : 'Start Adventure'}
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className={styles.info}>
            <h4>About Adventures</h4>
            <p>
              Send your hero on adventures to find valuable items, resources, troops, and
              experience. Adventures spawn randomly on the map and expire after 24 hours.
            </p>
            <p>
              The Hero's Mansion level determines how many adventures you can have running
              simultaneously. Higher difficulty adventures offer better rewards but are more
              dangerous.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

function formatTime(seconds: number): string {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);

  if (hours > 0) {
    return `${hours}h ${minutes}m`;
  }
  return `${minutes}m`;
}
