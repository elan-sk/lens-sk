import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.jsx';

const HOST_ID = 'lens-sk-react-host';

// Mismo criterio de inyección que toolbar.js: un <script src="..."> clásico
// que se auto-ejecuta al cargar. Idempotente — si ya está montado, una
// segunda inyección hace toggle de visibilidad en vez de duplicar el árbol
// (nunca crea un segundo host/root).
(function mount() {
  const existing = document.getElementById(HOST_ID);
  if (existing) {
    existing.style.display = existing.style.display === 'none' ? 'block' : 'none';
    return;
  }

  const host = document.createElement('div');
  host.id = HOST_ID;
  // `position:fixed` + `z-index` van en el HOST mismo (elemento liviano en
  // el light DOM), no solo en los divs de adentro del shadow root — mismo
  // patrón que usa el toolbar.js original (`host.style.cssText`). Un fixed
  // adentro de un shadow host sin posicionar quedaba en desventaja de
  // stacking-context contra el host YA posicionado del otro toolbar, aunque
  // compartieran el mismo z-index y el nuestro fuera después en el DOM —
  // bug real, confirmado con `elementsFromPoint` en la primera inyección
  // real conviviendo con la versión vanilla en la misma página. `all:initial`
  // además blindea el host de cualquier estilo heredado de la página host
  // (mismo motivo que en el original). `pointer-events:none` en el host y
  // `auto` en el contenido real (ver tokens/componentes) — si no, un host
  // fixed cubriendo toda la ventana bloquearía clics en el resto de la
  // página aunque esté vacío ahí.
  host.style.cssText = 'all:initial; position:fixed; inset:0; z-index:2147483647; pointer-events:none;';
  // Colgado de <html>, no de <body> — con z-index EMPATADO contra otra
  // herramienta (ej. la versión vanilla conviviendo en la misma página), el
  // desempate es por orden real en el árbol completo, no por "quién está
  // más adentro". Un host fixed colgado de <body> pierde contra uno colgado
  // directo de <html> aunque el de <body> esté "más profundo" en el orden
  // de inserción — <body> entero se resuelve como una sola posición en la
  // lista de hijos de <html> antes de que cualquier fixed-descendant se
  // "promueva" a comparar contra hermanos de <html>. Confirmado en vivo con
  // `document.elementsFromPoint` conviviendo con el toolbar original (que
  // sí cuelga de <html>) — recién con este cambio ganó el desempate.
  document.documentElement.appendChild(host);

  // Shadow DOM: aísla nuestra UI de cualquier selector CSS global de la
  // página host (reset agresivo, `* { box-sizing }`, etc.) — además de que
  // cada componente ya usa estilos inline (ver src/styles/tokens.js), así
  // no hay ningún <style>/<link> propio que dependa de cascada externa.
  const shadowRoot = host.attachShadow({ mode: 'open' });
  const mountPoint = document.createElement('div');
  shadowRoot.appendChild(mountPoint);

  createRoot(mountPoint).render(
    <StrictMode>
      <App hostEl={host} />
    </StrictMode>,
  );
})();
