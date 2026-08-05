import { useEffect, useState } from 'react';
import { colors, zIndex } from '../../styles/tokens';

// Contorno fijo sobre el elemento fijado — equivalente simplificado del
// `pinOutline` del toolbar original. Recalcula en scroll/resize + un
// intervalo corto de respaldo (layouts que cambian de tamaño sin disparar
// ninguno de esos dos eventos, ej. una animación) — un ResizeObserver real
// sobre el propio elemento es una mejora pendiente, no bloqueante para la
// fundación.
export default function PinOutline({ el }) {
  const [rect, setRect] = useState(null);

  useEffect(() => {
    if (!el) {
      setRect(null);
      return;
    }
    function update() {
      setRect(el.getBoundingClientRect());
    }
    update();
    window.addEventListener('scroll', update, true);
    window.addEventListener('resize', update);
    const intervalId = setInterval(update, 400);
    return () => {
      window.removeEventListener('scroll', update, true);
      window.removeEventListener('resize', update);
      clearInterval(intervalId);
    };
  }, [el]);

  if (!rect) return null;

  return (
    <div
      style={{
        position: 'fixed',
        top: rect.top,
        left: rect.left,
        width: rect.width,
        height: rect.height,
        border: `2px dashed ${colors.accent}`,
        borderRadius: 2,
        pointerEvents: 'none',
        zIndex: zIndex.host - 1,
        boxShadow: `0 0 0 2px ${colors.accentSoft}`,
      }}
    />
  );
}
