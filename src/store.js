import { create } from 'zustand';

export const useAppStore = create((set) => ({
  hiddenIds: new Set(),
  selectedBuildingId: null,
  annotations: {}, // { [osmId]: { title, notes, color } }

  toggleHidden: (id) => set((state) => {
    const next = new Set(state.hiddenIds);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    return { 
      hiddenIds: next,
      selectedBuildingId: state.selectedBuildingId === id ? null : state.selectedBuildingId
    };
  }),

  selectBuilding: (id) => set({ selectedBuildingId: id }),
  
  showAll: () => set({ hiddenIds: new Set() }),

  upsertAnnotation: (id, annotation) => set((state) => ({
    annotations: { ...state.annotations, [id]: annotation }
  })),

  removeAnnotation: (id) => set((state) => {
    const next = { ...state.annotations };
    delete next[id];
    return { annotations: next };
  }),
}));
