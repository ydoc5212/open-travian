import { Routes, Route, Navigate } from 'react-router-dom';
import { useEffect } from 'react';
import { useAuthStore } from './stores/authStore';
import { connectSocket, disconnectSocket } from './services/socket';

// Pages
import { LoginPage } from './pages/LoginPage';
import { RegisterPage } from './pages/RegisterPage';
import { GameLayout } from './layouts/GameLayout';
import { VillageView } from './pages/VillageView';
import { ResourceFieldsView } from './pages/ResourceFieldsView';
import { BarracksView } from './pages/BarracksView';
import { RallyPointView } from './pages/RallyPointView';
import { MapView } from './pages/MapView';
import { AllianceView } from './pages/AllianceView';
import { MarketplaceView } from './pages/MarketplaceView';
import { HeroView } from './pages/HeroView';
import { ReportsView } from './pages/ReportsView';

function PrivateRoute({ children }: { children: React.ReactNode }) {
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  return <>{children}</>;
}

function App() {
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);

  useEffect(() => {
    if (isAuthenticated) {
      connectSocket();
    } else {
      disconnectSocket();
    }

    return () => {
      disconnectSocket();
    };
  }, [isAuthenticated]);

  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/register" element={<RegisterPage />} />

      <Route
        path="/"
        element={
          <PrivateRoute>
            <GameLayout />
          </PrivateRoute>
        }
      >
        <Route index element={<Navigate to="/village" replace />} />
        <Route path="village" element={<VillageView />} />
        <Route path="resources" element={<ResourceFieldsView />} />
        <Route path="barracks" element={<BarracksView />} />
        <Route path="rally-point" element={<RallyPointView />} />
        <Route path="map" element={<MapView />} />
        <Route path="alliance" element={<AllianceView />} />
        <Route path="marketplace" element={<MarketplaceView />} />
        <Route path="hero" element={<HeroView />} />
        <Route path="reports" element={<ReportsView />} />
      </Route>

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

export default App;
