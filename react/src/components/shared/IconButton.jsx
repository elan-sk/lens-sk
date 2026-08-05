import { colors, radii } from '../../styles/tokens';

// Botón solo-ícono reutilizable — lo usan tanto la Pastilla (Menú,
// Inspección) como, más adelante, cualquier accesos rápido nuevo. Mismo
// criterio de "componente chico y genérico" que CopyableRow.
export default function IconButton({ title, active, onClick, children }) {
  return (
    <button
      title={title}
      onClick={onClick}
      style={{
        width: 34,
        height: 34,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: active ? colors.accent : 'transparent',
        color: active ? '#fff' : colors.text,
        border: 'none',
        borderRadius: radii.sm,
        cursor: 'pointer',
        fontSize: 16,
        padding: 0,
        flexShrink: 0,
      }}
    >
      {children}
    </button>
  );
}
