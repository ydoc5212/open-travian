import { useState, useEffect } from 'react';
import { useAuthStore } from '../stores/authStore';
import styles from './ArtefactsView.module.css';

interface Artefact {
  id: string;
  type: string; // 'unique' | 'large' | 'small'
  effect: string;
  effectName: string;
  effectDescription: string;
  size: number;
  coordinates: { x: number; y: number };
  owner: {
    villageId: string;
    villageName: string;
    coordinates: { x: number; y: number };
    ownerName: string;
    isOwn?: boolean;
  } | null;
  ownerAlliance: {
    allianceId: string;
    name: string;
    tag: string;
  } | null;
  capturedAt: string | null;
  activatedAt: string | null;
  isActive: boolean;
  activatesIn?: number;
  spawnedAt: string;
}

export function ArtefactsView() {
  const [artefacts, setArtefacts] = useState<Artefact[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedType, setSelectedType] = useState<string>('all');
  const [selectedEffect, setSelectedEffect] = useState<string>('all');

  useEffect(() => {
    fetchArtefacts();
    const interval = setInterval(fetchArtefacts, 60000); // Update every minute
    return () => clearInterval(interval);
  }, []);

  const fetchArtefacts = async () => {
    try {
      const token = useAuthStore.getState().token;
      const response = await fetch('/api/artefacts', {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await response.json();

      if (data.success) {
        setArtefacts(data.data.artefacts);
      }
      setLoading(false);
    } catch (err) {
      console.error('Error fetching artefacts:', err);
      setError('Failed to load artefacts');
      setLoading(false);
    }
  };

  const getTypeColor = (type: string) => {
    switch (type) {
      case 'unique':
        return '#FFD700'; // Gold
      case 'large':
        return '#C0C0C0'; // Silver
      case 'small':
        return '#CD7F32'; // Bronze
      default:
        return '#999';
    }
  };

  const formatTimeRemaining = (seconds: number) => {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    if (hours > 0) {
      return `${hours}h ${minutes}m`;
    }
    return `${minutes}m`;
  };

  const filteredArtefacts = artefacts.filter((art) => {
    if (selectedType !== 'all' && art.type !== selectedType) return false;
    if (selectedEffect !== 'all' && art.effect !== selectedEffect) return false;
    return true;
  });

  // Get unique effects for filter
  const uniqueEffects = Array.from(new Set(artefacts.map((a) => a.effect)));

  if (loading) {
    return (
      <div className={styles.artefactsContainer}>
        <div className={styles.loading}>Loading artefacts...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className={styles.artefactsContainer}>
        <div className={styles.error}>{error}</div>
      </div>
    );
  }

  return (
    <div className={styles.artefactsContainer}>
      <div className={styles.header}>
        <h1>Artefacts of Power</h1>
        <p className={styles.subtitle}>
          Ancient relics that grant immense power to their holders. Capture and defend them to gain advantages across your empire.
        </p>
      </div>

      <div className={styles.filters}>
        <div className={styles.filterGroup}>
          <label>Type:</label>
          <select value={selectedType} onChange={(e) => setSelectedType(e.target.value)}>
            <option value="all">All Types</option>
            <option value="unique">Unique (1x)</option>
            <option value="large">Large</option>
            <option value="small">Small</option>
          </select>
        </div>
        <div className={styles.filterGroup}>
          <label>Effect:</label>
          <select value={selectedEffect} onChange={(e) => setSelectedEffect(e.target.value)}>
            <option value="all">All Effects</option>
            {uniqueEffects.map((effect) => (
              <option key={effect} value={effect}>
                {effect.replace(/_/g, ' ').replace(/\b\w/g, (l) => l.toUpperCase())}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className={styles.artefactGrid}>
        {filteredArtefacts.map((artefact) => (
          <div key={artefact.id} className={`${styles.artefactCard} ${artefact.isActive ? styles.active : ''}`}>
            <div className={styles.artefactHeader} style={{ borderColor: getTypeColor(artefact.type) }}>
              <div className={styles.artefactType} style={{ backgroundColor: getTypeColor(artefact.type) }}>
                {artefact.type.toUpperCase()}
                {artefact.size > 1 && ` ×${artefact.size}`}
              </div>
              <h3>{artefact.effectName}</h3>
            </div>

            <div className={styles.artefactBody}>
              <p className={styles.description}>{artefact.effectDescription}</p>

              <div className={styles.artefactInfo}>
                <div className={styles.infoRow}>
                  <span className={styles.label}>Location:</span>
                  <span className={styles.value}>
                    ({artefact.coordinates.x}|{artefact.coordinates.y})
                  </span>
                </div>

                {artefact.owner && (
                  <>
                    <div className={styles.infoRow}>
                      <span className={styles.label}>Held by:</span>
                      <span className={`${styles.value} ${artefact.owner.isOwn ? styles.ownVillage : ''}`}>
                        {artefact.owner.villageName} ({artefact.owner.ownerName})
                      </span>
                    </div>

                    {artefact.ownerAlliance && (
                      <div className={styles.infoRow}>
                        <span className={styles.label}>Alliance:</span>
                        <span className={styles.value}>
                          [{artefact.ownerAlliance.tag}] {artefact.ownerAlliance.name}
                        </span>
                      </div>
                    )}

                    <div className={styles.infoRow}>
                      <span className={styles.label}>Status:</span>
                      <span className={`${styles.status} ${artefact.isActive ? styles.statusActive : styles.statusInactive}`}>
                        {artefact.isActive ? 'Active' : artefact.activatesIn ? `Activates in ${formatTimeRemaining(artefact.activatesIn)}` : 'Inactive'}
                      </span>
                    </div>

                    {artefact.capturedAt && (
                      <div className={styles.infoRow}>
                        <span className={styles.label}>Captured:</span>
                        <span className={styles.value}>{new Date(artefact.capturedAt).toLocaleString()}</span>
                      </div>
                    )}
                  </>
                )}

                {!artefact.owner && (
                  <div className={styles.uncaptured}>
                    <span>Uncaptured - Defended by Natar forces</span>
                  </div>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>

      {filteredArtefacts.length === 0 && (
        <div className={styles.noArtefacts}>
          No artefacts match your filters.
        </div>
      )}
    </div>
  );
}
