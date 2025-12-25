import { useAuthStore } from '../stores/authStore';

const API_BASE = '/api';

async function request<T>(
  endpoint: string,
  options: RequestInit = {}
): Promise<T> {
  const token = useAuthStore.getState().token;

  const headers: HeadersInit = {
    'Content-Type': 'application/json',
    ...(options.headers || {}),
  };

  if (token) {
    (headers as Record<string, string>)['Authorization'] = `Bearer ${token}`;
  }

  const response = await fetch(`${API_BASE}${endpoint}`, {
    ...options,
    headers,
  });

  const data = await response.json();

  if (!response.ok) {
    throw new Error(data.error || 'Request failed');
  }

  return data;
}

// Auth API
export const authApi = {
  register: (email: string, password: string, username: string, tribe: string) =>
    request<{ success: boolean; data: { token: string; user: any } }>('/auth/register', {
      method: 'POST',
      body: JSON.stringify({ email, password, username, tribe }),
    }),

  login: (email: string, password: string) =>
    request<{ success: boolean; data: { token: string; user: any } }>('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    }),

  me: () =>
    request<{ success: boolean; data: { user: any } }>('/auth/me'),
};

// Village API
export const villageApi = {
  list: () =>
    request<{ success: boolean; data: { villages: any[] } }>('/villages'),

  get: (villageId: string) =>
    request<{ success: boolean; data: { village: any } }>(`/villages/${villageId}`),

  rename: (villageId: string, name: string) =>
    request<{ success: boolean; data: { name: string } }>(`/villages/${villageId}/name`, {
      method: 'PATCH',
      body: JSON.stringify({ name }),
    }),
};

// Building API
export const buildingApi = {
  getSlot: (villageId: string, slot: number) =>
    request<{ success: boolean; data: any }>(`/buildings/village/${villageId}/slot/${slot}`),

  upgrade: (villageId: string, slot: number, buildingType?: string) =>
    request<{ success: boolean; data: any }>(`/buildings/village/${villageId}/slot/${slot}/upgrade`, {
      method: 'POST',
      body: JSON.stringify({ buildingType }),
    }),

  cancel: (villageId: string, slot: number) =>
    request<{ success: boolean }>(`/buildings/village/${villageId}/slot/${slot}/cancel`, {
      method: 'POST',
    }),
};

// Resource API
export const resourceApi = {
  getField: (villageId: string, slot: number) =>
    request<{ success: boolean; data: any }>(`/resources/village/${villageId}/field/${slot}`),

  upgradeField: (villageId: string, slot: number) =>
    request<{ success: boolean; data: any }>(`/resources/village/${villageId}/field/${slot}/upgrade`, {
      method: 'POST',
    }),

  getCurrent: (villageId: string) =>
    request<{ success: boolean; data: any }>(`/resources/village/${villageId}`),
};

// Troops API
export const troopsApi = {
  getAvailable: (villageId: string) =>
    request<{ success: boolean; data: any }>(`/troops/village/${villageId}/available`),

  train: (villageId: string, unitType: string, quantity: number) =>
    request<{ success: boolean; data: any }>(`/troops/village/${villageId}/train`, {
      method: 'POST',
      body: JSON.stringify({ unitType, quantity }),
    }),

  getVillageTroops: (villageId: string) =>
    request<{ success: boolean; data: any }>(`/troops/village/${villageId}`),
};

// Combat API
export const combatApi = {
  getTarget: (x: number, y: number) =>
    request<{ success: boolean; data: any }>(`/combat/target/${x}/${y}`),

  sendAttack: (fromVillageId: string, toX: number, toY: number, troops: { unitType: string; quantity: number }[], attackType: 'attack' | 'raid' | 'reinforcement') =>
    request<{ success: boolean; data: any }>('/combat/attack', {
      method: 'POST',
      body: JSON.stringify({ fromVillageId, toX, toY, troops, attackType }),
    }),

  getIncoming: (villageId: string) =>
    request<{ success: boolean; data: any }>(`/combat/incoming/${villageId}`),

  getOutgoing: (villageId: string) =>
    request<{ success: boolean; data: any }>(`/combat/outgoing/${villageId}`),
};

// Reports API
export const reportsApi = {
  getAll: () =>
    request<{ success: boolean; data: any }>('/reports'),

  get: (reportId: string) =>
    request<{ success: boolean; data: any }>(`/reports/${reportId}`),

  markRead: (reportId: string) =>
    request<{ success: boolean }>(`/reports/${reportId}/read`, {
      method: 'PUT',
    }),

  delete: (reportId: string) =>
    request<{ success: boolean }>(`/reports/${reportId}`, {
      method: 'DELETE',
    }),

  getUnreadCount: () =>
    request<{ success: boolean; data: { count: number } }>('/reports/unread/count'),
};

// Map API
export const mapApi = {
  getTiles: (x: number, y: number, size: number = 7) =>
    request<{ success: boolean; data: any }>(`/map?x=${x}&y=${y}&size=${size}`),
};

// Oasis API
export const oasisApi = {
  getInArea: (x: number, y: number, size: number = 7) =>
    request<{ success: boolean; data: any }>(`/oases?x=${x}&y=${y}&size=${size}`),

  get: (oasisId: string) =>
    request<{ success: boolean; data: any }>(`/oases/${oasisId}`),
};

// Marketplace API
export const marketplaceApi = {
  getOffers: (villageId: string) =>
    request<{ success: boolean; data: any }>(`/marketplace/offers?villageId=${villageId}`),

  getMyOffers: (villageId: string) =>
    request<{ success: boolean; data: any }>(`/marketplace/my-offers?villageId=${villageId}`),

  createOffer: (villageId: string, offerType: string, offerAmount: number, wantType: string, wantAmount: number) =>
    request<{ success: boolean; data: any }>('/marketplace/offer', {
      method: 'POST',
      body: JSON.stringify({ villageId, offerType, offerAmount, wantType, wantAmount }),
    }),

  acceptOffer: (offerId: string, villageId: string) =>
    request<{ success: boolean; data: any }>(`/marketplace/accept/${offerId}`, {
      method: 'POST',
      body: JSON.stringify({ villageId }),
    }),

  cancelOffer: (offerId: string) =>
    request<{ success: boolean; data: any }>(`/marketplace/offer/${offerId}`, {
      method: 'DELETE',
    }),

  getTrades: (villageId: string) =>
    request<{ success: boolean; data: any }>(`/marketplace/trades?villageId=${villageId}`),
};

// Hero API
export const heroApi = {
  get: () =>
    request<{ success: boolean; data: any }>('/hero'),

  create: (name: string) =>
    request<{ success: boolean; data: any }>('/hero/create', {
      method: 'POST',
      body: JSON.stringify({ name }),
    }),

  assign: (villageId: string) =>
    request<{ success: boolean; data: any }>(`/hero/assign/${villageId}`, {
      method: 'PUT',
    }),

  revive: () =>
    request<{ success: boolean; data: any }>('/hero/revive', {
      method: 'POST',
    }),
};

// Alliance API
export const allianceApi = {
  getCurrent: () =>
    request<{ success: boolean; data: { alliance: any } }>('/alliance'),

  get: (allianceId: string) =>
    request<{ success: boolean; data: { alliance: any } }>(`/alliance/${allianceId}`),

  create: (name: string, tag: string) =>
    request<{ success: boolean; data: { alliance: any } }>('/alliance', {
      method: 'POST',
      body: JSON.stringify({ name, tag }),
    }),

  invite: (username: string) =>
    request<{ success: boolean; data: { message: string } }>(`/alliance/invite/${username}`, {
      method: 'POST',
    }),

  join: (allianceId: string) =>
    request<{ success: boolean; data: { message: string } }>(`/alliance/join/${allianceId}`, {
      method: 'POST',
    }),

  leave: () =>
    request<{ success: boolean; data: { message: string } }>('/alliance/leave', {
      method: 'POST',
    }),

  kick: (userId: string) =>
    request<{ success: boolean; data: { message: string } }>(`/alliance/kick/${userId}`, {
      method: 'DELETE',
    }),

  changeRole: (userId: string, role: string) =>
    request<{ success: boolean; data: { message: string } }>(`/alliance/role/${userId}`, {
      method: 'PUT',
      body: JSON.stringify({ role }),
    }),
};

// Plus API
export const plusApi = {
  getStatus: () =>
    request<{ success: boolean; data: { isActive: boolean; expiresAt: string | null } }>('/plus'),

  activate: () =>
    request<{ success: boolean; data: { isActive: boolean; expiresAt: string } }>('/plus/activate', {
      method: 'POST',
    }),
};
