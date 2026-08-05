import { useState } from 'react';
import { colors, fontMono } from '../../styles/tokens';

// Fila etiqueta+valor, copiable con un clic (📋→✅) — mismo criterio que
// "Todo valor mostrado en cualquier panel es una fila clickeable que lo
// copia" del toolbar original. La reusan Componente y Estilos por igual;
// cualquier vista nueva debería reusarla también en vez de armar su propia
// fila desde cero.
export default function CopyableRow({ label, value }) {
  const [copied, setCopied] = useState(false);
  const [hover, setHover] = useState(false);

  if (value === undefined || value === null || value === '') return null;

  function handleCopy() {
    navigator.clipboard
      .writeText(String(value))
      .then(() => {
        setCopied(true);
        setTimeout(() => setCopied(false), 1200);
      })
      .catch(() => {});
  }

  return (
    <div
      onClick={handleCopy}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        gap: 8,
        padding: '6px 8px',
        borderRadius: 6,
        cursor: 'pointer',
        fontSize: 12.5,
        color: colors.text,
        background: hover ? 'rgba(255,255,255,.04)' : 'transparent',
      }}
    >
      <span style={{ color: colors.muted, flexShrink: 0 }}>{label}</span>
      <span
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          fontFamily: fontMono,
          maxWidth: '65%',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
        }}
      >
        {String(value)}
        <span style={{ opacity: 0.6, flexShrink: 0 }}>{copied ? '✅' : '📋'}</span>
      </span>
    </div>
  );
}
