import { useState } from 'react'
import shotPanel from '../assets/manual/01-panel-inicial.png'
import shotSeleccion from '../assets/manual/02-seleccion-componente.png'
import shotEstilos from '../assets/manual/03-vista-estilos.png'
import shotLayout from '../assets/manual/04-vista-layout.png'
import shotArbol from '../assets/manual/05-arbol-html.png'
import shotCascada from '../assets/manual/06-arbol-ocultar-cascada.png'
import shotLupa from '../assets/manual/07-arbol-lupa-senalar.png'
import shotClonar from '../assets/manual/09-clonar-elemento.png'
import shotPersistencia from '../assets/manual/10-persistencia-reload.png'
import shotNegativo from '../assets/manual/11-valor-negativo-warning.png'
import shotDiagrama from '../assets/manual/12-diagrama-negativo.png'
import shotPastilla from '../assets/manual/13-pastilla-oculta.png'
import shotPedirCambio from '../assets/manual/ai-01-pedir-cambio.png'
import shotPregunta from '../assets/manual/ai-02-pregunta-opciones.png'
import shotOverlay from '../assets/manual/ai-03-overlay-heredado.png'

const TOPICS = [
  {
    id: 'empezando',
    kicker: 'Primeros pasos',
    title: 'Qué es y cómo se activa',
    body: (
      <>
        <p>Lens-SK se inyecta sobre cualquier página abierta en el navegador — no importa si es WordPress/PHP renderizado, una app React o Vue, o HTML estático. No modifica el proyecto: vive como un script suelto, autocontenido en Shadow DOM, sin chocar con el CSS ni el JS de la página real.</p>
        <p>Al cargar aparece una <b>pastilla vertical</b> pegada al borde derecho de la pantalla, siempre visible. De arriba hacia abajo: <b>☰ Menú</b> (abre/cierra el panel grande) y después los accesos directos — cursor de Inspección, Layout, Estilos, Ver estructura HTML, copiar clases/componente, capturar, Clonar.</p>
        <Shot src={shotPanel} caption="Panel abierto con la pastilla de accesos directos a la derecha" />
        <p className="muted">Ícono de ojo al final de la pastilla (o tecla <kbd>H</kbd>) la minimiza a un botón redondo 🛠️ sin perder ningún estado.</p>
      </>
    ),
  },
  {
    id: 'seleccion',
    kicker: 'Uso básico',
    title: 'Selección e Inspección',
    body: (
      <>
        <p>Activá el cursor de Inspección y hacé clic en cualquier elemento para seleccionarlo (fijarlo). Desactivalo para usar la página con normalidad sin seleccionar nada por accidente.</p>
        <ul>
          <li><b>Doble clic</b> con Inspección activa copia todas las clases del elemento, directo.</li>
          <li><b>Clic central</b> (rueda del mouse) fija Y abre de una el árbol HTML — funciona siempre, no depende de Inspección.</li>
          <li><b>Clic izquierdo sostenido</b> (~500ms) hace lo mismo, alternativa si el botón central no anda bien.</li>
          <li><kbd>↑ ↓ ← →</kbd> saltan a padre / hijo / hermano anterior / hermano siguiente del elemento fijado, sin volver a clickear en la página.</li>
        </ul>
        <Shot src={shotSeleccion} caption="Elemento seleccionado, resumen 📌 arriba del panel" />
      </>
    ),
  },
  {
    id: 'estilos',
    kicker: 'Edición en vivo',
    title: 'Vista previa de estilos',
    body: (
      <>
        <p>La vista 🎨 Estilos muestra tipografía, tamaño, márgenes, bordes y fondo, con un diagrama box-model clickeable — los nombres y números llevan directo a esa propiedad. Cada valor tiene un ✏️ al lado: un clic lo convierte en editable, y el cambio se aplica al instante sobre la página real.</p>
        <p>El cambio queda guardado en el navegador (nunca se sube a ningún lado) y sigue viéndose igual después de recargar. Un valor <b>negativo</b> (común para "sacar" un elemento de su caja) se marca en rojo en el diagrama y con ⚠️ en la fila — válido, pero una causa frecuente de bugs si no se nota a tiempo.</p>
        <Shot src={shotEstilos} caption="Diagrama box-model con overlay en vivo sobre la página" />
        <Shot src={shotNegativo} caption="Aviso ⚠️ junto a un valor de margin negativo" />
        <Shot src={shotDiagrama} caption="El mismo valor negativo resaltado en rojo en el diagrama" />
        <p>Con <b>TWCSS</b> activo, copiar un valor busca primero una clase de utilidad real del proyecto para ese mismo valor — filas de spacing suman un selector con la escala 0-12 de Tailwind, y Tipografía suma las clases <code>text-*</code>/<code>font-*</code> detectadas de verdad en el CSS del proyecto.</p>
      </>
    ),
  },
  {
    id: 'layout',
    kicker: 'Estructura',
    title: 'Vista Layout',
    body: (
      <>
        <p>Muestra cómo está armada la estructura del elemento y de todo lo que tiene adentro: etiquetas de flex/grid del contenedor y sus hijos directos, tipo de posicionamiento (relative/fixed/sticky/absolute) de cada elemento posicionado, y el resto de los recuadros de contexto anidados.</p>
        <p>Tres switches (Display / Position / Delineado) dejan elegir qué mostrar en componentes muy densos, para no saturar de recuadros y etiquetas.</p>
        <Shot src={shotLayout} caption="Overlay de Layout: grilla, etiquetas de tipo de posición" />
      </>
    ),
  },
  {
    id: 'arbol',
    kicker: 'Estructura',
    title: 'Árbol HTML (</>)',
    body: (
      <>
        <p>Un popup con el HTML del elemento seleccionado y sus descendientes, resaltado por colores como un editor de código. Cada fila con un elemento real tiene dos íconos siempre visibles (no dependen de hover): un ojo para ocultar/mostrar, y una lupa para señalar el elemento en la página sin cerrar el árbol.</p>
        <Shot src={shotArbol} caption="Árbol HTML anidado con clases Tailwind reales" />
        <p>Ocultar un elemento con hijos atenúa visualmente todo el bloque en el árbol — el cambio real guardado sigue siendo solo el del elemento clickeado.</p>
        <Shot src={shotCascada} caption="Ocultar un elemento cascadea visualmente a todos sus hijos" />
        <Shot src={shotLupa} caption="La lupa resalta el elemento en la página sin cerrar el popup" />
      </>
    ),
  },
  {
    id: 'clonar',
    kicker: 'Edición en vivo',
    title: 'Clonar elementos',
    body: (
      <>
        <p>El botón ⧉ (o tecla <kbd>D</kbd>) duplica el elemento fijado justo después del original — útil para ver cómo se comporta un layout con un ítem más (una fila flex con <code>wrap</code>, una grilla) sin agregar contenido real al proyecto.</p>
        <p>Cada clon lleva un marcador numerado; solo se guarda la referencia (selector del original + cantidad), nunca el HTML del clon — se regenera clonando de nuevo en cada recarga.</p>
        <Shot src={shotClonar} caption="Elemento clonado junto al original, con marcador numerado" />
      </>
    ),
  },
  {
    id: 'ia',
    kicker: 'Modo IA (opcional)',
    title: 'Asistencia Claude',
    body: (
      <>
        <p>Con una sesión de Claude Code escuchando este mismo proyecto, aparece la pestaña ✨ Asistencia Claude. Es la única puerta para que un cambio termine escrito en el archivo fuente real — siempre a pedido explícito de un clic, nunca automático.</p>
        <p><b>🪄 Pedir cambio:</b> texto libre describiendo qué querés, con la captura del elemento adjunta siempre (Claude ve la página real, no solo lee clases). Se aplica como vista previa, editable después.</p>
        <Shot src={shotPedirCambio} caption="Pedir cambio con el menú de autocompletado / abierto" />
        <p><b>📤 Aplicar / Aplicar todos:</b> toma lo que esté en vista previa (de Claude, de una edición manual, o de una mezcla) y lo escribe en el archivo real. "Aplicar todos" hace lo mismo con todos los cambios pendientes de la página de una sola vez.</p>
        <p><b>Preguntas de Claude:</b> si necesita algo más, la pregunta aparece en el propio panel — nunca en el chat del editor. Puede venir con opciones para elegir, además de una respuesta libre.</p>
        <Shot src={shotPregunta} caption="Pregunta de Claude con opciones, dentro del panel del navegador" />
        <p><b>El overlay no desaparece:</b> si veías Layout o Estilos antes de abrir Asistencia, ese overlay se sigue mostrando y siguiendo al elemento en scroll — no hace falta memorizar el layout de memoria mientras escribís el pedido.</p>
        <Shot src={shotOverlay} caption="Overlay de Layout todavía visible con el panel de Asistencia abierto" />
        <p className="muted">Sin una sesión de Claude Code escuchando, esta pestaña directamente no aparece — el resto de la herramienta funciona exactamente igual.</p>
      </>
    ),
  },
  {
    id: 'atajos',
    kicker: 'Productividad',
    title: 'Atajos de teclado',
    body: (
      <>
        <p><kbd>Shift</kbd> + tecla funciona siempre. La tecla sola (sin Shift) solo funciona con Inspección activada, y nunca mientras estás escribiendo en un campo de texto.</p>
        <ul>
          <li><kbd>Espacio</kbd> — abrir/cerrar el panel</li>
          <li><kbd>I</kbd> — Inspección on/off</li>
          <li><kbd>S</kbd> / <kbd>L</kbd> — Estilos / Layout</li>
          <li><kbd>V</kbd> o <kbd>Enter</kbd> — Ver estructura HTML</li>
          <li><kbd>C</kbd> / <kbd>T</kbd> — copiar clases / copiar clase de componente</li>
          <li><kbd>P</kbd> — captura para chat</li>
          <li><kbd>D</kbd> — clonar el elemento fijado</li>
          <li><kbd>G</kbd> — copiar el CSS real de todo lo cambiado</li>
          <li><kbd>R</kbd> — restablecer toda la vista previa de la página</li>
          <li><kbd>H</kbd> — ocultar/mostrar la barra</li>
          <li><kbd>↑ ↓ ← →</kbd> — padre / hijo / hermano anterior / siguiente</li>
          <li><kbd>Esc</kbd> — cancela una edición en curso, o cierra el popup abierto</li>
        </ul>
        <Shot src={shotPastilla} caption="Pastilla minimizada, con el botón 🛠️ para restaurar" />
      </>
    ),
  },
  {
    id: 'persistencia',
    kicker: 'Comportamiento',
    title: 'Persistencia entre recargas',
    body: (
      <>
        <p>El elemento seleccionado, la vista activa, los cambios de estilo/clases/contenido, los clones y los elementos ocultos se guardan solos (por página) y se restauran automáticamente después de un F5 completo — nada se pierde hasta que decidas restablecerlo con <kbd>R</kbd> o el botón ↺.</p>
        <Shot src={shotPersistencia} caption="Estado idéntico tras un F5 completo: misma selección, misma vista, mismo scroll" />
      </>
    ),
  },
]

function Shot({ src, caption }) {
  return (
    <figure className="docs-shot">
      <img src={src} alt={caption} />
      <figcaption>{caption}</figcaption>
    </figure>
  )
}

export default function Docs() {
  const [active, setActive] = useState(TOPICS[0].id)
  const topic = TOPICS.find((t) => t.id === active) ?? TOPICS[0]

  return (
    <section id="docs-page">
      <div className="wrap docs-shell">
        <nav className="docs-nav">
          {TOPICS.map((t) => (
            <button
              key={t.id}
              className={t.id === active ? 'active' : ''}
              onClick={() => setActive(t.id)}
            >
              {t.title}
            </button>
          ))}
        </nav>
        <article className="docs-topic">
          <span className="label topic-kicker">{topic.kicker}</span>
          <h2>{topic.title}</h2>
          <div className="topic-body">{topic.body}</div>
        </article>
      </div>
    </section>
  )
}
