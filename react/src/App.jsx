import { useEffect } from 'react';
import { useInspectorStore } from './store/useInspectorStore';
import Pill from './components/Pill/Pill';
import Panel from './components/Panel/Panel';
import PinOutline from './components/shared/PinOutline';

// hostEl: el <div> real que contiene nuestro Shadow DOM (ver main.jsx) —
// necesario para excluir del listener global de selección cualquier clic
// que se origine DENTRO de nuestra propia UI (composedPath, no target
// directo: un clic en un botón dentro del shadow root sigue teniendo
// e.target === ese botón, pero composedPath() sí incluye el host). Mismo
// gotcha que `isInsideHost` en el toolbar.js original — sin esto, clickear
// un botón del propio panel re-pinea ESE botón como si fuera contenido real
// de la página.
export default function App({ hostEl }) {
  const inspecting = useInspectorStore((s) => s.inspecting);
  const pin = useInspectorStore((s) => s.pin);
  const pinnedEl = useInspectorStore((s) => s.pinnedEl);

  useEffect(() => {
    function onClick(e) {
      if (!inspecting) return;
      if (hostEl && e.composedPath().includes(hostEl)) return;
      e.preventDefault();
      e.stopPropagation();
      pin(e.target);
    }
    document.addEventListener('click', onClick, true);
    return () => document.removeEventListener('click', onClick, true);
  }, [inspecting, pin, hostEl]);

  return (
    <>
      <PinOutline el={pinnedEl} />
      <Panel />
      <Pill />
    </>
  );
}
