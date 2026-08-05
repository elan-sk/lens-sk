import { create } from 'zustand';
import { cssSelectorFor } from '../lib/dom';

// Store único de la herramienta — mismo espíritu que el objeto de estado
// centralizado del toolbar.js original (saveState/restoreState), pero acá
// vive en memoria vía Zustand en vez de un blob de localStorage a mano. La
// persistencia entre recargas (equivalente a __claudeInspectorState) es un
// paso posterior, no parte de esta fundación — ver SKILL.md.
export const useInspectorStore = create((set) => ({
  inspecting: true,
  panelOpen: false,
  activeView: 'component',

  // El elemento real (no serializable) vive en el store igual — Zustand no
  // obliga a que el estado sea JSON-safe, y guardarlo acá (en vez de solo
  // el selector) evita tener que re-resolverlo por selector en cada render.
  pinnedEl: null,
  pinnedSelector: null,

  toggleInspecting: () => set((s) => ({ inspecting: !s.inspecting })),
  togglePanel: () => set((s) => ({ panelOpen: !s.panelOpen })),
  setActiveView: (view) => set({ activeView: view }),

  pin: (el) =>
    set({
      pinnedEl: el,
      pinnedSelector: el ? cssSelectorFor(el) : null,
      panelOpen: true,
    }),

  clearPin: () => set({ pinnedEl: null, pinnedSelector: null }),
}));
