# Lens-SK — Documentación técnica (para el dueño de la herramienta)

Este documento es **interno**: arquitectura, protocolos y decisiones de diseño con
detalle de código. `MANUAL.md`/`MANUAL.docx` son la documentación de **uso** — si algo
solo importa para leer/tocar el código, va acá, no ahí. `SKILL.md` es el tercer
documento del set: instrucciones para que **Claude** sepa cómo comportarse al trabajar
en este skill (no es una explicación para un humano).

Versión cubierta: **1.2.7** (vanilla) — puerto React en fundación, ver `react/README.md`.

---

## 1. Mapa del repo

```
dev-inspector-toolbar/
├── SKILL.md              — instrucciones para Claude (no para humanos)
├── MANUAL.md / .docx      — documentación de uso, para cualquier usuario
├── ARCHITECTURE.md        — este archivo
├── landing-mockup.html    — landing HTML actual (a migrar a React)
├── assets/
│   ├── logo-elan-sk.svg
│   └── manual/*.png        — capturas usadas en MANUAL.md/.docx
├── scripts/
│   ├── toolbar.js                — EL WIDGET vanilla completo (~9860 líneas, un solo archivo)
│   ├── lens-sk-live-server.js    — servidor puente (Node, sin dependencias) del modo live
│   ├── lens-sk-project-map.js    — genera .lens-sk-cache/project-map.json
│   ├── lens-sk-live-poll.js      — cliente de referencia standalone (poll, no SSE)
│   ├── dev-tools-sync.js         — copia scripts/* → assets/dev-tools/ en el PROYECTO destino
│   ├── modern-screenshot.umd.js  — vendorizada, usada por 📸/captura de Asistencia Claude
│   ├── mammoth.browser.min.js    — vendorizada, DOCX → texto (adjuntos de Asistencia Claude)
│   ├── pdf.min.js / pdf.worker.min.js — vendorizadas, PDF → texto
│   └── xlsx.full.min.js          — vendorizada, XLSX → tabla Markdown
└── react/                 — puerto React (fundación, NO reemplaza al vanilla), ver su propio README.md
```

**Cómo se instala en un proyecto:** `scripts/*.js` se copian (no se importan) a
`assets/dev-tools/` del proyecto destino vía `dev-tools-sync.js`, y `toolbar.js`
(compilado, un solo archivo) se enqueuea como `<script src="...">` clásico desde
`functions.php` (o equivalente). El widget nunca se bundlea con el proyecto — vive
inyectado, standalone.

---

## 2. `toolbar.js` — arquitectura interna

Un único IIFE. No hay build step propio (se edita el archivo compilado directo — por
eso existe el puerto React, para poder tener una arquitectura de componentes real). Mapa
de secciones (línea de inicio → qué hay):

| Línea | Sección |
|---|---|
| 148 | i18n ES/EN — `tr(key)`, diccionario `STRINGS` |
| 389–617 | `HELP_CONTENT_HTML_ES/EN` — contenido del modal de Ayuda general |
| 621–685 | `LIVE_HELP_CONTENT_HTML_ES/EN` — Ayuda específica de Asistencia Claude |
| 705–767 | Host + Shadow DOM principal (`host`, `root`) |
| 768–1064 | Pastilla + panel grande (estructura DOM base) |
| 1065–1150 | Modal de Ayuda (host + shadow DOM aparte) |
| 1151–1353 | Modal de pregunta standalone (`askUserHost`, protocolo `/ask-user`) |
| 1354–1680 | "Pedir cambio a Claude" — compose box, `liveTextarea`, adjuntos |
| 1681–2019 | Historial de Asistencia Claude + "Aplicar todos" |
| 2020–2217 | Popup `</>` Ver estructura HTML (árbol DOM) |
| 2218–2338 | Modal de configuración de Breakpoints |
| 3444–3594 | Overlays fuera del shadow root (pinOutline, hoverOutline, spacing overlays, layoutOverlayRoot) |
| 3595–3897 | Editor de imagen simple (recuadros/flechas/texto sobre una captura) |
| 3957–4016 | Vista previa de estilos — overrides en `localStorage`, por página+selector |
| 4017–4247 | Historial de Asistencia Claude (persistencia) |
| 4282–4677 | Clonar elementos |
| 4678–5092 | Conexión con el helper del modo live (`checkLiveHelper`, `liveHelperAvailable`) |
| 5093–5604 | Adjuntar documentos (PDF/DOCX/XLSX/imagen → texto/JPEG comprimido) |
| 5604–5750 | `attachAutocomplete` (dropdown genérico para `<input>`, ej. clases CSS) |
| ~5750–5920 | `attachComposeMenus` (menú `/` y `@` del textarea de Asistencia Claude) |
| 6987–7285 | Comparación/normalización de valores CSS (`COLOR_PROPS`, `rgbToHex`, etc.) |
| 7296–7681 | Escala numérica de Tailwind (🔢), detección de clases `text-*`/`font-*` (🔤) |
| 7682–onward | Estado central: `pinnedEl`, `activeTool`, `lastViewTool`, `inspectingActive` |
| 7829–7863 | `renderActiveTool()` / `renderUnderlyingOverlay()` — el despachador de vistas |
| 8206 | `renderComponent(el)` |
| 8247 | `renderLive(el)` |
| 8262 | `renderStyles(el)` |
| 8477 | `renderContrast(el)` |
| ~8500 | Diagrama box-model (esquemático, no a escala) |
| 8608–8787 | Overlay de estructura Layout (`renderStructureOverlay`, colores por profundidad) |
| 8795 | Áreas de grid con nombre (`AREA_COLORS`, `parseGridAreas`) |
| 9149 | `renderLayout(el)` |
| 9274 | `doCapture(el, btn)` — captura del elemento (📸) |
| 9359 | `runA11yScan()` |
| 9400 | Config de Breakpoints (Auto/Manual) |
| 9740 | `saveState()`/`restoreState()` — persistencia completa en `localStorage` |

### 2.1 — Estado central

No hay store formal (a diferencia del puerto React, que usa Zustand) — variables `var`
en el scope del IIFE: `pinnedEl`, `activeTool`, `lastViewTool` (agregado en 1.2.7, ver
§2.3), `inspectingActive`, `currentLang`, `liveHelperAvailable`, etc. `saveState()` (línea
9740) serializa lo persistible a un único blob en `localStorage`
(`__claudeInspectorState` + claves aparte para adjuntos/texto en curso por
selector+página). `restoreState()` es el inverso, corre al cargar.

### 2.2 — Shadow DOM: por qué tantos hosts separados

Cada modal/overlay que necesita quedar SIEMPRE por encima de la página host (Ayuda,
árbol HTML, breakpoints, editor de imagen, pregunta standalone) tiene su **propio**
`<div>` colgado de `document.documentElement` con `attachShadow({mode:'open'})`, en vez
de vivir todos dentro del mismo shadow root del panel principal. Por qué: cada uno
necesita su propio `z-index:2147483647` + `position:fixed;inset:0` para no competir por
stacking-context con el panel principal cuando ambos están abiertos a la vez.

**`isInsideHost(e)` (línea ~7686 en adelante, buscar por nombre)** es la lista
hardcodeada de todos estos hosts — el capture-phase listener de selección de elementos
(`onClick`, `onMouseMove`, etc.) usa `e.composedPath()` contra esta lista para
excluirlos de "esto es un elemento de la página, lo selecciono". **Bug real ya
cometido:** agregar un host nuevo (`askUserHost`) sin sumarlo acá hace que, con
Inspección activada, un clic DENTRO de ese modal se interprete como "fijar este
elemento de la página" en vez de disparar su propio botón. Cualquier host nuevo tiene
que sumarse a esa lista.

### 2.3 — El despachador de vistas: `renderActiveTool()`

```
renderActiveTool()
  si activeTool === 'live':
    renderUnderlyingOverlay(pinnedEl)   // dibuja/actualiza el overlay de lastViewTool
  si no:
    hideOverlays()
    lastViewTool = activeTool           // solo se actualiza fuera de 'live'
  redibuja pinOutline según inspectingActive
  despacha a render{Component,Styles,Contrast,Layout,Live}(pinnedEl)
```

`lastViewTool` (agregado en 1.2.7) es la última vista REAL (no `'live'`) seleccionada.
Asistencia Claude no tiene overlay propio — "hereda" el de `lastViewTool` (Layout o
Estilos; Componente/Contraste/A11y no tienen overlay, así que ahí no se dibuja nada).
`renderUnderlyingOverlay()` simplemente llama a `renderStyles`/`renderLayout` (que de
paso reescriben `panel` con SU contenido) y quien la invoca se encarga de pisar `panel`
de nuevo con `renderLive()` después — ver también `refreshOverlaysOnScrollResize()`
(línea ~8152), que hace lo mismo en cada scroll/resize para que el overlay heredado siga
al elemento en vivo, no solo en el render inicial.

### 2.4 — Autocompletado del textarea de Asistencia Claude

`attachComposeMenus(textarea)` (no `attachAutocomplete`, que es genérico para
`<input>` de un solo valor) maneja **ambos** triggers (`/` y `@`) con un solo dropdown
compartido — el token bajo el cursor determina cuál aplica. `SLASH_COMMANDS` es una
lista curada a mano (no un endpoint que lea `~/.claude/skills` en vivo — decisión
tomada explícitamente vía el protocolo `/ask-user`, ver `MANUAL.md` §7.1 para el
razonamiento). El menú `@` usa `filePathsCache` (poblado por `ensureComponentMap()`,
`Object.keys(data.files)` de `project-map.json`).

**Bug real ya cometido:** `attachComposeMenus(liveTextarea)` se llama ANTES de que
`liveTextarea` esté insertado en el DOM real (se crea suelto, se appendea a
`liveComposeBox` recién más abajo en el archivo) — `insertAdjacentElement('afterend', …)`
sobre un nodo sin `parentNode` no inserta nada en ningún lado, sin tirar error. Fix: el
dropdown se appendea directo a `root` (el shadow root del panel), no relativo al
textarea — no importa, porque el CSS ya es `position:fixed` y se reposiciona solo en
cada render.

---

## 3. Protocolo del modo live

### 3.1 — Piezas

- **`lens-sk-live-server.js`** — servidor HTTP puro (sin Express ni dependencias),
  puerto default `8137` (`LENS_SK_LIVE_PORT`). Un solo dev, una sola sesión de Claude
  Code, un solo pedido a la vez (`activeCommand`) + una sola pregunta standalone a la
  vez (`activeQuestion`) — no hay cola.
- **Browser (`toolbar.js`)** — nunca abre una conexión persistente propia (no hay SSE
  del lado del navegador). Todo pedido del navegador es un `fetch()` que se queda
  esperando (held-open) hasta que llega la respuesta.
- **Claude** — SÍ mantiene una conexión persistente (`GET /events`, Server-Sent Events)
  vía el tool `Monitor`, para enterarse de pedidos nuevos sin pollear.

### 3.2 — Endpoints

| Método + ruta | Quién llama | Qué hace |
|---|---|---|
| `GET /status` | ambos | `{connected, bootId}` — `connected` = hay algún cliente SSE (Claude) escuchando ahora mismo |
| `GET /events` (SSE) | Claude | Stream de eventos: pedidos nuevos, `{cancelled:true}`, `{answered:true, answer}` |
| `POST /event` | navegador | Crea un pedido (`suggest`/`commit`/`commit-all`/`locate`). 409 si ya hay uno en curso. Se mantiene abierto hasta `/reply` |
| `POST /reply` | Claude | Resuelve el `/event` pendiente — cierra el fetch del navegador |
| `POST/GET /progress` | Claude / navegador | Mensajes de "voy por acá" durante un pedido — poll cada 900ms del lado del navegador |
| `POST /ask` | Claude | Pregunta A MITAD de un pedido en curso — se guarda en `activeCommand.question`, viaja en el mismo poll de `/progress` |
| `POST /answer` | navegador | Responde la pregunta de `/ask` — la respuesta llega a Claude por el stream SSE (`{id, answered:true, answer}`) |
| `POST /ask-user` | Claude | Pregunta STANDALONE, sin pedido en curso — held-open igual que `/event` pero en la dirección contraria (Claude espera, no el navegador) |
| `GET /ask-user` | navegador | Poll (2.5s) — `{pending, id, question, options, multiSelect}` o `{pending:false}` |
| `POST /answer-user` | navegador | Resuelve el `/ask-user` pendiente — soporta `{cancelled:true}` |
| `POST /cancel` | navegador | Corta el `/event` en curso al instante — Claude se entera por SSE (`{id, cancelled:true}`) |
| `GET /project-map.json` | navegador | Sirve `.lens-sk-cache/project-map.json` tal cual (503 si todavía no se generó) |
| `GET /file-exists?path=` | navegador | Confirma que un archivo del mapa sigue existiendo, antes de intentar `vscode://file/...` |

### 3.3 — Por qué SSE y no WebSocket

`http.createServer` ya sabe mantener una respuesta abierta (es lo mismo que hace
`/event` en la otra dirección) — un WebSocket real exige el handshake completo a mano o
sumar la dependencia `ws` sin necesidad, para el mismo resultado. V1 de este servidor
usaba `GET /poll` de ~55s (long-poll) que Claude tenía que relanzar constantemente —
visible como actividad sin ninguna razón real la mayoría de las veces.

### 3.4 — Por qué dos protocolos de pregunta distintos (`/ask` vs `/ask-user`)

`/ask` cuelga de un pedido que YA existe (`activeCommand`) — la pregunta es parte de
resolver ESE pedido puntual, y la respuesta se correlaciona por el mismo `id`. `/ask-user`
no depende de que haya ningún pedido: Claude la abre cuando la necesita, sin que el
usuario haya hecho nada primero. Por eso `/ask-user` es la conexión HELD-OPEN de
Claude (simétrico a como el navegador usa `/event`) en vez de otro campo más en
`activeCommand`.

### 3.5 — Regla de comportamiento (no de protocolo): simetría de canal

Mientras se resuelve un evento del modo live, cualquier pregunta de Claude al usuario
va por este protocolo, NUNCA por el chat de VSCode — salvo que el `prompt` del usuario
empiece con `dev:` (señal explícita de que está probando el mecanismo a propósito).
Ver memoria `feedback_preguntas_via_protocolo_ask_answer` en el proyecto que uses esto,
no está codificado acá — es una convención de uso, no algo que el servidor imponga.

---

## 4. `project-map.json` — esquema

Generado por `lens-sk-project-map.js` (`node lens-sk-project-map.js` una vez, o
`--watch` para regenerar en cada guardado — el servidor live ya lo levanta en background
al arrancar).

```jsonc
{
  "generatedAt": "ISO-8601",
  "themeRoot": "/ruta/absoluta/al/theme",
  "files": {
    "components/foo.php": [ { "line": 12, "tag": "div", "classes": [...], "kind": "tag_class" }, ... ]
  },
  "byClass": {
    "container": [ { "file": "...", "line": N, "tag": "div", "kind": "tag_class" }, ... ]
  },
  "componentMap": {
    "identificador": { "file": "...", "line": N }   // resuelve "Ir al código" directo
  },
  "elementIndex": {
    "components/foo.php": { "div": [12, 40, ...], "h2": [15] }  // N-ésima aparición de un tag → línea
  },
  "customUtilities": {
    "nombre-utility": { "name", "file", "line", "body", "affectsChildren" }
    // @utility nombre { ... } de tailwindcss/**/*.css — affectsChildren=true si el
    // cuerpo tiene un combinador de descendencia (& > *, & .foo, :where(), :is())
  },
  "colorTokens": {
    "primary": { "hex": "#114325", "file": "tailwindcss/plugins/variables.js", "line": 26 }
    // agregado en 1.2.7 — lee tailwindcss/plugins/*.js (la fuente REAL de la paleta,
    // nunca el CSS compilado, que puede estar desactualizado si no se corrió el build)
  }
}
```

**`files`** solo indexa clases que aparecen como texto LITERAL en el PHP — una clase
armada 100% dinámicamente (`resolve_bg_color_class()`, por ejemplo) no queda acá, ahí
sigue haciendo falta grep + criterio. **`componentMap`** prioriza la convención
`$class_name = 'root-class';` (primera línea de ~22/30 componentes de un proyecto real)
por sobre el HTML literal, porque esa clase raíz casi nunca aparece como texto en el
propio `class="..."` (se inyecta vía PHP).

---

## 5. Puerto React

Ver `react/README.md` — es la fuente de verdad de su propio estado (arquitectura,
comandos, pendientes). No duplicar ese detalle acá; solo el resumen:

- Vive en `react/`, **no reemplaza** al vanilla — proyectos aparte.
- React 19 + Zustand + Vite, build a un único IIFE (`dist/lens-sk-react.js`,
  ~200KB/63KB gzip) — se inyecta exactamente igual que `toolbar.js`.
- CSS 100% inline (objetos JS, `src/styles/tokens.js`) — nunca clases + hoja externa,
  porque el widget se inyecta sobre CUALQUIER página ajena.
- Estado: fundación completa (pastilla, panel, selección, vistas Componente + Estilos
  de solo lectura). Todo lo demás (edición en vivo, Layout/Contraste/A11y, árbol HTML,
  atajos, i18n, modo live, persistencia) está pendiente — lista ordenada en su README.

---

## 6. Lecciones/gotchas ya resueltos (no re-descubrir)

- **Clases de Tailwind con fracciones** (`basis-1/2`) rompían selectores CSS armados a
  mano — el `/` es inválido sin escapar. Fix: `CSS.escape()` en cada clase.
- **`scroll-behavior:smooth` de la página** rompía el scroll "instantáneo" de
  señalar/seleccionar — la spec real es "respetá el `scroll-behavior` de la página", no
  "sin animación". Fix: forzar `scroll-behavior:auto` inline antes del scroll, restaurar
  después.
- **Ocultar un elemento con hijos** no atenuaba visualmente la descendencia en el árbol
  — el diseño original solo marcaba la fila clickeada. Fix: recalcular el estado de
  opacidad de TODAS las filas visibles en cada toggle, sin generar overrides redundantes
  por hijo.
- **`insertAdjacentElement` sobre un nodo detached** no tira error y tampoco inserta
  nada — ver §2.4.
- **`isInsideHost()` es una lista hardcodeada** — cualquier host de Shadow DOM nuevo
  tiene que sumarse ahí a mano, ver §2.2.
- **Timeout de preguntas standalone:** `/ask-user` reutilizaba al principio el mismo
  timeout que `/event` (5 min, pensado para un "Aplicar" automático) — muy corto para
  que una persona lea opciones y decida con calma. Se separó en
  `ASK_USER_TIMEOUT_MS = 30 * 60 * 1000`.
- **`var SLASH_COMMANDS` definida DESPUÉS del punto donde se usaba** — pasarla como
  parámetro a una función invocada antes de que la asignación corriera (aunque la
  declaración ya estuviera hoisted) dejaba el parámetro en `undefined` para siempre.
  Fix: no pasarla por parámetro, referenciarla por clausura (para cuando el código
  realmente se ejecuta —el usuario tipeando—, la asignación ya corrió).

---

## 7. Historial de versiones

- **1.2.7** (2026-08-04) — protocolo `/ask`/`/ask-user` (preguntas de Claude al
  usuario, con o sin pedido en curso, con soporte de opciones), autocompletado `/`/`@`
  en el textarea de Asistencia Claude, `colorTokens` en `project-map.json` (fuente real
  de la paleta), overlay de Layout/Estilos heredado en vivo por Asistencia Claude
  (`lastViewTool`), ayuda in-app de Asistencia Claude completada (ES/EN), atajos de
  teclado para los switches de Layout (`Y`/`N`/`O` — Display/Position/Delineado, ver
  `toggleLayoutDisplayShortcut`/`toggleLayoutPositionShortcut`/`toggleLayoutOutlineShortcut`
  en `SHORTCUT_ACTIONS`) con su mismo badge negro/amarillo que el resto de atajos.
