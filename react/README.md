# Lens-SK — versión React (fundación, en progreso)

Puerto de la herramienta original (`../scripts/toolbar.js`, vanilla JS, un solo archivo) a
React + Zustand. **Vive separada del original a propósito — el original NO se toca ni se
reemplaza.** Se creó porque el bundle vanilla es un solo archivo gigante, poco práctico de
editar/extender a mano por fuera de Claude Code.

## Estado actual: fundación, no reemplazo todavía

Cubre la arquitectura base y **2 de las 5 vistas** del original, a valor real (no mockeado):

- Pastilla minimizada (Menú + Inspección ON/OFF).
- Panel grande con selector de vista.
- Selección de elementos por clic (con Inspección ON) + contorno de pin en vivo.
- Vista **🧩 Componente** (tag, clases, contenedor semántico más cercano, clase principal).
- Vista **🎨 Estilos**, de solo lectura (tipografía, tamaño, padding/margin por lado, bordes,
  fondo/efectos) — todavía SIN overlay en vivo, SIN diagrama box-model visual, SIN edición
  inline (✏️).

**Todo lo demás del original** (Contraste, Layout con overlay de estructura, A11y, árbol
HTML, atajos de teclado, clonar, ocultar/mostrar barra, vista previa editable con
localStorage, TWCSS, modo live 🪄/📤, editor de imagen, adjuntar documentos, i18n ES/EN,
persistencia entre recargas, etc.) **todavía no está portado.** Se suma por iteraciones —
ver la lista de features pendientes al final de este archivo.

## Arquitectura

- **Estado**: un único store de Zustand (`src/store/useInspectorStore.js`) — equivalente al
  blob centralizado `__claudeInspectorState` del original, pero en memoria (la persistencia
  a `localStorage` es una iteración pendiente, no parte de esta fundación).
- **Componentes**: arquitectura por composición, con una carpeta `shared/` de piezas
  genéricas reutilizadas por cualquier vista nueva —
  `CopyableRow` (fila etiqueta+valor, copiable con un clic — mismo criterio que "todo valor
  es copiable" del original), `SectionHeader`, `IconButton`, `PinOutline`. **Cualquier vista
  nueva debería reusar estas piezas antes de inventar una fila/botón propio.**
- **CSS**: **inline, siempre** — cada componente estiliza con objetos JS (`style={{...}}`),
  nunca clases + hoja de estilos externa. Los tokens de diseño (colores, radios, fuentes)
  viven centralizados en `src/styles/tokens.js`. Esto es una decisión explícita del dueño de
  la herramienta: el widget se inyecta sobre CUALQUIER página ajena, así que no puede
  depender de que ningún selector CSS propio "gane" la cascada de esa página — con todo
  inline, no hay cascada de la que depender.
- **Aislamiento del host**: el widget se monta en un `<div>` colgado directo de
  `document.documentElement` (no de `<body>`) con Shadow DOM adentro (`attachShadow`). Dos
  detalles NO obvios, ambos confirmados con una inyección real de prueba conviviendo con la
  versión vanilla en la misma página:
  - El **host** (no el contenido de adentro) necesita `position:fixed` + el mismo
    `z-index:2147483647` que usa el original — un `position:fixed` solo adentro del shadow
    root, colgado de un host sin posicionar, pierde el desempate de stacking-context contra
    un host que SÍ está posicionado, sin importar cuál esté después en el DOM.
  - Colgar de `<html>` en vez de `<body>` importa para el desempate por orden de documento
    cuando dos widgets fixed con el mismo z-index conviven: `<body>` completo cuenta como
    una sola posición en la lista de hijos de `<html>`, así que un fixed-descendant de
    `<body>` pierde contra un host colgado directo de `<html>` que aparezca después, aunque
    esté "más adentro" en el árbol.
  - El host es `pointer-events:none` (cubre toda la ventana con `inset:0` para poder
    posicionarse fixed sin condicionar su tamaño al contenido) — el contenido real
    (Pill/Panel) reactiva `pointer-events:auto` explícitamente, porque `pointer-events` se
    hereda.
- **Montaje**: `src/main.jsx` es un IIFE que se auto-ejecuta al cargar el script — mismo
  criterio que `toolbar.js` (inyectado como `<script src="...">` clásico, nunca importado).
  Idempotente: si ya existe el host, una segunda inyección hace toggle de visibilidad en vez
  de duplicar el árbol.

## Comandos

```
npm install
npm run dev      # servidor de Vite con hot-reload, sirve index.html (página de prueba
                  # de mentira con contenido real para clickear — NO es parte del widget)
npm run build     # build de producción: un solo archivo IIFE en dist/lens-sk-react.js,
                  # sin CSS separado (todo es inline) — este es el archivo que se inyecta
npm run preview   # sirve el build de dist/ para probarlo tal cual quedaría en producción
```

`npm run build` produce **un solo archivo** (`dist/lens-sk-react.js`, ~200KB / ~63KB gzip,
incluye React+ReactDOM+Zustand empaquetados adentro — la página host no necesita tener
React) — se inyecta exactamente igual que `toolbar.js`: un `<script src="...">` clásico.

## Probar una inyección real (sin publicar nada)

```bash
npm run build
cd dist && python3 -m http.server 8931 --bind 127.0.0.1
```
Y en la página real (vía Chrome DevTools MCP, `evaluate_script`):
```js
const s = document.createElement('script');
s.src = 'http://127.0.0.1:8931/lens-sk-react.js';
document.body.appendChild(s);
```

## Pendiente (por orden sugerido, no obligatorio)

1. Persistencia en `localStorage` (selector fijado, vista activa, panel abierto/cerrado) —
   mismo criterio que `saveState()`/`restoreState()` del original.
2. Vista previa de estilos editable (✏️ + overrides aplicados de verdad sobre la página +
   reset por elemento/global) — el feature más grande y más usado del original.
3. Diagrama box-model visual + overlay en vivo de margin/border/padding sobre la página.
4. Vistas restantes: Contraste, Layout (overlay de estructura anidada), A11y.
5. Popup de árbol HTML (`</>`).
6. Atajos de teclado (mapa `SHORTCUT_ACTIONS` del original).
7. i18n ES/EN.
8. Modo live (🪄/📤) — reusar el mismo protocolo/servidor (`lens-sk-live-server.js`) ya
   documentado en `../SKILL.md`, "Modo live" — no hay que rediseñar el backend, solo el
   cliente. El backend creció desde que se escribió esta lista (v1.2.7, 2026-08-04) —
   antes de portar esto, releer `../scripts/lens-sk-live-server.js` entero, no solo
   `POST /event` ↔ `POST /reply`:
   - `POST /ask` ↔ `GET/POST /progress`: preguntas de Claude A MITAD de un pedido ya en
     curso — el cliente tiene que pollear `question` en el mismo poll de progreso y
     mostrar un cuadro de respuesta propio (ver `.live-question` / `liveQuestionBox` en
     `../scripts/toolbar.js`).
   - `POST /ask-user` ↔ `GET /ask-user` ↔ `POST /answer-user`: preguntas STANDALONE de
     Claude, sin ningún pedido en curso — el cliente necesita un poll propio (2.5s,
     `pollAskUser`) y un modal aparte (soporta opciones tipo radio/checkbox + respuesta
     libre + cancelar) — ver `askUserHost`/`openAskUserModal` en `toolbar.js`.
   - Autocompletado `/` (skills/comandos, lista curada `SLASH_COMMANDS`) y `@` (archivos
     reales del proyecto, vía `project-map.json`) en el textarea del pedido — ver
     `attachComposeMenus` en `toolbar.js`.
9. `colorTokens` de `project-map.json` (generado por `lens-sk-project-map.js`, leyendo
   `tailwindcss/plugins/*.js` del proyecto — NUNCA el CSS compilado) — cuando se porte el
   selector de variables de color de Estilos (🎨, ver punto 2), preferir esta fuente por
   sobre inferir `--color-*` del `:root` del CSS cargado en la página (que sigue siendo
   válido como fallback sin servidor, ver `getProjectColorVariables` en `toolbar.js` y
   `MANUAL.md` §7.1).
10. Al portar Layout/Estilos + modo live juntos: en el original, activar Asistencia
    Claude NO limpia el overlay de la vista anterior (Layout o Estilos) — lo sigue
    mostrando y actualizando en vivo (incluso en scroll) mientras el panel de Asistencia
    está abierto, ver `lastViewTool`/`renderUnderlyingOverlay` en `toolbar.js` y
    `MANUAL.md` §7. Replicar ese comportamiento, no limpiar el overlay al entrar a Live.
