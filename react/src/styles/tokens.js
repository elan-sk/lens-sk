// Tokens de diseño compartidos — cada componente los usa en objetos de
// estilo inline (nunca clases/CSS externo), a propósito: así el widget no
// depende de ningún <style>/<link> global que pueda chocar con el CSS de la
// página host (ver nota de arquitectura en react/README.md). Mismo dark UI
// que el toolbar.js original (vanilla), para que ambas versiones se sientan
// coherentes mientras convivan.

export const colors = {
  bg: '#0b1220',
  panel: '#0f172a',
  border: '#1f2937',
  borderLight: '#374151',
  text: '#e5e7eb',
  muted: '#9ca3af',
  accent: '#ec4899',
  accentSoft: 'rgba(236, 72, 153, .15)',
  amber: '#f59e0b',
  danger: '#ef4444',
};

export const radii = { sm: 6, md: 10, pill: 999 };

export const fontFamily =
  "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif";
export const fontMono =
  "ui-monospace, SFMono-Regular, Menlo, Consolas, 'Liberation Mono', monospace";

// Máximo entero de 32 bits — MISMO valor exacto que usa el host del
// toolbar.js original (no un número "grande pero distinto"): si conviven
// las dos versiones en la misma página, la última en el DOM gana el
// desempate, pero con un valor más bajo la nuestra quedaba tapada por el
// host del original a pesar de estar después en el DOM (bug real,
// detectado en la primera inyección de prueba real contra la página).
export const zIndex = { host: 2147483647 };

export const shadow = '0 6px 24px rgba(0, 0, 0, .35)';
