import { create } from 'zustand';
import type { Resources, ResourceFieldType, BuildingType } from '@travian/shared';

interface ResourceField {
  id: string;
  slot: number;
  type: ResourceFieldType;
  level: number;
  upgradeEndsAt: string | null;
}

interface Building {
  id: string;
  slot: number;
  type: BuildingType | null;
  level: number;
  upgradeEndsAt: string | null;
}

interface Troop {
  unitType: string;
  quantity: number;
}

interface Village {
  id: string;
  name: string;
  coordinates: { x: number; y: number };
  isCapital: boolean;
  population: number;
  loyalty: number;
  resources: Resources;
  warehouseCapacity: number;
  granaryCapacity: number;
  production: Resources;
  cropConsumption: number;
  resourceFields: ResourceField[];
  buildings: Building[];
  troops: Troop[];
}

interface VillageSummary {
  id: string;
  name: string;
  coordinates: { x: number; y: number };
  isCapital: boolean;
  population: number;
  resources: Resources;
  warehouseCapacity: number;
  granaryCapacity: number;
  production: Resources;
}

interface GameState {
  villages: VillageSummary[];
  currentVillage: Village | null;
  selectedVillageId: string | null;
  isLoading: boolean;
  error: string | null;

  setVillages: (villages: VillageSummary[]) => void;
  setCurrentVillage: (village: Village | null) => void;
  selectVillage: (villageId: string) => void;
  setLoading: (loading: boolean) => void;
  setError: (error: string | null) => void;

  updateResources: (villageId: string, resources: Resources) => void;
  updateBuilding: (villageId: string, slot: number, updates: Partial<Building>) => void;
  updateResourceField: (villageId: string, slot: number, updates: Partial<ResourceField>) => void;
}

export const useGameStore = create<GameState>((set, get) => ({
  villages: [],
  currentVillage: null,
  selectedVillageId: null,
  isLoading: false,
  error: null,

  setVillages: (villages) => set({ villages }),

  setCurrentVillage: (village) => set({ currentVillage: village }),

  selectVillage: (villageId) => set({ selectedVillageId: villageId }),

  setLoading: (isLoading) => set({ isLoading }),

  setError: (error) => set({ error }),

  updateResources: (villageId, resources) => {
    const { currentVillage, villages } = get();

    // Update current village if it's the one being updated
    if (currentVillage && currentVillage.id === villageId) {
      set({
        currentVillage: { ...currentVillage, resources },
      });
    }

    // Update village in list
    set({
      villages: villages.map((v) =>
        v.id === villageId ? { ...v, resources } : v
      ),
    });
  },

  updateBuilding: (villageId, slot, updates) => {
    const { currentVillage } = get();
    if (currentVillage && currentVillage.id === villageId) {
      set({
        currentVillage: {
          ...currentVillage,
          buildings: currentVillage.buildings.map((b) =>
            b.slot === slot ? { ...b, ...updates } : b
          ),
        },
      });
    }
  },

  updateResourceField: (villageId, slot, updates) => {
    const { currentVillage } = get();
    if (currentVillage && currentVillage.id === villageId) {
      set({
        currentVillage: {
          ...currentVillage,
          resourceFields: currentVillage.resourceFields.map((f) =>
            f.slot === slot ? { ...f, ...updates } : f
          ),
        },
      });
    }
  },
}));
