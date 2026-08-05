import { useInspectorStore } from '../../store/useInspectorStore';
import IconButton from '../shared/IconButton';
import { colors, radii, zIndex, shadow } from '../../styles/tokens';

// Pastilla minimizada — versión fundacional (Menú + Inspección solamente).
// El resto de accesos directos del original (Layout, Estilos, árbol HTML,
// acciones rápidas, Clonar, ocultar barra) se suman a medida que sus vistas
///features tengan su propio componente React — ver SKILL.md.
export default function Pill() {
  const inspecting = useInspectorStore((s) => s.inspecting);
  const panelOpen = useInspectorStore((s) => s.panelOpen);
  const toggleInspecting = useInspectorStore((s) => s.toggleInspecting);
  const togglePanel = useInspectorStore((s) => s.togglePanel);

  return (
    <div
      style={{
        position: 'fixed',
        bottom: 8,
        right: 0,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 4,
        background: colors.panel,
        border: `1px solid ${colors.border}`,
        borderRadius: radii.pill,
        padding: '10px 6px',
        boxShadow: shadow,
        zIndex: zIndex.host,
        // El host raíz es pointer-events:none (cubre toda la ventana para
        // poder posicionarnos fixed sin bloquear la página) — pointer-events
        // se hereda, así que cualquier contenido real e interactivo tiene
        // que reactivarlo acá.
        pointerEvents: 'auto',
      }}
    >
      <IconButton title="Menú" active={panelOpen} onClick={togglePanel}>
        ☰
      </IconButton>
      <div style={{ width: 20, height: 1, background: colors.border, margin: '2px 0' }} />
      <IconButton title="Inspección ON/OFF" active={inspecting} onClick={toggleInspecting}>
        ◎
      </IconButton>
    </div>
  );
}
