import { useState, useEffect } from 'react';
import { useAuthStore } from '../stores/authStore';
import styles from './WorldWondersView.module.css';

interface WorldWonder {
  id: string;
  coordinates: { x: number; y: number };
  level: number;
  rank: number;
  ownerAlliance: {
    allianceId: string;
    name: string;
    tag: string;
    memberCount: number;
  } | null;
  capturedAt: string | null;
  createdAt: string;
  recentBuilds: Array<{
    id: string;
    fromLevel: number;
    toLevel: number;
    allianceId: string;
    completedAt: string;
  }>;
}

export function WorldWondersView() {
  const [worldWonders, setWorldWonders] = useState<WorldWonder[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [serverPhase, setServerPhase] = useState('normal');
  const [gameStartedAt, setGameStartedAt] = useState<string | null>(null);

  useEffect(() => {
    fetchWorldWonders();
    const interval = setInterval(fetchWorldWonders, 30000); // Update every 30 seconds
    return () => clearInterval(interval);
  }, []);

  const fetchWorldWonders = async () => {
    try {
      const token = useAuthStore.getState().token;
      const response = await fetch('/api/world-wonders', {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await response.json();

      if (data.success) {
        setWorldWonders(data.data.worldWonders);
        setServerPhase(data.data.serverPhase);
        setGameStartedAt(data.data.gameStartedAt);
      }
      setLoading(false);
    } catch (err) {
      console.error('Error fetching world wonders:', err);
      setError('Failed to load world wonders');
      setLoading(false);
    }
  };

  const getRankColor = (rank: number) => {
    switch (rank) {
      case 1:
        return '#FFD700'; // Gold
      case 2:
        return '#C0C0C0'; // Silver
      case 3:
        return '#CD7F32'; // Bronze
      default:
        return '#666';
    }
  };

  const getProgressPercentage = (level: number) => {
    return (level / 100) * 100;
  };

  const getPhaseDescription = (phase: string) => {
    switch (phase) {
      case 'normal':
        return 'World Wonders are dormant';
      case 'artefacts_active':
        return 'Artefacts have spawned - World Wonders will activate soon';
      case 'world_wonder_race':
        return 'The race to level 100 has begun!';
      case 'ended':
        return 'The server has ended - A winner has been declared';
      default:
        return 'Unknown phase';
    }
  };

  if (loading) {
    return (
      <div className={styles.wwContainer}>
        <div className={styles.loading}>Loading World Wonders...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className={styles.wwContainer}>
        <div className={styles.error}>{error}</div>
      </div>
    );
  }

  return (
    <div className={styles.wwContainer}>
      <div className={styles.header}>
        <h1>World Wonders</h1>
        <p className={styles.subtitle}>
          The ultimate monuments to glory. First alliance to construct a World Wonder to level 100 wins the server!
        </p>
        <div className={styles.serverStatus}>
          <span className={`${styles.phaseIndicator} ${styles[`phase${serverPhase}`]}`}>
            {getPhaseDescription(serverPhase)}
          </span>
        </div>
      </div>

      {worldWonders.length === 0 ? (
        <div className={styles.noWorldWonders}>
          <h2>No World Wonders Active</h2>
          <p>World Wonders will appear once artefacts have been spawned and the end-game phase begins.</p>
        </div>
      ) : (
        <div className={styles.wwRankings}>
          <h2>World Wonder Rankings</h2>
          {worldWonders.map((ww) => (
            <div key={ww.id} className={`${styles.wwCard} ${ww.rank === 1 ? styles.leader : ''}`}>
              <div className={styles.rankBadge} style={{ backgroundColor: getRankColor(ww.rank) }}>
                #{ww.rank}
              </div>

              <div className={styles.wwInfo}>
                <div className={styles.wwHeader}>
                  <div>
                    <h3>
                      {ww.ownerAlliance ? (
                        <>
                          [{ww.ownerAlliance.tag}] {ww.ownerAlliance.name}
                        </>
                      ) : (
                        'Unclaimed'
                      )}
                    </h3>
                    <p className={styles.coordinates}>
                      Location: ({ww.coordinates.x}|{ww.coordinates.y})
                    </p>
                  </div>
                  <div className={styles.levelDisplay}>
                    <span className={styles.currentLevel}>{ww.level}</span>
                    <span className={styles.maxLevel}>/100</span>
                  </div>
                </div>

                <div className={styles.progressContainer}>
                  <div className={styles.progressBar}>
                    <div
                      className={styles.progressFill}
                      style={{
                        width: `${getProgressPercentage(ww.level)}%`,
                        backgroundColor: ww.rank === 1 ? '#FFD700' : ww.rank === 2 ? '#C0C0C0' : '#CD7F32',
                      }}
                    />
                  </div>
                  <span className={styles.progressText}>{getProgressPercentage(ww.level).toFixed(1)}% Complete</span>
                </div>

                {ww.ownerAlliance && (
                  <div className={styles.allianceInfo}>
                    <span>Alliance Members: {ww.ownerAlliance.memberCount}</span>
                    {ww.capturedAt && (
                      <span>Captured: {new Date(ww.capturedAt).toLocaleDateString()}</span>
                    )}
                  </div>
                )}

                {ww.recentBuilds.length > 0 && (
                  <div className={styles.recentActivity}>
                    <h4>Recent Progress</h4>
                    <div className={styles.buildHistory}>
                      {ww.recentBuilds.slice(0, 3).map((build) => (
                        <div key={build.id} className={styles.buildEntry}>
                          <span>Level {build.fromLevel} → {build.toLevel}</span>
                          <span className={styles.buildTime}>
                            {new Date(build.completedAt).toLocaleString()}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      <div className={styles.infoSection}>
        <h3>About World Wonders</h3>
        <ul>
          <li>World Wonders spawn at specific coordinates at the start of the game</li>
          <li>Alliances must capture and hold a World Wonder village to build it</li>
          <li>Each level requires massive resources and takes significant time to complete</li>
          <li>World Wonder Construction Plans (artefact) are required to build beyond level 50</li>
          <li>Natar forces will launch increasingly powerful attacks on World Wonder holders</li>
          <li>First alliance to reach level 100 wins the server!</li>
        </ul>
      </div>
    </div>
  );
}
