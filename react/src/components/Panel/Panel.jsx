import { useInspectorStore } from '../../store/useInspectorStore';
import { colors, radii, zIndex, shadow, fontMono } from '../../styles/tokens';
import ComponentView from './views/ComponentView';
import StylesView from './views/StylesView';

// Cada vista nueva se suma acá — 2 vistas reales por ahora (Componente,
// Estilos), el resto (Contraste/Layout/A11y/árbol HTML) queda para
// iteraciones siguientes, ver SKILL.md "React: fundación en progreso".
const VIEWS = [
  { id: 'component', label: '🧩 Componente', Component: ComponentView },
  { id: 'styles', label: '🎨 Estilos', Component: StylesView },
];

export default function Panel() {
  const panelOpen = useInspectorStore((s) => s.panelOpen);
  const activeView = useInspectorStore((s) => s.activeView);
  const setActiveView = useInspectorStore((s) => s.setActiveView);
  const pinnedEl = useInspectorStore((s) => s.pinnedEl);
  const pinnedSelector = useInspectorStore((s) => s.pinnedSelector);

  if (!panelOpen) return null;

  const active = VIEWS.find((v) => v.id === activeView) || VIEWS[0];
  const ActiveComponent = active.Component;

  return (
    <div
      style={{
        position: 'fixed',
        bottom: 8,
        right: 56,
        width: 340,
        maxHeight: '80vh',
        overflowY: 'auto',
        background: colors.panel,
        border: `1px solid ${colors.border}`,
        borderRadius: radii.md,
        padding: 14,
        boxShadow: shadow,
        zIndex: zIndex.host,
        pointerEvents: 'auto',
        color: colors.text,
        fontSize: 13,
      }}
    >
      <div
        style={{
          fontSize: 11.5,
          color: colors.muted,
          marginBottom: 10,
          wordBreak: 'break-word',
          fontFamily: fontMono,
        }}
      >
        {pinnedEl ? '📌 ' + pinnedSelector : 'Seleccioná un elemento en la página (Inspección ON).'}
      </div>

      <div style={{ display: 'flex', gap: 6, marginBottom: 10 }}>
        {VIEWS.map((v) => (
          <button
            key={v.id}
            onClick={() => setActiveView(v.id)}
            style={{
              flex: 1,
              padding: '6px 4px',
              fontSize: 11.5,
              background: activeView === v.id ? colors.accent : 'transparent',
              color: activeView === v.id ? '#fff' : colors.text,
              border: `1px solid ${activeView === v.id ? colors.accent : colors.border}`,
              borderRadius: radii.sm,
              cursor: 'pointer',
            }}
          >
            {v.label}
          </button>
        ))}
      </div>

      {pinnedEl ? <ActiveComponent el={pinnedEl} /> : null}
    </div>
  );
}
