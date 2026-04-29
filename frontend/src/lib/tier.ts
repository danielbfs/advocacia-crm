import { create } from "zustand";
import { api } from "./api";

interface TierState {
  tier: "basic" | "advanced" | null;
  isLoading: boolean;
  loadTier: () => Promise<void>;
}

export const useTier = create<TierState>((set) => ({
  tier: null,
  isLoading: true,

  loadTier: async () => {
    try {
      // Ajuste na URL para não usar /api/v1 já que api base_url já inclui, 
      // ou se tiver erro na config, usa axios direto se for global. 
      // Em main.py adicionamos em /api/v1/config/tier
      const { data } = await api.get<{ tier: "basic" | "advanced" }>("/config/tier");
      set({ tier: data.tier, isLoading: false });
    } catch (error) {
      console.error("Failed to load tier", error);
      set({ tier: "basic", isLoading: false }); // fallback
    }
  },
}));
