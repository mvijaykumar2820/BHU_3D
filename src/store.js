import { create } from 'zustand';

export const useAreaStore = create((set) => ({
  areas: [],
  center: [
    { lat: 25.27, lng: 82.99 },
    { lat: 25.26, lng: 83.00 },
  ],
  appendAreas: (areas) => set(() => ({ areas: [...areas] })),
  setCenter: (center) => set(() => ({ center: [...center] })),
}));

export const useHiddenStore = create((set, get) => ({
  hiddenIds: new Set(),
  selectedBuildingId: null,
  toggleHidden: (id) => set((state) => {
    const next = new Set(state.hiddenIds);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    return {
      hiddenIds: next,
      selectedBuildingId: state.selectedBuildingId === id ? null : state.selectedBuildingId,
    };
  }),
  selectBuilding: (id) => set({ selectedBuildingId: id }),
  showAll: () => set({ hiddenIds: new Set() }),
  hiddenCount: () => get().hiddenIds.size,
}));

export const useAnnotationStore = create((set) => ({
  annotations: {},
  upsertAnnotation: (id, annotation) => set((state) => ({
    annotations: { ...state.annotations, [id]: annotation }
  })),
  removeAnnotation: (id) => set((state) => {
    const next = { ...state.annotations };
    delete next[id];
    return { annotations: next };
  }),
}));
