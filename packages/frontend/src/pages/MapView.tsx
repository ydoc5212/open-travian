import { useState, useEffect } from 'react';
import { useGameStore } from '../stores/gameStore';
import { mapApi } from '../services/api';
import styles from './MapView.module.css';

interface MapTile {
  x: number;
  y: number;
  type: 'village' | 'oasis' | 'wilderness' | 'empty';
  terrainVariant: string;
  village: {
    id: string;
    name: string;
    ownerName: string;
    ownerTribe: string;
    population: number;
    isOwn: boolean;
  } | null;
  oasis?: {
    id: string;
    type: string;
    resourceType: string;
    bonus: number;
    imageNumber: number;
    owner: {
      villageId: string;
      villageName: string;
      ownerName: string;
      isOwn: boolean;
    } | null;
  } | null;
}

interface MapData {
  centerX: number;
  centerY: number;
  size: number;
  tiles: MapTile[];
}

export function MapView() {
  const currentVillage = useGameStore((state) => state.currentVillage);
  const [mapData, setMapData] = useState<MapData | null>(null);
  const [centerX, setCenterX] = useState(0);
  const [centerY, setCenterY] = useState(0);
  const [jumpX, setJumpX] = useState('');
  const [jumpY, setJumpY] = useState('');
  const [selectedTile, setSelectedTile] = useState<MapTile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const mapSize = 7; // Show 15x15 grid (7 tiles in each direction from center)

  useEffect(() => {
    if (currentVillage) {
      // Start centered on current village
      setCenterX(currentVillage.coordinates.x);
      setCenterY(currentVillage.coordinates.y);
    }
  }, [currentVillage?.id]);

  useEffect(() => {
    loadMap();
  }, [centerX, centerY]);

  async function loadMap() {
    setLoading(true);
    setError(null);
    try {
      const response = await mapApi.getTiles(centerX, centerY, mapSize);
      setMapData(response.data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load map');
    } finally {
      setLoading(false);
    }
  }

  function handleTileClick(tile: MapTile) {
    setSelectedTile(tile);
  }

  function handleCenterOn(x: number, y: number) {
    setCenterX(x);
    setCenterY(y);
    setSelectedTile(null);
  }

  function handleJumpTo() {
    const x = parseInt(jumpX);
    const y = parseInt(jumpY);
    if (!isNaN(x) && !isNaN(y)) {
      handleCenterOn(x, y);
      setJumpX('');
      setJumpY('');
    }
  }

  function getTileImage(tile: MapTile): string {
    if (tile.type === 'village') {
      // Use village graphics based on tribe
      if (tile.village?.ownerTribe === 'romans') {
        return `/assets/map/d1.gif`;
      } else if (tile.village?.ownerTribe === 'gauls') {
        return `/assets/map/d2.gif`;
      } else if (tile.village?.ownerTribe === 'teutons') {
        return `/assets/map/d3.gif`;
      } else {
        return `/assets/map/d1.gif`;
      }
    } else if (tile.type === 'oasis') {
      // Use oasis graphics from oasis data if available, otherwise use variant
      if (tile.oasis?.imageNumber) {
        return `/assets/map/o${tile.oasis.imageNumber}.gif`;
      } else {
        const oasisVariant = Math.abs((tile.x * 2851 + tile.y * 2857) % 7) + 1;
        return `/assets/map/o${oasisVariant}.gif`;
      }
    } else {
      // Use terrain variant
      return `/assets/map/${tile.terrainVariant}.jpg`;
    }
  }

  if (!currentVillage) {
    return <div className={styles.loading}>Loading village...</div>;
  }

  if (loading && !mapData) {
    return <div className={styles.loading}>Loading map...</div>;
  }

  return (
    <div className={styles.container}>
      <div className={styles.mapPanel}>
        <div className="panel">
          <div className="panel-header">
            World Map - Center: ({centerX}|{centerY})
          </div>
          <div className="panel-body">
            {error && <div className="alert alert-error">{error}</div>}

            {/* Jump to coordinates */}
            <div className={styles.jumpControls}>
              <div className={styles.coordInputs}>
                <label>
                  X:
                  <input
                    type="number"
                    value={jumpX}
                    onChange={(e) => setJumpX(e.target.value)}
                    className={styles.coordInput}
                    placeholder={centerX.toString()}
                  />
                </label>
                <label>
                  Y:
                  <input
                    type="number"
                    value={jumpY}
                    onChange={(e) => setJumpY(e.target.value)}
                    className={styles.coordInput}
                    placeholder={centerY.toString()}
                  />
                </label>
                <button className="btn btn-secondary btn-sm" onClick={handleJumpTo}>
                  Jump to
                </button>
              </div>
              {currentVillage && (
                <button
                  className="btn btn-primary btn-sm"
                  onClick={() =>
                    handleCenterOn(currentVillage.coordinates.x, currentVillage.coordinates.y)
                  }
                >
                  Center on Village
                </button>
              )}
            </div>

            {/* Map Grid */}
            {mapData && (
              <div className={styles.mapContainer}>
                <div
                  className={styles.mapGrid}
                  style={{
                    gridTemplateColumns: `repeat(${mapSize * 2 + 1}, 1fr)`,
                  }}
                >
                  {mapData.tiles.map((tile) => {
                    const isCenter = tile.x === centerX && tile.y === centerY;
                    const isSelected = selectedTile?.x === tile.x && selectedTile?.y === tile.y;

                    return (
                      <div
                        key={`${tile.x},${tile.y}`}
                        className={`${styles.mapTile} ${isCenter ? styles.centerTile : ''} ${
                          isSelected ? styles.selectedTile : ''
                        }`}
                        onClick={() => handleTileClick(tile)}
                        style={{
                          backgroundImage: `url(${getTileImage(tile)})`,
                        }}
                      >
                        {tile.village && (
                          <div className={styles.villageMarker}>
                            <div
                              className={`${styles.villageIcon} ${
                                tile.village.isOwn ? styles.ownVillage : ''
                              }`}
                            />
                          </div>
                        )}
                        <div className={styles.tileCoords}>
                          {tile.x}|{tile.y}
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* Navigation arrows */}
                <div className={styles.navArrows}>
                  <button
                    className={`${styles.navButton} ${styles.navUp}`}
                    onClick={() => handleCenterOn(centerX, centerY - 1)}
                    title="Move North"
                  >
                    ▲
                  </button>
                  <button
                    className={`${styles.navButton} ${styles.navDown}`}
                    onClick={() => handleCenterOn(centerX, centerY + 1)}
                    title="Move South"
                  >
                    ▼
                  </button>
                  <button
                    className={`${styles.navButton} ${styles.navLeft}`}
                    onClick={() => handleCenterOn(centerX - 1, centerY)}
                    title="Move West"
                  >
                    ◀
                  </button>
                  <button
                    className={`${styles.navButton} ${styles.navRight}`}
                    onClick={() => handleCenterOn(centerX + 1, centerY)}
                    title="Move East"
                  >
                    ▶
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Tile Info Panel */}
      {selectedTile && (
        <div className={styles.infoPanel}>
          <div className="panel">
            <div className="panel-header">
              Tile ({selectedTile.x}|{selectedTile.y})
            </div>
            <div className="panel-body">
              {selectedTile.village ? (
                <div className={styles.villageInfo}>
                  <h3 className={styles.villageName}>{selectedTile.village.name}</h3>
                  <div className={styles.villageDetails}>
                    <div className={styles.detailRow}>
                      <span className={styles.label}>Owner:</span>
                      <span className={styles.value}>
                        {selectedTile.village.ownerName}
                        {selectedTile.village.isOwn && (
                          <span className={styles.ownBadge}>(You)</span>
                        )}
                      </span>
                    </div>
                    <div className={styles.detailRow}>
                      <span className={styles.label}>Tribe:</span>
                      <span className={styles.value}>{selectedTile.village.ownerTribe}</span>
                    </div>
                    <div className={styles.detailRow}>
                      <span className={styles.label}>Population:</span>
                      <span className={styles.value}>{selectedTile.village.population}</span>
                    </div>
                    <div className={styles.detailRow}>
                      <span className={styles.label}>Coordinates:</span>
                      <span className={styles.value}>
                        {selectedTile.x}|{selectedTile.y}
                      </span>
                    </div>
                  </div>
                  {!selectedTile.village.isOwn && (
                    <div className={styles.actions}>
                      <button className="btn btn-primary btn-sm">Send Troops</button>
                      <button className="btn btn-secondary btn-sm">Send Message</button>
                    </div>
                  )}
                  <button
                    className="btn btn-secondary btn-sm mt-2"
                    onClick={() => handleCenterOn(selectedTile.x, selectedTile.y)}
                  >
                    Center on this tile
                  </button>
                </div>
              ) : selectedTile.type === 'oasis' ? (
                <div className={styles.oasisInfo}>
                  <h3>Oasis</h3>
                  {selectedTile.oasis ? (
                    <div className={styles.villageDetails}>
                      <div className={styles.detailRow}>
                        <span className={styles.label}>Resource:</span>
                        <span className={styles.value}>
                          {selectedTile.oasis.resourceType.charAt(0).toUpperCase() +
                            selectedTile.oasis.resourceType.slice(1)}
                        </span>
                      </div>
                      <div className={styles.detailRow}>
                        <span className={styles.label}>Bonus:</span>
                        <span className={styles.value}>{selectedTile.oasis.bonus}%</span>
                      </div>
                      {selectedTile.oasis.owner && (
                        <div className={styles.detailRow}>
                          <span className={styles.label}>Occupied by:</span>
                          <span className={styles.value}>
                            {selectedTile.oasis.owner.villageName}
                            {selectedTile.oasis.owner.isOwn && (
                              <span className={styles.ownBadge}>(You)</span>
                            )}
                          </span>
                        </div>
                      )}
                      {!selectedTile.oasis.owner && (
                        <p className="mt-2">
                          Unoccupied oasis available for annexing. Provides resource bonuses to the
                          controlling village.
                        </p>
                      )}
                    </div>
                  ) : (
                    <p>An oasis that can provide resource bonuses to nearby villages.</p>
                  )}
                  <button
                    className="btn btn-secondary btn-sm mt-2"
                    onClick={() => handleCenterOn(selectedTile.x, selectedTile.y)}
                  >
                    Center on this tile
                  </button>
                </div>
              ) : (
                <div className={styles.wildernessInfo}>
                  <h3>Wilderness</h3>
                  <p>Empty land available for settling.</p>
                  <button
                    className="btn btn-secondary btn-sm mt-2"
                    onClick={() => handleCenterOn(selectedTile.x, selectedTile.y)}
                  >
                    Center on this tile
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
