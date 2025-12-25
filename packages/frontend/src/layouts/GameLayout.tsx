import { Outlet, NavLink, useNavigate } from 'react-router-dom';
import { useEffect } from 'react';
import { useAuthStore } from '../stores/authStore';
import { useGameStore } from '../stores/gameStore';
import { villageApi, resourceApi } from '../services/api';
import { joinVillage } from '../services/socket';
import { ResourceBar } from '../components/ResourceBar';
import styles from './GameLayout.module.css';

export function GameLayout() {
  const navigate = useNavigate();
  const { user, logout } = useAuthStore();
  const {
    villages,
    currentVillage,
    selectedVillageId,
    setVillages,
    setCurrentVillage,
    selectVillage,
    setLoading,
  } = useGameStore();

  // Load villages on mount
  useEffect(() => {
    loadVillages();
  }, []);

  // Load current village when selection changes
  useEffect(() => {
    if (selectedVillageId) {
      loadVillage(selectedVillageId);
      joinVillage(selectedVillageId);
    }
  }, [selectedVillageId]);

  // Auto-refresh resources every 30 seconds
  useEffect(() => {
    if (selectedVillageId) {
      const interval = window.setInterval(() => {
        refreshResources();
      }, 30000);

      return () => {
        clearInterval(interval);
      };
    }
  }, [selectedVillageId]);

  async function loadVillages() {
    try {
      setLoading(true);
      const response = await villageApi.list();
      setVillages(response.data.villages);

      // Select first village if none selected
      if (response.data.villages.length > 0 && !selectedVillageId) {
        selectVillage(response.data.villages[0].id);
      }
    } catch (error) {
      console.error('Failed to load villages:', error);
    } finally {
      setLoading(false);
    }
  }

  async function loadVillage(villageId: string) {
    try {
      setLoading(true);
      const response = await villageApi.get(villageId);
      setCurrentVillage(response.data.village);
    } catch (error) {
      console.error('Failed to load village:', error);
    } finally {
      setLoading(false);
    }
  }

  async function refreshResources() {
    if (!selectedVillageId) return;
    try {
      const response = await resourceApi.getCurrent(selectedVillageId);
      useGameStore.getState().updateResources(selectedVillageId, {
        lumber: response.data.lumber,
        clay: response.data.clay,
        iron: response.data.iron,
        crop: response.data.crop,
      });
    } catch (error) {
      console.error('Failed to refresh resources:', error);
    }
  }

  function handleLogout() {
    logout();
    navigate('/login');
  }

  return (
    <div className={styles.layout}>
      {/* Top bar with resources */}
      <header className={styles.header}>
        <div className={styles.headerLeft}>
          <h1 className={styles.logo}>Open Travian</h1>
          {villages.length > 1 && (
            <select
              className={styles.villageSelect}
              value={selectedVillageId || ''}
              onChange={(e) => selectVillage(e.target.value)}
            >
              {villages.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.name} ({v.coordinates.x}|{v.coordinates.y})
                </option>
              ))}
            </select>
          )}
        </div>

        {currentVillage && (
          <ResourceBar
            resources={currentVillage.resources}
            production={currentVillage.production}
            warehouseCapacity={currentVillage.warehouseCapacity}
            granaryCapacity={currentVillage.granaryCapacity}
          />
        )}

        <div className={styles.headerRight}>
          <span className={styles.username}>{user?.username}</span>
          <button className="btn btn-secondary" onClick={handleLogout}>
            Logout
          </button>
        </div>
      </header>

      {/* Navigation */}
      <nav className={styles.nav}>
        <NavLink
          to="/resources"
          className={({ isActive }) => `${styles.navLink} ${isActive ? styles.active : ''}`}
        >
          Resource Fields
        </NavLink>
        <NavLink
          to="/village"
          className={({ isActive }) => `${styles.navLink} ${isActive ? styles.active : ''}`}
        >
          Village Center
        </NavLink>
        <NavLink
          to="/barracks"
          className={({ isActive }) => `${styles.navLink} ${isActive ? styles.active : ''}`}
        >
          Barracks
        </NavLink>
        <NavLink
          to="/rally-point"
          className={({ isActive }) => `${styles.navLink} ${isActive ? styles.active : ''}`}
        >
          Rally Point
        </NavLink>
        <NavLink
          to="/hero"
          className={({ isActive }) => `${styles.navLink} ${isActive ? styles.active : ''}`}
        >
          Hero
        </NavLink>
        <NavLink
          to="/map"
          className={({ isActive }) => `${styles.navLink} ${isActive ? styles.active : ''}`}
        >
          Map
        </NavLink>
        <NavLink
          to="/reports"
          className={({ isActive }) => `${styles.navLink} ${isActive ? styles.active : ''}`}
        >
          Reports
        </NavLink>
        <NavLink
          to="/alliance"
          className={({ isActive }) => `${styles.navLink} ${isActive ? styles.active : ''}`}
        >
          Alliance
        </NavLink>
      </nav>

      {/* Main content */}
      <main className={styles.main}>
        <Outlet />
      </main>

      {/* Footer */}
      <footer className={styles.footer}>
        <span>
          Population: <strong>{currentVillage?.population || 0}</strong>
        </span>
        <span>|</span>
        <span>
          Coordinates: <strong>({currentVillage?.coordinates.x || 0}|{currentVillage?.coordinates.y || 0})</strong>
        </span>
      </footer>
    </div>
  );
}
