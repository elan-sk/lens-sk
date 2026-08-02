/**
 * Claude Dev Inspector Toolbar
 * Barra flotante de depuración, autocontenida (Shadow DOM), sin dependencias.
 * Funciona en cualquier página: WordPress/PHP, React, Vue, HTML estático, etc.
 *
 * Modelo de uso: PUNTERO fija un elemento (persiste entre herramientas y entre
 * recargas de página vía localStorage); las herramientas leen ese elemento
 * fijado, no piden click cada vez. Para elegir otro elemento, clic en el
 * puntero de nuevo.
 *
 * Uso: evaluar este archivo completo en el contexto de la página (ej. Chrome
 * DevTools MCP evaluate_script, o auto-inyectado por functions.php en dev).
 * Es idempotente: si ya está inyectado, hace toggle de visibilidad.
 *
 * Breakpoints del indicador (📱): configurables desde la propia UI (botón
 * ⚙️ junto a "Mostrar breakpoint") — modo Auto (detectados del CSS ya
 * cargado) o Manual (lista editable), persistido en localStorage. Ver
 * bpConfig/openBpConfig más abajo.
 */
(function () {
  if (window.__claudeInspector) {
    window.__claudeInspector.toggle();
    return;
  }

  // Tailwind CSS v4 vía Play/browser CDN, para compilar clases "de stock"
  // que el proyecto todavía no tiene compiladas (ver stockClassToStyleDiff,
  // usado por el editor de clases del árbol HTML). Corre AISLADO dentro de
  // un <iframe> propio, nunca en el documento principal: versiones
  // anteriores lo cargaban directo en <head> y su @theme "de fábrica"
  // (--text-base, colores, radios...) competía por especificidad con los
  // tokens reales del proyecto con el MISMO nombre, rompiendo tamaños/
  // colores de la página entera cada vez que el CDN recompilaba (JIT en
  // vivo). Aislado en su propio documento, es estructuralmente imposible
  // que su CSS vuelva a tocar la página real. twcdnProbeElement() crea el
  // elemento de prueba DENTRO de este iframe — distinto de
  // tailwindProbeElement(), que vive en el documento principal y prueba
  // clases que YA son reales en el proyecto (ver findUtilityClassFor).
  var twFrame = null;
  (function ensureTailwindCDN() {
    if (document.querySelector('iframe[data-lens-sk-tw-frame]')) return;
    twFrame = document.createElement('iframe');
    twFrame.setAttribute('data-lens-sk-tw-frame', '1');
    twFrame.style.cssText = 'position:fixed;top:-9999px;left:-9999px;width:0;height:0;border:0;';
    document.body.appendChild(twFrame);
    var twDoc = twFrame.contentDocument;
    var s = twDoc.createElement('script');
    s.src = 'https://cdn.jsdelivr.net/npm/@tailwindcss/browser@4';
    twDoc.head.appendChild(s);
  })();

  var TYPO_PREFIX_RE = /^(text-|font-|leading-|tracking-|italic$|not-italic$|uppercase$|lowercase$|capitalize$|normal-case$|underline$|line-through$|no-underline$)/;
  // Sugerencias de autocompletado (datalist nativo) para la vista previa de
  // estilos: solo las propiedades CSS que tienen un set finito de valores
  // "de palabra" tienen sentido acá — las numéricas/arbitrarias (tamaños,
  // colores, sombras) se dejan sin autocompletar.
  var CSS_VALUE_SUGGESTIONS = {
    'display': ['block', 'inline', 'inline-block', 'flex', 'inline-flex', 'grid', 'inline-grid', 'none', 'contents'],
    'position': ['static', 'relative', 'absolute', 'fixed', 'sticky'],
    'font-weight': ['normal', 'bold', 'bolder', 'lighter', '100', '200', '300', '400', '500', '600', '700', '800', '900'],
    'text-align': ['left', 'center', 'right', 'justify', 'start', 'end'],
    'text-transform': ['none', 'uppercase', 'lowercase', 'capitalize'],
    'overflow': ['visible', 'hidden', 'scroll', 'auto', 'clip'],
    'cursor': ['auto', 'default', 'pointer', 'move', 'text', 'not-allowed', 'grab', 'grabbing', 'wait', 'help', 'crosshair', 'zoom-in', 'zoom-out'],
    'border-style': ['none', 'solid', 'dashed', 'dotted', 'double', 'groove', 'ridge', 'inset', 'outset'],
    'flex-direction': ['row', 'row-reverse', 'column', 'column-reverse'],
    'flex-wrap': ['nowrap', 'wrap', 'wrap-reverse'],
    'justify-content': ['flex-start', 'flex-end', 'center', 'space-between', 'space-around', 'space-evenly', 'start', 'end', 'normal'],
    'align-items': ['flex-start', 'flex-end', 'center', 'baseline', 'stretch', 'normal', 'start', 'end'],
    'align-self': ['auto', 'flex-start', 'flex-end', 'center', 'baseline', 'stretch', 'normal'],
    'width': ['auto'],
    'height': ['auto'],
    'top': ['auto'],
    'right': ['auto'],
    'bottom': ['auto'],
    'left': ['auto'],
  };
  // Nombres de propiedades CSS conocidas, para el autocompletado de
  // "Agregar propiedad" en Estilos (ver renderStyles) — no es la lista
  // completa del spec, cubre lo que alguien realmente escribiría a mano.
  var KNOWN_CSS_PROPERTIES = [
    'align-content', 'align-items', 'align-self', 'animation', 'animation-delay', 'animation-duration',
    'animation-fill-mode', 'animation-iteration-count', 'animation-name', 'animation-timing-function',
    'aspect-ratio', 'backdrop-filter', 'backface-visibility', 'background', 'background-attachment',
    'background-blend-mode', 'background-clip', 'background-color', 'background-image', 'background-origin',
    'background-position', 'background-repeat', 'background-size', 'block-size', 'border', 'border-bottom',
    'border-bottom-color', 'border-bottom-left-radius', 'border-bottom-right-radius', 'border-bottom-style',
    'border-bottom-width', 'border-collapse', 'border-color', 'border-image', 'border-left', 'border-left-color',
    'border-left-style', 'border-left-width', 'border-radius', 'border-right', 'border-right-color',
    'border-right-style', 'border-right-width', 'border-spacing', 'border-style', 'border-top', 'border-top-color',
    'border-top-left-radius', 'border-top-right-radius', 'border-top-style', 'border-top-width', 'border-width',
    'bottom', 'box-shadow', 'box-sizing', 'caption-side', 'caret-color', 'clear', 'clip-path', 'color',
    'color-scheme', 'column-count', 'column-gap', 'column-rule', 'column-width', 'columns', 'contain', 'content',
    'counter-increment', 'counter-reset', 'cursor', 'direction', 'display', 'empty-cells', 'filter', 'flex',
    'flex-basis', 'flex-direction', 'flex-flow', 'flex-grow', 'flex-shrink', 'flex-wrap', 'float', 'font',
    'font-family', 'font-feature-settings', 'font-kerning', 'font-size', 'font-size-adjust', 'font-stretch',
    'font-style', 'font-variant', 'font-weight', 'gap', 'grid', 'grid-area', 'grid-auto-columns', 'grid-auto-flow',
    'grid-auto-rows', 'grid-column', 'grid-column-end', 'grid-column-gap', 'grid-column-start', 'grid-row',
    'grid-row-end', 'grid-row-gap', 'grid-row-start', 'grid-template', 'grid-template-areas', 'grid-template-columns',
    'grid-template-rows', 'height', 'hyphens', 'inline-size', 'inset', 'isolation', 'justify-content', 'justify-items',
    'justify-self', 'left', 'letter-spacing', 'line-break', 'line-height', 'list-style', 'list-style-image',
    'list-style-position', 'list-style-type', 'margin', 'margin-bottom', 'margin-left', 'margin-right', 'margin-top',
    'mask', 'max-height', 'max-width', 'min-height', 'min-width', 'mix-blend-mode', 'object-fit', 'object-position',
    'opacity', 'order', 'outline', 'outline-color', 'outline-offset', 'outline-style', 'outline-width', 'overflow',
    'overflow-wrap', 'overflow-x', 'overflow-y', 'padding', 'padding-bottom', 'padding-left', 'padding-right',
    'padding-top', 'perspective', 'perspective-origin', 'place-content', 'place-items', 'place-self', 'pointer-events',
    'position', 'quotes', 'resize', 'right', 'rotate', 'row-gap', 'scale', 'scroll-behavior', 'scroll-margin',
    'scroll-padding', 'scroll-snap-align', 'scroll-snap-type', 'tab-size', 'table-layout', 'text-align',
    'text-align-last', 'text-decoration', 'text-decoration-color', 'text-decoration-line', 'text-decoration-style',
    'text-indent', 'text-justify', 'text-orientation', 'text-overflow', 'text-shadow', 'text-transform',
    'text-underline-offset', 'top', 'transform', 'transform-origin', 'transform-style', 'transition',
    'transition-delay', 'transition-duration', 'transition-property', 'transition-timing-function', 'translate',
    'unicode-bidi', 'user-select', 'vertical-align', 'visibility', 'white-space', 'width', 'will-change',
    'word-break', 'word-spacing', 'word-wrap', 'writing-mode', 'z-index',
  ];
  var STORAGE_KEY = '__claudeInspectorState';
  var OVERRIDE_STORAGE_KEY = '__claudeInspectorStyleOverrides';
  var editingStyleRow = false; // true mientras hay un input de edición de estilo abierto
  var cancelActiveStyleEdit = null; // función para cancelar ese input desde Esc (ver onShortcutKeydown)
  var propertyFilterQuery = ''; // buscador de propiedades en Estilos/Layout — compartido entre ambas vistas, persiste (ver saveState/restoreState)
  var customStyleProps = []; // propiedades CSS agregadas a mano en Estilos (ver "Agregar propiedad") — globales, no por elemento; persiste (ver saveState/restoreState)

  // ---------------------------------------------------------------------
  // i18n: ES/EN. Detección automática (idioma del navegador si es español,
  // inglés en cualquier otro caso) con selección manual persistida aparte
  // (LANG_STORAGE_KEY, no dentro del blob grande de STORAGE_KEY). tr(key)
  // devuelve el string en currentLang; el modal de Ayuda usa su propio par
  // de bloques completos (HELP_CONTENT_HTML_ES/EN) en vez de claves sueltas,
  // por ser texto largo tipo documentación. Ojo con SIZE/BORDER más abajo:
  // son las únicas claves de texto que además se usan como CLAVE de
  // búsqueda (jumpToZone compara contra el textContent de los <h4> — ver
  // BM_ZONE_HEADERS/renderStyles), así que siempre se leen de acá, nunca
  // como literal suelto, para que header y salto sigan coincidiendo.
  // ---------------------------------------------------------------------
  var LANG_STORAGE_KEY = '__claudeInspectorLang';
  function detectDefaultLang() {
    var nav = (navigator.language || navigator.userLanguage || '').toLowerCase();
    return nav.indexOf('es') === 0 ? 'es' : 'en';
  }
  var currentLang = detectDefaultLang();
  try {
    var savedLang = localStorage.getItem(LANG_STORAGE_KEY);
    if (savedLang === 'es' || savedLang === 'en') currentLang = savedLang;
  } catch (e) {}
  var STRINGS = {
    creditsDesc: { es: 'Este inspector de depuración es un producto de Elan SK Soft, elaborado por ELAN-SK.', en: 'This debugging inspector is a product of Elan SK Soft, made by ELAN-SK.' },
    contact: { es: 'Contacto', en: 'Contact' },
    paypalDonate: { es: 'Donar por PayPal', en: 'Donate via PayPal' },
    copy: { es: 'Copiar', en: 'Copy' },
    copied: { es: 'Copiado ✅', en: 'Copied ✅' },
    creditsFooterPrefix: { es: 'Elaborado por ELAN-SK · Elan SK Soft · ', en: 'Made by ELAN-SK · Elan SK Soft · ' },
    close: { es: 'Cerrar', en: 'Close' },
    treeTitleDefault: { es: 'Estructura HTML', en: 'HTML Structure' },
    treeSearchPlaceholder: { es: 'Buscar por etiqueta, clase, id o texto…', en: 'Search by tag, class, id or text…' },
    treeExpandAll: { es: '⊞ Expandir todo', en: '⊞ Expand all' },
    treeCollapseAll: { es: '⊟ Colapsar todo', en: '⊟ Collapse all' },
    treeCopyAll: { es: '📋 Copiar todo', en: '📋 Copy all' },
    treeCopyPage: { es: '📦 Copiar página', en: '📦 Copy page' },
    treeCopyPageTitle: { es: 'Copiar el HTML completo de la página (sin lo que inyecta esta herramienta)', en: "Copy the page's full HTML (without what this tool injects)" },
    treeCopyAllDone: { es: '✅ Copiado', en: '✅ Copied' },
    treeResetElement: { es: '↺ Restablecer este elemento (R)', en: '↺ Reset this element (R)' },
    editContent: { es: 'Editar contenido', en: 'Edit content' },
    copyClassesTitle: { es: 'Copiar clases', en: 'Copy classes' },
    copyValue: { es: 'Copiar valor', en: 'Copy value' },
    editClasses: { es: 'Editar clases', en: 'Edit classes' },
    copyHtml: { es: 'Copiar HTML', en: 'Copy HTML' },
    treeTruncatedPrefix: { es: '⚠️ Árbol truncado en ', en: '⚠️ Tree truncated at ' },
    treeTruncatedSuffix: { es: ' nodos (el elemento fijado tiene más descendientes que eso).', en: ' nodes (the pinned element has more descendants than that).' },
    bpTitle: { es: '📱 Configurar breakpoints', en: '📱 Configure breakpoints' },
    bpConfigure: { es: 'Configurar breakpoints', en: 'Configure breakpoints' },
    bpAutoHint: { es: 'Se leen del CSS ya cargado en esta página: primero variables --breakpoint-* (Tailwind), y si no hay, @media tradicionales de cualquier hoja.', en: 'Read from the CSS already loaded on this page: first --breakpoint-* variables (Tailwind), and if there are none, traditional @media queries from any stylesheet.' },
    bpSourceVars: { es: 'Fuente: variables --breakpoint-* de Tailwind', en: 'Source: Tailwind --breakpoint-* variables' },
    bpSourceMedia: { es: 'Fuente: @media tradicionales (sin nombre propio en el CSS)', en: 'Source: traditional @media queries (no name of their own in the CSS)' },
    bpSourceNone: { es: 'No se encontró ningún breakpoint en el CSS cargado.', en: 'No breakpoint found in the loaded CSS.' },
    bpNoneDetected: { es: 'Sin breakpoints detectados.', en: 'No breakpoints detected.' },
    bpRedetect: { es: '🔄 Volver a detectar', en: '🔄 Re-detect' },
    bpManualHint: { es: 'Arranca con la escala default de Tailwind — editá nombre, dirección o valor, o borrá la fila. Los cambios se aplican al toque.', en: "Starts with Tailwind's default scale — edit the name, direction or value, or delete the row. Changes apply instantly." },
    bpDelete: { es: 'Eliminar', en: 'Delete' },
    bpNoneManual: { es: 'Sin breakpoints — agregá uno.', en: 'No breakpoints — add one.' },
    bpAddBreakpoint: { es: '+ Agregar breakpoint', en: '+ Add breakpoint' },
    openClose: { es: 'Abrir/cerrar (Espacio)', en: 'Open/close (Space)' },
    resetAll: { es: 'Restablecer todo (R)', en: 'Reset all (R)' },
    copyCssShortcut: { es: 'Copiar CSS (G)', en: 'Copy CSS (G)' },
    clickToInspect: { es: 'Clic en cualquier elemento de la página para inspeccionarlo.', en: 'Click any element on the page to inspect it.' },
    helpBtnLabel: { es: '❓ Ayuda', en: '❓ Help' },
    selectElementToStart: { es: 'Seleccioná un elemento de la página y elegí una herramienta para comenzar.', en: 'Select an element on the page and pick a tool to get started.' },
    inspectToggle: { es: 'Inspección on/off (I)', en: 'Inspect on/off (I)' },
    shortcutLayout: { es: 'Layout (L)', en: 'Layout (L)' },
    shortcutStyles: { es: 'Estilos (S)', en: 'Styles (S)' },
    treeShortcutTitle: { es: 'Estructura HTML (V/Enter)', en: 'HTML Structure (V/Enter)' },
    shortcutCopyClasses: { es: 'Copiar clases (C)', en: 'Copy classes (C)' },
    shortcutCopyComponent: { es: 'Clase componente (T)', en: 'Component class (T)' },
    shortcutCapture: { es: 'Captura p/chat (P)', en: 'Screenshot for chat (P)' },
    hideBar: { es: 'Ocultar barra (H)', en: 'Hide bar (H)' },
    showBar: { es: 'Mostrar barra (H)', en: 'Show bar (H)' },
    showBreakpointLabel: { es: 'Breakpoints', en: 'Breakpoints' },
    twcssModeLabel: { es: 'TWCSS', en: 'TWCSS' },
    layoutShowDisplayLabel: { es: 'Display', en: 'Display' },
    layoutShowPositionLabel: { es: 'Position', en: 'Position' },
    layoutShowOutlineLabel: { es: 'Delineado', en: 'Outline' },
    langLabel: { es: 'Idioma', en: 'Language' },
    selectElement: { es: 'Seleccionar elemento', en: 'Select element' },
    hideElement: { es: 'Ocultar elemento', en: 'Hide element' },
    showElement: { es: 'Mostrar elemento', en: 'Show element' },
    locateElement: { es: 'Señalar en la página (sin salir del árbol)', en: 'Locate on the page (without leaving the tree)' },
    negativeValueWarning: { es: 'Valor negativo — puede afectar la maquetación', en: 'Negative value — can affect layout' },
    shortcutClone: { es: 'Clonar elemento fijado (D)', en: 'Clone pinned element (D)' },
    clearAllClones: { es: 'Quitar todos los clones', en: 'Remove all clones' },
    removeClone: { es: 'Quitar este clon', en: 'Remove this clone' },
    contrastTab: { es: '🌓 Contraste', en: '🌓 Contrast' },
    a11yTab: { es: '♿ A11y (página)', en: '♿ A11y (page)' },
    previewPrefix: { es: '✎ Vista previa: ', en: '✎ Preview: ' },
    changeSingular: { es: ' cambio', en: ' change' },
    changePlural: { es: ' cambios', en: ' changes' },
    copyCss: { es: 'Copiar CSS', en: 'Copy CSS' },
    reset: { es: 'Restablecer', en: 'Reset' },
    edit: { es: 'Editar', en: 'Edit' },
    remove: { es: 'Quitar', en: 'Remove' },
    none: { es: '(ninguna)', en: '(none)' },
    noColorVars: { es: 'No se encontraron variables --color-* en el theme.css del proyecto.', en: "No --color-* variables found in the project's theme.css." },
    numericScale: { es: 'Escala numérica (Tailwind)', en: 'Numeric scale (Tailwind)' },
    detectedClasses: { es: 'Clases detectadas del proyecto', en: 'Detected project classes' },
    noClassesDetected: { es: 'No se encontraron clases para esta propiedad en el theme.css del proyecto.', en: "No classes found for this property in the project's theme.css." },
    typographyPreset: { es: 'Presets de tipografía detectados', en: 'Detected typography presets' },
    noTypographyPresets: { es: 'No se encontraron presets de tipografía (clases con 2+ propiedades) en el theme.css del proyecto.', en: "No typography presets found (classes with 2+ properties) in the project's theme.css." },
    chooseColor: { es: 'Elegir color', en: 'Choose color' },
    closePicker: { es: 'Cerrar selector', en: 'Close picker' },
    colorVariables: { es: 'Variables de color', en: 'Color variables' },
    overlayTransparency: { es: 'Transparencia del overlay', en: 'Overlay transparency' },
    filterProperties: { es: 'Filtrar propiedades…', en: 'Filter properties…' },
    copyAllStyle: { es: 'Copiar todo el estilo', en: 'Copy all styles' },
    clearFilter: { es: 'Limpiar filtro', en: 'Clear filter' },
    clickElementFirst: { es: 'Hacé clic en cualquier elemento de la página primero.', en: 'Click any element on the page first.' },
    element: { es: 'Elemento', en: 'Element' },
    containerComponent: { es: 'Contenedor / componente', en: 'Container / component' },
    mainClass: { es: 'clase principal', en: 'main class' },
    fullClasses: { es: 'clases completas', en: 'full classes' },
    classesLabel: { es: 'clases', en: 'classes' },
    sourceLabel: { es: 'Fuente', en: 'Source' },
    reactComponent: { es: 'componente React', en: 'React component' },
    fileLabel: { es: 'archivo', en: 'file' },
    anonymous: { es: '(anónimo)', en: '(anonymous)' },
    noReactSourcePrefix: { es: 'Sin fuente React detectada (prod build, o no-React). Si el proyecto sigue la convención "clase raíz = archivo", "', en: 'No React source detected (prod build, or non-React). If the project follows the "root class = file" convention, "' },
    noReactSourceSuffix: { es: '" es normalmente el nombre del componente/archivo.', en: '" is usually the component/file name.' },
    noClassLabel: { es: '(sin clase)', en: '(no class)' },
    goToPrefix: { es: 'Ir a ', en: 'Go to ' },
    typography: { es: 'Tipografía', en: 'Typography' },
    family: { es: 'familia', en: 'family' },
    sizeLower: { es: 'tamaño', en: 'size' },
    weight: { es: 'peso', en: 'weight' },
    utilityClasses: { es: 'clases utilidad', en: 'utility classes' },
    zoneSize: { es: 'Tamaño', en: 'Size' },
    backgroundEffects: { es: 'Fondo y efectos', en: 'Background & effects' },
    noHoverStyles: { es: '(sin estilos :hover definidos para este elemento)', en: '(no :hover styles defined for this element)' },
    addProperty: { es: 'Agregar propiedad', en: 'Add property' },
    addedProperties: { es: 'Propiedades agregadas', en: 'Added properties' },
    egBackdropFilter: { es: 'ej. backdrop-filter', en: 'e.g. backdrop-filter' },
    zoneBorder: { es: 'Bordes', en: 'Border' },
    contrastHeader: { es: 'Contraste', en: 'Contrast' },
    textLabel: { es: 'texto', en: 'text' },
    effectiveBackground: { es: 'fondo efectivo', en: 'effective background' },
    large: { es: 'grande', en: 'large' },
    normalLabel: { es: 'normal', en: 'normal' },
    pass: { es: '✅ pasa', en: '✅ pass' },
    fail: { es: '❌ no pasa', en: '❌ fail' },
    displayPinned: { es: 'Display (elemento fijado)', en: 'Display (pinned element)' },
    thisIsFlexItem: { es: 'Este elemento es flex-item', en: 'This element is a flex item' },
    thisIsGridItem: { es: 'Este elemento es grid-item', en: 'This element is a grid item' },
    noneOrViewport: { es: '(ninguno / viewport)', en: '(none / viewport)' },
    imgNoAlt: { es: '<img> sin atributo alt', en: '<img> missing alt attribute' },
    fieldNoLabelPrefix: { es: '<', en: '<' },
    fieldNoLabelSuffix: { es: '> sin label asociado', en: '> missing associated label' },
    headingSkipPrefix: { es: 'salto de jerarquía: h', en: 'heading level skip: h' },
    issuesFoundSuffix: { es: ' problema(s) encontrado(s)', en: ' issue(s) found' },
    noIssues: { es: '✅ Sin problemas detectados.', en: '✅ No issues detected.' },
    showPositionedAncestor: { es: 'Click: resaltar su referencia (ancestro/contenedor)', en: 'Click: highlight its reference (ancestor/container)' },
  };
  function tr(key) {
    var entry = STRINGS[key];
    if (!entry) return key;
    return entry[currentLang] || entry.en;
  }

  // TODO: falta agregar acá, al final, la sección de marca/contactos/donaciones
  // que el usuario pidió — pendiente de que pase el contenido exacto.
  var HELP_CONTENT_HTML_ES = [
    '<h2>🔍 Lens-SK</h2>',
    '<p>Barra flotante para inspeccionar y depurar visualmente cualquier elemento de esta página: clases, estilos, contraste, estructura de layout y accesibilidad.</p>',

    '<h3>Selección</h3>',
    '<p>Activá el ícono de Inspección (el cursor amarillo) y hacé clic en cualquier elemento de la página para seleccionarlo. Desactivalo cuando quieras usar la página con normalidad, sin seleccionar nada por error.</p>',
    '<p>Con Inspección activada, hacer <b>doble clic</b> sobre un elemento copia directo todas sus clases, sin pasos extra.</p>',
    '<p>El <b>clic central</b> (rueda del mouse) sobre un elemento lo fija Y abre de una el popup de estructura HTML — selección + <b>V</b> en un solo clic. Funciona siempre, no depende de Inspección.</p>',
    '<p>Con Inspección activada, mantener presionado (~medio segundo) el clic <b>izquierdo</b> hace lo mismo — alternativa por si el botón central del mouse no anda bien. Soltando antes, es un clic normal (solo fija).</p>',

    '<h3>La pastilla minimizada</h3>',
    '<p>La pastilla queda siempre visible, pegada al borde derecho de la pantalla. De arriba hacia abajo: <b>☰ Menú</b> (abre/cierra el panel grande), y luego los accesos directos, para no tener que abrir ese panel:</p>',
    '<ul>',
    '<li><svg viewBox="0 0 40 40" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.3" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:-3px;display:inline-block;"><path d="M4 4h5M4 4v5M32 4h-5M32 4v5M4 32h5M4 32v-5M32 32h-5M32 32v-5M15 4h6M15 32h6M4 15v6M32 15v6"/><path d="M11 11l11.930 28.635 4.235-12.470 12.470-4.235L11 11z" fill="#fbbf24" stroke="#fbbf24" stroke-width="1.5"/></svg> <b>Cursor de selección (Inspección)</b> — prende o apaga el modo de selección explicado arriba.</li>',
    '<li><b>📐 Layout</b> y <b>🎨 Estilos</b> — muestran esa información directamente sobre la página, sin necesidad de abrir el panel.</li>',
    '<li><b>&lt;/&gt; Ver estructura HTML</b> — abre un popup grande con el HTML del elemento seleccionado (ver más abajo).</li>',
    '<li><b>📋 Copiar clases</b> — copia todas las clases CSS del elemento seleccionado.</li>',
    '<li><b>🏷️ Copiar clase componente</b> — copia el nombre del componente o sección donde está ese elemento.</li>',
    '<li><b>📸 Captura p/chat</b> — saca una foto solo del elemento seleccionado y la copia, lista para pegarla en un chat o un pedido de cambio.</li>',
    '<li><b>⧉ Clonar</b> — duplica el elemento fijado justo a continuación del original, con un marcador numerado (ver "Clonar elementos" más abajo). Útil para probar cómo se ve un layout con más ítems (ej. una fila flex con <code>wrap</code>) sin tener que agregar contenido real.</li>',
    '</ul>',
    '<p>Para saltar del elemento seleccionado a su <b>padre</b>, <b>hijo</b> o <b>hermanos</b> sin volver a hacer clic en la página: flechas del teclado ↑ ↓ ← →.</p>',

    '<h3>Ocultar la barra</h3>',
    '<p>El ícono de ojo al final de la pastilla (abajo del todo) o la tecla <b>H</b> minimiza toda la pastilla a un botón redondo 🛠️ — el panel general sigue visible si estaba abierto y Inspección está activa, para poder seguir consultándolo. Sin Inspección activa esconde todo. Un clic en el 🛠️ (o <b>H</b> de nuevo) la vuelve a mostrar.</p>',

    '<h3>Idioma</h3>',
    '<p>Los botones <b>ES/EN</b> (abajo del panel) cambian el idioma de toda la interfaz al instante, sin recargar la página. Se detecta el idioma del sistema al primer uso (español si coincide, inglés si no) y después se recuerda tu elección manual. Los atajos de teclado son siempre los mismos letras, sin importar el idioma.</p>',

    '<h3>Las 5 vistas de este panel</h3>',
    '<ul>',
    '<li><b>🧩 Componente</b> — sus clases CSS y el nombre del componente al que pertenece.</li>',
    '<li><b>🎨 Estilos</b> — tipografía, tamaño, márgenes, bordes y fondo, con un diagrama visual clickeable (los nombres y números llevan directo a esa propiedad). El alto marcado con <b>A</b> es automático (por contenido), <b>D</b> es definido a propósito. Los propios de margen/relleno/tamaño (min/max) se marcan con flechitas en el diagrama. Un valor <b>negativo</b> (ej. un margen para "sacar" un elemento de su caja) se marca en rojo llamativo en el diagrama y con un ⚠️ en la fila de la lista — son válidos y muy usados, pero también una causa común de bugs de maquetación si no se notan a tiempo. Cada valor se puede editar (ver "Vista previa de estilos" más abajo), y al final hay un campo para agregar cualquier propiedad CSS que no esté en la lista.</li>',
    '<li><b>🌓 Contraste</b> — qué tan legible es el texto sobre su fondo, y si cumple los estándares de accesibilidad (WCAG).</li>',
    '<li><b>📐 Layout</b> — cómo está armada la estructura del elemento y de todo lo que tiene adentro (ver "Vista Layout: qué mostrar" más abajo). También editable (ver "Vista previa de estilos" más abajo).</li>',
    '<li><b>♿ A11y</b> — revisa toda la página en busca de problemas de accesibilidad: imágenes sin texto alternativo, campos de formulario sin etiqueta, encabezados mal ordenados.</li>',
    '</ul>',

    '<h3>Vista Layout: qué mostrar</h3>',
    '<p>En componentes densos (mucho anidamiento, varios <code>absolute</code>, grillas con muchos ítems) el overlay de Layout puede saturarse de recuadros y etiquetas. Tres switches arriba del panel dejan elegir qué ver:</p>',
    '<ul>',
    '<li><b>Display</b> — etiquetas de flex/grid: el contenedor resaltado (ej. "flex row gap 8 justify-center") y cada hijo directo (ej. "item2 flex: 1 1 0%"), con relleno de color para distinguir uno de otro.</li>',
    '<li><b>Position</b> — el elemento fijado siempre se marca con su contorno de selección de siempre; además, cualquier elemento con <code>position</code> distinto de <code>static</code> se etiqueta como <b>relative</b>/<b>fixed</b>/<b>sticky</b> (arriba-izquierda) o <b>absolute</b> (arriba-derecha, para no solaparse con su ancestro posicionado) — cada tipo con su propio color. Clic en una etiqueta relative/fixed/sticky <b>selecciona</b> ese elemento; clic en <b>absolute</b> en cambio resalta (marco + etiqueta brillante, un instante) a su ancestro posicionado real, sin cambiar el elemento fijado — útil para entender rápido "¿respecto a qué se está posicionando esto?".</li>',
    '<li><b>Delineado</b> — el resto de los recuadros de contexto (todos los niveles anidados, tengan o no una etiqueta encima). Display y Position siempre dibujan el recuadro que necesitan para su propia etiqueta aunque Delineado esté apagado.</li>',
    '</ul>',
    '<p>Al menos uno de los tres tiene que quedar activo: apagar Display o Position estando solo ellos activos enciende automáticamente al otro; Delineado, si es el único activo, no se puede apagar.</p>',

    '<h3>&lt;/&gt; Ver estructura HTML</h3>',
    '<p>Abre un popup con el HTML del elemento seleccionado y sus hijos, resaltado por colores como en un editor de código. Cada fila con un elemento real (no texto) tiene dos íconos propios, siempre visibles (no dependen de pasar el mouse — funcionan igual con mouse que por toque en pantallas táctiles):</p>',
    '<ul>',
    '<li>El ícono <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:-2px;display:inline-block;"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg> de ojo <b>oculta/muestra</b> ese elemento en la página real (ver "Ocultar elementos" más abajo).</li>',
    '<li>El ícono <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:-2px;display:inline-block;"><circle cx="11" cy="11" r="7"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg> de lupa <b>señala</b> dónde está ese elemento en la página (ver "Señalar sin salir del árbol" más abajo), sin ocultar ni fijar nada.</li>',
    '</ul>',
    '<p>Clic en el <b>texto</b> de la línea (la etiqueta, no los íconos) selecciona ese elemento, cierra el popup y hace un salto+resaltado breve hasta él en la página.</p>',
    '<ul>',
    '<li>Clic en un valor de atributo (ej. las clases) lo copia. El ícono <b>📋</b> copia el HTML completo de esa línea.</li>',
    '<li>Buscador por etiqueta/clase/id/texto, y botones para expandir, colapsar o copiar todo el árbol.</li>',
    '<li><b>📦 Copiar página</b> — copia el HTML completo de la página (no solo el subárbol del elemento fijado), sin nada de lo que esta herramienta inyecta. Pensado para armar un layout desde cero con Lens-SK y llevarte el resultado final.</li>',
    '<li><b>↺ Restablecer este elemento</b> — aparece solo si el elemento raíz del árbol (el que estaba fijado) tiene algo cambiado; lo deja todo como estaba.</li>',
    '<li>Las clases y el texto también tienen su ✏️ para editarlos en vista previa (mismo sistema que "Vista previa de estilos" más abajo, cuenta para el mismo indicador de la píldora).</li>',
    '</ul>',
    '<p>Si escribís una clase de utilidad "de stock" que el proyecto todavía no usa, se compila aparte (en un iframe invisible, nunca toca el CSS real de la página) y su efecto se aplica como vista previa normal. Clases propias del proyecto (ej. <code>text-h2</code>) ya funcionan directo, sin nada de esto.</p>',

    '<h3>Ocultar elementos</h3>',
    '<p>El ojito de cada fila del árbol alterna un override de <code>display:none</code> sobre ese elemento real de la página — el mismo sistema que "Vista previa de estilos", nada se borra. Al ocultar un elemento con hijos, <b>todo el bloque</b> se atenúa en el árbol (aperturas, cierres y texto) y todos sus ojitos se muestran tachados — aunque el único cambio guardado de verdad sea el del elemento que clickeaste (ocultarlo ya oculta automáticamente todo lo que tiene adentro, como pasaría en la página real).</p>',

    '<h3>Señalar sin salir del árbol</h3>',
    '<p>La lupa 🔍 de una fila lleva la vista hasta ese elemento (si no está en pantalla, la página se mueve para encuadrarlo) y lo marca con un contorno — sin cerrar el árbol ni cambiar el elemento fijado. Se apaga solo después de un par de segundos. Pensada para pantallas táctiles (donde no existe "pasar el mouse" para previsualizar antes de decidir qué tocar).</p>',

    '<h3>Clonar elementos</h3>',
    '<p>El botón <b>⧉ Clonar</b> de la pastilla (o la tecla <b>D</b>) duplica el elemento fijado, insertando la copia justo después del original. Cada clon se marca con un numerito (①, ②...) y el original con un <b>×N</b> — clic en el numerito quita ese clon puntual, clic en el <b>×N</b> los quita todos de una. Se guarda solo la referencia (selector del original + cantidad), nunca el HTML del clon — se regenera clonando de nuevo cada vez que se recarga la página. No se clona a sí mismo si el original ya fue modificado por React (evita romper el estado interno de un componente).</p>',

    '<h3>Atajos de teclado</h3>',
    '<p><b>Shift + tecla</b> funciona siempre. La tecla sola (sin Shift) solo funciona si Inspección está activada, y no funciona mientras estás escribiendo en un campo de texto.</p>',
    '<p>Para ver qué tecla es cada una: mantené <b>Shift</b> apretado (o dejá Inspección activada) y aparece la letra sobre cada ícono de la pastilla.</p>',
    '<ul>',
    '<li><b>Espacio</b> — abrir/cerrar el panel.</li>',
    '<li><b>I</b> — activar/desactivar Inspección.</li>',
    '<li><b>L</b> — Layout.</li>',
    '<li><b>S</b> — Estilos.</li>',
    '<li><b>V</b> o <b>Enter</b> — Ver estructura HTML.</li>',
    '<li><b>C</b> — Copiar clases.</li>',
    '<li><b>T</b> — Copiar clase componente.</li>',
    '<li><b>P</b> — Captura p/chat.</li>',
    '<li><b>D</b> — Clonar el elemento fijado.</li>',
    '<li><b>H</b> — Ocultar/mostrar la barra.</li>',
    '<li><b>R</b> — Restablecer toda la vista previa de la página (estilos, clases y contenido).</li>',
    '<li><b>G</b> — Copiar el CSS real (selector + propiedades) de todo lo cambiado en la página, listo para pegar en un .css. Mismo ícono <b>📄</b> en la pastilla (aparece solo si hay algo cambiado). Dentro del panel, en el aviso de "Vista previa" hay un botón <b>📄 CSS/TWCSS</b> (el nombre cambia según el modo) que hace lo mismo pero solo con el elemento fijado.</li>',
    '<li><b>F</b> — Va directo al buscador de la ventana en la que estás: el del árbol de estructura si ese popup está abierto, o el de filtrar propiedades si el panel está en Estilos/Layout.</li>',
    '<li><b>↑ ↓ ← →</b> — Padre / Hijo / Hermano anterior / Hermano siguiente.</li>',
    '<li><b>Esc</b> — cancela una edición de estilo en curso; si no hay ninguna, cierra el popup que esté abierto (ayuda o árbol HTML).</li>',
    '</ul>',

    '<h3>Vista previa de estilos</h3>',
    '<p>En las vistas <b>Estilos</b> y <b>Layout</b>, cada valor tiene un ícono ✏️ al lado. Al hacer clic, se convierte en un campo editable: escribís el nuevo valor y se aplica al instante sobre el elemento en la página real, para ver cómo quedaría antes de tocar el código.</p>',
    '<p>El cambio queda guardado en tu navegador (no es un cambio real ni se sube a ningún lado), así que sigue viéndose igual aunque recargués la página. Cuando el elemento tiene algún valor cambiado, aparece un aviso arriba del panel con la cantidad de cambios y un botón <b>↺ Restablecer</b> que los deja como estaban.</p>',
    '<p>Para saber si hay algo cambiado en <b>cualquier parte</b> de la página (no solo en el elemento fijado): la pastilla se tiñe de ámbar y aparece un botón <b>↺ N</b> con la cantidad total. Un clic ahí restablece todo de una sola vez, sin tener que ir elemento por elemento. Con Inspección activa, cada elemento cambiado tiene un puntito <b>✎</b> ámbar sobre él en la página — clic ahí para fijarlo directo, sin buscarlo.</p>',
    '<p>Varios campos ofrecen autocompletado al escribir (propiedades, nombres de CSS al agregar una nueva, clases del árbol). Con la lista abierta, <b>↑/↓</b> mueven la selección entre las sugerencias y <b>Tab</b> o <b>Enter</b> confirman la resaltada (o la primera, si no navegaste con las flechas).</p>',
    '<p>Las filas de color tienen un botón <b>🎨</b> con las variables de marca del proyecto (nombre + muestra) — elegir una aplica <code>var(--color-x)</code> sobre el elemento.</p>',

    '<h3>Modo TWCSS</h3>',
    '<p>Switch "TWCSS". Con esto activado, copiar un valor busca primero si ya existe una clase de utilidad real del proyecto para ese mismo valor y copia esa clase en vez del valor plano — si no la encuentra, cae en la sintaxis arbitraria de Tailwind (ej. <code>w-[123px]</code>).</p>',
    '<p>Con TWCSS activo, además aparecen dos botones nuevos junto al ✏️ en algunas filas: <b>🔢</b> en márgenes/padding/width/height/gap/posición (escala 0 a 12 de Tailwind, ej. <code>mb-4</code>, ordenada de menor a mayor) y <b>🔤</b> en tamaño/familia/peso/line-height/letter-spacing de Tipografía (clases <code>text-*</code>/<code>font-*</code> reales, detectadas en el CSS del proyecto, ordenadas de mayor a menor valor). En Tipografía también aparece <b>✨</b> junto al título si el proyecto tiene clases propias que combinan varias propiedades a la vez (ej. <code>text-h2</code>) — elegir una las aplica todas juntas. En los tres casos, elegir una opción aplica siempre el <b>valor real</b> sobre el elemento (nunca el nombre de la clase, la fila sigue mostrando lo mismo que el inspector de Chrome) y copia el nombre de la clase.</p>',
    '<p>El selector <b>🔢</b> además tiene, al final de la lista, un campo numérico libre (ej. <code>mb-</code> + escribir <b>20</b>) para valores fuera de la escala 0-12 — muestra el valor real calculado en vivo mientras se escribe, y <b>Enter</b> lo aplica.</p>',

    '<h3>Breakpoints</h3>',
    '<p>El indicador <b>📱</b> (abajo a la derecha) muestra el ancho actual y el breakpoint activo. El ⚙️ junto a "Mostrar breakpoint" abre la configuración: modo <b>Auto</b> (detecta los breakpoints ya definidos en el CSS del proyecto) o <b>Manual</b> (lista propia editable).</p>',

    '<h3>Todo es copiable</h3>',
    '<p>Cualquier valor mostrado en un panel es una fila clickeable que lo copia al portapapeles (ícono 📋 → ✅).</p>',

    '<h3>Persistencia</h3>',
    '<p>El elemento seleccionado, la vista activa, los cambios de estilo/clases/contenido, los clones y los elementos ocultos se guardan solos (por página) y se restauran automáticamente después de una recarga — nada se pierde entre recargas hasta que decidas restablecerlo.</p>',
  ].join('');

  var HELP_CONTENT_HTML_EN = [
    '<h2>🔍 Lens-SK</h2>',
    '<p>Floating bar to visually inspect and debug any element on this page: classes, styles, contrast, layout structure and accessibility.</p>',

    '<h3>Selection</h3>',
    '<p>Turn on the Inspect icon (the yellow cursor) and click any element on the page to select it. Turn it off when you want to use the page normally, without selecting anything by mistake.</p>',
    '<p>With Inspect on, <b>double-clicking</b> an element copies all of its classes right away, no extra steps.</p>',
    '<p>A <b>middle click</b> (mouse wheel) on an element pins it AND opens the HTML structure popup in one go — selection + <b>V</b> in a single click. Works always, regardless of Inspect.</p>',
    '<p>With Inspect on, holding down the <b>left</b> click (~half a second) does the same — an alternative in case the middle mouse button doesn\'t work well. Releasing sooner is just a normal click (pins only).</p>',

    '<h3>The minimized pill</h3>',
    '<p>The pill is always visible, pinned to the right edge of the screen. Top to bottom: <b>☰ Menu</b> (opens/closes the big panel), then these shortcuts, so you don\'t have to open that panel:</p>',
    '<ul>',
    '<li><svg viewBox="0 0 40 40" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.3" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:-3px;display:inline-block;"><path d="M4 4h5M4 4v5M32 4h-5M32 4v5M4 32h5M4 32v-5M32 32h-5M32 32v-5M15 4h6M15 32h6M4 15v6M32 15v6"/><path d="M11 11l11.930 28.635 4.235-12.470 12.470-4.235L11 11z" fill="#fbbf24" stroke="#fbbf24" stroke-width="1.5"/></svg> <b>Selection cursor (Inspect)</b> — turns the selection mode explained above on or off.</li>',
    '<li><b>📐 Layout</b> and <b>🎨 Styles</b> — show that information directly over the page, without opening the panel.</li>',
    '<li><b>&lt;/&gt; HTML structure</b> — opens a large popup with the HTML of the selected element (see below).</li>',
    '<li><b>📋 Copy classes</b> — copies all the CSS classes of the selected element.</li>',
    '<li><b>🏷️ Copy component class</b> — copies the name of the component or section that element is in.</li>',
    '<li><b>📸 Screenshot for chat</b> — takes a photo of just the selected element and copies it, ready to paste into a chat or a change request.</li>',
    '<li><b>⧉ Clone</b> — duplicates the pinned element right after the original, with a numbered marker (see "Cloning elements" below). Handy for testing how a layout looks with more items (e.g. a flex row with <code>wrap</code>) without adding real content.</li>',
    '</ul>',
    '<p>To jump from the selected element to its <b>parent</b>, <b>child</b> or <b>siblings</b> without clicking the page again: keyboard arrows ↑ ↓ ← →.</p>',

    '<h3>Hiding the bar</h3>',
    '<p>The eye icon at the end of the pill (all the way down) or the <b>H</b> key minimizes the whole pill down to a round 🛠️ button — the general panel stays visible if it was open and Inspect is on, so you can keep checking it. Without Inspect on it hides everything. A click on the 🛠️ (or <b>H</b> again) brings it back.</p>',

    '<h3>Language</h3>',
    '<p>The <b>ES/EN</b> buttons (bottom of the panel) switch the whole interface\'s language instantly, without reloading the page. The system language is detected on first use (Spanish if it matches, English otherwise), and your manual choice is remembered after that. Keyboard shortcuts are always the same letters, regardless of language.</p>',

    '<h3>The 5 views of this panel</h3>',
    '<ul>',
    '<li><b>🧩 Component</b> — its CSS classes and the name of the component it belongs to.</li>',
    '<li><b>🎨 Styles</b> — typography, size, margins, borders and background, with a clickable visual diagram (names and numbers jump straight to that property). The height marked <b>A</b> is automatic (by content), <b>D</b> is explicitly defined. Margin/padding/size (min/max) constraints are marked with small arrows on the diagram. A <b>negative</b> value (e.g. a margin that "pulls" an element out of its box) is flagged in bold red on the diagram and with a ⚠️ on the list row — perfectly valid and commonly used, but also a frequent cause of layout bugs when unnoticed. Every value can be edited (see "Style preview" below), and at the end there\'s a field to add any CSS property not already in the list.</li>',
    '<li><b>🌓 Contrast</b> — how readable the text is against its background, and whether it meets accessibility standards (WCAG).</li>',
    '<li><b>📐 Layout</b> — how the element and everything inside it is structured (see "Layout view: what to show" below). Also editable (see "Style preview" below).</li>',
    '<li><b>♿ A11y</b> — scans the whole page for accessibility issues: images without alt text, form fields without a label, headings out of order.</li>',
    '</ul>',

    '<h3>Layout view: what to show</h3>',
    '<p>On dense components (heavy nesting, several <code>absolute</code> elements, grids with many items) the Layout overlay can get cluttered with boxes and labels. Three switches above the panel let you choose what to see:</p>',
    '<ul>',
    '<li><b>Display</b> — flex/grid labels: the highlighted container (e.g. "flex row gap 8 justify-center") and each direct child (e.g. "item2 flex: 1 1 0%"), with colored fill to tell them apart.</li>',
    '<li><b>Position</b> — the pinned element always gets its usual selection outline; on top of that, any element with a <code>position</code> other than <code>static</code> gets labeled <b>relative</b>/<b>fixed</b>/<b>sticky</b> (top-left) or <b>absolute</b> (top-right, so it never overlaps its positioned ancestor) — each type in its own color. Clicking a relative/fixed/sticky label <b>selects</b> that element; clicking <b>absolute</b> instead briefly highlights (box + glowing label) its real positioned ancestor, without changing the pinned element — handy for quickly answering "what is this positioned relative to?".</li>',
    '<li><b>Outline</b> — the rest of the context boxes (every other nested level, whether or not it has a label on it). Display and Position always draw whatever box their own label needs, even with Outline off.</li>',
    '</ul>',
    '<p>At least one of the three has to stay on: turning off Display or Position while it\'s the only one left automatically turns the other one on; Outline, if it\'s the only one left, can\'t be turned off.</p>',

    '<h3>&lt;/&gt; HTML structure</h3>',
    '<p>Opens a popup with the HTML of the selected element and its children, syntax-highlighted like a code editor. Every row for a real element (not text) has two icons of its own, always visible (they don\'t depend on hovering — they work the same with a mouse or by tapping on touch screens):</p>',
    '<ul>',
    '<li>The <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:-2px;display:inline-block;"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg> eye icon <b>hides/shows</b> that element on the real page (see "Hiding elements" below).</li>',
    '<li>The <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:-2px;display:inline-block;"><circle cx="11" cy="11" r="7"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg> magnifying-glass icon <b>locates</b> that element on the page (see "Locate without leaving the tree" below), without hiding or pinning anything.</li>',
    '</ul>',
    '<p>Clicking the line\'s <b>text</b> (the tag, not the icons) selects that element, closes the popup and does a quick jump+flash to it on the page.</p>',
    '<ul>',
    '<li>Clicking an attribute value (e.g. classes) copies it. The <b>📋</b> icon copies the full HTML of that line.</li>',
    '<li>Search by tag/class/id/text, and buttons to expand, collapse or copy the whole tree.</li>',
    '<li><b>📦 Copy page</b> — copies the full HTML of the page (not just the pinned element\'s subtree), with everything this tool injects stripped out. Meant for building a layout from scratch with Lens-SK and taking the final result with you.</li>',
    '<li><b>↺ Reset this element</b> — appears only if the root element of this tree (the one that was pinned) has anything changed; puts it all back the way it was.</li>',
    '<li>Classes and text also have their own ✏️ to edit them in preview (same system as "Style preview" below, counts toward the same pill indicator).</li>',
    '</ul>',
    '<p>If you type a "stock" utility class the project doesn\'t use yet, it gets compiled separately (in an invisible iframe, never touching the page\'s real CSS) and its effect applies as a normal preview. The project\'s own classes (e.g. <code>text-h2</code>) already work directly, without any of this.</p>',

    '<h3>Hiding elements</h3>',
    '<p>Each tree row\'s eye toggles a <code>display:none</code> override on that real page element — the same system as "Style preview", nothing gets deleted. Hiding an element with children dims <b>the whole block</b> in the tree (opening tags, closing tags and text) and shows every one of its eyes as closed — even though the only change actually saved is on the element you clicked (hiding it already hides everything inside it, same as it would on the real page).</p>',

    '<h3>Locate without leaving the tree</h3>',
    '<p>A row\'s 🔍 magnifying glass jumps the view to that element (if it\'s off-screen, the page scrolls to frame it) and marks it with an outline — without closing the tree or changing the pinned element. It fades on its own after a couple of seconds. Built for touch screens, where there\'s no "hover" to preview before deciding what to tap.</p>',

    '<h3>Cloning elements</h3>',
    '<p>The pill\'s <b>⧉ Clone</b> button (or the <b>D</b> key) duplicates the pinned element, inserting the copy right after the original. Each clone gets a small number marker (①, ②...) and the original gets an <b>×N</b> — click a number to remove just that clone, click the <b>×N</b> to remove all of them at once. Only a reference is saved (the original\'s selector + count), never the clone\'s markup — it\'s regenerated by cloning again every time the page reloads. It won\'t clone an element already managed by React (to avoid breaking that component\'s internal state).</p>',

    '<h3>Keyboard shortcuts</h3>',
    '<p><b>Shift + key</b> always works. The key alone (without Shift) only works if Inspect is on, and doesn\'t work while you\'re typing in a text field.</p>',
    '<p>To see which key is which: hold <b>Shift</b> down (or leave Inspect on) and the letter appears over each icon in the pill.</p>',
    '<ul>',
    '<li><b>Space</b> — open/close the panel.</li>',
    '<li><b>I</b> — turn Inspect on/off.</li>',
    '<li><b>L</b> — Layout.</li>',
    '<li><b>S</b> — Styles.</li>',
    '<li><b>V</b> or <b>Enter</b> — View HTML structure.</li>',
    '<li><b>C</b> — Copy classes.</li>',
    '<li><b>T</b> — Copy component class.</li>',
    '<li><b>P</b> — Screenshot for chat.</li>',
    '<li><b>D</b> — Clone the pinned element.</li>',
    '<li><b>H</b> — Hide/show the bar.</li>',
    '<li><b>R</b> — Reset the entire page preview (styles, classes and content).</li>',
    '<li><b>G</b> — Copy the real CSS (selector + properties) of everything changed on the page, ready to paste into a .css file. Same <b>📄</b> icon in the pill (appears only if something changed). Inside the panel, the "Preview" notice has a <b>📄 CSS/TWCSS</b> button (the name changes with the mode) that does the same but only for the pinned element.</li>',
    '<li><b>F</b> — Jumps straight to the search box of whichever window you\'re in: the structure tree one if that popup is open, or the property filter one if the panel is on Styles/Layout.</li>',
    '<li><b>↑ ↓ ← →</b> — Parent / Child / Previous sibling / Next sibling.</li>',
    '<li><b>Esc</b> — cancels a style edit in progress; if there isn\'t one, closes whichever popup is open (help or HTML tree).</li>',
    '</ul>',

    '<h3>Style preview</h3>',
    '<p>In the <b>Styles</b> and <b>Layout</b> views, every value has a ✏️ icon next to it. Clicking it turns it into an editable field: type the new value and it applies instantly to the element on the real page, so you can see how it would look before touching the code.</p>',
    '<p>The change is saved in your browser (it isn\'t a real change and isn\'t uploaded anywhere), so it keeps looking the same even after reloading the page. When the element has any changed value, a notice appears above the panel with the number of changes and a <b>↺ Reset</b> button that puts them back the way they were.</p>',
    '<p>To know if something has changed <b>anywhere</b> on the page (not just the pinned element): the pill turns amber and a <b>↺ N</b> button appears with the total count. One click there resets everything at once, without having to go element by element. With Inspect on, every changed element has a small amber <b>✎</b> dot over it on the page — click it to pin it directly, without hunting for it.</p>',
    '<p>Several fields offer autocomplete as you type (properties, CSS names when adding a new one, tree classes). With the list open, <b>↑/↓</b> move the selection between suggestions and <b>Tab</b> or <b>Enter</b> confirm the highlighted one (or the first one, if you didn\'t navigate with the arrows).</p>',
    '<p>Color rows have a <b>🎨</b> button with the project\'s brand variables (name + swatch) — picking one applies <code>var(--color-x)</code> to the element.</p>',

    '<h3>TWCSS mode</h3>',
    '<p>The "TWCSS" switch. With this on, copying a value first checks whether a real utility class already exists in the project for that same value and copies that class instead of the plain value — if it can\'t find one, it falls back to Tailwind\'s arbitrary syntax (e.g. <code>w-[123px]</code>).</p>',
    '<p>With TWCSS on, two extra buttons also show up next to ✏️ on some rows: <b>🔢</b> on margin/padding/width/height/gap/position (Tailwind\'s 0-to-12 scale, e.g. <code>mb-4</code>, sorted smallest to largest) and <b>🔤</b> on Typography\'s size/family/weight/line-height/letter-spacing (real <code>text-*</code>/<code>font-*</code> classes detected in the project\'s CSS, sorted largest value first). Typography also shows <b>✨</b> next to its title if the project has its own classes that bundle several properties at once (e.g. <code>text-h2</code>) — picking one applies all of them together. In all three cases, picking an option always applies the <b>real value</b> to the element (never the class name — the row keeps showing exactly what Chrome\'s inspector would) and copies the class name.</p>',
    '<p>The <b>🔢</b> picker also has a free-form number field at the end of the list (e.g. <code>mb-</code> + type <b>20</b>) for values outside the 0-12 scale — it shows the real calculated value live as you type, and <b>Enter</b> applies it.</p>',

    '<h3>Breakpoints</h3>',
    '<p>The <b>📱</b> indicator (bottom right) shows the current width and active breakpoint. The ⚙️ next to "Show breakpoint" opens the settings: <b>Auto</b> mode (detects the breakpoints already defined in the project\'s CSS) or <b>Manual</b> (your own editable list).</p>',

    '<h3>Everything is copyable</h3>',
    '<p>Any value shown in a panel is a clickable row that copies it to the clipboard (📋 icon → ✅).</p>',

    '<h3>Persistence</h3>',
    '<p>The selected element, active view, style/class/content changes, clones and hidden elements all save themselves (per page) and are restored automatically after a reload — nothing is lost between reloads until you decide to reset it.</p>',
  ].join('');

  function getHelpContentHTML() { return currentLang === 'es' ? HELP_CONTENT_HTML_ES : HELP_CONTENT_HTML_EN; }

  // Créditos: datos reales de ELAN-SK/Elan SK Soft, mismo patrón de formato
  // ya validado en otro proyecto (filas centradas como conjunto, etiqueta
  // shrink-0 sin ancho fijo, la llave de Bre-B es directamente el botón de
  // copiar sin ícono aparte). copyText() se define más abajo (hoisted).
  // Logo real de ELAN-SK SOFT, embebido como data URI (self-contained, sin
  // depender de un archivo aparte que haya que copiar/servir junto al script).
  var LOGO_ELANSK_SVG = '<?xml version="1.0" encoding="UTF-8" standalone="no"?><svg version="1.0" width="2890.000000pt" height="1130.000000pt" viewBox="0 0 2890.000000 1130.000000" preserveAspectRatio="xMidYMid meet" id="svg32" sodipodi:docname="logo-elan-sk.svg" inkscape:version="1.1.2 (0a00cf5339, 2022-02-04)" xmlns:inkscape="http://www.inkscape.org/namespaces/inkscape" xmlns:sodipodi="http://sodipodi.sourceforge.net/DTD/sodipodi-0.dtd" xmlns:xlink="http://www.w3.org/1999/xlink" xmlns="http://www.w3.org/2000/svg" xmlns:svg="http://www.w3.org/2000/svg"> <defs id="defs36"> <linearGradient inkscape:collect="always" id="linearGradient31309"> <stop style="stop-color:#ffffff;" offset="0" id="stop31305" /> <stop style="stop-color:#ffffff;stop-opacity:0;" offset="1" id="stop31307" /> </linearGradient> <linearGradient inkscape:collect="always" xlink:href="#linearGradient31309" id="linearGradient31311" x1="552.93746" y1="975.90632" x2="717.1804" y2="975.90632" gradientUnits="userSpaceOnUse" /> </defs> <sodipodi:namedview id="namedview34" pagecolor="#ffffff" bordercolor="#666666" borderopacity="1.0" inkscape:pageshadow="2" inkscape:pageopacity="0.0" inkscape:pagecheckerboard="0" inkscape:document-units="pt" showgrid="false" inkscape:zoom="0.11313709" inkscape:cx="-1520.2795" inkscape:cy="-1392.1164" inkscape:window-width="1920" inkscape:window-height="1024" inkscape:window-x="1600" inkscape:window-y="28" inkscape:window-maximized="1" inkscape:current-layer="g30" /> <g transform="translate(0.000000,1130.000000) scale(0.100000,-0.100000)" fill="#000000" stroke="none" id="g30"> <path fill="#c83000" d="M4395 10049 c-776 -49 -1551 -302 -2209 -722 -599 -382 -1109 -906 -1484 -1524 -100 -165 -271 -509 -340 -683 -332 -839 -415 -1745 -241 -2635 125 -642 395 -1265 778 -1800 715 -998 1788 -1674 2991 -1884 921 -161 1863 -43 2717 339 1395 626 2405 1915 2677 3420 202 1112 -10 2272 -591 3238 -478 795 -1215 1454 -2058 1839 -692 317 -1472 460 -2240 412z m355 -819 c36 -51 147 -290 181 -390 23 -69 33 -120 37 -187 6 -110 -6 -160 -54 -225 -96 -134 -281 -147 -388 -28 -126 140 -112 337 50 679 87 184 126 218 174 151z m-358 -841 c54 -28 174 -150 218 -223 48 -79 75 -111 88 -102 6 4 35 44 65 89 111 171 216 257 312 257 93 0 148 -58 148 -155 0 -66 -6 -76 -101 -168 -49 -48 -95 -105 -120 -150 -79 -139 -149 -415 -96 -379 5 4 45 51 88 105 126 157 249 256 385 308 145 57 251 3 251 -127 0 -78 -27 -110 -137 -165 -108 -54 -164 -97 -235 -184 l-53 -65 -511 0 -511 0 -54 65 c-69 82 -130 129 -243 185 -108 54 -136 87 -136 162 0 83 44 140 119 153 28 5 60 -1 117 -20 142 -47 283 -159 426 -337 38 -49 74 -88 79 -88 31 0 -19 194 -86 337 -37 79 -58 107 -140 192 -102 105 -120 140 -108 205 21 112 128 160 235 105z m-647 -859 c44 -12 126 -43 183 -70 l102 -49 0 -220 c0 -122 -3 -221 -7 -221 -5 0 -37 23 -72 51 -86 67 -229 136 -321 155 -141 30 -307 0 -437 -78 -129 -77 -279 -251 -365 -423 -48 -95 -88 -209 -88 -250 0 -40 8 -43 142 -45 93 -1 191 -22 158 -33 -8 -3 -60 -11 -115 -17 -409 -45 -716 -185 -907 -415 -59 -72 -65 -76 -93 -69 -61 16 -142 10 -171 -12 -49 -36 -68 -70 -68 -121 0 -73 45 -149 119 -203 19 -14 20 -25 17 -148 l-3 -134 -27 7 c-121 30 -267 151 -331 275 -104 200 -83 384 59 522 33 32 60 62 60 67 0 34 -127 65 -235 58 -113 -8 -166 -29 -239 -98 -113 -105 -156 -225 -156 -434 0 -199 45 -383 145 -590 205 -427 581 -771 913 -835 195 -39 365 44 448 218 15 31 28 58 29 59 1 2 55 -11 121 -28 179 -46 311 -74 609 -129 282 -52 452 -90 507 -113 85 -36 127 -105 108 -178 l-10 -37 -108 -7 c-114 -7 -421 -31 -537 -41 l-70 -6 -38 38 c-31 32 -91 138 -110 196 -3 9 -16 23 -29 32 -20 13 -57 11 -328 -15 -168 -15 -429 -40 -580 -54 -151 -14 -285 -31 -297 -37 -13 -6 -25 -19 -28 -29 -7 -22 26 -145 66 -242 16 -39 25 -74 21 -78 -10 -9 -184 -39 -229 -39 -51 0 -123 37 -150 78 -12 18 -24 51 -28 75 -11 63 -63 221 -101 304 -45 99 -130 228 -303 457 -78 105 -151 207 -162 228 -37 72 -158 437 -181 545 -19 91 -23 138 -23 293 0 221 12 284 87 438 41 87 62 117 126 181 83 83 182 142 297 178 91 27 339 25 454 -5 90 -24 131 -28 131 -13 0 16 -58 59 -117 85 -149 67 -173 93 -173 183 0 49 4 59 34 89 39 39 75 43 178 22 31 -7 60 -9 64 -6 3 4 -5 31 -19 60 -49 105 -52 124 -51 303 1 190 7 215 53 215 32 0 161 -107 244 -201 54 -62 112 -167 121 -221 20 -113 -65 -208 -186 -208 -20 0 -39 -4 -42 -9 -6 -9 198 -201 214 -201 18 0 27 36 34 130 7 112 24 182 63 258 71 142 177 176 271 89 37 -35 56 -94 47 -139 -4 -17 -23 -62 -43 -101 -28 -55 -36 -84 -40 -142 -8 -135 18 -160 54 -52 156 471 473 814 842 906 116 30 116 30 272 26 109 -2 165 -9 225 -25z m2357 10 c188 -41 363 -143 519 -301 144 -146 242 -301 334 -534 56 -140 70 -161 81 -121 3 15 4 60 2 99 -4 56 -13 87 -40 142 -20 39 -38 84 -42 100 -15 69 44 156 118 176 81 22 161 -39 217 -165 26 -59 49 -181 49 -258 0 -60 12 -98 31 -98 6 0 36 24 67 53 31 29 78 70 105 91 60 49 61 66 4 66 -121 0 -190 66 -190 180 0 79 54 178 155 285 137 145 221 195 247 148 5 -10 12 -81 16 -158 8 -163 -6 -254 -54 -347 -16 -32 -26 -60 -22 -62 4 -3 32 1 62 9 30 8 75 15 102 15 40 0 53 -5 82 -32 24 -22 38 -45 42 -70 13 -84 -26 -135 -146 -190 -96 -44 -151 -82 -151 -104 0 -19 5 -18 123 13 87 23 123 27 247 27 166 1 217 -9 339 -65 71 -33 98 -54 176 -132 75 -75 100 -108 134 -177 71 -145 86 -224 86 -445 0 -162 -4 -206 -23 -300 -29 -134 -74 -258 -140 -390 -27 -55 -64 -134 -82 -175 -42 -97 -57 -121 -163 -263 -196 -263 -245 -352 -327 -602 -28 -85 -61 -166 -72 -181 -28 -34 -92 -64 -143 -64 -22 0 -143 20 -268 44 -176 34 -232 48 -242 63 -16 22 -217 366 -238 408 l-15 31 59 -30 c183 -91 451 -12 721 213 280 232 512 629 573 977 33 188 14 409 -46 525 -35 69 -122 153 -192 185 -56 26 -72 29 -172 29 -120 0 -205 -22 -205 -53 0 -8 29 -46 65 -83 72 -74 101 -129 115 -216 22 -136 -47 -319 -162 -429 -83 -80 -128 -104 -287 -159 -73 -25 -152 -59 -175 -74 -41 -29 -112 -101 -174 -179 -81 -101 -223 -67 -239 58 -5 32 0 48 22 83 74 113 211 240 314 291 29 15 99 43 154 63 160 55 200 82 239 158 43 83 26 166 -46 219 -41 31 -135 29 -199 -3 -45 -24 -273 -250 -320 -319 -63 -93 -145 -287 -180 -427 -9 -33 -23 -85 -32 -115 -21 -68 -31 -284 -17 -359 10 -54 10 -55 -8 -31 -18 24 -115 189 -267 451 l-72 126 217 215 c119 118 358 352 529 519 326 316 334 327 301 372 -12 15 -67 17 -648 19 -349 1 -655 4 -680 7 l-45 6 60 32 c83 43 130 54 238 55 105 1 137 9 137 37 0 72 -117 318 -210 443 -149 199 -375 328 -569 328 -165 -1 -350 -78 -487 -203 l-64 -59 0 234 0 234 78 41 c88 47 198 87 292 107 98 22 297 19 402 -4z m-892 -740 l0 -511 -107 2 c-128 3 -117 7 -354 -147 l-66 -42 -7 -174 c-4 -95 -15 -258 -25 -363 -10 -104 -16 -193 -14 -196 1 -4 67 -10 145 -13 165 -8 238 -15 238 -24 0 -4 -38 -47 -84 -97 l-83 -90 -124 24 c-68 13 -145 27 -170 33 l-45 9 -44 107 c-24 59 -54 132 -68 162 -13 30 -31 71 -39 90 -8 19 -18 43 -23 52 -6 10 -10 22 -10 28 0 5 -11 33 -24 62 -13 29 -32 72 -42 95 -10 24 -19 41 -21 39 -2 -2 5 -50 16 -107 11 -57 41 -225 66 -374 26 -148 51 -278 56 -287 8 -15 25 -18 112 -18 56 0 139 -3 184 -7 l82 -6 -49 -57 -50 -57 -159 -52 c-87 -28 -167 -51 -177 -51 -10 0 -53 23 -96 51 l-78 52 0 1188 0 1189 530 0 530 0 0 -510z m264 -149 c58 -41 150 -139 176 -190 51 -101 56 -226 15 -352 -25 -75 -118 -170 -209 -213 -39 -19 -83 -37 -98 -40 l-28 -6 0 73 c0 66 3 77 30 113 38 50 38 61 0 34 l-30 -21 0 49 c0 35 4 52 15 56 26 10 55 69 55 113 0 32 -8 52 -35 87 l-35 46 0 160 0 160 51 -20 c28 -12 70 -33 93 -49z m-1444 -116 c0 -202 -9 -231 -68 -221 -21 3 -86 11 -145 18 l-109 11 6 30 c14 68 59 145 119 205 58 57 155 121 185 122 9 0 12 -40 12 -165z m-165 -329 c61 -9 122 -18 138 -22 l27 -6 -2 -356 -3 -357 -75 -7 c-41 -4 -92 -9 -112 -12 -36 -4 -38 -2 -60 42 -84 169 -281 261 -533 249 -60 -3 -132 -12 -160 -21 -27 -8 -50 -14 -51 -13 -1 1 10 31 24 65 l27 64 55 -6 c30 -4 109 -15 175 -25 66 -10 121 -17 123 -16 2 2 -44 29 -102 60 -58 31 -108 60 -110 64 -3 4 -1 36 4 71 5 35 8 66 6 68 -2 1 -54 -13 -115 -33 -110 -36 -111 -36 -111 -67 0 -72 -24 -163 -55 -212 -18 -28 -46 -76 -62 -106 -16 -30 -74 -131 -128 -225 -54 -93 -113 -197 -131 -231 l-33 -61 92 -124 c315 -425 378 -511 374 -515 -7 -7 -335 64 -467 102 -266 75 -419 182 -549 383 -81 125 -117 273 -108 436 8 124 26 197 76 300 147 299 474 474 981 524 146 15 733 6 865 -13z m1345 -111 c0 -175 5 -171 -182 -161 -73 3 -134 8 -136 11 -7 7 88 212 103 225 15 12 161 57 193 59 22 1 22 0 22 -134z m2175 46 c-230 -216 -954 -932 -964 -952 -13 -27 -1 -49 534 -966 301 -516 550 -941 552 -945 2 -5 -257 -8 -576 -8 l-579 0 -297 586 c-162 323 -293 589 -290 592 3 3 88 -9 188 -27 101 -18 190 -32 199 -30 9 2 74 53 146 114 l129 110 37 163 c37 160 40 198 15 150 -6 -12 -31 -52 -54 -88 -23 -36 -60 -95 -84 -131 l-42 -66 -131 -22 c-72 -12 -133 -20 -135 -17 -3 2 7 60 20 128 21 101 29 126 49 140 12 10 63 47 112 83 58 42 83 65 70 65 -11 0 -24 -4 -30 -8 -5 -5 -68 -28 -141 -51 -72 -23 -136 -48 -141 -54 -5 -7 -42 -91 -82 -187 -41 -96 -75 -177 -77 -179 -3 -4 -171 44 -250 72 -18 6 -33 18 -33 27 0 8 -7 112 -15 230 -13 204 -12 220 6 309 10 51 19 95 19 98 0 12 -22 -13 -56 -64 l-37 -57 -39 43 c-43 49 -42 57 20 113 22 20 41 41 43 47 2 6 157 189 344 406 l340 395 625 0 c610 0 624 0 605 -19z m-2175 -540 l0 -228 -207 57 -208 57 -7 39 c-3 22 -9 82 -13 135 -7 89 -6 97 11 102 11 3 100 15 199 27 99 12 189 25 200 30 11 5 21 9 23 9 1 1 2 -102 2 -228z m352 94 c24 -10 16 -23 -84 -136 -93 -107 -106 -118 -130 -119 -16 0 -18 13 -18 136 l0 137 108 -6 c59 -3 115 -8 124 -12z m-2283 -92 c-8 -10 -40 -47 -73 -83 -32 -36 -72 -94 -89 -130 -17 -36 -31 -66 -33 -68 -5 -7 -60 27 -80 50 -47 52 -37 125 26 182 22 20 43 36 48 36 4 1 30 7 57 15 28 7 74 14 104 14 49 1 52 0 40 -16z m340 -100 c30 -31 55 -72 73 -116 l26 -67 -26 -48 c-14 -26 -26 -48 -28 -50 -4 -6 -259 30 -267 37 -9 9 26 112 57 165 31 53 94 126 109 126 6 0 31 -21 56 -47z m-584 -293 c84 -31 255 -65 495 -95 113 -15 242 -33 288 -40 l83 -14 64 -68 64 -68 -2 -199 -2 -200 -370 3 c-203 1 -373 5 -377 8 -7 4 -95 106 -416 484 l-82 97 46 109 46 109 52 -51 c35 -36 70 -59 111 -75z m995 -180 c0 -5 -7 -7 -15 -4 -8 4 -15 8 -15 10 0 2 7 4 15 4 8 0 15 -4 15 -10z m1394 -187 c-3 -16 -18 -93 -34 -173 -15 -80 -26 -148 -24 -152 2 -3 21 -9 42 -12 163 -24 252 -40 250 -45 -2 -3 -48 -50 -104 -104 l-100 -97 -143 92 -144 92 7 81 c3 44 6 115 6 158 l0 77 88 40 c48 22 98 46 112 55 38 22 50 19 44 -12z m-1040 -123 c60 28 110 49 112 47 2 -2 -47 -58 -108 -125 l-112 -122 -63 0 -63 0 0 142 0 143 63 -68 62 -68 109 51z m676 -33 c0 -2 -16 -72 -35 -156 -19 -83 -35 -158 -35 -165 0 -12 50 -34 303 -132 l98 -38 -91 -91 -90 -90 0 -373 0 -372 -530 0 -530 0 0 510 c0 433 2 510 14 510 8 0 72 27 143 61 216 103 386 179 390 175 2 -2 -30 -40 -72 -84 -41 -44 -75 -84 -75 -89 0 -4 13 -24 28 -43 16 -19 104 -135 196 -257 150 -200 208 -271 177 -217 -6 11 -25 51 -42 89 -44 99 -73 162 -137 302 l-55 123 96 142 c91 133 100 143 154 169 50 24 93 36 93 26z m-1122 -383 l92 -7 -2 -515 -3 -516 -30 -7 c-217 -55 -780 -70 -1112 -29 -125 15 -318 56 -405 86 -244 83 -430 234 -553 450 -41 72 -102 221 -94 228 3 3 1003 97 1021 96 4 0 21 -28 38 -62 107 -213 276 -307 547 -308 127 0 228 20 318 65 132 65 198 156 198 275 0 96 -40 166 -126 226 l-52 36 35 -6 c19 -3 77 -8 128 -12z m1837 -157 c44 -86 77 -159 73 -162 -3 -3 -112 0 -242 7 l-237 13 73 72 73 72 124 -50 c69 -27 128 -48 132 -47 4 2 -42 34 -102 72 l-110 70 58 58 c32 32 62 57 68 55 5 -2 46 -74 90 -160z m-80 -248 c166 -9 202 -13 213 -27 8 -9 34 -57 59 -107 44 -86 45 -91 34 -135 -21 -86 -22 -124 -6 -180 28 -93 30 -127 7 -139 -14 -7 -114 -5 -346 6 l-326 17 0 294 0 294 83 -6 c45 -3 172 -11 282 -17z m-2000 -8 c-39 -34 -259 -64 -351 -46 -66 12 -17 24 158 39 213 18 204 17 193 7z m3875 -216 c276 -50 290 -56 290 -117 0 -40 -147 -386 -177 -415 -26 -27 -73 -29 -198 -8 l-80 13 117 1 c113 1 117 2 137 27 12 15 21 31 21 36 0 5 -56 105 -124 221 -68 117 -131 226 -140 243 -14 30 -14 32 2 28 9 -2 78 -15 152 -29z m-5685 -71 c109 -149 240 -258 412 -344 103 -51 104 -54 13 -64 -30 -4 -158 -21 -283 -38 l-228 -31 -27 20 c-32 23 -53 63 -133 252 -34 81 -59 155 -57 169 5 38 45 61 143 82 50 10 95 19 101 19 5 1 32 -29 59 -65z m3769 -400 c94 -3 177 -7 185 -9 9 -1 75 -6 146 -10 72 -3 168 -11 215 -16 47 -6 155 -14 240 -19 257 -14 1025 -103 1121 -130 19 -5 48 -23 64 -40 23 -24 28 -39 28 -75 0 -53 -22 -89 -73 -117 -40 -22 -121 -21 -310 6 -425 60 -1008 112 -1570 142 -400 22 -1470 25 -1825 6 -698 -37 -1241 -85 -1744 -153 -179 -24 -217 -24 -261 0 -106 56 -104 195 3 230 31 10 580 82 747 97 105 10 97 10 310 -10 211 -21 632 -24 805 -7 66 7 167 21 225 32 96 17 159 19 718 19 599 0 612 0 632 20 11 11 20 27 20 36 0 13 11 15 78 10 42 -3 153 -8 246 -12z" id="path2" /> <path fill="#1ee492" d="M22343 9460 c-301 -29 -546 -140 -678 -308 -104 -130 -150 -274 -142 -442 13 -286 181 -489 517 -621 131 -52 221 -79 430 -130 276 -68 373 -115 427 -206 52 -89 34 -194 -46 -266 -58 -53 -114 -77 -192 -86 -154 -16 -276 18 -369 105 -58 54 -92 119 -119 224 -19 75 -19 75 -55 78 -19 2 -180 -6 -356 -17 -177 -12 -325 -21 -329 -21 -12 0 14 -153 40 -235 12 -39 38 -104 59 -145 176 -349 458 -480 1039 -480 203 0 341 16 479 56 380 110 622 415 622 784 0 288 -140 508 -409 645 -140 70 -339 132 -674 210 -295 69 -365 114 -355 225 12 124 137 188 329 169 83 -9 152 -39 202 -87 45 -43 69 -86 92 -165 l16 -57 42 0 c56 0 558 29 625 36 62 7 62 3 27 140 -83 332 -293 510 -680 579 -108 19 -412 27 -542 15z" id="path4" /> <path fill="#1ee492" d="M10030 8190 l0 -1240 1045 0 1045 0 0 280 0 280 -660 0 -660 0 0 245 0 245 595 0 595 0 0 250 0 250 -534 0 c-293 0 -561 3 -595 6 l-61 7 0 188 0 189 623 0 c342 0 632 3 645 6 22 6 22 7 22 218 0 116 -3 235 -6 264 l-7 52 -1023 0 -1024 0 0 -1240z" id="path6" /> <path fill="#1ee492" d="M12530 8190 l0 -1240 980 0 980 0 0 305 0 305 -595 0 -595 0 0 935 0 935 -385 0 -385 0 0 -1240z" id="path8" /> <path fill="#1ee492" d="M15515 9413 c-3 -10 -211 -560 -460 -1223 -249 -663 -457 -1213 -460 -1223 -7 -16 14 -17 386 -15 l394 3 55 185 c31 102 59 193 62 203 7 16 37 17 437 17 l429 0 30 -97 c17 -54 45 -146 63 -205 l32 -108 403 0 404 0 -11 28 c-6 15 -209 554 -451 1197 -242 644 -447 1189 -456 1213 l-16 42 -417 0 c-388 0 -417 -1 -424 -17z m553 -1088 l129 -420 -133 -3 c-74 -1 -194 -1 -267 0 l-133 3 130 428 c71 235 133 424 137 420 4 -5 65 -197 137 -428z" id="path10" /> <path fill="#1ee492" d="M17530 8190 l0 -1240 360 0 360 0 0 558 c0 484 6 759 15 770 2 2 79 -107 172 -243 92 -136 296 -434 453 -663 l285 -417 363 -3 362 -2 0 1240 0 1240 -360 0 -360 0 -2 -681 -3 -681 -254 374 c-140 205 -349 511 -465 681 l-210 307 -358 0 -358 0 0 -1240z" id="path12" /> <path fill="#1ee492" d="M24060 8190 l0 -1240 385 0 385 0 0 303 0 303 192 202 c106 111 195 199 199 195 4 -5 122 -231 263 -503 l254 -495 471 -3 c259 -1 471 0 471 3 0 3 -209 347 -465 765 -256 417 -465 763 -465 768 0 6 199 216 443 468 243 251 444 461 445 465 2 5 -220 9 -505 8 l-508 0 -395 -462 -395 -462 -5 460 -5 460 -382 3 -383 2 0 -1240z" id="path14" /> <path fill="#1ee492" d="M20230 7856 l0 -263 53 -7 c28 -3 253 -6 500 -6 l447 0 0 270 0 270 -500 0 -500 0 0 -264z" id="path16" /> <path fill="#1ee492" d="M9780 6415 l0 -105 8450 0 8450 0 0 105 0 105 -8450 0 -8450 0 0 -105z" id="path18" /> <path fill="#1ee492" d="M11340 5964 c-336 -31 -567 -88 -785 -193 -399 -193 -651 -536 -697 -951 -22 -198 12 -407 97 -586 59 -127 114 -204 220 -309 244 -244 603 -405 1258 -565 440 -107 596 -167 688 -261 72 -74 104 -147 104 -239 0 -98 -32 -167 -114 -243 -99 -91 -192 -125 -371 -134 -270 -14 -497 93 -613 288 -43 73 -89 210 -107 317 -16 96 -25 104 -109 97 -36 -3 -318 -21 -625 -40 -383 -24 -563 -39 -574 -47 -31 -26 8 -281 73 -476 70 -209 172 -386 317 -552 155 -177 325 -285 578 -368 401 -132 1049 -170 1528 -91 535 88 926 327 1155 706 149 248 217 508 203 783 -20 417 -202 734 -551 965 -264 174 -640 302 -1364 465 -302 68 -397 105 -463 178 -46 51 -60 99 -48 163 17 90 75 156 171 197 60 26 225 46 309 37 275 -28 423 -155 491 -425 12 -47 28 -91 34 -98 18 -20 1252 52 1275 74 12 12 12 26 1 101 -26 183 -84 368 -161 510 -208 387 -548 591 -1130 679 -102 15 -677 28 -790 18z m785 -108 c709 -108 1069 -418 1193 -1028 11 -51 18 -95 16 -97 -4 -4 -1118 -71 -1122 -67 -1 2 -11 36 -22 75 -33 119 -84 207 -164 286 -121 120 -254 167 -471 167 -192 1 -299 -30 -390 -113 -114 -105 -151 -256 -89 -369 72 -132 179 -182 594 -276 682 -153 1046 -279 1310 -453 118 -77 282 -244 341 -346 205 -354 214 -781 24 -1160 -140 -281 -332 -471 -624 -616 -183 -90 -403 -150 -666 -181 -164 -19 -683 -16 -854 5 -622 78 -932 250 -1189 658 -105 166 -206 464 -214 634 l-3 50 500 32 c275 17 529 32 565 32 l65 1 26 -110 c60 -247 181 -410 378 -509 142 -72 357 -99 535 -67 427 78 598 496 311 765 -117 109 -281 173 -695 271 -386 92 -615 168 -845 280 -233 114 -382 228 -498 383 -301 400 -248 988 121 1354 133 132 337 252 537 318 101 33 291 71 420 84 55 6 116 13 135 15 91 10 680 -3 775 -18z" id="path20" style="fill:#000000" /> <path fill="#1ee492" d="M15800 5955 c-841 -105 -1425 -542 -1685 -1260 -108 -298 -152 -610 -142 -1014 12 -523 120 -903 353 -1252 330 -494 767 -744 1459 -835 186 -25 661 -25 835 -1 451 64 800 212 1097 466 331 284 555 720 627 1221 41 281 45 677 11 930 -98 720 -445 1237 -1023 1525 -192 96 -423 165 -687 206 -184 28 -666 36 -845 14z m820 -100 c410 -65 713 -186 975 -390 101 -78 253 -237 326 -341 247 -347 369 -784 369 -1325 0 -546 -107 -984 -321 -1310 -261 -398 -640 -655 -1122 -763 -177 -40 -312 -56 -537 -62 -490 -15 -905 58 -1236 216 -482 232 -837 709 -957 1285 -47 226 -52 284 -52 605 1 264 4 324 23 445 66 420 196 727 424 1001 295 354 744 583 1260 643 51 6 107 13 123 15 17 2 163 3 325 1 215 -2 324 -7 400 -20z" id="path22" style="fill:#000000" /> <path fill="#1ee492" d="M16075 4994 c-173 -25 -264 -53 -365 -113 -260 -156 -399 -426 -441 -856 -17 -174 -7 -528 20 -676 62 -354 209 -586 450 -713 248 -130 634 -130 883 1 82 43 189 131 241 198 52 66 120 210 150 315 99 342 102 916 6 1225 -98 320 -325 535 -634 600 -73 15 -258 26 -310 19z m320 -113 c138 -35 237 -92 340 -196 74 -73 99 -106 133 -175 86 -175 120 -342 129 -625 9 -302 -19 -559 -82 -750 -47 -142 -86 -208 -179 -300 -127 -127 -264 -187 -464 -204 -454 -37 -762 180 -871 614 -38 155 -46 240 -46 525 1 308 16 435 75 613 96 285 314 472 605 517 89 13 268 4 360 -19z" id="path24" style="fill:#000000" /> <path fill="#1ee492" d="M19006 5884 c-3 -9 -6 -962 -6 -2118 0 -1622 3 -2105 12 -2114 9 -9 173 -12 674 -12 589 0 664 2 678 16 14 14 16 105 16 855 l0 839 800 0 c780 0 800 0 810 19 6 13 10 170 10 443 0 367 -2 427 -16 446 l-15 22 -795 0 -794 0 0 320 0 320 933 0 c712 0 936 3 945 12 9 9 12 129 12 478 0 349 -3 469 -12 478 -9 9 -385 12 -1629 12 -1465 0 -1617 -1 -1623 -16z m3174 -474 l0 -400 -923 0 c-819 0 -925 -2 -945 -16 l-22 -15 0 -383 c0 -284 3 -385 12 -394 9 -9 203 -12 810 -12 l798 0 0 -375 0 -375 -793 -2 c-655 -3 -797 -5 -810 -17 -16 -12 -17 -84 -17 -852 l0 -839 -602 2 -603 3 -3 2038 -2 2037 1550 0 1550 0 0 -400z" id="path26" style="fill:#000000" /> <path fill="#1ee492" d="M22602 5888 c-9 -9 -12 -145 -12 -550 0 -521 1 -538 19 -548 13 -6 236 -10 655 -10 l636 0 0 -1554 c0 -1400 2 -1556 16 -1570 14 -14 89 -16 674 -16 585 0 660 2 674 16 14 14 16 170 16 1570 l0 1554 640 0 c629 0 640 0 660 20 20 20 20 30 18 551 -3 458 -5 531 -18 539 -24 15 -3963 13 -3978 -2z m3906 -545 l-3 -468 -645 -3 c-592 -2 -646 -3 -657 -19 -10 -13 -13 -343 -13 -1570 l0 -1553 -600 0 -600 0 0 1558 c0 1198 -3 1561 -12 1570 -9 9 -168 12 -655 12 l-643 0 0 470 0 470 1915 0 1915 0 -2 -467z" id="path28" style="fill:#000000" /> <path style="fill:#ffffff;stroke:#ffffff;stroke-width:1.01669;" d="m 1524.5205,1283.5435 c -48.2235,-1.658 -91.7225,-10.8482 -121.494,-25.6684 -45.5348,-22.6673 -78.1548,-67.1583 -92.6037,-126.3037 -3.1546,-12.9134 -4.4211,-27.956 -2.3545,-27.9652 0.7827,0 26.5861,-1.6024 57.3408,-3.5531 30.7548,-1.9506 63.7833,-3.8487 73.3966,-4.218 l 17.4789,-0.6713 0.6619,2.9535 c 6.9454,30.9947 14.8846,47.5823 29.8803,62.4296 19.0446,18.8563 42.3137,27.4362 74.4362,27.4465 21.7799,0.01 38.4992,-4.5047 53.2465,-14.3683 35.7504,-23.9113 37.5343,-68.7571 3.7556,-94.413 -14.9728,-11.3723 -33.0039,-18.0202 -82.8323,-30.5392 -39.2752,-9.8676 -46.7759,-11.9278 -65.305,-17.9375 -47.6887,-15.4673 -85.8846,-36.35684 -106.7945,-58.40648 -26.0275,-27.44627 -38.3324,-60.21601 -36.7908,-97.97907 2.2407,-54.89065 33.7769,-100.23493 88.2158,-126.84117 6.4086,-3.13211 16.4558,-7.35383 22.3272,-9.38161 13.7452,-4.74716 40.2236,-10.03497 64.0512,-12.79121 17.1013,-1.97818 22.0096,-2.11709 54.0705,-1.53023 44.5397,0.81528 59.6065,1.90267 78.1219,5.63815 63.7157,12.85463 103.5168,39.7611 125.6195,84.9216 6.4364,13.15095 12.5757,31.31857 15.6321,46.25921 1.2011,5.87136 2.3787,11.62979 2.6168,12.79651 0.4191,2.05299 -0.1473,2.15941 -17.5908,3.30509 -36.6152,2.40488 -120.8677,7.28217 -125.7953,7.28217 h -5.0886 l -3.8278,-12.00173 c -4.2207,-13.23328 -8.8959,-21.96773 -16.2821,-30.41894 -17.3732,-19.87827 -36.723,-27.73065 -68.3338,-27.73065 -26.6473,0 -42.4707,5.20916 -54.3287,17.88535 -8.5975,9.1908 -12.5219,17.69645 -13.0812,28.35188 -0.5463,10.409 1.2439,16.42476 7.3602,24.73318 10.0778,13.68977 22.864,18.70783 84.8172,33.28734 102.4531,24.11036 148.4991,42.12474 181.2644,70.91534 16.421,14.42897 27.6355,28.67877 35.3671,44.93937 24.793,52.1434 19.0781,112.0595 -15.6611,164.1948 -31.1172,46.6994 -85.7642,75.9293 -156.6393,83.784 -16.8992,1.8729 -55.6124,2.6006 -84.8572,1.5952 z" id="path4586" transform="matrix(7.5,0,0,-7.5,0,11300)" /> <path style="stroke:#ffffff;stroke-width:1.01669;fill:#ffffff;fill-opacity:1" d="m 2125.9666,1283.5695 c -78.6193,-6.1586 -132.5193,-28.0031 -175.4687,-71.1137 -31.9236,-32.0435 -53.8397,-71.8937 -65.54,-119.1719 -7.933,-32.0554 -8.1558,-34.4812 -8.1558,-88.7983 0,-53.79948 0.2087,-56.18001 7.6965,-87.78818 20.5784,-86.86824 73.3978,-146.6065 155.7588,-176.16182 29.8576,-10.71439 68.135,-17.17543 101.3914,-17.11433 33.1013,0.0608 65.9965,1.71696 79.3015,3.99252 67.9806,11.62682 115.6732,36.08676 153.4725,78.711 23.3067,26.2817 39.1158,55.28614 50.2276,92.15091 10.3614,34.37512 15.1288,79.96289 12.9207,123.5515 -3.7118,73.2711 -19.1118,122.4804 -52.0045,166.1754 -40.955,54.4051 -101.4877,86.3137 -179.3583,94.5453 -13.6047,1.4381 -66.3514,2.1097 -80.2417,1.0216 z m 60.734,-117.9386 c 20.4065,-4.2989 33.7282,-10.7484 49.3128,-23.8737 10.2008,-8.5911 14.5665,-14.0181 20.9066,-25.9892 16.0017,-30.2133 22.9705,-70.1403 21.6413,-123.99093 -1.3231,-53.60674 -10.1383,-85.0114 -31.2176,-111.2144 -7.5612,-9.3992 -15.4284,-16.26474 -26.8658,-23.44534 -17.5832,-11.03908 -33.8575,-15.46735 -60.5288,-16.47001 -14.6211,-0.54966 -18.2183,-0.35291 -28.0123,1.53214 -20.8161,4.00643 -35.6028,10.51031 -49.8967,21.94688 -35.1776,28.14555 -50.71,79.88854 -47.2033,157.24746 1.5133,33.3822 4.7484,52.7154 12.2055,72.9401 14.7573,40.024 43.0805,64.5522 82.9146,71.8049 12.2123,2.2235 14.9466,2.3961 31.5173,1.9887 10.219,-0.2512 18.5415,-1.0683 25.2264,-2.4766 z" id="path4662" transform="matrix(7.5,0,0,-7.5,0,11300)" /> <path style="fill:#ffffff; stroke:#ffffff;stroke-width:1.01669;" d="m 2552.3042,1274.6823 -6.6942,-0.3518 -0.6765,-200.4987 c -0.3721,-110.27423 -0.6767,-232.18111 -0.6768,-270.90413 l -3e-4,-70.4055 h 206.3872 206.3873 v 52.81879 52.8188 l -123.3185,0.30304 c -117.2665,0.28817 -123.4571,0.39388 -126.1428,2.15395 l -2.8242,1.85091 0.3279,51.6954 c 0.1803,28.43247 0.7089,52.07627 1.1747,52.54179 0.4658,0.46551 48.8474,0.97292 107.5146,1.12757 l 106.6676,0.28118 v 49.65282 49.65278 l -103.9562,0.6016 c -57.1758,0.3309 -105.1835,0.8978 -106.6837,1.2599 -1.5002,0.3621 -3.1014,1.4116 -3.5584,2.3321 -0.4569,0.9206 -0.9641,51.6566 -1.1271,112.7467 l -0.2963,111.0729 -72.9051,-0.1991 c -40.0978,-0.1095 -75.9174,-0.3575 -79.5992,-0.551 z" id="path4701" transform="matrix(7.5,0,0,-7.5,0,11300)" /> <path style="fill:#ffffff;stroke:#ffffff;stroke-width:1.01669;" d="m 3199.0021,1082.4238 c 0,-204.35406 -0.249,-223.27801 -2.9525,-224.42156 -0.8924,-0.37748 -39.9389,-0.91774 -86.77,-1.20058 l -85.1475,-0.51426 v -61.88262 -61.88261 h 255.352 255.3519 l -0.6702,29.73806 c -0.3687,16.35594 -0.6712,44.22382 -0.6722,61.92863 v 32.19057 l -84.6391,0.44973 c -46.5515,0.24736 -85.6044,0.78163 -86.7843,1.18726 -1.8418,0.6332 -2.2373,1.82633 -2.7959,8.4347 -0.3578,4.23344 -0.6506,97.9861 -0.6506,208.33928 v 200.642 h -79.8099 -79.8098 z" id="path4740" transform="matrix(7.5,0,0,-7.5,0,11300)" /> <path style="fill:#fde000;stroke:#ffffff;stroke-width:2.03337;" d="m 199.27043,1008.775 c -8.80172,-3.9204 -12.30209,-8.81459 -16.15622,-22.58971 -9.56459,-34.18496 -16.47313,-47.02946 -50.59883,-94.07451 l -25.35502,-34.95392 -11.877402,-35.12099 -11.877401,-35.12101 -0.01866,-37.61737 -0.01866,-37.61738 8.584836,-17.8685 c 10.734187,-22.34216 23.957467,-35.83953 44.816487,-45.74543 13.75197,-6.53079 16.39375,-7.07238 35.62706,-7.30396 11.42553,-0.13758 27.88478,1.02646 36.5761,2.58672 8.69132,1.56026 16.3706,2.26863 17.06507,1.57416 2.3818,-2.3818 -4.17828,-7.81014 -17.61719,-14.57786 -7.39804,-3.7256 -14.41593,-7.99476 -15.59529,-9.48702 -3.74728,-4.74148 -4.93249,-13.80065 -2.42213,-18.51356 4.46149,-8.37594 7.94874,-9.65902 22.60058,-8.31559 l 13.73333,1.25922 -5.0915,-13.52686 c -4.28232,-11.37706 -5.0915,-17.01249 -5.0915,-35.4589 0,-14.57312 0.87046,-23.12246 2.59427,-25.4799 2.40968,-3.29544 3.2403,-3.07988 11.67413,3.02956 29.89891,21.65866 45.59438,50.78012 35.59439,66.04203 -3.57518,5.45641 -14.29313,10.96713 -21.33028,10.96713 -2.27263,0 -4.13205,1.29515 -4.13205,2.87811 0,4.13299 25.83282,26.25482 29.16566,24.97589 1.7929,-0.688 3.60113,-7.44968 5.09058,-19.0356 2.95463,-22.98304 11.29487,-40.99519 21.53588,-46.51034 6.72156,-3.61979 7.43277,-3.63793 14.29698,-0.36461 4.42918,2.11212 8.54608,6.21799 10.64227,10.61373 3.29152,6.90239 3.24623,7.56499 -1.21702,17.81427 -6.86989,15.77576 -8.64303,23.03841 -7.9517,32.56964 0.99464,13.71312 5.2464,10.3429 13.55031,-10.74086 21.99502,-55.84576 57.87157,-93.4281 102.97393,-107.86996 11.72285,-3.75368 18.44772,-4.50933 38.12372,-4.28384 25.34371,0.29045 38.26861,3.30279 58.79031,13.70192 l 9.83798,4.98529 v 27.41626 c 0,15.07895 -0.45539,27.41627 -1.01199,27.41627 -0.55657,0 -5.4607,-3.1961 -10.89803,-7.10244 -33.00439,-23.71128 -73.03532,-25.69716 -102.961,-5.10776 -25.30779,17.41222 -55.9322,65.18116 -55.9322,87.24484 0,5.29603 0.74098,5.84902 9.43397,7.04053 5.18869,0.71119 13.57635,1.29307 18.63925,1.29307 14.05905,0 9.21113,1.84493 -13.88834,5.28537 -44.66323,6.65215 -76.06787,20.7487 -102.98238,46.22553 l -17.16651,16.24952 -11.92343,0.17874 c -15.82411,0.23727 -22.41521,5.8145 -22.41521,18.96727 0,10.36875 2.05844,14.91031 11.58749,25.56552 6.90545,7.72157 6.92814,7.81315 5.54194,22.36709 -0.76555,8.03757 -1.54011,14.80486 -1.72126,15.03841 -1.55269,2.00185 -22.56438,-10.95194 -30.28053,-18.6681 -13.30068,-13.30067 -20.06069,-27.28641 -21.26503,-43.99503 -1.25139,-17.36123 1.60663,-25.636 13.99662,-40.52408 l 9.98599,-11.99939 -4.63819,-3.03906 c -6.81583,-4.4659 -25.35363,-6.04346 -38.62963,-3.28737 -8.91667,1.85109 -13.78835,4.42838 -21.53364,11.39207 -12.22467,10.99104 -17.93215,22.60606 -20.89407,42.52066 -8.48271,57.0337 27.47948,134.01467 83.37258,178.46804 49.96973,39.74236 98.89376,39.71277 117.86547,-0.0714 3.77087,-7.9076 0.55836,-8.00217 41.99834,1.23631 15.65696,3.49051 45.39502,9.59386 66.08458,13.56298 63.10118,12.10545 73.20138,16.6218 73.20138,32.73224 0,7.95006 3.13859,7.29242 -55.91772,11.71657 -44.80262,3.35635 -41.0225,4.63005 -53.3204,-17.96632 -7.44903,-13.68699 -8.06234,-14.25688 -15.97004,-14.84004 -4.52293,-0.33353 -33.33119,1.74299 -64.01833,4.61448 -91.09824,8.52446 -95.44555,9.27939 -95.44555,16.57464 0,1.54054 2.64985,11.04103 5.88855,21.11217 3.23871,10.07117 5.2975,18.65832 4.57509,19.08262 -0.72241,0.4243 -5.43105,1.3834 -10.46364,2.1315 -5.0326,0.748 -11.43772,1.7437 -14.2336,2.2127 -2.79589,0.4689 -7.82849,-0.3701 -11.18355,-1.8644 z" id="path29331" transform="matrix(7.5,0,0,-7.5,0,11300)" /> <path style="fill:#fde000;stroke:#ffffff;stroke-width:2.03337;" d="m 1023.497,1007.4993 c -11.9109,-2.1207 -26.55118,-5.0706 -32.53399,-6.5554 l -10.87783,-2.69961 -15.75863,-26.31177 c -8.66725,-14.47147 -15.75863,-26.97449 -15.75863,-27.78448 0,-0.81 3.17317,-0.14681 7.05149,1.47358 10.61763,4.43633 30.41356,3.63211 45.99529,-1.86857 56.2207,-19.847 110.921,-90.18255 124.0367,-159.49076 3.7904,-20.02957 1.4494,-52.39037 -4.7732,-65.98226 -11.0708,-24.1818 -31.3648,-35.71173 -57.9773,-32.93952 -14.8359,1.54545 -20.827,3.74086 -20.7463,7.60245 0.028,1.3586 4.5787,7.91359 10.1116,14.56664 12.4405,14.95893 15.9364,27.30276 12.4012,43.78712 -5.4431,25.38028 -21.8345,44.0398 -47.9815,54.6208 -31.56603,12.7739 -35.18773,14.955 -49.97468,30.09626 -12.43738,12.73539 -15.61861,14.95229 -21.4563,14.95229 -8.8485,0 -14.98776,-6.03923 -14.98607,-14.74194 0.002,-8.72809 14.37429,-27.11137 30.44728,-38.94365 6.62658,-4.87822 20.91994,-12.26178 31.94736,-16.50315 24.74611,-9.51786 29.81391,-13.00422 33.95801,-23.36128 4.952,-12.3764 4.1842,-17.78918 -3.6322,-25.60556 -5.5272,-5.52721 -8.4832,-6.89508 -14.7419,-6.82176 -12.2077,0.14295 -17.68111,3.58673 -38.63616,24.30876 -17.28537,17.09315 -20.65928,21.65797 -29.30619,39.65074 -13.32841,27.73418 -20.41308,53.74828 -21.98588,80.72962 l -1.26852,21.76182 -21.08588,-35.99229 -21.08589,-35.99229 70.39516,-69.35082 c 69.29966,-68.27167 74.94826,-74.88807 67.85346,-79.47994 -1.398,-0.90476 -42.345,-2.10254 -90.99342,-2.66171 l -88.45167,-1.01669 7.1168,-3.91045 c 4.35474,-2.39278 15.00842,-4.79862 27.45052,-6.19893 l 20.33372,-2.28849 -0.53395,-7.01798 c -0.29368,-3.85989 -5.73584,-17.54068 -12.0937,-30.40176 -9.779,-19.78159 -13.9254,-25.7383 -26.91656,-38.6683 -21.10663,-21.00725 -37.22803,-28.90779 -61.39152,-30.08584 -25.30253,-1.23358 -43.96475,5.30546 -65.72478,23.02924 l -11.25952,9.17101 v -29.47802 -29.47802 l 11.76355,-5.93822 c 22.32812,-11.2712 39.8725,-15.49191 63.47121,-15.2695 36.26579,0.3418 62.08528,11.00939 89.83869,37.11781 24.2948,22.85481 35.68368,40.52307 54.2588,84.17493 2.26048,5.31218 4.97725,9.65852 6.03724,9.65852 5.95148,0 3.90934,-22.23709 -3.54793,-38.63407 -2.2888,-5.03259 -4.18156,-11.30046 -4.20613,-13.92859 -0.0608,-6.51318 12.28669,-18.60536 18.99828,-18.60536 12.66099,0 26.57367,21.24798 28.80247,43.98824 2.11767,21.6067 3.01396,25.1464 6.36728,25.1464 3.91617,0 31.56522,-24.18002 30.19112,-26.40321 -0.542,-0.87711 -5.0336,-2.20177 -9.9811,-2.9437 -19.75581,-2.96257 -26.01306,-21.06826 -14.25558,-41.24921 11.20598,-19.23434 40.85198,-45.19185 44.63068,-39.07779 0.7664,1.24 1.8611,11.55487 2.4326,22.92194 0.9423,18.73916 0.525,22.15264 -4.4728,36.58675 -3.0317,8.75565 -5.1498,16.28163 -4.7071,16.72441 0.4428,0.44277 6.5865,-0.27012 13.6527,-1.58421 l 12.8475,-2.38925 5.8426,6.53898 c 10.6734,11.94561 6.3938,20.57343 -16.2502,32.76106 -14.6275,7.8729 -20.4872,13.14647 -17.7021,15.93155 0.5326,0.53255 7.188,-0.45862 14.7898,-2.2026 31.7901,-7.29316 59.2084,-5.76033 79.2448,4.43021 16.7143,8.50092 34.2143,26.59665 42.5574,44.00628 13.8938,28.99235 14.6633,75.8062 1.8723,113.90994 -7.845,23.36972 -27.1352,63.66318 -37.9454,79.26038 -28.2437,40.75056 -38.5543,57.37728 -43.2506,69.74512 -2.8451,7.49271 -7.9752,21.0895 -11.4002,30.21509 -9.2748,24.71131 -14.0857,26.85761 -47.0463,20.98901 z" id="path29370" transform="matrix(7.5,0,0,-7.5,0,11300)" /> <path style="fill:#fde000;stroke:#ffffff;stroke-width:2.03337;" d="m 546.977,502.57975 c -7.14458,-7.42756 -17.49278,-15.45502 -24.97213,-19.37176 -15.54305,-8.13948 -20.77874,-13.45619 -20.77874,-21.10031 0,-7.18071 4.82913,-16.89313 9.24128,-18.58623 16.95866,-6.50765 49.71471,12.38935 74.95671,43.24259 6.50754,7.95415 12.6431,14.46209 13.63456,14.46209 2.6635,0 2.20167,-7.02336 -1.36756,-20.79746 -5.05308,-19.50047 -14.23391,-36.60411 -27.30554,-50.86949 -6.67787,-7.28772 -13.06936,-15.69066 -14.20333,-18.67321 -2.88446,-7.58671 1.89891,-18.26493 10.0761,-22.49352 12.39169,-6.40799 26.66027,2.53156 46.21899,28.9571 6.00115,8.10807 11.76131,14.74194 12.80037,14.74194 1.03905,0 5.70522,-5.26134 10.36925,-11.69188 18.07525,-24.92126 28.40455,-33.04229 42.02709,-33.04229 10.83046,0 16.7224,6.40278 16.7224,18.17228 0,7.9034 -1.19477,10.03721 -12.21822,21.82132 -17.88649,19.1207 -30.55324,46.84992 -30.43175,66.61913 l 0.0508,8.27277 8.31228,-9.15017 c 25.12553,-27.6582 35.58534,-36.969 49.16093,-43.76059 17.40257,-8.70616 27.79473,-9.32392 35.03593,-2.0827 4.96865,4.96862 6.61204,14.8525 3.72187,22.38418 -0.69802,1.81903 -8.33585,7.3834 -16.97292,12.36527 -8.93464,5.15349 -20.72049,14.31742 -27.34206,21.25943 l -11.63825,12.2015 -66.44894,-0.0983 -66.44894,-0.0983 z" id="path29409" transform="matrix(7.5,0,0,-7.5,0,11300)" /> <path style="fill:#fde000;stroke:#ffffff;stroke-width:2.03337;" d="m 611.8183,391.73741 c -9.0073,-5.66294 -14.86767,-14.79829 -17.44483,-27.19361 -1.90751,-9.1745 -1.60119,-13.22163 2.10479,-27.80881 7.05442,-27.76705 23.80523,-61.41117 31.29353,-62.85329 2.51634,-0.4846 6.0275,4.75654 13.61215,20.31893 24.2186,49.69239 26.46107,74.38503 8.36044,92.05982 -7.23415,7.06396 -9.44582,8.03252 -19.8698,8.70166 -9.05876,0.5815 -13.17016,-0.15277 -18.05628,-3.2247 z" id="path29448" transform="matrix(7.5,0,0,-7.5,0,11300)" /> <path style="fill:#fde000;stroke:#ffffff;stroke-width:2.03337;" d="m 711.80426,715.23851 c 0.7645,-5.31218 2.6506,-11.10309 4.19133,-12.86868 5.29861,-6.07193 2.55289,-10.7995 -3.15465,-5.43167 -2.22629,2.09379 -2.44872,1.47028 -1.26214,-3.53803 0.79223,-3.34386 2.14591,-6.54642 3.00818,-7.1168 3.08159,-2.03844 6.2433,-10.01887 6.2433,-15.75862 0,-3.21131 -2.28754,-8.93934 -5.08343,-12.72895 -4.56453,-6.18687 -5.08343,-8.8217 -5.08343,-25.81219 0,-11.74237 0.80227,-18.92199 2.11438,-18.92199 10.37735,0 38.8256,26.88209 42.51787,40.17714 2.68022,9.65087 2.71061,25.78799 0.0665,35.30704 -2.95672,10.64445 -16.59546,25.09929 -29.39594,31.15489 -15.15496,7.16944 -15.80641,6.96419 -14.16198,-4.46214 z" id="path29487" transform="matrix(7.5,0,0,-7.5,0,11300)" /> <path style="fill:#fde000;stroke:#ffffff;stroke-width:2.03337;" d="m 517.49311,662.57511 c -2.79589,-0.42182 -8.96177,-1.26672 -13.70195,-1.87756 l -8.61852,-1.11061 3.12083,-7.50405 c 5.22109,-12.55411 12.97687,-22.17463 23.99309,-29.76179 5.77063,-3.97438 11.17039,-7.22615 11.99947,-7.22615 1.80041,0 2.04591,40.96493 0.27319,45.58456 -1.19963,3.12618 -5.64033,3.61943 -17.06611,1.8956 z" id="path29526" transform="matrix(7.5,0,0,-7.5,0,11300)" /> <path style="fill:#fde000;stroke:#ffffff;stroke-width:2.03337;" d="m 471.08984,807.65737 c -9.56819,-1.18506 -15.27876,-2.86721 -15.98544,-4.70878 -1.53652,-4.00411 8.20921,-23.16623 15.17768,-29.84245 l 5.79431,-5.5513 4.65631,4.95641 c 2.56097,2.72602 6.76834,9.33862 9.34972,14.69467 4.23603,8.78924 4.41465,10.27732 1.83291,15.26986 -1.57328,3.04238 -3.55328,5.86769 -4.39999,6.27845 -0.84672,0.41077 -8.2382,-0.0828 -16.4255,-1.09686 z" id="path29565" transform="matrix(7.5,0,0,-7.5,0,11300)" /> <path style="fill:#fde000;stroke:#ffffff;stroke-width:2.03337;" d="m 403.80345,790.45691 c -7.62649,-7.6265 -7.89421,-12.49433 -1.1293,-20.53396 5.25991,-6.25106 12.19646,-9.23325 26.02406,-11.18839 8.55799,-1.21005 8.47135,-0.73849 -2.00479,10.91188 -2.52163,2.80426 -7.29061,10.04666 -10.59773,16.09421 l -6.01296,10.99554 z" id="path29604" transform="matrix(7.5,0,0,-7.5,0,11300)" /> <path style="fill:#fde000;stroke:#ffffff;stroke-width:2.03337;" d="m 1009.3365,1087.0141 c 7.8675,-0.8575 11.6798,-2.3386 13.5394,-5.2603 2.2959,-3.6071 0.5491,-7.6178 -15.4557,-35.4849 -9.92433,-17.28 -17.8471,-31.6114 -17.60619,-31.8476 1.21315,-1.1895 51.56709,9.9718 53.96469,11.9617 3.9496,3.2779 2.1412,11.5318 -7.3463,33.5307 -12.426,28.8122 -12.6156,29.0178 -26.4019,28.6254 l -11.64498,-0.3314 z" id="path29643" transform="matrix(7.5,0,0,-7.5,0,11300)" /> <path style="fill:#fde000;stroke:#ffffff;stroke-width:2.03337;" d="m 734.0472,1062.349 c -12.3019,-0.7856 -22.59585,-1.5447 -22.87543,-1.6869 -0.27959,-0.1423 -0.50835,-17.2567 -0.50835,-38.0321 v -37.77333 l 25.92549,1.41453 c 14.25902,0.778 31.3361,1.99196 37.94906,2.69769 l 12.02357,1.28315 6.8541,13.21696 c 6.42416,12.3878 6.72921,13.867 4.86313,23.5822 -1.46884,7.6472 -1.26259,13.4988 0.78653,22.3138 1.52762,6.5716 2.33851,12.6586 1.80198,13.5267 -1.12064,1.8132 -34.12119,1.5452 -66.82008,-0.5427 z" id="path29682" transform="matrix(7.5,0,0,-7.5,0,11300)" /> <path style="fill:#fde000;stroke:#ffffff;stroke-width:2.03337;" d="m 234.28159,1082.3257 c -5.5675,-7.5141 -19.07789,-38.3328 -20.98528,-47.8698 -1.10371,-5.5185 -0.49488,-6.6445 5.17959,-9.5789 3.53668,-1.8288 10.77911,-3.8403 16.0943,-4.4698 l 9.66398,-1.1445 10.97323,13.5247 c 12.28283,15.1389 24.72784,25.3856 45.69934,37.6268 7.81073,4.5592 13.71866,8.2895 13.12872,8.2895 -1.66203,0 -61.08655,8.0187 -68.35383,9.2236 -5.53225,0.9173 -7.16408,0.1155 -11.40005,-5.6016 z" id="path29721" transform="matrix(7.5,0,0,-7.5,0,11300)" /> <path style="fill:#fde000;stroke:#ffffff;stroke-width:0.127086;" d="m 451.15436,994.55148 c -3.98073,-0.24558 -8.20079,-1.0664 -8.78146,-1.70804 -0.17134,-0.18933 -0.18252,-0.27248 -0.057,-0.42376 0.72825,-0.8775 7.24142,-1.92064 19.06882,-3.05406 4.07806,-0.39079 20.31717,-1.74507 25.16297,-2.09849 3.99992,-0.29172 6.41945,-0.33171 6.55748,-0.10836 0.15255,0.24682 -0.9424,1.07851 -2.31873,1.76125 -5.17603,2.56757 -17.65964,4.88974 -30.03715,5.58743 -2.0152,0.11359 -8.02076,0.14115 -9.59497,0.044 z" id="path29760" transform="matrix(7.5,0,0,-7.5,0,11300)" /> <path style="fill:#fde000;stroke:#ffffff;stroke-width:2.03337;" d="m 245.94555,1130.6471 c -6.65838,-6.6584 -7.31887,-15.3763 -1.64601,-21.726 3.31764,-3.7135 24.70939,-7.3805 82.05662,-14.0661 30.13006,-3.5126 38.83259,-3.8216 56.77922,-2.0164 33.25247,3.3449 111.60655,2.715 133.34104,-1.072 13.76296,-2.3981 39.64461,-3.4725 104.38682,-4.3335 82.18584,-1.093 86.25526,-1.3261 89.81159,-5.1433 3.60989,-3.8748 5.03548,-3.9278 46.08269,-1.7147 96.17968,5.1857 230.576,18.5017 250.26358,24.7962 7.185,2.2972 12.7148,8.6506 12.7148,14.6087 0,2.0739 -2.6746,6.4454 -5.9437,9.7144 -7.0879,7.088 -15.4726,7.5943 -48.35297,2.9198 -38.0633,-5.4112 -116.00158,-12.6774 -188.69123,-17.5917 -56.74998,-3.8366 -249.00552,-3.2509 -307.03913,0.9353 -65.73062,4.7415 -131.78013,10.8847 -168.76985,15.6971 -41.45305,5.3931 -48.72586,5.2598 -54.99347,-1.0078 z" id="path29799" transform="matrix(7.5,0,0,-7.5,0,11300)" /> <path style="fill:#ffffff;stroke:#ffffff;stroke-width:0.78125;" d="m 392.96875,907.0304 c -49.21698,-10.29461 -69.4961,-17.00673 -87.65399,-29.01232 -16.76338,-11.08357 -33.51942,-32.00601 -40.01983,-49.97077 -7.405,-20.46471 -7.82053,-47.20421 -1.04837,-67.46393 4.96235,-14.8455 13.40459,-28.26005 25.12415,-39.9218 12.53162,-12.4698 28.72237,-22.37165 48.51992,-29.67355 8.77694,-3.23719 27.87064,-8.09232 39.49452,-10.04265 20.27658,-3.40212 24.16273,-3.60374 68.31798,-3.54448 50.85203,0.0683 67.11777,1.0177 87.36805,5.09975 l 4.16493,0.83957 -0.55465,47.00176 c -0.30505,25.85098 -0.59724,47.06034 -0.6493,47.13193 -0.33104,0.4552 -27.141,2.73562 -28.05194,2.38605 -0.6202,-0.23799 -2.75177,-3.24846 -4.7368,-6.68993 -10.767,-18.66679 -28.48092,-28.7614 -55.15825,-31.43298 -10.85221,-1.08679 -26.12369,-0.0851 -36.54086,2.39677 -3.33783,0.79523 -6.14027,1.37439 -6.22764,1.28701 -0.16102,-0.16101 5.91632,-15.50798 6.28847,-15.88013 0.11114,-0.11114 10.02592,1.19464 22.03285,2.90173 23.05707,3.27816 26.13111,3.57075 24.9167,2.37157 -0.4082,-0.40308 -6.54297,-3.95146 -13.63281,-7.88528 -7.08985,-3.93382 -13.35571,-7.59728 -13.92414,-8.14103 -0.82802,-0.79207 -0.86685,-2.18679 -0.19531,-7.015 0.46101,-3.31451 0.8382,-7.38479 0.8382,-9.04507 v -3.0187 l -5.66407,1.56099 c -10.91921,3.00928 -22.37032,7.10153 -23.44525,8.37856 -0.59677,0.70897 -1.5022,4.75418 -2.01207,8.98935 -1.19635,9.93738 -3.85946,17.74677 -9.06951,26.59571 -6.20079,10.53166 -37.91788,66.27532 -41.86175,73.57318 l -3.40824,6.30671 3.54808,4.63079 c 10.22304,13.34265 56.37713,76.24168 58.0016,79.04486 0.80007,1.3806 -0.48336,1.22768 -14.76067,-1.75867 z" id="path31067" transform="matrix(7.5,0,0,-7.5,0,11300)" /> <path style="fill:#ffffff;stroke:#ffffff;stroke-width:0.78125;" d="m 401.5625,908.8687 c -10.3437,-1.91231 -44.05039,-9.73638 -53.72852,-12.47157 -27.82954,-7.86507 -45.10357,-17.50633 -60.31226,-33.66245 -14.40561,-15.30301 -23.40389,-32.44967 -26.7339,-50.94275 -1.68307,-9.34688 -1.65082,-27.22895 0.0676,-37.49618 3.39805,-20.30237 12.59463,-37.69507 28.15595,-53.24897 22.68205,-22.67121 54.44134,-35.83356 102.00423,-42.27473 9.22195,-1.24887 16.04284,-1.42023 54.29687,-1.36409 51.21545,0.0752 69.43543,1.12897 87.86852,5.08216 l 4.11676,0.88289 -0.57165,46.98537 c -0.31439,25.84196 -0.64149,47.065 -0.72687,47.16233 -0.45719,0.52111 -26.97553,2.73969 -28.00863,2.34325 -0.67335,-0.25839 -2.64758,-2.90686 -4.3872,-5.88549 -6.66035,-11.40409 -13.26047,-17.78937 -24.30655,-23.51534 -12.18543,-6.31657 -24.71735,-9.029 -41.40625,-8.96204 -11.62409,0.0466 -20.64239,1.05098 -28.01367,3.1198 -2.30204,0.64609 -4.29908,1.06116 -4.43786,0.92237 -0.13879,-0.13878 1.15678,-3.85078 2.87903,-8.24889 l 3.13137,-7.99655 2.869,0.39188 c 1.57795,0.21554 11.77268,1.64196 22.65496,3.16983 10.88228,1.52788 20.19641,2.64114 20.69807,2.47392 1.1317,-0.37723 -1.52478,-2.08174 -15.87465,-10.18587 -12.86878,-7.26766 -11.74688,-5.37047 -10.59749,-17.92101 0.61442,-6.70904 0.59419,-6.83594 -1.09004,-6.83594 -2.723,0 -25.54882,7.72558 -27.2034,9.20721 -1.12482,1.00725 -1.71653,3.21057 -2.38463,8.87954 -0.97579,8.27987 -3.8519,18.2793 -6.48262,22.53825 -2.26416,3.66553 -34.03575,59.32699 -41.59998,72.88007 -3.47062,6.21842 -5.771,11.17139 -5.44273,11.71875 0.31274,0.52143 5.13591,7.1004 10.71816,14.61993 28.34878,38.187 48.28084,65.50286 50.02354,68.55469 0.64398,1.12773 -0.43105,1.14159 -6.17519,0.0796 z" id="path31106" transform="matrix(7.5,0,0,-7.5,0,11300)" /> <path style="fill:#ffffff;stroke:#ffffff;stroke-width:0.78125;" d="m 407.03125,1077.6495 c -21.79492,-1.3719 -51.17712,-6.1725 -68.75,-11.2326 -32.61072,-9.3901 -58.27946,-27.5267 -75.79278,-53.5523 -5.2881,-7.8584 -12.91775,-23.11378 -16.28462,-32.56095 l -2.00784,-5.63386 2.51137,-0.42419 c 5.54286,-0.93625 126.21792,-12.13622 130.7627,-12.13622 h 3.26276 l 3.70565,6.83594 c 9.48232,17.49235 18.30731,26.76994 31.96776,33.60728 9.21805,4.6138 18.31734,6.8371 32.83224,8.022 34.26925,2.7976 64.80474,-9.1596 74.55789,-29.19569 3.14729,-6.46551 4.32192,-14.44572 3.19521,-21.70756 -1.56343,-10.07656 -6.23915,-17.32581 -15.54678,-24.1038 -2.61289,-1.90275 -4.63225,-3.57802 -4.48746,-3.72281 0.29838,-0.29838 29.61875,2.20416 30.02389,2.56259 0.14436,0.12773 -0.0314,30.92846 -0.39063,68.44607 l -0.65311,68.2139 -8.20312,1.6621 c -9.79,1.9838 -27.60633,3.9536 -45.3125,5.0099 -14.98727,0.8941 -60.62368,0.8398 -75.39063,-0.09 z" id="path31145" transform="matrix(7.5,0,0,-7.5,0,11300)" /> <path style="fill:url(#linearGradient31311);stroke:#ffffff;stroke-width:0.78125;" d="m 553.733,1004.1016 c 0.22138,-36.20121 0.63602,-66.53645 0.92141,-67.41168 0.32733,-1.00389 1.95449,-2.10123 4.40774,-2.97254 2.13887,-0.75966 10.99441,-4.73454 19.67898,-8.83306 21.7716,-10.27471 45.19431,-20.74054 45.57213,-20.36272 0.17263,0.17263 -3.73309,4.82073 -8.67938,10.32912 -4.94629,5.50838 -8.99325,10.65591 -8.99325,11.43895 0,0.78303 2.881,5.20772 6.40222,9.83264 3.52122,4.62492 13.59859,17.90113 22.39416,29.50269 19.46053,25.66893 25.32904,32.93625 25.69941,31.82514 0.15565,-0.46697 -0.43363,-2.25376 -1.30951,-3.97064 -2.52417,-4.94778 -29.69256,-65.00464 -29.92758,-66.15619 -0.25669,-1.25767 19.56593,-30.41525 24.13586,-35.50204 4.55015,-5.06475 19.79294,-12.18034 19.79294,-9.23967 0,0.61069 -1.93252,9.70154 -4.29448,20.20188 -2.36197,10.50034 -4.29556,19.87443 -4.29687,20.83133 -0.002,0.99521 0.83292,2.28712 1.94942,3.01868 2.68791,1.76119 20.55713,9.07648 48.78283,19.97069 1.82774,0.70545 1.41612,1.22703 -9.96094,12.62188 l -11.86746,11.88602 v 49.40492 49.4049 h -70.40508 -70.40507 z" id="path31184" transform="matrix(7.5,0,0,-7.5,0,11300)" /> <path style="fill:#fde000;stroke:#ffffff;stroke-width:0.78125;" d="m 768.75,974.9509 c -0.85937,-0.12482 -11.40625,-0.64669 -23.4375,-1.15971 -12.03125,-0.51301 -23.20046,-1.15403 -24.82047,-1.42447 l -2.94547,-0.49172 8.96337,-8.93494 8.96337,-8.93495 9.99773,4.00779 c 12.54535,5.02907 22.738,8.78398 23.84398,8.78398 1.98438,0 -2.87353,-3.74881 -14.41401,-11.12317 -6.77758,-4.33086 -12.32287,-8.12006 -12.32287,-8.42043 0,-0.84159 13.90413,-14.05015 14.79003,-14.05015 1.12167,0 6.83375,10.05384 14.42566,25.39062 8.85412,17.88662 8.65861,16.82146 3.06352,16.69049 -2.49966,-0.0585 -5.24796,-0.20852 -6.10734,-0.33334 z" id="path43549" transform="matrix(7.5,0,0,-7.5,0,11300)" /> <path style="fill:#ffffff;stroke:#ffffff;stroke-width:0.78125;" d="m 711.80234,779.62361 c -0.26082,-0.67968 -0.47421,-8.64072 -0.47421,-17.69122 v -16.45544 l 11.32759,0.55071 c 11.61253,0.56456 18.78394,1.40158 19.67924,2.29689 0.88908,0.88908 -1.32787,4.06809 -9.42808,13.51944 -14.92449,17.41394 -19.70078,21.43775 -21.10454,17.77962 z" id="path43588" transform="matrix(7.5,0,0,-7.5,0,11300)" /> <path style="fill:#ffffff;stroke:#ffffff;stroke-width:0.78125;" d="m 393.81261,907.37504 c -50.26854,-10.59705 -71.01267,-17.51106 -89.44313,-29.81134 -7.92796,-5.29102 -21.98165,-19.58895 -28.08362,-28.57167 -13.34422,-19.64405 -18.72284,-40.75957 -16.57375,-65.06566 2.26133,-25.57554 11.23399,-44.83646 29.2938,-62.88273 21.03387,-21.0181 49.41197,-33.74518 90.29097,-40.4939 18.09732,-2.98769 27.99151,-3.58047 59.76562,-3.58068 49.86081,-3.2e-4 83.13241,2.05808 96.80241,5.98884 1.45239,0.41763 1.47594,1.6107 0.93555,47.38304 -0.3049,25.82505 -0.67437,47.07465 -0.82106,47.22133 -0.14669,0.14669 -6.42841,0.83901 -13.95937,1.53849 -11.17122,1.03759 -13.91518,1.08713 -14.90101,0.26895 -0.6646,-0.55156 -2.42669,-3.16663 -3.91577,-5.81127 -9.23155,-16.39548 -25.12471,-26.73788 -47.00397,-30.58764 -12.54756,-2.20781 -33.80942,-1.44348 -45.93414,1.65124 -2.51824,0.64276 -4.71311,1.03416 -4.8775,0.86977 -0.31561,-0.31561 4.72633,-13.53898 5.80799,-15.23245 0.50051,-0.78362 5.35605,-0.33518 23.23418,2.14582 12.43079,1.72506 22.88586,3.13765 23.23349,3.13909 1.75133,0.007 -1.33438,-2.04375 -12.38656,-8.23298 -16.83432,-9.42724 -15.49353,-7.85793 -14.47995,-16.94774 1.20627,-10.81793 1.32552,-10.23718 -1.975,-9.618 -4.50398,0.84495 -23.99633,7.28944 -25.60425,8.46518 -1.12657,0.82377 -1.711,2.97485 -2.53083,9.31515 -0.58629,4.53422 -1.9008,10.71155 -2.92114,13.7274 -1.13061,3.34178 -10.09607,19.93064 -22.95533,42.47443 -11.6051,20.34507 -22.71397,39.98604 -24.68636,43.64658 l -3.58619,6.65554 5.52551,7.40696 c 22.00155,29.49316 56.13993,76.27995 56.13993,76.94002 0,0.76739 -3.68862,0.25429 -14.39052,-2.00177 z" id="path43960" transform="matrix(7.5,0,0,-7.5,0,11300)" /> <path style="fill:#ffffff;stroke:#ffffff;stroke-width:0.78125;" d="m 457.53402,901.98533 -19.80973,-0.42283 -4.04069,-4.34272 c -5.03748,-5.41404 -60.78929,-70.81752 -61.67568,-72.35288 -0.42582,-0.7376 1.29344,-5.73371 5.00951,-14.55746 3.11182,-7.38894 5.76948,-13.57379 5.90593,-13.74412 0.13645,-0.17032 2.85397,2.16566 6.03894,5.19107 6.76142,6.42268 10.68607,8.88092 18.32874,11.48036 12.01416,4.08628 29.25409,7.20992 71.22459,12.90492 16.11328,2.18642 31.9984,4.48216 35.30025,5.10165 l 6.0034,1.12635 6.59539,6.86204 c 3.62747,3.77413 7.45766,7.91673 8.51153,9.20579 l 1.91613,2.34375 -0.35445,25.97657 -0.35445,25.97656 -29.39484,-0.16311 c -16.16716,-0.0897 -38.30922,-0.35338 -49.20457,-0.58594 z" id="path43999" transform="matrix(7.5,0,0,-7.5,0,11300)" /> <path style="fill:#ffffff;stroke:#ffffff;stroke-width:0.78125;" d="m 567.54819,857.58283 c -4.06556,-2.4896 -8.88608,-5.5246 -10.71225,-6.74444 l -3.32031,-2.21789 V 690.52118 532.42188 h 70.3125 70.3125 v 67.51725 67.51726 l -14.64844,0.25618 -14.64844,0.25618 -5.46875,2.80483 c -3.00781,1.54266 -12.19115,7.12085 -20.40743,12.39599 l -14.93868,9.59115 -0.53749,13.77589 c -0.61876,15.85884 -2.28822,41.61201 -3.9064,60.26027 -1.91979,22.12417 -2.02754,24.11376 -1.32923,24.54534 0.37392,0.2311 9.60294,0.95324 20.50892,1.60475 22.9276,1.36967 28.69216,1.92788 29.25127,2.83255 0.37543,0.60746 -6.7214,8.90576 -16.89997,19.76108 l -4.35277,4.64218 -21.03786,-4.06895 c -11.57082,-2.23791 -21.61567,-4.24202 -22.32189,-4.45358 -0.76752,-0.2299 -2.79003,-4.06671 -5.02785,-9.53807 -2.05909,-5.03438 -7.24167,-17.23936 -11.51684,-27.12218 -4.27516,-9.88281 -8.4325,-19.8807 -9.23852,-22.21752 -2.4081,-6.98158 -10.93726,-25.82935 -11.68852,-25.82935 -1.04454,0 -0.94819,0.77954 2.37933,19.24997 1.69218,9.39299 4.17246,23.40628 5.51173,31.14065 3.42264,19.76597 8.52834,47.11063 9.4408,50.56221 1.04391,3.94879 2.56702,4.24661 24.93953,4.87635 10.09765,0.28422 19.88557,0.75886 21.75093,1.05473 l 3.39156,0.53796 -6.12593,7.1274 -6.12594,7.12739 -14.84375,4.7783 c -18.99451,6.11445 -27.71952,8.66433 -29.71743,8.6849 -0.87584,0.009 -4.91881,-2.02056 -8.98438,-4.51016 z" id="path44038" transform="matrix(7.5,0,0,-7.5,0,11300)" /> <path style="fill:#ffffff;stroke:#ffffff;stroke-width:0.78125;" d="m 809.16627,994.72657 c -20.7103,-41.35743 -38.15931,-76.48684 -38.77558,-78.06537 l -1.1205,-2.87006 2.86491,0.40782 c 1.57569,0.22429 12.31137,1.95528 23.85704,3.84661 11.54568,1.89135 21.88548,3.43881 22.97733,3.43881 1.18756,0 4.22409,-1.68513 7.55756,-4.19411 5.06893,-3.81518 26.28179,-21.50417 29.49781,-24.59764 1.73378,-1.66771 10.16576,-38.87062 9.83484,-43.39242 l -0.23468,-3.20646 -2.34375,3.77954 c -2.0762,3.3481 -23.05407,36.46039 -23.50168,37.09597 -0.16548,0.23499 -22.83845,4.02388 -30.9905,5.17885 -3.58126,0.50739 -3.71094,0.45722 -3.71094,-1.43558 0,-6.25418 5.62353,-29.74101 7.6597,-31.99095 0.72117,-0.79688 5.18144,-4.28829 9.9117,-7.75869 10.65497,-7.81709 16.02235,-12.22058 16.02235,-13.14501 0,-1.06157 -2.92077,-0.85367 -5.31224,0.37814 -1.1603,0.63058 -8.84843,3.41747 -16.95339,6.19309 -8.10496,2.77563 -16.01105,5.58605 -17.5691,6.24538 -3.13824,1.32804 -2.19942,-0.55089 -16.73118,33.48534 -5.45388,12.77406 -7.22827,16.21094 -8.36939,16.21094 -3.97818,0 -32.50162,-9.03775 -34.44916,-10.91534 -1.25734,-1.21219 -1.63417,-4.1707 -2.90121,-22.77796 -2.04952,-30.09833 -1.96536,-38.45371 0.52472,-52.09303 1.1223,-6.14732 1.84942,-11.36807 1.61582,-11.60166 -0.80301,-0.80302 -2.08208,0.60947 -7.20296,7.95433 l -5.133,7.36224 -4.25261,-4.76598 c -2.66699,-2.98896 -4.2526,-5.47152 -4.2526,-6.65824 0,-1.29664 1.65991,-3.54524 5.27344,-7.14367 2.90039,-2.88826 8.58895,-9.28731 12.64125,-14.22011 4.05229,-4.93279 24.9474,-29.47041 46.43356,-54.52805 l 39.06575,-45.55934 81.04073,0.24684 c 44.57241,0.13576 81.32508,0.53134 81.67262,0.87906 0.34753,0.34772 -12.36747,13.32847 -28.25555,28.84612 -15.88808,15.51765 -44.79563,44.0656 -64.23899,63.43989 -32.18112,32.0668 -35.35156,35.45439 -35.35156,37.77278 0,3.20753 3.34897,9.86405 17.01616,33.82182 11.50203,20.16236 13.43133,23.4802 82.80789,142.40553 34.42903,59.01834 43.9034,75.81954 43.05744,76.35524 -0.60406,0.3825 -34.5133,0.6922 -76.53366,0.6988 l -75.44903,0.012 z" id="path44077" transform="matrix(7.5,0,0,-7.5,0,11300)" /> <path style="fill:#ffffff;stroke:#ffffff;stroke-width:0.78125;" d="m 808.85873,994.33594 c -20.8447,-41.57226 -38.29081,-76.72982 -38.76914,-78.1279 l -0.8697,-2.54195 3.28068,0.48955 c 1.80438,0.26924 12.76433,2.02836 24.35546,3.90914 11.59111,1.88078 21.81406,3.4196 22.71764,3.4196 1.84997,0 27.53216,-20.36466 36.82132,-29.1974 1.31997,-1.25512 9.75774,-39.84563 9.46971,-43.31013 l -0.2397,-2.8831 -1.89785,3.125 c -2.20837,3.63631 -23.58595,37.3579 -23.95921,37.79393 -0.25787,0.30124 -23.21943,4.17707 -30.58825,5.16318 l -4.10156,0.54889 v -2.35396 c 0,-3.05651 3.59826,-21.21382 5.25164,-26.50054 1.53264,-4.90065 1.88697,-5.25003 16.43608,-16.20672 6.28161,-4.73057 11.5595,-9.04048 11.72867,-9.57759 0.4215,-1.3383 -2.50944,-1.24329 -5.24233,0.16994 -1.2194,0.63058 -8.84843,3.41747 -16.95339,6.19309 -8.10496,2.77563 -16.01105,5.58605 -17.5691,6.24538 -3.13824,1.32804 -2.19942,-0.55089 -16.73118,33.48534 -5.45388,12.77406 -7.22827,16.21094 -8.36939,16.21094 -3.97818,0 -32.50162,-9.03775 -34.44916,-10.91534 -1.25734,-1.21219 -1.63417,-4.1707 -2.90121,-22.77796 -2.04952,-30.09833 -1.96536,-38.45371 0.52472,-52.09303 1.1223,-6.14732 1.84942,-11.36807 1.61582,-11.60166 -0.80301,-0.80302 -2.08208,0.60947 -7.20296,7.95433 l -5.133,7.36224 -4.25261,-4.76598 c -2.66699,-2.98896 -4.2526,-5.47152 -4.2526,-6.65824 0,-1.29664 1.65991,-3.54524 5.27344,-7.14367 2.90039,-2.88826 8.58895,-9.28731 12.64125,-14.22011 4.05229,-4.93279 24.9474,-29.47041 46.43356,-54.52805 l 39.06575,-45.55934 81.04073,0.24684 c 44.57241,0.13576 81.32508,0.53134 81.67262,0.87906 0.34753,0.34772 -12.36747,13.32847 -28.25555,28.84612 -15.88808,15.51765 -44.79563,44.0656 -64.23899,63.43989 -32.18112,32.0668 -35.35156,35.45439 -35.35156,37.77278 0,3.20753 3.34897,9.86405 17.01616,33.82182 11.50203,20.16236 13.43133,23.4802 82.80789,142.40553 34.42903,59.01834 43.9034,75.81954 43.05744,76.35524 -0.60406,0.3825 -34.5133,0.6922 -76.53366,0.6988 l -75.44903,0.012 z" id="path44116" transform="matrix(7.5,0,0,-7.5,0,11300)" /> <path style="fill:#ffffff;stroke:#ffffff;stroke-width:0.78125;" d="m 553.73071,1004.1016 c 0.2147,-36.20121 0.63059,-66.54974 0.9242,-67.44121 0.30503,-0.92617 1.76578,-2.05083 3.40821,-2.62404 1.58091,-0.55174 12.71813,-5.58174 24.74938,-11.17777 26.33992,-12.25134 41.09349,-18.74426 41.55136,-18.28639 0.1863,0.1863 -3.72521,4.85336 -8.69225,10.37124 -4.96704,5.51788 -9.03098,10.6095 -9.03098,11.3147 0,0.70521 10.10968,14.59734 22.46597,30.87141 27.38128,36.06302 31.65446,41.44665 32.02215,40.34359 0.15771,-0.47313 -0.7465,-2.91063 -2.00935,-5.41668 -2.28173,-4.52793 -27.90765,-60.94409 -29.03959,-63.93145 -0.46238,-1.22029 1.37887,-4.47126 8.40706,-14.84375 9.71481,-14.3375 14.57716,-20.89617 17.48101,-23.5796 3.31637,-3.06463 16.5323,-8.86813 17.64986,-7.75057 0.2564,0.2564 -1.58727,9.82133 -4.09704,21.25541 -3.3627,15.31981 -4.35187,21.12688 -3.75984,22.07263 1.00811,1.61039 10.58989,5.81952 33.06727,14.52594 9.66797,3.7448 17.8352,7.05427 18.1494,7.35437 0.31421,0.30009 -4.69556,5.80369 -11.13281,12.23021 l -11.70409,11.68457 v 49.42389 49.4238 h -70.40014 -70.40014 z" id="path44155" transform="matrix(7.5,0,0,-7.5,0,11300)" /> <path style="fill:#ffffff;stroke:#ffffff;stroke-width:0.78125;" d="m 411.71875,1077.9707 c -20.62982,-0.9014 -46.67108,-4.772 -67.1875,-9.9862 -19.70319,-5.0075 -32.78773,-10.5812 -46.64986,-19.8717 -22.88804,-15.3398 -38.87627,-35.5608 -49.93422,-63.15413 -3.96729,-9.89975 -4.00987,-10.18572 -1.59005,-10.67987 1.90056,-0.38811 66.97398,-6.63614 110.73874,-10.63258 25.14076,-2.29577 23.00656,-2.80004 28.21338,6.66628 14.42657,26.22838 32.80109,37.8677 63.46387,40.2012 25.5172,1.9419 46.9457,-3.1776 63.08124,-15.07068 11.47757,-8.45985 17.15431,-21.93936 15.02508,-35.67739 -1.52049,-9.81038 -6.40232,-17.48565 -15.25694,-23.98717 -2.72704,-2.00233 -4.82956,-3.76931 -4.67225,-3.92661 0.15729,-0.1573 6.4977,0.25817 14.08978,0.92327 7.59208,0.66509 14.35457,1.20926 15.02775,1.20926 1.10607,0 1.16977,6.56587 0.66134,68.16402 -0.30944,37.4903 -0.78993,68.4023 -1.06774,68.6933 -1.7466,1.8299 -29.59129,5.4812 -52.45824,6.8788 -11.54078,0.7054 -57.39343,0.8658 -71.48438,0.2502 z" id="path44194" transform="matrix(7.5,0,0,-7.5,0,11300)" /> <path style="fill:#ffffff;stroke:#ffffff;stroke-width:0.552427;" d="m 553.80824,885.24755 v -18.2471 l 7.76498,8.44151 c 4.27074,4.64284 8.08118,8.51367 8.46765,8.60184 0.38647,0.0882 4.16355,-1.48343 8.39351,-3.49245 11.07547,-5.26031 19.05984,-8.68497 19.41662,-8.32819 0.40598,0.40598 -3.67974,5.05237 -23.24756,26.43775 l -4.42292,4.83373 h -8.18614 -8.18614 z" id="path51735" transform="matrix(7.5,0,0,-7.5,0,11300)" /> <path style="fill:#ffffff;stroke:#ffffff;stroke-width:0.552427;" d="m 667.05581,715.10752 c -4.10177,-0.24562 -9.03287,-0.61464 -10.95801,-0.82005 -3.45064,-0.36818 -3.49512,-0.39431 -3.13908,-1.84359 0.95778,-3.89871 11.79562,-27.0534 13.19557,-28.19191 1.80141,-1.46499 22.79476,-7.80489 25.84439,-7.80489 1.1595,0 1.63335,0.32177 1.87157,1.27093 0.17545,0.69902 0.24233,8.34323 0.14864,16.98714 -0.22728,20.96717 0.0227,20.54654 -12.32376,20.73774 -3.94985,0.0612 -10.53754,-0.0897 -14.63932,-0.33537 z" id="path51774" transform="matrix(7.5,0,0,-7.5,0,11300)" /> <path style="fill:#ffffff;stroke:#ffffff;stroke-width:0.552427;" d="m 668.16067,782.74993 c -13.52066,-3.74488 -25.49335,-7.07374 -26.60598,-7.39745 -1.9769,-0.57517 -2.03671,-0.67333 -2.62606,-4.30986 -0.9793,-6.04272 -2.25235,-21.00115 -2.2544,-26.48946 -0.002,-4.37184 0.14106,-5.16703 1.01076,-5.63248 1.04997,-0.56193 6.92961,-1.41618 32.68539,-4.74887 14.44009,-1.86849 20.62872,-2.91169 22.78762,-3.84125 0.91393,-0.39351 0.96675,1.2168 0.96675,29.47392 0,23.58007 -0.14578,29.87583 -0.69054,29.82225 -0.37979,-0.0373 -11.75289,-3.13192 -25.27354,-6.8768 z" id="path51813" transform="matrix(7.5,0,0,-7.5,0,11300)" /> <path style="fill:#ffffff;stroke:#ffffff;stroke-width:0.552427;" d="m 724.74266,936.70135 c -1.23832,-0.79318 -9.76323,-6.25832 -18.94422,-12.14476 l -16.69273,-10.70261 0.31069,-2.27942 c 0.69304,-5.08467 1.37719,-19.45462 1.38524,-29.09556 l 0.009,-10.24331 4.83374,-2.13888 c 2.65856,-1.17638 9.59766,-4.45969 15.42022,-7.29625 5.82257,-2.83655 10.85656,-5.15737 11.18665,-5.15737 1.05209,0 0.66871,3.03079 -2.39796,18.95672 -3.8239,19.85846 -4.99139,27.4126 -4.33763,28.06635 0.58905,0.58905 4.50508,1.32064 21.73552,4.0606 6.85644,1.09031 13.41896,2.24542 14.58336,2.56693 l 2.1171,0.58456 -7.67802,7.72351 c -4.22292,4.24793 -10.28825,10.15759 -13.47851,13.13257 l -5.80049,5.40905 z" id="path51852" transform="matrix(7.5,0,0,-7.5,0,11300)" /> </g></svg>';

  function buildCreditsSection() {
    var credits = document.createElement('div');
    credits.className = 'credits';

    var brand = document.createElement('div');
    brand.className = 'credits-brand';
    brand.innerHTML = LOGO_ELANSK_SVG;
    credits.appendChild(brand);

    var desc = document.createElement('p');
    desc.className = 'credits-desc';
    desc.textContent = tr('creditsDesc');
    credits.appendChild(desc);

    function creditsRow(icon, label, valueEl) {
      var row = document.createElement('div');
      row.className = 'credits-row';
      var lbl = document.createElement('span');
      lbl.className = 'label';
      var iconSpan = document.createElement('span');
      iconSpan.setAttribute('aria-hidden', 'true');
      iconSpan.textContent = icon;
      lbl.appendChild(iconSpan);
      lbl.appendChild(document.createTextNode(' ' + label));
      row.appendChild(lbl);
      row.appendChild(valueEl);
      return row;
    }

    var rows = document.createElement('div');
    rows.className = 'credits-rows';

    var emailLink = document.createElement('a');
    emailLink.href = 'mailto:elan-sk@hotmail.com';
    emailLink.textContent = 'elan-sk@hotmail.com';
    rows.appendChild(creditsRow('✉️', tr('contact'), emailLink));

    var paypalLink = document.createElement('a');
    paypalLink.href = 'https://www.paypal.com/paypalme/elansk';
    paypalLink.target = '_blank';
    paypalLink.rel = 'noopener noreferrer';
    paypalLink.className = 'credits-paypal-btn';
    paypalLink.textContent = tr('paypalDonate');
    rows.appendChild(creditsRow('💳', 'PayPal', paypalLink));

    var brebBtn = document.createElement('button');
    brebBtn.type = 'button';
    brebBtn.title = tr('copy');
    brebBtn.textContent = 'elan-sk@hotmail.com';
    brebBtn.addEventListener('click', function () {
      copyText('elan-sk@hotmail.com');
      var original = brebBtn.textContent;
      brebBtn.textContent = tr('copied');
      setTimeout(function () { brebBtn.textContent = original; }, 1200);
    });
    rows.appendChild(creditsRow('⚡', 'Bre-B', brebBtn));

    credits.appendChild(rows);

    var footer = document.createElement('p');
    footer.className = 'credits-footer';
    footer.textContent = tr('creditsFooterPrefix') + new Date().getFullYear();
    credits.appendChild(footer);

    return credits;
  }

  // ---------------------------------------------------------------------
  // Host + Shadow DOM
  // ---------------------------------------------------------------------
  var host = document.createElement('div');
  host.id = 'claude-inspector-host';
  host.setAttribute('data-lens-sk-own', '1');
  host.style.cssText = 'all:initial; position:fixed; inset:auto 0px 8px auto; z-index:2147483647;';
  document.documentElement.appendChild(host);
  var root = host.attachShadow({ mode: 'open' });

  var style = document.createElement('style');
  style.textContent = [
    ':host{all:initial;}',
    '*{box-sizing:border-box;font-family:ui-sans-serif,system-ui,-apple-system,Segoe UI,Roboto,sans-serif;}',
    // Vertical, no horizontal (pedido explícito: "me ocupa mucho espacio")
    // — mismo ancho fijo que un solo ícono en vez de una fila que se
    // estiraba y envolvía. El orden visual de cada hijo se controla con la
    // propiedad `order` (ver JS más abajo, junto a cada pill.appendChild) —
    // así no hace falta reordenar dónde se arma cada botón en el código.
    '.pill{position:relative;display:flex;flex-direction:column;align-items:center;gap:6px;background:#111827;color:#fff;padding:10px 5px;border-radius:999px;box-shadow:0 4px 16px rgba(0,0,0,.35);cursor:pointer;font-size:15px;user-select:none;max-height:calc(100vh - 32px);margin-right:6px;}',
    '.pill:hover{background:#1f2937;}',
    // Indicador simple de "hay vista previa de estilos activa en algún lado
    // de esta página": la píldora entera se tiñe de ámbar (mismo color que
    // el aviso/borde de fila overridden), visible incluso minimizada.
    '.pill.has-overrides{box-shadow:0 0 0 2px #f59e0b,0 0 8px 2px rgba(245,158,11,.6),0 4px 16px rgba(0,0,0,.35);}',
    // Mismo aviso ámbar que .pill.has-overrides, pero para el botón redondo
    // que queda como único rastro clickeable en modo oculto (H) — así el
    // "hay cambios pendientes" se sigue viendo aunque la pastilla esté escondida.
    '.restore-btn{border:1px solid #374151;box-shadow:0 4px 16px rgba(0,0,0,.35);}',
    '.restore-btn.has-overrides{border-color:#f59e0b;box-shadow:0 0 0 2px #f59e0b,0 0 8px 2px rgba(245,158,11,.6),0 4px 16px rgba(0,0,0,.35);}',
    '.pill-reset-all{display:none;flex:0 0 auto;align-items:center;flex-direction:column;gap:2px;background:#78350f;color:#fbbf24;border:1px solid #f59e0b;border-radius:12px;padding:6px 10px;font-size:12px;font-weight:700;cursor:pointer;min-width:40px;}',
    '.pill-reset-all.show{display:flex;}',
    '.pill-reset-all:hover{background:#92400e;}',
    '.pill-reset-all span{display:block;line-height:1;}',
    '.pill-reset-all .reset-icon{font-size:14px;}',
    '.pill-reset-all .reset-count{font-size:11px;}',
    '.bar{display:none;flex-direction:column;gap:7px;background:#111827;color:#fff;padding:12px;border-radius:12px;box-shadow:0 8px 24px rgba(0,0,0,.4);width:min(340px, calc(100vw - 32px));max-height:75vh;overflow:auto;scrollbar-width:thin;scrollbar-color:#374151 transparent;margin-right:5px;}',
    '.bar.open{display:flex;}',
    '.bar::-webkit-scrollbar,.panel::-webkit-scrollbar,.color-var-dropdown::-webkit-scrollbar{width:6px;}',
    '.bar::-webkit-scrollbar-track,.panel::-webkit-scrollbar-track,.color-var-dropdown::-webkit-scrollbar-track{background:transparent;}',
    '.bar::-webkit-scrollbar-thumb,.panel::-webkit-scrollbar-thumb,.color-var-dropdown::-webkit-scrollbar-thumb{background:#374151;border-radius:999px;}',
    '.bar::-webkit-scrollbar-thumb:hover,.panel::-webkit-scrollbar-thumb:hover,.color-var-dropdown::-webkit-scrollbar-thumb:hover{background:#4b5563;}',
    '.pinned{font-size:13px;color:#93c5fd;background:#0b1220;border:1px solid #1f2937;border-radius:6px;padding:6px 8px;word-break:break-word;padding-right:40px;}',
    '.row{display:flex;flex-wrap:wrap;gap:6px;}',
    'button.tool{flex:1 1 auto;min-width:70px;background:#1f2937;color:#e5e7eb;border:1px solid #374151;border-radius:8px;padding:9px 7px;font-size:13px;cursor:pointer;text-align:center;line-height:1.3;white-space:nowrap;}',
    'button.tool:hover{background:#374151;}',
    'button.tool.active{background:#2563eb;border-color:#2563eb;color:#fff;}',
    'button.tool:disabled{opacity:.4;cursor:not-allowed;}',
    'button.tool-icon{flex:0 0 auto;width:38px;height:34px;background:#1f2937;color:#e5e7eb;border:1px solid #374151;border-radius:8px;font-size:15px;cursor:pointer;display:flex;align-items:center;justify-content:center;}',
    'button.tool-icon:hover{background:#374151;}',
    'button.tool-icon.active{background:#ec4899;border-color:#ec4899;color:#fff;}',
    // Mantener Shift apretado (con la barra visible) revela la letra de cada
    // atajo encima de su ícono — oculto por default, .show-hotkeys lo prende.
    '.hotkey-badge{position:absolute;top:-6px;right:-6px;background:#000;color:#fbbf24;font-size:9px;font-weight:800;padding:0 4px;height:14px;line-height:14px;border-radius:4px;box-shadow:0 0 0 1px #374151;display:none;pointer-events:none;}',
    '.show-hotkeys .hotkey-badge{display:block;}',
    '.panel{background:#0b1220;border:1px solid #1f2937;border-radius:8px;padding:9px;font-size:13px;color:#e5e7eb;min-height:333px;max-height:min(640px, 65vh);overflow:auto;scrollbar-width:thin;scrollbar-color:#374151 transparent;}',
    '.panel h4{margin:7px 0 5px;font-size:12px;color:#93c5fd;text-transform:uppercase;letter-spacing:.04em;}',
    '.panel h4:first-child{margin-top:0;}',
    '.hint{font-size:12px;color:#9ca3af;}',
    '.lang-toggle{display:flex;align-items:center;gap:0;border:1px solid #374151;border-radius:6px;overflow:hidden;flex-shrink:0;}',
    '.lang-btn{background:#1f2937;color:#9ca3af;border:none;padding:2px 6px;font-size:10.5px;font-weight:700;cursor:pointer;line-height:1.4;font-family:inherit;}',
    '.lang-btn:hover{background:#374151;color:#e5e7eb;}',
    '.lang-btn.active{background:#2563eb;color:#fff;}',
    // Switch estilo iOS: el <input type="checkbox"> real sigue existiendo
    // (oculto, ver .switch input) para no tocar la lógica ya cableada
    // (bpInput.checked/twcssInput.checked, listeners, saveState/restoreState)
    // — solo cambia la piel visual vía el selector hermano `:checked + .switch-track`.
    '.switch{position:relative;display:inline-block;width:30px;height:17px;flex-shrink:0;}',
    '.switch input{position:absolute;opacity:0;width:100%;height:100%;margin:0;cursor:pointer;}',
    '.switch-track{position:absolute;inset:0;background:#374151;border-radius:999px;transition:background .15s;pointer-events:none;}',
    '.switch-track::before{content:"";position:absolute;width:13px;height:13px;left:2px;top:2px;background:#fff;border-radius:50%;transition:transform .15s;box-shadow:0 1px 3px rgba(0,0,0,.4);}',
    // Azul (mismo #2563eb que button.tool.active/lang-btn.active, no un
    // verde tipo iOS "de fábrica"): más discreto, consistente con el resto
    // de estados "activo" de la herramienta, y sin pisar el significado ya
    // establecido del ámbar/amarillo (siempre = "hay cambios sin guardar").
    '.switch input:checked + .switch-track{background:#2563eb;}',
    '.switch input:checked + .switch-track::before{transform:translateX(13px);}',
    '.row-copy{display:flex;justify-content:space-between;align-items:flex-start;gap:6px;padding:4px 5px;border-radius:4px;cursor:pointer;}',
    '.row-copy:hover{background:#1f2937;}',
    '.row-copy .k{color:#9ca3af;flex-shrink:0;white-space:nowrap;padding-top:1px;}',
    '.row-copy .v{flex:1;white-space:normal;word-break:break-word;text-align:right;font-family:ui-monospace,monospace;font-size:13px;}',
    '.row-copy .ic{flex-shrink:0;width:16px;text-align:center;font-size:13px;}',
    '.row-copy .swatch{flex-shrink:0;width:14px;height:14px;border-radius:3px;border:1px solid rgba(255,255,255,0.25);align-self:center;}',
    '.swatch-pickable{position:relative;cursor:pointer;}',
    '.swatch-picker-input{position:absolute;inset:0;width:100%;height:100%;opacity:0;border:none;padding:0;cursor:pointer;}',
    '.row-copy.overridden{border-left:2px solid #f59e0b;padding-left:3px;}',
    // Flash breve de "guardado" (ver commitStyleEdit) — sobre todo para el
    // picker de color nativo, que no tiene un botón de cerrar propio.
    '.row-copy.just-saved{background:rgba(34,197,94,.35);transition:background .5s ease-out;}',
    '.row-edit-input{flex:1;min-width:0;background:#111827;color:#fff;border:1px solid #f59e0b;border-radius:4px;padding:2px 5px;font-family:ui-monospace,monospace;font-size:13px;text-align:right;}',
    // Dropdown de autocompletado propio (ver attachAutocomplete) — position:
    // fixed para no quedar recortado por el overflow:auto del panel.
    '.ac-dropdown{position:fixed;z-index:2147483000;display:none;flex-direction:column;max-height:220px;overflow:auto;background:#111827;border:1px solid #f59e0b;border-radius:6px;box-shadow:0 8px 24px rgba(0,0,0,.5);font-family:ui-monospace,monospace;font-size:12.5px;}',
    '.ac-dropdown.show{display:flex;}',
    '.ac-item{padding:4px 8px;color:#e5e7eb;cursor:pointer;white-space:nowrap;text-align:left;}',
    '.ac-item:hover{background:#374151;}',
    '.ac-item.ac-active{background:#ec4899;color:#fff;}',
    // Botón ✕ flotante para cerrar el picker de color nativo (ver
    // makeEditableColorRow) — position:fixed porque no vive dentro del
    // popup nativo (no se puede), solo cerca. display:none por default,
    // .show lo prende mientras el <input type=color> tiene foco.
    '.swatch-close-x{display:none;position:fixed;z-index:2147483000;width:20px;height:20px;border-radius:999px;background:#111827;color:#fff;border:1px solid #f59e0b;font-size:11px;line-height:1;padding:0;cursor:pointer;box-shadow:0 2px 8px rgba(0,0,0,.5);}',
    '.swatch-close-x.show{display:block;}',
    '.swatch-close-x:hover{background:#374151;}',
    // Dropdown de variables --color-* del proyecto (ver getProjectColorVariables
    // / openColorVarDropdown), mismo patrón fixed+flotante que .bp-op-dropdown.
    '.color-var-dropdown{position:fixed;z-index:2147483000;max-height:260px;overflow:auto;background:#111827;border:1px solid #374151;border-radius:6px;box-shadow:0 8px 24px rgba(0,0,0,.5);scrollbar-width:thin;scrollbar-color:#374151 transparent;}',
    '.color-var-item{display:flex;align-items:center;gap:8px;padding:6px 12px;font-size:12.5px;color:#e5e7eb;cursor:pointer;white-space:nowrap;}',
    '.color-var-item:hover{background:#374151;}',
    '.color-var-item.active{background:rgba(236,72,153,.12);}',
    '.color-var-item.picked{background:rgba(34,197,94,.25);transition:background .5s ease-out;}',
    '.color-var-check{margin-left:auto;color:#ec4899;font-weight:800;}',
    '.var-item-value{color:#6b7280;font-size:11px;font-family:ui-monospace,monospace;}',
    '.color-var-custom{display:flex;align-items:center;gap:6px;padding:6px 12px;font-size:12.5px;color:#e5e7eb;border-top:1px solid #374151;}',
    '.var-custom-input{width:52px;background:#1f2937;border:1px solid #374151;border-radius:4px;color:#e5e7eb;padding:2px 6px;font-size:12px;font-family:inherit;}',
    '.var-custom-input:focus{outline:1px solid #ec4899;}',
    '.typo-preset-btn{background:none;border:none;padding:2px 4px;border-radius:4px;cursor:pointer;font-size:13px;line-height:1;color:inherit;text-transform:none;letter-spacing:normal;}',
    '.typo-preset-btn:hover{background:#374151;}',
    '.color-var-swatch{flex-shrink:0;width:14px;height:14px;border-radius:3px;border:1px solid rgba(255,255,255,0.25);}',
    '.color-var-empty{padding:8px 12px;font-size:12px;color:#9ca3af;max-width:220px;white-space:normal;}',
    '.preview-banner{display:flex;justify-content:space-between;align-items:center;gap:8px;background:rgba(245,158,11,.12);border:1px solid rgba(245,158,11,.4);border-radius:6px;padding:6px 8px;margin-bottom:8px;font-size:12px;color:#fbbf24;}',
    // Buscador de propiedades (Estilos/Layout) — ver makeFilterBar.
    '.filter-bar{display:flex;gap:6px;margin-bottom:8px;}',
    '.filter-bar input{flex:1;min-width:0;background:#1f2937;border:1px solid #374151;border-radius:6px;color:#e5e7eb;padding:5px 8px;font-size:12.5px;font-family:inherit;}',
    '.filter-bar input:focus{outline:1px solid #ec4899;}',
    '.filter-clear{flex-shrink:0;width:28px;background:#1f2937;border:1px solid #374151;border-radius:6px;color:#e5e7eb;font-size:14px;cursor:pointer;}',
    '.filter-clear:hover{background:#374151;}',
    // Slider de transparencia del overlay de espaciado — sin label (ver
    // makeSpacingOpacitySlider), pegado debajo del diagrama.
    '.opacity-slider-wrap{margin-bottom:8px;}',
    '.opacity-slider-wrap input[type=range]{width:100%;accent-color:#ec4899;cursor:pointer;}',
    '.opacity-slider-wrap input[type=range]:disabled{opacity:.35;cursor:not-allowed;}',
    '.preview-reset{flex-shrink:0;background:#1f2937;color:#fbbf24;border:1px solid #f59e0b;border-radius:6px;padding:3px 8px;font-size:12px;cursor:pointer;}',
    '.preview-reset:hover{background:#374151;}',
    '.row-copy-stack{display:flex;flex-direction:column;gap:3px;padding:4px 5px;border-radius:4px;cursor:pointer;}',
    '.row-copy-stack:hover{background:#1f2937;}',
    '.row-copy-stack .head{display:flex;justify-content:space-between;align-items:center;gap:6px;}',
    '.row-copy-stack .head .k{color:#9ca3af;white-space:nowrap;}',
    '.row-copy-stack .head .ic{flex-shrink:0;width:16px;text-align:center;font-size:13px;}',
    '.row-copy-stack .vlist{display:flex;flex-direction:column;gap:1px;}',
    '.row-copy-stack .vlist span{font-family:ui-monospace,monospace;font-size:13px;color:#e5e7eb;white-space:normal;word-break:break-word;text-align:right;}',
    '.row-copy-stack .vlist span.empty{color:#6b7280;font-family:inherit;}',
    '.list-item{padding:5px 6px;border-radius:6px;cursor:pointer;}',
    '.list-item:hover{background:#1f2937;}',
    '.badge{position:fixed;top:0;right:0;padding:3px 9px;font-size:13px;font-weight:600;color:#fff;border-bottom-left-radius:8px;z-index:2147483647;pointer-events:none;}',
    '.boxmodel{background:#e5e7eb;border-radius:4px;padding:8px;margin:6px 0;}',
    '.bm-band{position:relative;}',
    '.bm-num{position:absolute;font-size:11px;color:#111;font-weight:700;background:rgba(255,255,255,.6);padding:0 3px;border-radius:2px;cursor:pointer;}',
    '.bm-num:hover{background:#fff;}',
    '.bm-num-negative{background:#ef4444;color:#fff;}',
    '.bm-num-negative:hover{background:#dc2626;}',
    '.bm-num-vertical{writing-mode:vertical-rl;text-orientation:mixed;padding:3px 0;}',
    '.bm-tag{position:absolute;font-size:11px;color:#111;text-transform:uppercase;font-weight:700;background:rgba(255,255,255,.55);padding:0 3px;border-radius:2px;cursor:pointer;}',
    '.bm-tag:hover{background:#fff;}',
    '.bm-content{position:relative;background:#93c5fd;color:#111;font-size:12px;font-weight:700;display:flex;align-items:center;justify-content:center;border-radius:2px;min-height:38px;min-width:44px;cursor:pointer;}',
    '.bm-content:hover{background:#7dabf5;}',
    '.bm-content-num{cursor:pointer;border-radius:2px;padding:0 2px;}',
    '.bm-content-num:hover{background:rgba(0,0,0,.18);}',
    // Etiqueta A (auto) / D (definido) del height — ver specifiedValueFor().
    '.bm-src-badge{display:inline-block;font-size:8px;line-height:1;font-weight:800;color:#111;background:rgba(255,255,255,.7);border-radius:2px;padding:1px 2px;margin-left:2px;vertical-align:super;cursor:pointer;}',
    '.bm-src-badge:hover{background:#fff;}',
    // Ícono de min/max activo en el borde del cuadro azul — ver BM_CONSTRAINTS.
    '.bm-constraint-dot{position:absolute;font-size:9px;line-height:1;font-weight:900;color:#78350f;background:#f59e0b;border-radius:3px;padding:0 1px;cursor:pointer;}',
    '.bm-constraint-dot:hover{background:#fbbf24;}',
    // Flash al saltar a una sección/propiedad desde el diagrama (ver jumpToZone/jumpToProp).
    '.jump-flash{background:rgba(59,130,246,.35);transition:background .6s ease-out;}',
    '.pill-label{display:flex;align-items:center;gap:5px;background:transparent;color:#fff;padding:6.5px 12px;border-radius:999px;font-weight:700;cursor:pointer;border:1.5px solid #4b5563;}',
    '.pill-label:hover{background:rgba(255,255,255,.08);border-color:#6b7280;}',
    '.pill-label.active{background:#ec4899;border-color:#ec4899;}',
    '.pill-label.active:hover{background:#db2777;border-color:#db2777;}',
  ].join('');
  root.appendChild(style);

  // ---------------------------------------------------------------------
  // Modal de Ayuda: host + Shadow DOM aparte, fixed a pantalla completa (el
  // host principal está anclado abajo-derecha y shrink-wrappea su contenido,
  // no sirve para centrar algo "grande" en toda la pantalla).
  // ---------------------------------------------------------------------
  var helpHost = document.createElement('div');
  helpHost.id = 'claude-inspector-help-host';
  helpHost.setAttribute('data-lens-sk-own', '1');
  helpHost.style.cssText = 'all:initial; position:fixed; inset:0; z-index:2147483647; display:none;';
  document.documentElement.appendChild(helpHost);
  var helpRoot = helpHost.attachShadow({ mode: 'open' });

  var helpStyle = document.createElement('style');
  helpStyle.textContent = [
    ':host{all:initial;}',
    '*{box-sizing:border-box;font-family:ui-sans-serif,system-ui,-apple-system,Segoe UI,Roboto,sans-serif;}',
    '.help-backdrop{position:fixed;inset:0;background:rgba(0,0,0,.6);display:flex;align-items:center;justify-content:center;padding:24px;}',
    '.help-modal{position:relative;background:#111827;color:#e5e7eb;border-radius:14px;box-shadow:0 20px 60px rgba(0,0,0,.5);width:min(640px,100%);max-height:85vh;overflow:auto;padding:28px;scrollbar-width:thin;scrollbar-color:#374151 transparent;}',
    '.help-modal::-webkit-scrollbar{width:6px;}',
    '.help-modal::-webkit-scrollbar-track{background:transparent;}',
    '.help-modal::-webkit-scrollbar-thumb{background:#374151;border-radius:999px;}',
    '.help-modal::-webkit-scrollbar-thumb:hover{background:#4b5563;}',
    '.help-modal h2{margin:0 0 4px;font-size:20px;color:#fff;}',
    '.help-modal h3{margin:20px 0 8px;font-size:14px;color:#93c5fd;text-transform:uppercase;letter-spacing:.04em;}',
    '.help-modal h3:first-of-type{margin-top:16px;}',
    '.help-modal p{margin:0 0 8px;font-size:14px;line-height:1.5;color:#d1d5db;}',
    '.help-modal ul{margin:0 0 8px;padding-left:20px;font-size:14px;line-height:1.6;color:#d1d5db;}',
    '.help-modal li{margin-bottom:4px;}',
    '.help-modal b{color:#f3f4f6;}',
    '.help-modal hr{border:none;border-top:1px solid #1f2937;margin:22px 0;}',
    '.help-close{position:absolute;top:14px;right:14px;width:30px;height:30px;border-radius:8px;background:#1f2937;color:#e5e7eb;border:1px solid #374151;cursor:pointer;font-size:15px;line-height:1;}',
    '.help-close:hover{background:#374151;}',
    '.credits{margin-top:24px;padding-top:20px;border-top:1px solid #1f2937;text-align:center;}',
    '.credits-brand{display:flex;justify-content:center;margin-bottom:8px;}',
    '.credits-brand > svg{height:88px;width:auto;display:block;}',
    '.credits .credits-desc{font-size:13px;color:#9ca3af;max-width:420px;margin:0 auto 16px;line-height:1.5;text-align:center;}',
    '.credits-rows{max-width:320px;margin:0 auto;border-top:1px solid #1f2937;border-bottom:1px solid #1f2937;}',
    '.credits-row{display:flex;align-items:center;justify-content:center;gap:20px;padding:8px 0;border-top:1px solid #1f2937;}',
    '.credits-row:first-child{border-top:none;}',
    '.credits-row .label{display:flex;align-items:center;gap:6px;font-size:13px;font-weight:600;color:#e5e7eb;flex-shrink:0;}',
    '.credits-row a{font-size:13px;color:#f472b6;text-decoration:none;}',
    '.credits-row a:hover{text-decoration:underline;}',
    '.credits-row button{font-size:13px;color:#f472b6;background:none;border:none;cursor:pointer;font-family:inherit;padding:0;}',
    '.credits-row button:hover{text-decoration:underline;}',
    '.credits-paypal-btn{background:#003087 !important;color:#fff !important;padding:5px 12px;border-radius:6px;font-weight:700;text-decoration:none !important;}',
    '.credits-paypal-btn:hover{background:#001f5c !important;}',
    '.credits-footer{font-size:11px;color:#6b7280;margin-top:16px;}',
  ].join('');
  helpRoot.appendChild(helpStyle);

  var helpBackdrop = document.createElement('div');
  helpBackdrop.className = 'help-backdrop';
  var helpModal = document.createElement('div');
  helpModal.className = 'help-modal';
  var helpCloseBtn = document.createElement('button');
  helpCloseBtn.className = 'help-close';
  helpCloseBtn.textContent = '✕';
  helpCloseBtn.title = tr('close');
  var helpContent = document.createElement('div');
  helpContent.innerHTML = getHelpContentHTML();
  helpContent.appendChild(buildCreditsSection());
  helpModal.appendChild(helpCloseBtn);
  helpModal.appendChild(helpContent);
  helpBackdrop.appendChild(helpModal);
  helpRoot.appendChild(helpBackdrop);

  function openHelp() {
    // Se reconstruye en cada apertura (no solo una vez al cargar la
    // página) para reflejar el idioma activo en ese momento — mismo patrón
    // que openBpConfig()/openTreeModal() con sus propios modales.
    helpContent.innerHTML = getHelpContentHTML();
    helpContent.appendChild(buildCreditsSection());
    helpHost.style.display = 'block';
  }
  function closeHelp() { helpHost.style.display = 'none'; }
  helpCloseBtn.addEventListener('click', closeHelp);
  helpBackdrop.addEventListener('click', function (e) { if (e.target === helpBackdrop) closeHelp(); });

  // ---------------------------------------------------------------------
  // Popup: </> Estructura HTML — árbol anidado del elemento fijado y sus
  // descendientes, resaltado tipo editor de código, copiable. Mismo patrón
  // de host/shadow aparte que el modal de Ayuda (así los clics ahí adentro
  // no quedan interceptados por el selector de elementos de la página).
  // ---------------------------------------------------------------------
  var TREE_MAX_NODES = 1500; // salvaguarda: páginas/elementos pathológicamente grandes no cuelgan el navegador
  var treeHost = document.createElement('div');
  treeHost.id = 'claude-inspector-tree-host';
  treeHost.setAttribute('data-lens-sk-own', '1');
  treeHost.style.cssText = 'all:initial; position:fixed; inset:0; z-index:2147483647; display:none;';
  document.documentElement.appendChild(treeHost);
  var treeRoot = treeHost.attachShadow({ mode: 'open' });

  var treeStyle = document.createElement('style');
  treeStyle.textContent = [
    ':host{all:initial;}',
    '*{box-sizing:border-box;font-family:ui-sans-serif,system-ui,-apple-system,Segoe UI,Roboto,sans-serif;}',
    '.tree-backdrop{position:fixed;inset:0;background:rgba(0,0,0,.6);display:flex;align-items:center;justify-content:center;padding:24px;transition:background .15s;}',
    '.tree-modal{position:relative;background:#0b1220;color:#e5e7eb;border-radius:14px;box-shadow:0 20px 60px rgba(0,0,0,.5);width:min(920px,100%);height:min(720px,88vh);display:flex;flex-direction:column;overflow:hidden;transition:opacity .15s;}',
    '.tree-header{padding:16px 20px 12px;border-bottom:1px solid #1f2937;flex-shrink:0;}',
    '.tree-header h2{margin:0 0 10px;font-size:15px;color:#fff;font-family:ui-monospace,monospace;word-break:break-all;padding-right:34px;}',
    '.tree-toolbar{display:flex;gap:8px;align-items:center;flex-wrap:wrap;}',
    '.tree-toolbar input{flex:1;min-width:140px;background:#1f2937;border:1px solid #374151;border-radius:6px;color:#e5e7eb;padding:6px 10px;font-size:13px;font-family:inherit;}',
    '.tree-toolbar input:focus{outline:1px solid #ec4899;}',
    '.tree-toolbar button{background:#1f2937;border:1px solid #374151;border-radius:6px;color:#e5e7eb;padding:6px 10px;font-size:12px;cursor:pointer;white-space:nowrap;font-family:inherit;}',
    '.tree-toolbar button:hover{background:#374151;}',
    '.tree-close{position:absolute;top:14px;right:8px;width:30px;height:30px;border-radius:8px;background:#1f2937;color:#e5e7eb;border:1px solid #374151;cursor:pointer;font-size:15px;line-height:1;}',
    '.tree-close:hover{background:#374151;}',
    '.tree-body{flex:1;min-height:0;overflow:auto;padding:14px 20px 20px;font-family:ui-monospace,monospace;font-size:12.5px;line-height:1.65;scrollbar-width:thin;scrollbar-color:#374151 transparent;}',
    '.tree-body::-webkit-scrollbar{width:8px;}',
    '.tree-body::-webkit-scrollbar-track{background:transparent;}',
    '.tree-body::-webkit-scrollbar-thumb{background:#374151;border-radius:999px;}',
    // Fila de 2 columnas: .tn-eye-col a ancho fijo (siempre al mismo x,
    // como la columna de ojitos de las capas en Photoshop) + .tn-line
    // (flex:1) con el resto de la línea, que sigue indentándose normal por
    // profundidad vía su propio padding-left inline.
    '.tn-row{display:flex;align-items:center;}',
    '.tn-eye-col{flex-shrink:0;width:38px;display:flex;align-items:center;justify-content:flex-start;gap:5px;}',
    '.tn-line{flex:1;min-width:0;display:flex;align-items:flex-start;gap:4px;border-radius:4px;padding:1px 4px;cursor:pointer;white-space:pre-wrap;word-break:break-all;}',
    '.tn-line:hover{background:#1f2937;}',
    '.tn-caret{flex-shrink:0;width:14px;text-align:center;color:#6b7280;user-select:none;}',
    '.tn-caret.leaf{visibility:hidden;}',
    '.tn-tag{color:#f472b6;}',
    '.tn-attr{color:#93c5fd;}',
    '.tn-str{color:#86efac;cursor:copy;}',
    '.tn-str:hover{text-decoration:underline;}',
    '.tn-text{color:#9ca3af;font-style:italic;}',
    '.tn-copy{flex-shrink:0;opacity:0;font-size:11px;padding:0 3px;}',
    '.tn-line:hover .tn-copy{opacity:1;}',
    // Editor de clases/contenido (ver "Vista previa de estilos" en la
    // Ayuda): mismo lápiz ✏️ que el panel Estilos/Layout, mismo color ámbar
    // para la fila con override activo.
    '.tn-edit{flex-shrink:0;opacity:0;font-size:11px;padding:0 3px;cursor:pointer;}',
    '.tn-line:hover .tn-edit{opacity:1;}',
    '.tn-line.tn-overridden{outline:1px solid #f59e0b;background:rgba(245,158,11,.08);}',
    '.tn-line.tn-node-hidden{opacity:.45;}',
    '.tn-edit-input{background:#111827;color:#fff;border:1px solid #f59e0b;border-radius:4px;padding:0 4px;font-family:ui-monospace,monospace;font-size:12.5px;min-width:100px;flex:1;}',
    // Dropdown de autocompletado propio (ver attachAutocomplete en el
    // panel principal — mismo mecanismo, reutilizado acá).
    '.ac-dropdown{position:fixed;z-index:2147483000;display:none;flex-direction:column;max-height:220px;overflow:auto;background:#111827;border:1px solid #f59e0b;border-radius:6px;box-shadow:0 8px 24px rgba(0,0,0,.5);font-family:ui-monospace,monospace;font-size:12.5px;}',
    '.ac-dropdown.show{display:flex;}',
    '.ac-item{padding:4px 8px;color:#e5e7eb;cursor:pointer;white-space:nowrap;text-align:left;}',
    '.ac-item:hover{background:#374151;}',
    '.ac-item.ac-active{background:#ec4899;color:#fff;}',
    // Siempre visible (no depende del hover de la línea) — vive en su
    // propia columna fija, como el ojito de una capa en Photoshop. Ícono de
    // líneas (SVG stroke=currentColor), no el emoji a color.
    '.tn-eye{display:flex;cursor:pointer;opacity:.5;color:#9ca3af;}',
    '.tn-eye:hover{opacity:1;color:#e5e7eb;}',
    '.tn-eye svg{display:block;width:13px;height:13px;}',
    // Mismo criterio Y mismo estilo que .tn-eye (siempre visible, no
    // depende de hover, mismo color/tamaño de línea): botón aparte para
    // señalar el elemento sin salir del árbol — ver flashElementInTree.
    '.tn-locate{display:flex;cursor:pointer;opacity:.5;color:#9ca3af;}',
    '.tn-locate:hover{opacity:1;color:#e5e7eb;}',
    '.tn-locate svg{display:block;width:13px;height:13px;}',
    '.tn-children.collapsed{display:none;}',
    '.tn-dim{opacity:.25;}',
    '.tn-match{background:rgba(236,72,153,.35);border-radius:2px;}',
    '.tree-hint{color:#6b7280;font-size:11px;margin-top:10px;}',
  ].join('');
  treeRoot.appendChild(treeStyle);

  var treeBackdrop = document.createElement('div');
  treeBackdrop.className = 'tree-backdrop';
  var treeModal = document.createElement('div');
  treeModal.className = 'tree-modal';
  var treeCloseBtn = document.createElement('button');
  treeCloseBtn.className = 'tree-close';
  treeCloseBtn.textContent = '✕';
  treeCloseBtn.title = tr('close');
  var treeHeader = document.createElement('div');
  treeHeader.className = 'tree-header';
  var treeTitle = document.createElement('h2');
  treeTitle.innerHTML = svgCode(18, 'vertical-align:-4px;margin-right:6px') + '<span class="tree-title-text">' + tr('treeTitleDefault') + '</span>';
  var treeTitleText = treeTitle.querySelector('.tree-title-text');
  var treeToolbar = document.createElement('div');
  treeToolbar.className = 'tree-toolbar';
  var treeSearchInput = document.createElement('input');
  treeSearchInput.type = 'text';
  treeSearchInput.placeholder = tr('treeSearchPlaceholder');
  var treeExpandBtn = document.createElement('button');
  treeExpandBtn.textContent = tr('treeExpandAll');
  var treeCollapseBtn = document.createElement('button');
  treeCollapseBtn.textContent = tr('treeCollapseAll');
  var treeCopyAllBtn = document.createElement('button');
  treeCopyAllBtn.textContent = tr('treeCopyAll');
  var treeCopyPageBtn = document.createElement('button');
  treeCopyPageBtn.textContent = tr('treeCopyPage');
  treeCopyPageBtn.title = tr('treeCopyPageTitle');
  treeCopyPageBtn.addEventListener('click', function () {
    copyFullPageHTML();
    var original = treeCopyPageBtn.textContent;
    treeCopyPageBtn.textContent = tr('treeCopyAllDone');
    setTimeout(function () { treeCopyPageBtn.textContent = original; }, 1200);
  });
  // Restablece SOLO el elemento raíz de este árbol (el que estaba fijado al
  // abrir el popup) — clases, contenido y cualquier estilo que tenga en
  // vista previa. Ver "Vista previa de estilos" en la Ayuda. Oculto si ese
  // elemento no tiene nada cambiado.
  var treeResetBtn = document.createElement('button');
  treeResetBtn.textContent = tr('treeResetElement');
  treeResetBtn.style.display = 'none';
  treeToolbar.appendChild(treeSearchInput);
  treeToolbar.appendChild(treeExpandBtn);
  treeToolbar.appendChild(treeCollapseBtn);
  treeToolbar.appendChild(treeCopyAllBtn);
  treeToolbar.appendChild(treeCopyPageBtn);
  treeToolbar.appendChild(treeResetBtn);
  treeHeader.appendChild(treeTitle);
  treeHeader.appendChild(treeToolbar);
  var treeBody = document.createElement('div');
  treeBody.className = 'tree-body';
  treeModal.appendChild(treeCloseBtn);
  treeModal.appendChild(treeHeader);
  treeModal.appendChild(treeBody);
  treeBackdrop.appendChild(treeModal);
  treeRoot.appendChild(treeBackdrop);

  // Overlay de resaltado en vivo (hover sobre una línea, sin cerrar el
  // popup) — vive en el mismo shadow root, agregado DESPUÉS del backdrop
  // para pintar por encima de él. Se combina con bajar la opacidad del
  // modal (ver onTreeLineEnter/Leave) para poder "espiar" a través: el
  // marco cubre el caso de un elemento fuera del área del popup, la
  // transparencia cubre el caso de un elemento detrás del popup.
  var treeHoverOutline = document.createElement('div');
  treeHoverOutline.style.cssText = 'position:fixed;pointer-events:none;box-sizing:border-box;border:2px solid #ec4899;display:none;';
  treeRoot.appendChild(treeHoverOutline);

  function onTreeLineEnter(el) {
    treeModal.style.opacity = '0.2';
    treeBackdrop.style.background = 'rgba(0,0,0,.15)';
    var r = el.getBoundingClientRect();
    treeHoverOutline.style.cssText = 'position:fixed;pointer-events:none;box-sizing:border-box;border:2px solid #ec4899;display:block;'
      + 'top:' + r.top + 'px;left:' + r.left + 'px;width:' + r.width + 'px;height:' + r.height + 'px;';
  }
  function onTreeLineLeave() {
    treeModal.style.opacity = '';
    treeBackdrop.style.background = '';
    treeHoverOutline.style.display = 'none';
  }
  // Versión táctil de onTreeLineEnter/Leave (ver botón 🔍 "ubicar" en cada
  // fila): en touch no existe mouseleave para restaurar solo, así que en
  // vez de depender de un evento, se autorrestaura con un temporizador
  // propio. clearTimeout de entrada: si se toca otra fila (u otra vez la
  // misma) antes de que se cumpla el anterior, cancela ese restablecimiento
  // pendiente en vez de competir con el nuevo.
  // El <html> de este proyecto tiene scroll-behavior:smooth por CSS — eso
  // anima CUALQUIER scroll (incluso pidiendo behavior:'auto', que solo
  // dice "respetá el CSS", no "instantáneo"), y getBoundingClientRect()
  // termina leyendo la posición de ANTES de moverse porque no hay forma
  // confiable de esperar a que la animación termine. Se fuerza
  // scroll-behavior:auto por inline style en el <html> justo para este
  // scroll puntual (mayor especificidad que la regla de CSS) y se
  // restaura al toque — así el salto es realmente instantáneo y lo que se
  // mide después ya es la posición final correcta.
  function scrollIntoViewInstant(el) {
    var htmlEl = document.documentElement;
    var prevScrollBehavior = htmlEl.style.scrollBehavior;
    htmlEl.style.scrollBehavior = 'auto';
    el.scrollIntoView({ behavior: 'auto', block: 'center' });
    htmlEl.style.scrollBehavior = prevScrollBehavior;
  }
  var treeLocateTimer = null;
  function flashElementInTree(el) {
    clearTimeout(treeLocateTimer);
    scrollIntoViewInstant(el);
    onTreeLineEnter(el);
    treeLocateTimer = setTimeout(onTreeLineLeave, 1800);
  }

  var currentTreeData = null;

  function closeTreeModal() { clearTimeout(treeLocateTimer); treeHost.style.display = 'none'; onTreeLineLeave(); }
  treeCloseBtn.addEventListener('click', closeTreeModal);
  treeBackdrop.addEventListener('click', function (e) { if (e.target === treeBackdrop) closeTreeModal(); });

  // ---------------------------------------------------------------------
  // Modal: configuración de breakpoints (Auto/Manual) — mismo patrón que
  // Ayuda/Árbol de estructura (host de Shadow DOM aparte, backdrop, cierre
  // con click afuera/Escape).
  // ---------------------------------------------------------------------
  var bpHost = document.createElement('div');
  bpHost.id = 'claude-inspector-bp-host';
  bpHost.setAttribute('data-lens-sk-own', '1');
  bpHost.style.cssText = 'all:initial; position:fixed; inset:0; z-index:2147483647; display:none;';
  document.documentElement.appendChild(bpHost);
  var bpRoot = bpHost.attachShadow({ mode: 'open' });

  var bpStyle = document.createElement('style');
  bpStyle.textContent = [
    ':host{all:initial;}',
    '*{box-sizing:border-box;font-family:ui-sans-serif,system-ui,-apple-system,Segoe UI,Roboto,sans-serif;}',
    '.bp-backdrop{position:fixed;inset:0;background:rgba(0,0,0,.6);display:flex;align-items:center;justify-content:center;padding:24px;}',
    '.bp-modal{position:relative;background:#111827;color:#e5e7eb;border-radius:14px;box-shadow:0 20px 60px rgba(0,0,0,.5);width:min(560px,100%);max-height:85vh;overflow:auto;padding:24px;scrollbar-width:thin;scrollbar-color:#374151 transparent;}',
    '.bp-modal::-webkit-scrollbar{width:6px;}',
    '.bp-modal::-webkit-scrollbar-track{background:transparent;}',
    '.bp-modal::-webkit-scrollbar-thumb{background:#374151;border-radius:999px;}',
    '.bp-modal h2{margin:0 0 14px;font-size:16px;color:#fff;padding-right:34px;}',
    '.bp-close{position:absolute;top:14px;right:14px;width:30px;height:30px;border-radius:8px;background:#1f2937;color:#e5e7eb;border:1px solid #374151;cursor:pointer;font-size:15px;line-height:1;}',
    '.bp-close:hover{background:#374151;}',
    '.bp-tabs{display:flex;gap:6px;margin-bottom:14px;}',
    '.bp-tab{flex:1;background:#1f2937;border:1px solid #374151;border-radius:8px;color:#9ca3af;padding:7px;font-size:13px;cursor:pointer;font-weight:600;font-family:inherit;}',
    '.bp-tab:hover{background:#374151;}',
    '.bp-tab.active{background:#2563eb;border-color:#2563eb;color:#fff;}',
    '.bp-hint{font-size:12px;color:#9ca3af;margin-bottom:10px;line-height:1.5;}',
    '.bp-row{display:flex;align-items:center;gap:6px;margin-bottom:6px;}',
    '.bp-row .swatch{flex-shrink:0;width:12px;height:12px;border-radius:999px;}',
    '.bp-row input[type=text]{min-width:0;background:#1f2937;border:1px solid #374151;border-radius:6px;color:#e5e7eb;padding:5px 7px;font-size:12.5px;font-family:inherit;}',
    '.bp-row input[type=text].bp-name{flex:1 1 70px;}',
    '.bp-op-btn{background:#1f2937;border:1px solid #374151;border-radius:6px;color:#e5e7eb;padding:5px 8px;font-size:12.5px;cursor:pointer;flex-shrink:0;font-family:inherit;min-width:40px;}',
    '.bp-op-btn:hover{background:#374151;}',
    '.bp-op-dropdown{position:fixed;z-index:2147483647;background:#111827;border:1px solid #374151;border-radius:6px;box-shadow:0 8px 24px rgba(0,0,0,.5);overflow:hidden;}',
    '.bp-op-item{padding:6px 14px;font-size:12.5px;color:#e5e7eb;cursor:pointer;white-space:nowrap;font-family:inherit;}',
    '.bp-op-item:hover{background:#374151;}',
    '.bp-op-item.active{background:#2563eb;color:#fff;}',
    '.bp-row input[type=number]{width:72px;flex-shrink:0;background:#1f2937;border:1px solid #374151;border-radius:6px;color:#e5e7eb;padding:5px 7px;font-size:12.5px;font-family:inherit;}',
    '.bp-row .bp-unit{flex-shrink:0;font-size:12px;color:#6b7280;}',
    '.bp-row input:focus{outline:1px solid #ec4899;}',
    '.bp-row-del{flex-shrink:0;background:#1f2937;border:1px solid #374151;border-radius:6px;color:#f87171;width:26px;height:26px;cursor:pointer;font-size:12px;font-family:inherit;}',
    '.bp-row-del:hover{background:#374151;}',
    '.bp-add{margin-top:6px;background:#1f2937;border:1px dashed #374151;border-radius:6px;color:#9ca3af;padding:7px;font-size:12.5px;cursor:pointer;width:100%;font-family:inherit;}',
    '.bp-add:hover{background:#374151;color:#e5e7eb;}',
    '.bp-auto-row{display:flex;align-items:center;gap:8px;padding:6px 0;font-size:12.5px;color:#e5e7eb;border-bottom:1px solid #1f2937;}',
    '.bp-auto-row:last-child{border-bottom:none;}',
    '.bp-auto-source{font-size:11px;color:#6b7280;margin:10px 0 4px;}',
    '.bp-refresh{margin-top:10px;background:#1f2937;border:1px solid #374151;border-radius:6px;color:#e5e7eb;padding:6px 10px;font-size:12.5px;cursor:pointer;font-family:inherit;}',
    '.bp-refresh:hover{background:#374151;}',
    '.bp-empty{font-size:12.5px;color:#6b7280;padding:8px 0;}',
  ].join('');
  bpRoot.appendChild(bpStyle);

  var bpBackdrop = document.createElement('div');
  bpBackdrop.className = 'bp-backdrop';
  var bpModal = document.createElement('div');
  bpModal.className = 'bp-modal';
  var bpCloseBtn = document.createElement('button');
  bpCloseBtn.className = 'bp-close';
  bpCloseBtn.textContent = '✕';
  bpCloseBtn.title = tr('close');
  var bpTitle = document.createElement('h2');
  bpTitle.textContent = tr('bpTitle');
  var bpTabs = document.createElement('div');
  bpTabs.className = 'bp-tabs';
  var bpAutoTab = document.createElement('button');
  bpAutoTab.className = 'bp-tab';
  bpAutoTab.textContent = 'Auto';
  var bpManualTab = document.createElement('button');
  bpManualTab.className = 'bp-tab';
  bpManualTab.textContent = 'Manual';
  bpTabs.appendChild(bpAutoTab);
  bpTabs.appendChild(bpManualTab);
  var bpBody = document.createElement('div');
  bpModal.appendChild(bpCloseBtn);
  bpModal.appendChild(bpTitle);
  bpModal.appendChild(bpTabs);
  bpModal.appendChild(bpBody);
  bpBackdrop.appendChild(bpModal);
  bpRoot.appendChild(bpBackdrop);

  function openBpConfig() { bpHost.style.display = 'block'; renderBpModal(); }
  function closeBpConfig() { bpHost.style.display = 'none'; closeOpDropdown(); }
  bpCloseBtn.addEventListener('click', closeBpConfig);
  bpBackdrop.addEventListener('click', function (e) { if (e.target === bpBackdrop) closeBpConfig(); });

  // DOM real -> objeto plano {tag, attrs:[{name,value}], children:[...], el}
  // (los nodos de texto son {text, el:null}). Guardar `el` permite resaltar
  // en la página real al clickear un nodo del árbol, sin tener que
  // re-buscar el elemento. Excluye el propio host del inspector (si el
  // usuario fija <html>/<body>, si no, el árbol se incluiría a sí mismo).
  // Autocompletado de clases (ver "Vista previa de estilos" en la Ayuda):
  // en vez de intentar listar "todas las clases posibles de Tailwind" (no
  // existe tal lista, el motor las genera bajo demanda), se sugieren las
  // que YA se usan en esta misma página — así el autocompletado ofrece
  // justo las combinaciones que el proyecto ya tiene, no una lista
  // genérica. Nuestros propios elementos viven en Shadow DOM aparte, así
  // que ni aparecen acá (querySelectorAll del light DOM no los alcanza).
  function collectPageClassTokens() {
    var set = {};
    document.querySelectorAll('[class]').forEach(function (el) {
      if (typeof el.className !== 'string') return;
      el.className.trim().split(/\s+/).forEach(function (c) { if (c) set[c] = true; });
    });
    return Object.keys(set).sort();
  }
  function buildTreeData(rootEl) {
    var count = 0, truncated = false;
    var ownHosts = [host, helpHost, treeHost, bpHost, layoutOverlayRoot, badge, hoverOutline, pinOutline, marginOverlay, borderOverlay, paddingOverlay, contentOverlay];
    function walk(node) {
      if (truncated || ownHosts.indexOf(node) !== -1) return null;
      if (count >= TREE_MAX_NODES) { truncated = true; return null; }
      count++;
      var attrs = [];
      if (node.id) attrs.push({ name: 'id', value: node.id });
      if (node.className && typeof node.className === 'string' && node.className.trim()) attrs.push({ name: 'class', value: node.className.trim() });
      Array.prototype.forEach.call(node.attributes || [], function (a) {
        if (a.name === 'id' || a.name === 'class') return;
        if (a.name.indexOf('data-') === 0 || a.name.indexOf('aria-') === 0) attrs.push({ name: a.name, value: a.value });
      });
      var children = [];
      Array.prototype.forEach.call(node.childNodes, function (child) {
        if (child.nodeType === 1) {
          var childData = walk(child);
          if (childData) children.push(childData);
        } else if (child.nodeType === 3) {
          var text = child.textContent.replace(/\s+/g, ' ').trim();
          if (text) children.push({ text: text, el: null, textNode: child, textProp: 'text:' + textNodeIndex(child) });
        }
      });
      return { tag: node.tagName.toLowerCase(), attrs: attrs, children: children, el: node };
    }
    return { data: walk(rootEl), truncated: truncated, count: count };
  }

  // Solo estas etiquetas son válidas como autocerradas en HTML real — un
  // <div/> vacío no es válido (el navegador NO lo trata como autocerrado,
  // rompe el anidamiento de lo que venga después al pegarlo), así que un
  // elemento vacío que no sea de esta lista se serializa con apertura +
  // cierre explícitos en vez de "/>".
  var VOID_TAGS = { area: 1, base: 1, br: 1, col: 1, embed: 1, hr: 1, img: 1, input: 1, link: 1, meta: 1, param: 1, source: 1, track: 1, wbr: 1 };
  // Mismo path de ojo de siempre — la versión "cerrada" solo le suma una
  // línea diagonal (estilo Photoshop, capa oculta), no es un ícono distinto.
  var EYE_OPEN_SVG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>';
  var EYE_CLOSED_SVG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/><line x1="2" y1="2" x2="22" y2="22"/></svg>';
  // Mismo estilo que EYE_OPEN_SVG (líneas, stroke=currentColor, minimalista)
  // para el botón "ubicar" (🔍 lupa) — antes era un emoji a color, que no
  // combinaba con el ojito de al lado.
  var LOCATE_SVG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="7"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>';
  function serializeTreeNode(node, depth) {
    var indent = '  '.repeat(depth);
    if (node.text !== undefined) return indent + node.text;
    var open = '<' + node.tag;
    node.attrs.forEach(function (a) { open += ' ' + a.name + '="' + String(a.value).replace(/"/g, '&quot;') + '"'; });
    if (VOID_TAGS[node.tag]) return indent + open + ' />';
    if (!node.children.length) return indent + open + '></' + node.tag + '>';
    open += '>';
    var lines = [indent + open];
    node.children.forEach(function (child) { lines.push(serializeTreeNode(child, depth + 1)); });
    lines.push(indent + '</' + node.tag + '>');
    return lines.join('\n');
  }

  // Copia el HTML de la página COMPLETA (no solo el subárbol del elemento
  // fijado, ver "📋 Copiar todo" arriba) — para el flujo de "armar un
  // layout con la herramienta y llevarme el resultado". Clona todo
  // document.documentElement (nunca toca el DOM real) y recién en esa
  // copia saca todo lo que la propia herramienta inyectó — hosts, overlays,
  // marcadores, el iframe del Tailwind CDN — marcados todos con el mismo
  // atributo `data-lens-sk-own` puesto al crearlos (ver cada
  // document.documentElement.appendChild más arriba en el archivo). Los
  // CLONES creados con la función Clonar si quedan — son contenido real
  // que el usuario decidió agregar, no basura de la herramienta.
  function copyFullPageHTML() {
    var clone = document.documentElement.cloneNode(true);
    clone.querySelectorAll('[data-lens-sk-own], [data-lens-sk-tw-frame]').forEach(function (n) { n.remove(); });
    copyText('<!DOCTYPE html>\n' + clone.outerHTML);
  }

  // Envuelve una línea de contenido (ya armada, con su propio padding-left
  // por profundidad) en una fila de 2 columnas: la columna del ojito queda
  // SIEMPRE al mismo x sin importar el nivel de anidamiento (como la
  // columna de ojitos de las capas en Photoshop), porque vive AFUERA del
  // padding-left de la línea — no porque se calcule ninguna alineación,
  // simplemente ninguno de los contenedores por encima de esta fila mete
  // offset propio. El resto de la línea (flecha, etiqueta, 📋) sigue
  // anidándose normal, como antes.
  function wrapTreeRow(contentEl, eyeEl) {
    var row = document.createElement('div');
    row.className = 'tn-row';
    var eyeCol = document.createElement('span');
    eyeCol.className = 'tn-eye-col';
    if (eyeEl) eyeCol.appendChild(eyeEl);
    row.appendChild(eyeCol);
    row.appendChild(contentEl);
    return row;
  }

  function renderTreeNode(node, container, depth) {
    if (node.text !== undefined) {
      var textLine = document.createElement('div');
      textLine.className = 'tn-line';
      textLine.style.paddingLeft = (depth * 14) + 'px';
      var caretSpacer = document.createElement('span');
      caretSpacer.className = 'tn-caret leaf';
      var textSpan = document.createElement('span');
      textSpan.className = 'tn-text';
      textSpan.textContent = node.text.length > 140 ? node.text.slice(0, 140) + '…' : node.text;
      textLine.appendChild(caretSpacer);
      textLine.appendChild(textSpan);
      var textParentEl = node.textNode.parentElement;
      if (textParentEl && getElementOverrides(cssSelectorFor(textParentEl))[node.textProp]) {
        textLine.classList.add('tn-overridden');
      }
      var textEditIcon = document.createElement('span');
      textEditIcon.className = 'tn-edit';
      textEditIcon.textContent = '✏️';
      textEditIcon.title = tr('editContent');
      textEditIcon.addEventListener('click', function (e) {
        e.stopPropagation();
        startInlineEdit(textSpan, node.text, function (newValue) {
          var parentEl = node.textNode.parentElement;
          if (!parentEl) return;
          setElementOverride(parentEl, cssSelectorFor(parentEl), node.textProp, newValue);
          updateOverrideIndicator();
          if (currentTreeRootEl) treeResetBtn.style.display = '';
          textSpan.textContent = newValue.length > 140 ? newValue.slice(0, 140) + '…' : newValue;
          textLine.classList.add('tn-overridden');
          node.text = newValue; // mismo motivo que "a.value" en clases: si no, copiar sigue trayendo el texto original
        }, 'tn-edit-input', undefined, treeModal);
      });
      textLine.appendChild(textEditIcon);
      container.appendChild(wrapTreeRow(textLine, null));
      // Los nodos de texto no tienen ojito propio (no son un elemento que
      // se pueda ocultar por sí solo), pero si su elemento padre queda
      // efectivamente oculto, esta fila también se tiene que atenuar —
      // participa igual del refresco global.
      if (textParentEl) {
        allRefreshEyeIcons.push(function () {
          textLine.classList.toggle('tn-node-hidden', isEffectivelyHidden(textParentEl));
        });
        textLine.classList.toggle('tn-node-hidden', isEffectivelyHidden(textParentEl));
      }
      return;
    }
    var hasChildren = node.children.length > 0;
    var isVoid = !!VOID_TAGS[node.tag];
    var wrapper = document.createElement('div');
    var line = document.createElement('div');
    line.className = 'tn-line';
    line.style.paddingLeft = (depth * 14) + 'px';

    var eyeIcon = document.createElement('span');
    eyeIcon.className = 'tn-eye';
    // closeLine (la fila de la etiqueta de cierre, </tag>) todavía no
    // existe acá — solo se crea más abajo si el nodo tiene hijos. Se
    // declara ahora para que refreshEyeIcon ya pueda referenciarla (una vez
    // asignada), y se re-llama a refreshEyeIcon() después de crearla para
    // que arranque en el estado correcto.
    var closeLine = null;
    // Clic en el ojito: ocultar/mostrar el elemento real de la página (ver
    // toggleElementHidden — es un override de display:none más, mismo
    // sistema que el resto de Vista previa de estilos). La fila del árbol
    // NO desaparece cuando está oculto — se atenúa (.tn-node-hidden) para
    // poder encontrarla y volver a mostrarla. El ícono cambia a ojo tachado.
    // Se atenúa TAMBIÉN closeLine (la fila "</tag>") si existe — si no, el
    // bloque quedaba con la apertura atenuada pero el cierre normal, un
    // efecto a medias que no comunicaba bien "esto entero está oculto".
    function refreshEyeIcon() {
      // Efectivo (propio O de un ancestro) para decidir qué se VE — así un
      // hijo de un elemento oculto se muestra igual de atenuado y con el
      // ojo tachado, aunque el override real siga siendo solo del padre.
      var hidden = isEffectivelyHidden(node.el);
      eyeIcon.innerHTML = hidden ? EYE_CLOSED_SVG : EYE_OPEN_SVG;
      eyeIcon.title = hidden ? tr('showElement') : tr('hideElement');
      line.classList.toggle('tn-node-hidden', hidden);
      if (closeLine) closeLine.classList.toggle('tn-node-hidden', hidden);
    }
    refreshEyeIcon();
    // Para que ocultar/mostrar ESTE nodo también actualice a todos sus
    // descendientes ya renderizados (ver el click de más abajo) — cada fila
    // se registra acá al crearse; allRefreshEyeIcons se reinicia en cada
    // openTreeModal.
    allRefreshEyeIcons.push(refreshEyeIcon);
    eyeIcon.addEventListener('click', function (e) {
      e.stopPropagation();
      toggleElementHidden(node.el);
      // TODAS las filas, no solo esta — si lo que cambió tiene
      // descendientes ya renderizados, también tienen que atenuarse/
      // destacharse (ver isEffectivelyHidden).
      allRefreshEyeIcons.forEach(function (fn) { fn(); });
      if (currentTreeRootEl) treeResetBtn.style.display = '';
    });

    // Botón aparte del ojito: señala el elemento en la página real (modal
    // translúcido + contorno rosa, mismo efecto que antes disparaba el
    // hover) SIN cerrar el árbol ni cambiar el elemento fijado — se
    // autorrestaura solo, ver flashElementInTree. Funciona igual con mouse
    // que con toque (es un click, no depende de hover).
    var locateIcon = document.createElement('span');
    locateIcon.className = 'tn-locate';
    locateIcon.innerHTML = LOCATE_SVG;
    locateIcon.title = tr('locateElement');
    locateIcon.addEventListener('click', function (e) {
      e.stopPropagation();
      flashElementInTree(node.el);
    });

    var caret = document.createElement('span');
    caret.className = 'tn-caret' + (hasChildren ? '' : ' leaf');
    caret.textContent = hasChildren ? '▾' : '';
    line.appendChild(caret);

    var openTag = document.createElement('span');
    openTag.appendChild(document.createTextNode('<'));
    var tagNameSpan = document.createElement('span');
    tagNameSpan.className = 'tn-tag';
    tagNameSpan.textContent = node.tag;
    openTag.appendChild(tagNameSpan);
    node.attrs.forEach(function (a) {
      openTag.appendChild(document.createTextNode(' '));
      var attrSpan = document.createElement('span');
      attrSpan.className = 'tn-attr';
      attrSpan.textContent = a.name;
      openTag.appendChild(attrSpan);
      openTag.appendChild(document.createTextNode('="'));
      var strSpan = document.createElement('span');
      strSpan.className = 'tn-str';
      strSpan.textContent = a.value;
      strSpan.title = a.name === 'class' ? tr('copyClassesTitle') : tr('copyValue');
      strSpan.addEventListener('click', function (e) {
        e.stopPropagation();
        copyText(a.value);
        strSpan.style.background = 'rgba(134,239,172,.4)';
        setTimeout(function () { strSpan.style.background = ''; }, 400);
      });
      openTag.appendChild(strSpan);
      openTag.appendChild(document.createTextNode('"'));
      if (a.name === 'class') {
        if (getElementOverrides(cssSelectorFor(node.el))['class']) line.classList.add('tn-overridden');
        var classEditIcon = document.createElement('span');
        classEditIcon.className = 'tn-edit';
        classEditIcon.textContent = '✏️';
        classEditIcon.title = tr('editClasses');
        classEditIcon.addEventListener('click', function (e) {
          e.stopPropagation();
          startInlineEdit(strSpan, a.value, function (newValue) {
            setElementOverride(node.el, cssSelectorFor(node.el), 'class', newValue);
            applyUnknownClassesLive(node.el, newValue);
            updateOverrideIndicator();
            if (currentTreeRootEl) treeResetBtn.style.display = '';
            strSpan.textContent = newValue;
            line.classList.add('tn-overridden');
            // Sin esto, copiar el nodo (📋 de la línea o "Copiar todo")
            // seguía trayendo la clase ORIGINAL — el copiado lee de
            // node.attrs, no del span en pantalla.
            a.value = newValue;
          }, 'tn-edit-input', { options: collectPageClassTokens(), multiToken: true }, treeModal);
        });
        openTag.appendChild(classEditIcon);
      }
    });
    if (isVoid) {
      openTag.appendChild(document.createTextNode(' />'));
    } else {
      openTag.appendChild(document.createTextNode('>'));
      if (!hasChildren) {
        var inlineClose = document.createElement('span');
        inlineClose.className = 'tn-tag';
        inlineClose.textContent = '</' + node.tag + '>';
        openTag.appendChild(inlineClose);
      }
    }
    line.appendChild(openTag);

    var copyIcon = document.createElement('span');
    copyIcon.className = 'tn-copy';
    copyIcon.textContent = '📋';
    copyIcon.title = tr('copyHtml');
    copyIcon.addEventListener('click', function (e) {
      e.stopPropagation();
      copyText(serializeTreeNode(node, 0));
      copyIcon.textContent = '✅';
      setTimeout(function () { copyIcon.textContent = '📋'; }, 1000);
    });
    line.appendChild(copyIcon);

    line.addEventListener('click', function () {
      closeTreeModal();
      pin(node.el);
      highlightElementBriefly(node.el);
    });
    var eyeIcons = document.createDocumentFragment();
    eyeIcons.appendChild(eyeIcon);
    eyeIcons.appendChild(locateIcon);
    wrapper.appendChild(wrapTreeRow(line, eyeIcons));

    if (hasChildren) {
      var childrenWrap = document.createElement('div');
      childrenWrap.className = 'tn-children';
      node.children.forEach(function (child) { renderTreeNode(child, childrenWrap, depth + 1); });
      wrapper.appendChild(childrenWrap);
      caret.addEventListener('click', function (e) {
        e.stopPropagation();
        var collapsed = childrenWrap.classList.toggle('collapsed');
        caret.textContent = collapsed ? '▸' : '▾';
      });

      closeLine = document.createElement('div');
      closeLine.className = 'tn-line';
      closeLine.style.paddingLeft = (depth * 14) + 'px';
      var closeCaretSpacer = document.createElement('span');
      closeCaretSpacer.className = 'tn-caret leaf';
      var closeTagSpan = document.createElement('span');
      closeTagSpan.className = 'tn-tag';
      closeTagSpan.textContent = '</' + node.tag + '>';
      refreshEyeIcon(); // closeLine recién ahora existe: sincroniza su estado inicial
      closeLine.appendChild(closeCaretSpacer);
      closeLine.appendChild(closeTagSpan);
      wrapper.appendChild(wrapTreeRow(closeLine, null));
    }

    container.appendChild(wrapper);
  }

  var currentTreeRootEl = null;
  // Se reinicia en cada apertura del árbol — ver refreshEyeIcon/allRefreshEyeIcons.
  var allRefreshEyeIcons = [];
  function openTreeModal(rootEl) {
    currentTreeRootEl = rootEl;
    var result = buildTreeData(rootEl);
    currentTreeData = result.data;
    treeSearchInput.value = '';
    treeTitleText.textContent = labelFor(rootEl);
    treeBody.innerHTML = '';
    allRefreshEyeIcons = [];
    if (currentTreeData) renderTreeNode(currentTreeData, treeBody, 0);
    if (result.truncated) {
      var hint = document.createElement('div');
      hint.className = 'tree-hint';
      hint.textContent = tr('treeTruncatedPrefix') + TREE_MAX_NODES + tr('treeTruncatedSuffix');
      treeBody.appendChild(hint);
    }
    var rootOverrideCount = Object.keys(getElementOverrides(cssSelectorFor(rootEl))).length;
    treeResetBtn.style.display = rootOverrideCount ? '' : 'none';
    treeHost.style.display = 'block';
  }
  // También disponible con la tecla R mientras el popup está abierto (ver
  // onShortcutKeydown) — ahí R significa "restablecer este elemento" en vez
  // de "restablecer toda la página", que es lo que hace en el resto de la
  // herramienta.
  function resetTreeRootElement() {
    if (!currentTreeRootEl) return;
    clearElementOverrides(currentTreeRootEl, cssSelectorFor(currentTreeRootEl));
    updateOverrideIndicator();
    openTreeModal(currentTreeRootEl);
  }
  treeResetBtn.addEventListener('click', resetTreeRootElement);

  treeExpandBtn.addEventListener('click', function () {
    treeBody.querySelectorAll('.tn-children.collapsed').forEach(function (c) { c.classList.remove('collapsed'); });
    treeBody.querySelectorAll('.tn-caret:not(.leaf)').forEach(function (c) { c.textContent = '▾'; });
  });
  treeCollapseBtn.addEventListener('click', function () {
    treeBody.querySelectorAll('.tn-children').forEach(function (c) { c.classList.add('collapsed'); });
    treeBody.querySelectorAll('.tn-caret:not(.leaf)').forEach(function (c) { c.textContent = '▸'; });
  });
  treeCopyAllBtn.addEventListener('click', function () {
    if (!currentTreeData) return;
    copyText(serializeTreeNode(currentTreeData, 0));
    var original = treeCopyAllBtn.textContent;
    treeCopyAllBtn.textContent = tr('treeCopyAllDone');
    setTimeout(function () { treeCopyAllBtn.textContent = original; }, 1200);
  });
  // Buscar fuerza expandir todo (para que ningún match quede oculto detrás
  // de una rama colapsada) y atenúa/resalta según coincida el texto de la
  // línea completa (etiqueta, atributos o texto).
  treeSearchInput.addEventListener('input', function () {
    var q = treeSearchInput.value.trim().toLowerCase();
    var allLines = treeBody.querySelectorAll('.tn-line');
    if (!q) {
      allLines.forEach(function (l) { l.classList.remove('tn-dim', 'tn-match'); });
      return;
    }
    treeBody.querySelectorAll('.tn-children.collapsed').forEach(function (c) { c.classList.remove('collapsed'); });
    treeBody.querySelectorAll('.tn-caret:not(.leaf)').forEach(function (c) { c.textContent = '▾'; });
    allLines.forEach(function (line) {
      var isMatch = line.textContent.toLowerCase().indexOf(q) !== -1;
      line.classList.toggle('tn-match', isMatch);
      line.classList.toggle('tn-dim', !isMatch);
    });
  });
  // Enter saca el foco (mismo motivo que el buscador de propiedades): si
  // no, los atajos de una letra se quedan escribiendo acá adentro.
  treeSearchInput.addEventListener('keydown', function (e) {
    if (e.key === 'Enter') { e.preventDefault(); treeSearchInput.blur(); }
  });

  var wrap = document.createElement('div');
  // Panel (340px) y pastilla (ancho variable, según sus íconos) comparten el
  // borde DERECHO (align-items:flex-end), no se centran entre sí — el panel,
  // al ser más ancho, se extiende hacia la izquierda mientras la pastilla
  // queda siempre pegada al mismo borde derecho de la pantalla.
  wrap.style.cssText = 'position:relative;display:flex;flex-direction:row;align-items:flex-end;';
  var pill = document.createElement('div');
  pill.className = 'pill';
  var pillLabel = document.createElement('span');
  pillLabel.className = 'pill-label';
  pillLabel.textContent = '☰';
  pillLabel.title = tr('openClose');
  addHotkeyBadge(pillLabel, 'ESP');
  // Orden visual pedido (de arriba hacia abajo): el menú primero, luego
  // accesos rápidos, Restablecer/Copiar CSS globales, y al final ocultar —
  // ver los demás `style.order` de la píldora más abajo. `order` (no
  // reordenar el DOM real) porque cada botón se arma en un punto distinto
  // del código, más fácil de mantener así que moviendo bloques enteros.
  pillLabel.style.order = '0';
  pill.appendChild(pillLabel);
  // Indicador + reset global de "Vista previa de estilos" (ver más abajo,
  // junto a countAllOverrides/clearAllOverrides): solo visible cuando hay
  // al menos un estilo cambiado en algún elemento de la página, sin
  // importar cuál esté fijado ahora. Vive en la píldora (no en el panel)
  // para que se vea incluso minimizada.
  var pillResetAllBtn = document.createElement('button');
  pillResetAllBtn.className = 'pill-reset-all';
  pillResetAllBtn.title = tr('resetAll');
  // Icono arriba, número debajo: así el botón se muestra en forma de
  // pila compacta y legible incluso con poco ancho.
  var pillResetAllIcon = document.createElement('span');
  pillResetAllIcon.className = 'reset-icon';
  pillResetAllIcon.textContent = '↺';
  var pillResetAllCount = document.createElement('span');
  pillResetAllCount.className = 'reset-count';
  pillResetAllCount.textContent = '0';
  pillResetAllBtn.appendChild(pillResetAllIcon);
  pillResetAllBtn.appendChild(pillResetAllCount);
  pillResetAllBtn.style.order = '2';
  pill.appendChild(pillResetAllBtn);
  addHotkeyBadge(pillResetAllBtn, 'R');
  pillResetAllBtn.addEventListener('click', function (e) {
    e.stopPropagation();
    resetAllStylesShortcut();
  });
  // Copia el CSS real (selector + propiedades) de TODOS los elementos
  // cambiados en la página — mismo criterio de visibilidad que el reset
  // global (solo aparece si hay algo). El feedback ✅/⚠️ reemplaza el ícono
  // y se restaura solo (ver flashButtonFeedback).
  var pillCopyCssBtn = document.createElement('button');
  pillCopyCssBtn.className = 'pill-reset-all';
  pillCopyCssBtn.title = tr('copyCssShortcut');
  // Span aparte para el ícono — igual que pillResetAllLabel: si no, el
  // flash ✅/⚠️ (que pisa el innerHTML) borraría el badge de abajo.
  var pillCopyCssLabel = document.createElement('span');
  pillCopyCssLabel.textContent = '📄';
  pillCopyCssBtn.appendChild(pillCopyCssLabel);
  pillCopyCssBtn.style.order = '3';
  pill.appendChild(pillCopyCssBtn);
  addHotkeyBadge(pillCopyCssBtn, 'G');
  pillCopyCssBtn.addEventListener('click', function (e) {
    e.stopPropagation();
    copyAllModifiedCss(pillCopyCssLabel, '📄');
  });
  // Accesos directos solo-ícono, visibles también con el panel minimizado
  // (antes, minimizado no mostraba nada más que el texto). Se arman más
  // abajo, una vez que las funciones que ejecutan (goPrevSibling, doCapture,
  // etc.) ya están definidas — el orden de declaración no importa acá porque
  // son "function" hoisteadas, pero el armado del DOM sí necesita ese punto.
  var pillIcons = document.createElement('div');
  pillIcons.style.cssText = 'display:flex;flex-direction:column;gap:4px;order:1;align-items:center';
  // Cada ícono individual ya hace stopPropagation() en su propio listener,
  // pero el HUECO/fondo entre íconos es del propio pillIcons — sin este
  // listener, un clic ahí (sin tocar ningún botón) burbujeaba hasta el
  // listener de pill (abre/cierra el panel vía toggleBarPanel), como si se
  // hubiese clickeado la pastilla. Confirmado con clics reales en las
  // franjas vacías entre íconos: togglean el panel por error.
  pillIcons.addEventListener('click', function (e) { e.stopPropagation(); });
  pill.appendChild(pillIcons);
  var bar = document.createElement('div');
  bar.className = 'bar';

  // "Inspección: ON/OFF" ya no se repite acá — vive solo como el ícono de
  // cursor de selección de la pastilla minimizada (toggleInspecting() la sigue manejando igual,
  // sin depender de ningún elemento del panel expandido).

  var pinnedInfo = document.createElement('div');
  pinnedInfo.className = 'pinned';
  pinnedInfo.textContent = tr('clickToInspect');

  var toolsRow = document.createElement('div');
  toolsRow.className = 'row';
  // Componente, Estilos, Layout y </> Estructura HTML no tienen botón acá:
  // Estilos/Layout/HTML ya están como accesos directos en la pastilla
  // minimizada (íconos S/L/V), y Componente es el estado por defecto cuando
  // ningún otro está activo, así que no necesita su propio botón.
  var tools = [
    { id: 'contrast', label: tr('contrastTab') },
    { id: 'a11y', label: tr('a11yTab') },
  ];
  var buttons = {};
  tools.forEach(function (t) {
    var b = document.createElement('button');
    b.className = 'tool';
    b.textContent = t.label;
    b.addEventListener('click', function () { selectTool(t.id); });
    toolsRow.appendChild(b);
    buttons[t.id] = b;
  });

  // Ayuda: no es una "vista" (no toca activeTool ni el panel) — abre un
  // modal aparte, grande, con la explicación de la herramienta.
  var helpBtn = document.createElement('button');
  helpBtn.className = 'tool';
  helpBtn.textContent = tr('helpBtnLabel');
  helpBtn.addEventListener('click', function () { openHelp(); });
  toolsRow.appendChild(helpBtn);

  var panel = document.createElement('div');
  panel.className = 'panel';
  panel.textContent = tr('selectElementToStart');

  // Acciones rápidas ya NO se repiten acá — viven solo en la pastilla
  // minimizada (fila de íconos), para no duplicar la misma acción en dos
  // lugares de la UI. Padre/Hijo/Hermanos solo por flechas del teclado.
  //
  // Íconos pequeños con el nombre en title (tooltip al hover) — el texto del
  // ícono, incluido el feedback (✅/⚠️/❌), reemplaza SOLO el ícono, nunca
  // pisa el title, así el tooltip sigue diciendo qué hace el botón.
  function flashButtonFeedback(btn, icon, revertIcon, ms) {
    var original = revertIcon != null ? revertIcon : btn.innerHTML;
    btn.innerHTML = icon;
    setTimeout(function () { btn.innerHTML = original; }, ms || 1300);
  }
  function makeIconButton(icon, title) {
    var b = document.createElement('button');
    b.className = 'tool-icon';
    b.textContent = icon;
    b.title = title;
    return b;
  }
  // Ícono "</>" (código): no existe como emoji confiable, así que va como
  // SVG inline (mismo patrón que el cursor de Inspección y el ícono de
  // mover) — dos ángulos + una barra diagonal, el ícono de "código" más
  // reconocible en herramientas de programación.
  function svgCode(size, extraStyle) {
    return '<svg viewBox="0 0 24 24" width="' + size + '" height="' + size + '" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"' + (extraStyle ? ' style="' + extraStyle + '"' : '') + '><polyline points="8 6 2 12 8 18"/><polyline points="16 6 22 12 16 18"/><line x1="14" y1="4" x2="10" y2="20"/></svg>';
  }
  // Badge chico con la letra del atajo, oculto salvo con Shift apretado (ver
  // .show-hotkeys más abajo). btn necesita position:relative para anclarlo.
  function addHotkeyBadge(btn, letter) {
    var badge = document.createElement('span');
    badge.className = 'hotkey-badge';
    badge.textContent = letter;
    btn.style.position = 'relative';
    btn.appendChild(badge);
  }

  function doCopyClasses(btn) {
    if (!pinnedEl) { flashButtonFeedback(btn, '⚠️'); return; }
    var classes = (pinnedEl.className && typeof pinnedEl.className === 'string') ? pinnedEl.className.trim() : '';
    if (!classes) { flashButtonFeedback(btn, '⚠️'); return; }
    copyText(classes);
    flashButtonFeedback(btn, '✅');
  }
  function doCopyComponent(btn) {
    if (!pinnedEl) { flashButtonFeedback(btn, '⚠️'); return; }
    var section = pinnedEl.closest('section,article,header,footer,aside,main,nav') || pinnedEl;
    var rootClass = (section.className && typeof section.className === 'string' && section.className.trim())
      ? section.className.trim().split(/\s+/)[0] : '';
    if (!rootClass) { flashButtonFeedback(btn, '⚠️'); return; }
    copyText(rootClass);
    flashButtonFeedback(btn, '✅');
  }

  // Fila de accesos directos de la pastilla minimizada: Inspección, Layout,
  // Estilos y las 3 acciones rápidas — todo en un solo contenedor junto al
  // texto "🛠️ Inspector". Clic en cualquiera de estos íconos ejecuta la
  // acción directo sobre la página (stopPropagation para no pisar el toggle
  // propio de la pastilla), SIN abrir el panel general — ese tiene su propio
  // estado (abierto/cerrado) y no debe alterarse por una acción rápida.
  // Ícono de Inspección: cursor de selección (marco + puntero), al estilo
  // del cursor de "seleccionar elemento" de los DevTools del navegador —
  // no existe como emoji confiable, así que va como SVG inline en vez de
  // textContent.
  var pillInspectBtn = document.createElement('button');
  pillInspectBtn.className = 'tool-icon';
  pillInspectBtn.title = tr('inspectToggle');
  pillInspectBtn.innerHTML = '<svg viewBox="0 0 40 40" width="19" height="19" fill="none" stroke="#fff" stroke-width="2.3" stroke-linecap="round" stroke-linejoin="round"><path d="M4 4h5M4 4v5M32 4h-5M32 4v5M4 32h5M4 32v-5M32 32h-5M32 32v-5M15 4h6M15 32h6M4 15v6M32 15v6"/><path d="M11 11l11.930 28.635 4.235-12.470 12.470-4.235L11 11z" fill="#fbbf24" stroke="#fbbf24" stroke-width="1.5"/></svg>';
  pillInspectBtn.classList.add('active'); // arranca en ON (inspectingActive default = true)
  var pillLayoutBtn = makeIconButton('📐', tr('shortcutLayout'));
  var pillStylesBtn = makeIconButton('🎨', tr('shortcutStyles'));
  var pillTreeBtn = document.createElement('button');
  pillTreeBtn.className = 'tool-icon';
  pillTreeBtn.title = tr('treeShortcutTitle');
  pillTreeBtn.innerHTML = svgCode(16);
  var pillCopyClassesBtn = makeIconButton('📋', tr('shortcutCopyClasses'));
  var pillCopyComponentBtn = makeIconButton('🏷️', tr('shortcutCopyComponent'));
  var pillCaptureBtn = makeIconButton('📸', tr('shortcutCapture'));
  var pillCloneBtn = makeIconButton('⧉', tr('shortcutClone'));
  addHotkeyBadge(pillInspectBtn, 'I');
  addHotkeyBadge(pillLayoutBtn, 'L');
  addHotkeyBadge(pillStylesBtn, 'S');
  addHotkeyBadge(pillTreeBtn, 'V');
  addHotkeyBadge(pillCopyClassesBtn, 'C');
  addHotkeyBadge(pillCopyComponentBtn, 'T');
  addHotkeyBadge(pillCaptureBtn, 'P');
  addHotkeyBadge(pillCloneBtn, 'D');

  function onPillIcon(btn, action) {
    btn.addEventListener('click', function (e) {
      e.stopPropagation();
      action();
    });
  }
  // Inspección, Layout y Estilos NO abren el panel — actúan directo sobre la
  // página/estado, sin necesidad de desplegar nada más. Layout/Estilos
  // además vuelven a Componente si se clickean estando ya activos.
  pillInspectBtn.addEventListener('click', function (e) {
    e.stopPropagation();
    toggleInspecting();
  });
  pillLayoutBtn.addEventListener('click', function (e) {
    e.stopPropagation();
    selectTool(activeTool === 'layout' ? 'component' : 'layout');
  });
  pillStylesBtn.addEventListener('click', function (e) {
    e.stopPropagation();
    selectTool(activeTool === 'styles' ? 'component' : 'styles');
  });
  onPillIcon(pillTreeBtn, function () {
    if (!pinnedEl) { flashButtonFeedback(pillTreeBtn, '⚠️'); return; }
    openTreeModal(pinnedEl);
  });
  onPillIcon(pillCopyClassesBtn, function () { doCopyClasses(pillCopyClassesBtn); });
  onPillIcon(pillCopyComponentBtn, function () { doCopyComponent(pillCopyComponentBtn); });
  onPillIcon(pillCaptureBtn, function () { if (pinnedEl) doCapture(pinnedEl, pillCaptureBtn); else flashButtonFeedback(pillCaptureBtn, '⚠️'); });
  onPillIcon(pillCloneBtn, function () { if (pinnedEl) addCloneForPinned(); else flashButtonFeedback(pillCloneBtn, '⚠️'); });

  // Orden visual pedido (de arriba hacia abajo, ya que pillIcons ahora es
  // columna): Clonar primero, Inspección al final — al revés del orden
  // original en fila. `order` en vez de reordenar el array: el resto del
  // código (onPillIcon, addHotkeyBadge...) sigue referenciando cada botón
  // por nombre, sin depender de en qué posición del array quedó.
  pillInspectBtn.style.order = '1';
  pillLayoutBtn.style.order = '2';
  pillStylesBtn.style.order = '3';
  pillTreeBtn.style.order = '4';
  pillCopyClassesBtn.style.order = '5';
  pillCopyComponentBtn.style.order = '6';
  pillCaptureBtn.style.order = '7';
  pillCloneBtn.style.order = '8';
  [pillInspectBtn, pillLayoutBtn, pillStylesBtn, pillTreeBtn, pillCopyClassesBtn, pillCopyComponentBtn, pillCaptureBtn, pillCloneBtn]
    .forEach(function (b) { pillIcons.appendChild(b); });

  // Flechita al final de la píldora (no es un ícono más de la fila, va afuera
  // de pillIcons): un affordance chico y discreto para ocultar la barra con
  // un clic, sin el estilo cuadrado de botón del resto — la contraparte del
  // botón redondo 🛠️ que aparece para volver a mostrarla.
  var hideArrowBtn = document.createElement('span');
  hideArrowBtn.title = tr('hideBar');
  // Mismo ícono de ojo abierto que usa el árbol HTML para ocultar/mostrar
  // elementos (EYE_OPEN_SVG) — consistente con esa otra función de ocultar.
  hideArrowBtn.innerHTML = EYE_OPEN_SVG;
  hideArrowBtn.querySelector('svg').setAttribute('width', '20');
  hideArrowBtn.querySelector('svg').setAttribute('height', '20');
  // margin-top (antes margin-left) aparte del gap:6px de .pill: el ícono
  // anterior (ahora arriba, el menú ☰) quedaba a solo 6px de esta flechita
  // — un clic apenas desviado colapsaba TODA la barra sin querer. Con este
  // margen extra el "colchón" real pasa a ~16px. `order` la deja siempre
  // último (ver los demás `style.order` de la píldora más arriba).
  hideArrowBtn.style.cssText = 'display:flex;align-items:center;justify-content:center;cursor:pointer;color:#6b7280;padding:0;margin-top:5px;user-select:none;order:5;position:relative;';
  addHotkeyBadge(hideArrowBtn, 'H');
  hideArrowBtn.addEventListener('mouseenter', function () { hideArrowBtn.style.color = '#e5e7eb'; });
  hideArrowBtn.addEventListener('mouseleave', function () { hideArrowBtn.style.color = '#6b7280'; });
  hideArrowBtn.addEventListener('click', function (e) { e.stopPropagation(); setBarHidden(true); });
  pill.appendChild(hideArrowBtn);

  var breakpointToggle = document.createElement('label');
  breakpointToggle.className = 'hint';
  breakpointToggle.style.cssText = 'display:flex;align-items:center;gap:6px;cursor:pointer;white-space:nowrap;flex-shrink:0;';
  var bpInput = document.createElement('input');
  bpInput.type = 'checkbox';
  var bpSwitch = document.createElement('span');
  bpSwitch.className = 'switch';
  bpSwitch.appendChild(bpInput);
  var bpSwitchTrack = document.createElement('span');
  bpSwitchTrack.className = 'switch-track';
  bpSwitch.appendChild(bpSwitchTrack);
  breakpointToggle.appendChild(bpSwitch);
  var breakpointToggleTextNode = document.createTextNode(tr('showBreakpointLabel'));
  breakpointToggle.appendChild(breakpointToggleTextNode);
  // Botón aparte del <label> (no es el checkbox): abre el modal de
  // configuración Auto/Manual (ver openBpConfig, junto a updateBadge).
  var bpConfigBtn = document.createElement('button');
  bpConfigBtn.textContent = '⚙️';
  bpConfigBtn.title = tr('bpConfigure');
  bpConfigBtn.style.cssText = 'background:#1f2937;border:1px solid #374151;border-radius:6px;color:#e5e7eb;width:22px;height:22px;font-size:11px;cursor:pointer;line-height:1;padding:0;flex-shrink:0;';
  bpConfigBtn.addEventListener('click', function (e) { e.stopPropagation(); openBpConfig(); });
  breakpointToggle.appendChild(bpConfigBtn);

  // Modo TWCSS: cambia qué copian el 📋 de cada fila y el 📄/G de "CSS
  // modificado" — clases de Tailwind en vez de CSS plano (ver
  // valueToTailwindClass/propsToCssBlock más abajo).
  var twcssToggle = document.createElement('label');
  twcssToggle.className = 'hint';
  twcssToggle.style.cssText = 'display:flex;align-items:center;gap:6px;cursor:pointer;white-space:nowrap;flex-shrink:0;';
  var twcssInput = document.createElement('input');
  twcssInput.type = 'checkbox';
  var twcssSwitch = document.createElement('span');
  twcssSwitch.className = 'switch';
  twcssSwitch.appendChild(twcssInput);
  var twcssSwitchTrack = document.createElement('span');
  twcssSwitchTrack.className = 'switch-track';
  twcssSwitch.appendChild(twcssSwitchTrack);
  twcssToggle.appendChild(twcssSwitch);
  var twcssToggleTextNode = document.createTextNode(tr('twcssModeLabel'));
  twcssToggle.appendChild(twcssToggleTextNode);

  // Switches de la vista Layout (Display/Position/Delineado, ver
  // layoutShowDisplay/Position/Outline más arriba): misma estructura que
  // bp/twcssToggle de arriba, factorizada en un helper porque acá son 3
  // casi idénticos en vez de 2. Viven adentro del panel de Layout (ver
  // renderLayout), no en togglesRow — son específicos de esa vista, no
  // tiene sentido mostrarlos en Estilos/Componente/A11y.
  function makeMiniToggle(labelKey) {
    var toggle = document.createElement('label');
    toggle.className = 'hint';
    toggle.style.cssText = 'display:flex;align-items:center;gap:6px;cursor:pointer;white-space:nowrap;flex-shrink:0;';
    var input = document.createElement('input');
    input.type = 'checkbox';
    input.checked = true;
    var sw = document.createElement('span');
    sw.className = 'switch';
    sw.appendChild(input);
    var track = document.createElement('span');
    track.className = 'switch-track';
    sw.appendChild(track);
    toggle.appendChild(sw);
    var textNode = document.createTextNode(tr(labelKey));
    toggle.appendChild(textNode);
    return { toggle: toggle, input: input, textNode: textNode };
  }
  var layoutDisplayToggle = makeMiniToggle('layoutShowDisplayLabel');
  var layoutPositionToggle = makeMiniToggle('layoutShowPositionLabel');
  var layoutOutlineToggle = makeMiniToggle('layoutShowOutlineLabel');
  var layoutDisplayInput = layoutDisplayToggle.input;
  var layoutPositionInput = layoutPositionToggle.input;
  var layoutOutlineInput = layoutOutlineToggle.input;
  var layoutViewRow = document.createElement('div');
  layoutViewRow.style.cssText = 'display:flex;align-items:center;justify-content:space-between;gap:10px;flex-wrap:wrap;padding-bottom:8px;margin-bottom:8px;border-bottom:1px solid #1f2937;';
  layoutViewRow.appendChild(layoutDisplayToggle.toggle);
  layoutViewRow.appendChild(layoutPositionToggle.toggle);
  layoutViewRow.appendChild(layoutOutlineToggle.toggle);
  function onLayoutViewToggle(e) {
    // Al menos uno de los 3 tiene que quedar activo. Delineado es el único
    // que directamente NO se puede apagar si es el último — se revierte
    // solo. Display y Position en cambio SÍ se dejan apagar aunque sea el
    // último de los dos: el otro se prende automáticamente para tomar la
    // posta (se "turnan"), en vez de revertir la acción del usuario.
    if (!layoutDisplayInput.checked && !layoutPositionInput.checked && !layoutOutlineInput.checked) {
      if (e.target === layoutOutlineInput) {
        e.target.checked = true;
      } else if (e.target === layoutDisplayInput) {
        layoutPositionInput.checked = true;
      } else {
        layoutDisplayInput.checked = true;
      }
    }
    layoutShowDisplay = layoutDisplayInput.checked;
    layoutShowPosition = layoutPositionInput.checked;
    layoutShowOutline = layoutOutlineInput.checked;
    saveState();
    if (activeTool === 'layout' && pinnedEl) refreshPanelKeepScroll();
  }
  layoutDisplayInput.addEventListener('change', onLayoutViewToggle);
  layoutPositionInput.addEventListener('change', onLayoutViewToggle);
  layoutOutlineInput.addEventListener('change', onLayoutViewToggle);

  // Selector de idioma ES/EN: dos botones chicos (no <select> nativo — mismo
  // motivo que el dropdown propio de dirección de breakpoints más abajo, un
  // <select> dentro de Shadow DOM a veces abre el popup de opciones en el
  // lugar equivocado). Detección automática al cargar (detectDefaultLang) +
  // elección manual persistida aparte (LANG_STORAGE_KEY); cambiarlo llama a
  // applyI18n(), que reescribe en vivo todo el texto ya renderizado sin
  // recargar la página.
  var langToggle = document.createElement('div');
  langToggle.className = 'lang-toggle';
  langToggle.title = tr('langLabel');
  var langEsBtn = document.createElement('button');
  langEsBtn.type = 'button';
  langEsBtn.className = 'lang-btn';
  langEsBtn.textContent = 'ES';
  var langEnBtn = document.createElement('button');
  langEnBtn.type = 'button';
  langEnBtn.className = 'lang-btn';
  langEnBtn.textContent = 'EN';
  function syncLangButtons() {
    langEsBtn.classList.toggle('active', currentLang === 'es');
    langEnBtn.classList.toggle('active', currentLang === 'en');
  }
  syncLangButtons();
  function setLang(lang) {
    if (lang === currentLang) return;
    currentLang = lang;
    try { localStorage.setItem(LANG_STORAGE_KEY, lang); } catch (e) {}
    syncLangButtons();
    applyI18n();
  }
  langEsBtn.addEventListener('click', function (e) { e.stopPropagation(); setLang('es'); });
  langEnBtn.addEventListener('click', function (e) { e.stopPropagation(); setLang('en'); });
  langToggle.appendChild(langEsBtn);
  langToggle.appendChild(langEnBtn);

  // Reescribe en vivo todo el texto ya renderizado al cambiar de idioma —
  // sin recargar la página. Los popups (Ayuda/breakpoints/árbol HTML) solo
  // se refrescan si están abiertos en este momento; si no, ya van a salir
  // en el idioma correcto la próxima vez que se abran (sus renderers llaman
  // a tr()/getHelpContentHTML() al momento de abrir, no antes). Los atajos
  // de teclado (I/L/S/V/C/T/P/H/R/G/F) quedan siempre iguales a propósito,
  // no se remapean por idioma (decisión explícita: no romper la memoria
  // muscular de un uso diario).
  function applyI18n() {
    breakpointToggleTextNode.textContent = tr('showBreakpointLabel');
    twcssToggleTextNode.textContent = tr('twcssModeLabel');
    layoutDisplayToggle.textNode.textContent = tr('layoutShowDisplayLabel');
    layoutPositionToggle.textNode.textContent = tr('layoutShowPositionLabel');
    layoutOutlineToggle.textNode.textContent = tr('layoutShowOutlineLabel');
    langToggle.title = tr('langLabel');
    bpConfigBtn.title = tr('bpConfigure');
    pillLabel.title = tr('openClose');
    pillResetAllBtn.title = tr('resetAll');
    pillCopyCssBtn.title = tr('copyCssShortcut');
    pillInspectBtn.title = tr('inspectToggle');
    pillLayoutBtn.title = tr('shortcutLayout');
    pillStylesBtn.title = tr('shortcutStyles');
    pillTreeBtn.title = tr('treeShortcutTitle');
    pillCopyClassesBtn.title = tr('shortcutCopyClasses');
    pillCopyComponentBtn.title = tr('shortcutCopyComponent');
    pillCaptureBtn.title = tr('shortcutCapture');
    hideArrowBtn.title = tr('hideBar');
    restoreBtn.title = tr('showBar');
    helpBtn.textContent = tr('helpBtnLabel');
    if (buttons.contrast) buttons.contrast.textContent = tr('contrastTab');
    if (buttons.a11y) buttons.a11y.textContent = tr('a11yTab');
    helpCloseBtn.title = tr('close');
    treeCloseBtn.title = tr('close');
    treeSearchInput.placeholder = tr('treeSearchPlaceholder');
    treeExpandBtn.textContent = tr('treeExpandAll');
    treeCollapseBtn.textContent = tr('treeCollapseAll');
    treeCopyAllBtn.textContent = tr('treeCopyAll');
    treeResetBtn.textContent = tr('treeResetElement');
    bpTitle.textContent = tr('bpTitle');
    bpCloseBtn.title = tr('close');
    if (helpHost.style.display === 'block') {
      helpContent.innerHTML = getHelpContentHTML();
      helpContent.appendChild(buildCreditsSection());
    }
    if (bpHost.style.display === 'block') renderBpModal();
    if (treeHost.style.display === 'block' && currentTreeRootEl) openTreeModal(currentTreeRootEl);
    if (pinnedEl) {
      pinnedInfo.textContent = '📌 ' + labelFor(pinnedEl);
    } else {
      pinnedInfo.textContent = tr('clickToInspect');
    }
    if (activeTool === 'a11y') { runA11yScan(); }
    else if (pinnedEl) { renderActiveTool(); }
    else { panel.textContent = tr('selectElementToStart'); }
  }

  var togglesRow = document.createElement('div');
  togglesRow.style.cssText = 'display:flex;align-items:center;justify-content:space-between;gap:8px;flex-wrap:nowrap;';
  togglesRow.appendChild(breakpointToggle);
  togglesRow.appendChild(twcssToggle);
  togglesRow.appendChild(langToggle);

  bar.appendChild(pinnedInfo);
  bar.appendChild(toolsRow);
  bar.appendChild(panel);
  bar.appendChild(togglesRow);
  wrap.appendChild(bar);
  // "Slot" con alto mínimo fijo (48px — la pastilla mide ~45px de alto real
  // en una fila de íconos, unos px de margen de sobra a propósito) que
  // contiene tanto la pastilla como el botón redondo de restaurar (ver más
  // abajo) — nunca al mismo tiempo, uno de los dos siempre está en
  // display:none. Sin este alto fijo, ocultar la pastilla y mostrar el
  // botón redondo (restoreBtn, 40px) en su lugar cambiaba el alto total de
  // wrap, y como el host está anclado por abajo (bottom fijo), ese cambio
  // de alto se traducía en un salto visible del panel (que vive arriba, en
  // el mismo wrap) cada vez que se ocultaba/mostraba la barra con H.
  var pillSlot = document.createElement('div');
  pillSlot.style.cssText = 'display:flex;align-items:center;justify-content:center;';
  pillSlot.appendChild(pill);
  wrap.appendChild(pillSlot);
  root.appendChild(wrap);

  // Ocultar barra (H de "Hidden"): con Inspección activa esconde solo la
  // pastilla (el panel general, si estaba abierto, sigue visible — ver
  // setBarHidden); sin Inspección activa esconde pastilla+panel de un
  // saque. Mientras está oculta la pastilla no queda ningún rastro
  // clickeable de ella salvo este botón redondo mínimo, que reaparece en
  // el mismo lugar para restaurarla con un clic (o Shift+H).
  var restoreBtn = document.createElement('button');
  restoreBtn.className = 'restore-btn';
  restoreBtn.title = tr('showBar');
  restoreBtn.textContent = '🛠️';
  // border y box-shadow viven en .restore-btn (ver <style>), no acá: así la
  // variante .has-overrides puede pisarlos sin pelear con un inline style.
  // Va DENTRO de pillSlot (mismo padre que pill, ver más arriba) — comparte
  // su alto mínimo fijo de 44px en vez de agregarse como hermano suelto,
  // que es lo que causaba el salto de posición del panel al ocultar/mostrar.
  restoreBtn.style.cssText = 'display:none;align-items:center;justify-content:center;width:40px;height:40px;border-radius:999px;background:#111827;color:#fff;cursor:pointer;font-size:18px;padding:0;margin-right:7px;';
  pillSlot.appendChild(restoreBtn);
  var barHidden = false;
  function setBarHidden(hidden) {
    barHidden = hidden;
    // wrap SIEMPRE visible en modo oculto — restoreBtn vive adentro (vía
    // pillSlot) y tiene que quedar como único rastro clickeable para
    // restaurar. Antes wrap.style.display pasaba a 'none' sin Inspección
    // activa y se llevaba a restoreBtn con él, dejando la herramienta sin
    // ninguna forma de volver a mostrarse con un clic.
    wrap.style.display = 'flex';
    pill.style.display = hidden ? 'none' : '';
    // Con Inspección activa, ocultar NO esconde el panel general — solo la
    // pastilla, para poder seguir viendo el panel mientras se inspecciona.
    // Sin Inspección activa, oculta pastilla+panel de un saque (por eso se
    // fuerza display:none en bar; se limpia el inline al no estar oculto
    // para que bar.open siga mandando normalmente vía CSS).
    bar.style.display = (hidden && !inspectingActive) ? 'none' : '';
    restoreBtn.style.display = hidden ? 'flex' : 'none';
    updatePillSlotAbsolute();
    updateHotkeyHintsVisibility();
    saveState();
  }
  function toggleBarHidden() { setBarHidden(!barHidden); }
  restoreBtn.addEventListener('click', function (e) { e.stopPropagation(); setBarHidden(false); });

  // Responsive: por debajo de 420px de ancho, la barra completa (con el
  // panel abierto) no entra sin tapar el contenido de la página — se
  // fuerza el modo oculto (mismo que Shift+H), pero sigue quedando
  // accesible igual que siempre vía el botón redondo 🛠️/H. No bloquea
  // volver a mostrarla manualmente, solo garantiza que arranque minimizada
  // en pantallas chicas (carga inicial y al rotar/resizear el viewport).
  var MOBILE_FORCE_HIDDEN_WIDTH = 420;
  function enforceMobileHidden() {
    if (window.innerWidth < MOBILE_FORCE_HIDDEN_WIDTH && !barHidden) setBarHidden(true);
  }
  window.addEventListener('resize', enforceMobileHidden);

  // pillSlot sale del flujo (deja de ocupar espacio en la fila junto al
  // panel) y se planta arriba a la derecha de wrap (que por eso tiene
  // position:relative) solo cuando se dan LAS DOS condiciones a la vez:
  // oculto (barHidden) Y menú REALMENTE visible. bar.classList.contains
  // ('open') no alcanza: sin Inspección activa, setBarHidden fuerza
  // bar.style.display='none' aunque la clase 'open' siga puesta — si acá
  // solo mirábamos la clase, wrap colapsaba a 0 de alto (bar sin espacio
  // real) y el top:17px de pillSlot terminaba calculado por debajo del
  // borde inferior de la pantalla, dejando el botón invisible.
  function updatePillSlotAbsolute() {
    var barVisible = bar.classList.contains('open') && bar.style.display !== 'none';
    pillSlot.style.cssText = (barHidden && barVisible)
      ? 'display:flex;align-items:center;justify-content:center;position:absolute;top:6px;right:4px;'
      : 'display:flex;align-items:center;justify-content:center;';
  }
  function toggleBarPanel() { bar.classList.toggle('open'); updatePillSlotAbsolute(); syncBarSpacing(); syncPillLabel(); saveState(); }
  // Antes este listener estaba en pill (todo el contenedor) — cualquier
  // clic en su fondo/padding, fuera de un botón puntual, burbujeaba hasta
  // acá y abría/cerraba el panel sin querer. Ahora solo el texto "🛠️
  // Inspector" abre/cierra — el resto del contenedor (padding, huecos)
  // no reacciona a nada.
  pillLabel.addEventListener('click', function (e) { e.stopPropagation(); toggleBarPanel(); });
  function syncPillLabel() { pillLabel.classList.toggle('active', bar.classList.contains('open')); }
  // Ya no hay popup de movimiento colgando arriba de la pastilla para el
  // que reservar espacio — queda como no-op, sin tocar los call sites.
  function syncBarSpacing() {
    bar.style.marginBottom = '';
  }

  // ---------------------------------------------------------------------
  // Overlays fuera del shadow root
  // ---------------------------------------------------------------------
  function makeOverlay(bg, borderCss) {
    var d = document.createElement('div');
    d.style.cssText = 'position:fixed;pointer-events:none;z-index:2147483640;box-sizing:border-box;display:none;';
    if (bg) d.style.background = bg;
    if (borderCss) d.style.border = borderCss;
    d.setAttribute('data-lens-sk-own', '1');
    document.documentElement.appendChild(d);
    return d;
  }
  var hoverOutline = makeOverlay(null, '2px solid #ec4899');
  var pinOutline = makeOverlay(null, '2px dashed #22c55e');
  // Colores sólidos (sin alpha en el rgba) — la transparencia se controla
  // aparte con el slider debajo del diagrama de espacios (ver
  // spacingOverlayOpacity/applySpacingOverlayOpacity), así un solo valor
  // controla los 4 overlays de una.
  var marginOverlay = makeOverlay('rgb(249,115,22)');
  var borderOverlay = makeOverlay('rgb(234,179,8)');
  var paddingOverlay = makeOverlay('rgb(34,197,94)');
  var contentOverlay = makeOverlay('rgb(59,130,246)');
  var spacingOverlayOpacity = 0.25; // default (tope del slider es 30%, ver makeSpacingOpacitySlider)
  var opacitySliderSaveTimer = null;
  function applySpacingOverlayOpacity() {
    [marginOverlay, borderOverlay, paddingOverlay, contentOverlay].forEach(function (o) { o.style.opacity = spacingOverlayOpacity; });
    // El relleno flex/grid del overlay de estructura (ver
    // renderStructureOverlay) se redibuja entero cada vez, no son nodos
    // persistentes a los que cambiarles opacity directo como los 4 de
    // arriba — así que si el slider se mueve estando en Layout, hay que
    // volver a dibujar para que el cambio también se vea al instante ahí.
    // Limpiar ANTES es clave: el slider dispara "input" muchísimas veces
    // mientras se arrastra, y sin esto cada disparo agregaba un juego
    // nuevo de bordes/etiquetas ENCIMA de los anteriores sin borrarlos
    // (rellenos acumulándose, cada vez más oscuros/sólidos).
    if (activeTool === 'layout' && pinnedEl && inspectingActive) {
      layoutOverlayRoot.innerHTML = '';
      renderStructureOverlay(pinnedEl);
    }
  }
  applySpacingOverlayOpacity();
  var layoutOverlayRoot = document.createElement('div');
  // z-index intermedio: por encima de pinOutline/hoverOutline/spacing
  // overlays (2147483640, así las etiquetas de estructura nunca quedan
  // tapadas por la línea del elemento fijado) pero SIEMPRE por debajo de
  // host/badge (2147483647, así el overlay nunca tapa la barra en sí).
  layoutOverlayRoot.style.cssText = 'position:fixed;top:0;left:0;pointer-events:none;z-index:2147483644;';
  layoutOverlayRoot.setAttribute('data-lens-sk-own', '1');
  document.documentElement.appendChild(layoutOverlayRoot);

  var badge = document.createElement('div');
  badge.style.cssText = 'position:fixed;top:0;right:0;padding:2px 8px;font-size:11px;font-weight:600;color:#fff;border-bottom-left-radius:8px;z-index:2147483647;pointer-events:none;display:none;font-family:ui-sans-serif,system-ui,sans-serif;';
  badge.setAttribute('data-lens-sk-own', '1');
  document.documentElement.appendChild(badge);

  // Marca visualmente TODOS los elementos con vista previa activa (no solo
  // el fijado) mientras Inspección está encendida — para ubicar cambios
  // sutiles (ej. un color muy parecido al original) sin ir clic por clic.
  // Se reconstruye entero en cada refresco: no hay que trackear altas/bajas
  // una por una, y el costo (un puñado de overrides como mucho) es mínimo.
  var modifiedMarkersRoot = document.createElement('div');
  modifiedMarkersRoot.style.cssText = 'position:fixed;top:0;left:0;pointer-events:none;z-index:2147483641;';
  modifiedMarkersRoot.setAttribute('data-lens-sk-own', '1');
  document.documentElement.appendChild(modifiedMarkersRoot);
  function refreshModifiedMarkers() {
    modifiedMarkersRoot.innerHTML = '';
    if (!inspectingActive) return;
    var store = getOverridesStore();
    var page = store[pageOverrideKey()];
    if (!page) return;
    Object.keys(page).forEach(function (selector) {
      var el = uniqueElementFor(selector);
      if (!el) return;
      var rect = el.getBoundingClientRect();
      var dot = document.createElement('div');
      dot.textContent = '✎';
      dot.title = tr('selectElement');
      // Mismo ícono que el banner "✎ Vista previa: N cambios" y mismo
      // efecto neón que .pill.has-overrides/.restore-btn.has-overrides:
      // anillo sólido + blur ámbar, para que todos los indicadores de "hay
      // cambios" del inspector compartan el mismo lenguaje visual. pointer-
      // events:auto pisa el "none" del contenedor (modifiedMarkersRoot es
      // puramente decorativo por default) solo para este punto — es un
      // botón real, no un overlay más.
      // Esquina superior-izquierda, mismo criterio que layPositionCornerLabel
      // ("toca la línea, crece hacia adentro"): queda DENTRO del elemento en
      // vez de centrado sobre el punto de la esquina, así nunca se sale del
      // viewport aunque el elemento esté pegado al borde de la pantalla.
      dot.style.cssText = 'position:absolute;top:' + rect.top + 'px;left:' + rect.left + 'px;width:16px;height:16px;line-height:16px;text-align:center;border-radius:999px;background:#f59e0b;color:#111827;font-size:9px;box-shadow:0 0 0 2px #111827,0 0 0 3px #f59e0b,0 0 8px 2px rgba(245,158,11,.65);pointer-events:auto;cursor:pointer;';
      dot.addEventListener('click', function (e) {
        e.stopPropagation();
        pin(el);
      });
      modifiedMarkersRoot.appendChild(dot);
    });
  }

  function hideOverlays() {
    [hoverOutline, marginOverlay, borderOverlay, paddingOverlay, contentOverlay].forEach(function (o) { o.style.display = 'none'; });
    layoutOverlayRoot.innerHTML = '';
  }
  function setRect(el, rect) {
    el.style.display = 'block';
    el.style.top = rect.top + 'px';
    el.style.left = rect.left + 'px';
    el.style.width = rect.width + 'px';
    el.style.height = rect.height + 'px';
  }

  // ---------------------------------------------------------------------
  // Helpers generales
  // ---------------------------------------------------------------------
  function px(v) { return parseFloat(v) || 0; }

  // Sube hasta <html> (o hasta el primer ancestro con id) en vez de cortar
  // a 5 niveles: con secciones repetidas (tarjetas, sliders) un tope corto
  // podía matchear OTRO elemento con la misma pinta y aplicarle el cambio
  // a él en vez de al que se editó — ver applyStoredOverrides.
  function cssSelectorFor(el) {
    if (el.id) return '#' + el.id;
    var parts = [];
    var node = el;
    while (node && node.nodeType === 1) {
      if (node.id) { parts.unshift('#' + node.id); break; }
      var part = node.tagName.toLowerCase();
      if (node.className && typeof node.className === 'string' && node.className.trim()) {
        // CSS.escape: clases utilitarias de Tailwind con fracciones (ej.
        // "basis-1/2", "w-1/3") tienen caracteres (/) inválidos en un
        // selector CSS sin escapar — sin esto, querySelectorAll tira
        // SyntaxError, uniqueElementFor lo atrapa como null en silencio, y
        // los indicadores de vista previa/clon nunca aparecían para
        // cualquier elemento con esa clase en algún ancestro.
        var cls = node.className.trim().split(/\s+/).slice(0, 2).map(function (c) { return CSS.escape(c); }).join('.');
        part += '.' + cls;
      }
      var parent = node.parentElement;
      if (parent) {
        var siblings = Array.prototype.filter.call(parent.children, function (s) { return s.tagName === node.tagName; });
        if (siblings.length > 1) part += ':nth-of-type(' + (siblings.indexOf(node) + 1) + ')';
      }
      parts.unshift(part);
      node = node.parentElement;
    }
    return parts.join(' > ');
  }

  // ---------------------------------------------------------------------
  // Vista previa de estilos: overrides guardados en localStorage, por
  // página (pathname) + selector del elemento. Cada prop guarda el valor
  // nuevo y el valor inline original (para poder restablecerlo tal cual
  // estaba, no solo borrarlo). No son estilos reales — viven solo en el
  // navegador de quien los edita, hasta que se restablecen o se limpia
  // el localStorage.
  // ---------------------------------------------------------------------
  function pageOverrideKey() { return location.pathname; }
  function getOverridesStore() {
    try {
      var raw = localStorage.getItem(OVERRIDE_STORAGE_KEY);
      return raw ? JSON.parse(raw) : {};
    } catch (e) { return {}; }
  }
  function setOverridesStore(store) {
    try { localStorage.setItem(OVERRIDE_STORAGE_KEY, JSON.stringify(store)); } catch (e) {}
  }
  // Resuelve un selector guardado a UN elemento, solo si matchea exactamente
  // uno — si matchea 0 o varios (selector ambiguo o markup que cambió desde
  // que se guardó el override) no toca nada, en vez de arriesgarse a
  // mutarle el estilo al elemento equivocado.
  function uniqueElementFor(selector) {
    try {
      var matches = document.querySelectorAll(selector);
      return matches.length === 1 ? matches[0] : null;
    } catch (e) { return null; }
  }
  function getElementOverrides(selector) {
    var store = getOverridesStore();
    var page = store[pageOverrideKey()];
    return (page && page[selector]) || {};
  }
  // "prop" no siempre es una propiedad CSS real: 'class' pisa el atributo
  // class completo, y 'text:N' pisa el N-ésimo nodo de texto directo del
  // elemento (ver textNodeIndex más abajo, usado por el editor de
  // clases/contenido del árbol de estructura). Todo lo demás se trata como
  // CSS de toda la vida.
  function applyOverrideValue(el, prop, value) {
    if (prop === 'class') { el.className = value; return; }
    if (prop.indexOf('text:') === 0) {
      var idx = parseInt(prop.slice(5), 10);
      var textNodes = Array.prototype.filter.call(el.childNodes, function (n) { return n.nodeType === 3; });
      if (textNodes[idx]) textNodes[idx].textContent = value;
      return;
    }
    el.style.setProperty(prop, value);
  }
  function readOriginalValue(el, prop) {
    if (prop === 'class') return el.className;
    if (prop.indexOf('text:') === 0) {
      var idx = parseInt(prop.slice(5), 10);
      var textNodes = Array.prototype.filter.call(el.childNodes, function (n) { return n.nodeType === 3; });
      return textNodes[idx] ? textNodes[idx].textContent : '';
    }
    return el.style.getPropertyValue(prop);
  }
  function setElementOverride(el, selector, prop, value) {
    var store = getOverridesStore();
    var page = store[pageOverrideKey()] || (store[pageOverrideKey()] = {});
    var entry = page[selector] || (page[selector] = {});
    var original = entry[prop] ? entry[prop].original : readOriginalValue(el, prop);
    entry[prop] = { value: value, original: original };
    setOverridesStore(store);
    applyOverrideValue(el, prop, value);
  }
  function clearElementOverrides(el, selector) {
    var store = getOverridesStore();
    var page = store[pageOverrideKey()];
    var entry = page && page[selector];
    if (!entry) return;
    Object.keys(entry).forEach(function (prop) {
      var original = entry[prop].original;
      if (prop === 'class' || prop.indexOf('text:') === 0) applyOverrideValue(el, prop, original);
      else if (original) el.style.setProperty(prop, original);
      else el.style.removeProperty(prop);
    });
    delete page[selector];
    setOverridesStore(store);
  }
  // Como clearElementOverrides, pero para UNA sola propiedad — usado por
  // Ocultar/mostrar (ver más abajo) para no pisar otros overrides que ese
  // mismo elemento pueda tener (ej. un margin editado a mano): mostrar de
  // nuevo un elemento oculto no debería borrar sus demás cambios.
  function clearSingleOverride(el, selector, prop) {
    var store = getOverridesStore();
    var page = store[pageOverrideKey()];
    var entry = page && page[selector];
    if (!entry || !entry[prop]) return;
    var original = entry[prop].original;
    if (original) el.style.setProperty(prop, original);
    else el.style.removeProperty(prop);
    delete entry[prop];
    if (!Object.keys(entry).length) delete page[selector];
    setOverridesStore(store);
  }
  // ---------------------------------------------------------------------
  // Ocultar / mostrar (ojito del árbol HTML): un override de "display:none"
  // más, ni más ni menos — reusa TODA la plomería de Vista previa de
  // estilos que ya existe (guardado, aplicado al cargar la página,
  // contador de cambios, reset) sin agregar ningún mecanismo nuevo. Se
  // guarda/lee como override real, no como una bandera aparte, para que
  // "¿está oculto?" siempre refleje el estado de verdad (localStorage), no
  // una copia que se pueda desincronizar.
  // ---------------------------------------------------------------------
  function isHiddenOverride(el) {
    var ov = getElementOverrides(cssSelectorFor(el));
    return !!(ov.display && ov.display.value === 'none');
  }
  // Ocultar un padre (display:none) oculta TODOS sus descendientes en la
  // página real, aunque solo el padre tenga el override guardado — el
  // árbol tiene que verse igual: sube por los ancestros y devuelve true si
  // CUALQUIERA de ellos (incluido el propio el) está oculto. Se usa solo
  // para decidir qué se MUESTRA (atenuado + ojo tachado); toggleElementHidden
  // sigue mirando isHiddenOverride puntual, así que el único override que
  // se guarda de verdad sigue siendo el del padre que se clickeó.
  function isEffectivelyHidden(el) {
    var node = el;
    while (node && node.nodeType === 1) {
      if (isHiddenOverride(node)) return true;
      node = node.parentElement;
    }
    return false;
  }
  function toggleElementHidden(el) {
    var selector = cssSelectorFor(el);
    if (isHiddenOverride(el)) clearSingleOverride(el, selector, 'display');
    else setElementOverride(el, selector, 'display', 'none');
    updateOverrideIndicator();
  }

  // ---------------------------------------------------------------------
  // Clonar: persiste como referencia al ORIGINAL (selector) + cantidad de
  // clones, nunca el markup del clon — en cada carga se regeneran clonando
  // el original de nuevo (uniqueElementFor ya se encarga de no hacer nada
  // si el selector dejó de ser único, mismo candado que el resto de Vista
  // previa). Pensado para layouts (ej. probar flex-wrap con más ítems),
  // no para contenido dinámico/repetido de un loop.
  // ---------------------------------------------------------------------
  // Selector dedicado para el original de un clon — NO reusa cssSelectorFor
  // tal cual. Gotcha real, ya resuelto: cssSelectorFor omite el sufijo
  // :nth-of-type cuando hoy hay un solo hermano del mismo tag (ver su
  // propio código) — apenas se crea el PRIMER clon (mismo tag, hermano
  // nuevo), esa condición pasa a ser falsa→verdadera y el selector cambia
  // de forma, dejando de matchear al original de un momento a otro (bug
  // confirmado en vivo: clonar 3 veces daba índices 1,2,1 en vez de
  // 1,2,3, porque el segundo clon ya no encontraba al primero). Acá el
  // sufijo va SIEMPRE, contando TODOS los hermanos del mismo tag — el
  // original nunca cambia de posición real entre ellos porque los clones
  // siempre se insertan DESPUÉS, así que el número queda estable para
  // siempre una vez calculado.
  function cssSelectorForCloneAnchor(el) {
    if (el.id) return '#' + el.id;
    var parts = [];
    var node = el;
    while (node && node.nodeType === 1) {
      if (node.id) { parts.unshift('#' + node.id); break; }
      var part = node.tagName.toLowerCase();
      if (node.className && typeof node.className === 'string' && node.className.trim()) {
        // Ver el mismo comentario en cssSelectorFor: clases con "/"
        // (fracciones de Tailwind) rompen el selector sin CSS.escape.
        var cls = node.className.trim().split(/\s+/).slice(0, 2).map(function (c) { return CSS.escape(c); }).join('.');
        part += '.' + cls;
      }
      var parent = node.parentElement;
      if (parent) {
        var siblings = Array.prototype.filter.call(parent.children, function (s) { return s.tagName === node.tagName; });
        part += ':nth-of-type(' + (siblings.indexOf(node) + 1) + ')';
      }
      parts.unshift(part);
      node = node.parentElement;
    }
    return parts.join(' > ');
  }
  var CLONE_STORAGE_KEY = '__claudeInspectorClones';
  function getClonesStore() {
    try { var raw = localStorage.getItem(CLONE_STORAGE_KEY); return raw ? JSON.parse(raw) : {}; } catch (e) { return {}; }
  }
  function setClonesStore(store) {
    try { localStorage.setItem(CLONE_STORAGE_KEY, JSON.stringify(store)); } catch (e) {}
  }
  function getCloneCount(selector) {
    var store = getClonesStore();
    var page = store[pageOverrideKey()];
    return (page && page[selector]) || 0;
  }
  function setCloneCount(selector, count) {
    var store = getClonesStore();
    var page = store[pageOverrideKey()] || (store[pageOverrideKey()] = {});
    if (count > 0) page[selector] = count; else delete page[selector];
    setClonesStore(store);
  }
  // Chequeo robusto de "esto lo maneja React" — React le cuelga esta
  // propiedad a CADA nodo DOM que renderiza (no solo a la raíz), así que
  // alcanza con mirar el propio elemento. No usa reactSourceFor (esa
  // necesita _debugSource, que no siempre está disponible) — acá solo
  // importa si React lo maneja, no de dónde viene en el código fuente.
  function isReactManaged(el) {
    return !!Object.keys(el).find(function (k) { return k.indexOf('__reactFiber$') === 0 || k.indexOf('__reactInternalInstance$') === 0; });
  }
  // Crea un clon de `original` y lo inserta como hermano siguiente de
  // `afterEl` (el original mismo, o el último clon ya insertado) — helper
  // compartido entre "agregar un clon" (addCloneForPinned) y "regenerar
  // todos al cargar la página" (applyStoredClones).
  function insertCloneAfter(afterEl, original, selector, index) {
    var clone = original.cloneNode(true);
    clone.setAttribute('data-lens-sk-clone-of', selector);
    clone.setAttribute('data-lens-sk-clone-index', index);
    afterEl.parentNode.insertBefore(clone, afterEl.nextSibling);
    return clone;
  }
  function lastCloneOf(selector, original) {
    var clones = document.querySelectorAll('[data-lens-sk-clone-of]');
    var last = original;
    var lastIndex = 0;
    clones.forEach(function (cl) {
      if (cl.getAttribute('data-lens-sk-clone-of') !== selector) return;
      var idx = parseInt(cl.getAttribute('data-lens-sk-clone-index'), 10) || 0;
      if (idx > lastIndex) { lastIndex = idx; last = cl; }
    });
    return { el: last, index: lastIndex };
  }
  function addCloneForPinned() {
    if (!pinnedEl) return;
    if (isReactManaged(pinnedEl)) { flashButtonFeedback(pillCloneBtn, '⚠️'); return; }
    var selector = cssSelectorForCloneAnchor(pinnedEl);
    var found = lastCloneOf(selector, pinnedEl);
    var newIndex = found.index + 1;
    insertCloneAfter(found.el, pinnedEl, selector, newIndex);
    setCloneCount(selector, newIndex);
    refreshCloneMarkers();
  }
  function removeClone(cloneEl, selector) {
    cloneEl.remove();
    setCloneCount(selector, Math.max(0, getCloneCount(selector) - 1));
    refreshCloneMarkers();
  }
  function clearAllClonesFor(selector) {
    document.querySelectorAll('[data-lens-sk-clone-of]').forEach(function (cl) {
      if (cl.getAttribute('data-lens-sk-clone-of') === selector) cl.remove();
    });
    setCloneCount(selector, 0);
    refreshCloneMarkers();
  }
  // Regenera todos los clones guardados al cargar la página — el original
  // siempre existe (viene del HTML real), los clones nunca se guardan como
  // markup, se rehacen de cero clonándolo de nuevo.
  function applyStoredClones() {
    var store = getClonesStore();
    var page = store[pageOverrideKey()];
    if (!page) return;
    Object.keys(page).forEach(function (selector) {
      var count = page[selector];
      var original = uniqueElementFor(selector);
      if (!original || !count) return;
      var afterEl = original;
      for (var i = 1; i <= count; i++) { afterEl = insertCloneAfter(afterEl, original, selector, i); }
    });
  }
  // Marcadores flotantes de clones (×N sobre el original, número sobre
  // cada clon) — mismo patrón que refreshModifiedMarkers (root aparte,
  // reconstruido entero en cada refresco, gateado por Inspección activa).
  var cloneMarkersRoot = document.createElement('div');
  cloneMarkersRoot.style.cssText = 'position:fixed;top:0;left:0;pointer-events:none;z-index:2147483641;';
  cloneMarkersRoot.setAttribute('data-lens-sk-own', '1');
  document.documentElement.appendChild(cloneMarkersRoot);
  function cloneMarkerDot(text, title, rect, onClick) {
    var dot = document.createElement('div');
    dot.textContent = text;
    dot.title = title;
    // Esquina superior-derecha, mismo criterio que layPositionCornerLabel
    // ("toca la línea, crece hacia adentro"): translateX(-100%) para que
    // quede DENTRO del elemento (crece hacia la izquierda desde el punto de
    // la esquina) en vez de centrado sobre ella, así nunca se sale del
    // viewport aunque el elemento esté pegado al borde derecho de la
    // pantalla (caso típico con la herramienta anclada a la derecha).
    dot.style.cssText = 'position:absolute;top:' + rect.top + 'px;left:' + rect.right + 'px;transform:translateX(-100%);min-width:16px;height:16px;padding:0 3px;line-height:16px;text-align:center;border-radius:999px;background:#2563eb;color:#fff;font-size:9px;font-weight:700;box-shadow:0 0 0 2px #111827;pointer-events:auto;cursor:pointer;';
    dot.addEventListener('click', function (e) { e.stopPropagation(); onClick(); });
    cloneMarkersRoot.appendChild(dot);
  }
  function refreshCloneMarkers() {
    cloneMarkersRoot.innerHTML = '';
    if (!inspectingActive) return;
    var store = getClonesStore();
    var page = store[pageOverrideKey()];
    if (!page) return;
    Object.keys(page).forEach(function (selector) {
      var count = page[selector];
      if (!count) return;
      var original = uniqueElementFor(selector);
      if (!original) return;
      cloneMarkerDot('×' + count, tr('clearAllClones'), original.getBoundingClientRect(), function () { clearAllClonesFor(selector); });
      document.querySelectorAll('[data-lens-sk-clone-of]').forEach(function (cl) {
        if (cl.getAttribute('data-lens-sk-clone-of') !== selector) return;
        cloneMarkerDot(cl.getAttribute('data-lens-sk-clone-index'), tr('removeClone'), cl.getBoundingClientRect(), function () { removeClone(cl, selector); });
      });
    });
  }

  // Reaplica todos los overrides guardados para esta página, sin depender
  // de que el panel esté abierto ni de que haya un elemento fijado — así
  // la vista previa se ve igual apenas se recarga la página.
  function applyStoredOverrides() {
    var store = getOverridesStore();
    var page = store[pageOverrideKey()];
    if (!page) return;
    Object.keys(page).forEach(function (selector) {
      var el = uniqueElementFor(selector);
      if (!el) return;
      var entry = page[selector];
      Object.keys(entry).forEach(function (prop) { applyOverrideValue(el, prop, entry[prop].value); });
    });
  }
  // Índice del nodo de texto entre SUS HERMANOS de texto directo (ignora
  // elementos) — estable mientras no cambie la cantidad/orden de nodos de
  // texto de ese padre, igual limitación que ya tienen los selectores CSS
  // guardados si el DOM se reordena solo (ver Ayuda).
  function textNodeIndex(textNode) {
    var i = 0;
    var siblings = textNode.parentNode.childNodes;
    for (var j = 0; j < siblings.length; j++) {
      if (siblings[j] === textNode) return i;
      if (siblings[j].nodeType === 3) i++;
    }
    return i;
  }
  // CSS real a partir de los overrides guardados — para copiar y pegar
  // directo en un archivo .css. Se salta 'class' y 'text:N': no son
  // propiedades CSS (son el atributo class y contenido de texto), así que
  // no tienen sentido en una hoja de estilos.
  // Sin esto, una sola clase que fija VARIAS propiedades a la vez (ej.
  // text-h2 pone font-size + line-height + font-weight) salía repetida una
  // vez por cada propiedad que la encontraba — dos "text-h2" seguidos no
  // suman nada, solo ensucian la lista.
  function dedupe(arr) {
    var seen = {}, out = [];
    arr.forEach(function (x) { if (x && !seen[x]) { seen[x] = true; out.push(x); } });
    return out;
  }
  function propsToCssBlock(selector, propsMap) {
    var props = Object.keys(propsMap).filter(function (prop) { return prop !== 'class' && prop.indexOf('text:') !== 0; });
    if (!props.length) return '';
    // Modo TWCSS: mismas propiedades, pero como @apply con clases de
    // Tailwind (valueToTailwindClass, ver más abajo) en vez de CSS plano.
    if (twcssInput.checked) {
      var classes = dedupe(props.map(function (prop) { return valueToTailwindClass(prop, propsMap[prop].value); }));
      return selector + ' {\n  @apply ' + classes.join(' ') + ';\n}';
    }
    var declLines = props.map(function (prop) { return '  ' + prop + ': ' + propsMap[prop].value + ';'; });
    return selector + ' {\n' + declLines.join('\n') + '\n}';
  }
  // Modo TWCSS, "copiar CSS de este elemento" (banner de vista previa): acá
  // no interesa el selector — se pega directo en el atributo class="" del
  // HTML/PHP, así que son clases sueltas separadas por espacio, sin @apply
  // ni selector (a diferencia de propsToCssBlock, pensado para pegar en un
  // archivo .css).
  function propsToTailwindClasses(propsMap) {
    return dedupe(Object.keys(propsMap)
      .filter(function (prop) { return prop !== 'class' && prop.indexOf('text:') !== 0; })
      .map(function (prop) { return valueToTailwindClass(prop, propsMap[prop].value); })).join(' ');
  }
  function buildModifiedCss(selectorPropsMap) {
    return Object.keys(selectorPropsMap)
      .map(function (selector) {
        // Para el texto copiado se prefiere el selector que el elemento ya
        // tiene en el CSS real del proyecto (findOriginalSelector, definida
        // más abajo) — el `selector` generado acá sigue siendo la clave de
        // guardado/reaplique interno, no lo que se muestra.
        var el = null;
        try { el = document.querySelector(selector); } catch (e) { el = null; }
        var displaySelector = (el && findOriginalSelector(el)) || selector;
        return propsToCssBlock(displaySelector, selectorPropsMap[selector]);
      })
      .filter(Boolean)
      .join('\n\n');
  }
  // Cuenta total de propiedades cambiadas en TODA la página (todos los
  // elementos con override, no solo el fijado) — para el indicador de la
  // píldora.
  function countAllOverrides() {
    var store = getOverridesStore();
    var page = store[pageOverrideKey()];
    if (!page) return 0;
    return Object.keys(page).reduce(function (total, selector) { return total + Object.keys(page[selector]).length; }, 0);
  }
  // Restablece TODOS los elementos de la página de una sola vez (botón de
  // la píldora), no uno por uno como el ↺ Restablecer del panel.
  function clearAllOverrides() {
    var store = getOverridesStore();
    var page = store[pageOverrideKey()];
    if (!page) return;
    Object.keys(page).forEach(function (selector) {
      var el = uniqueElementFor(selector);
      if (el) clearElementOverrides(el, selector);
    });
    // clearElementOverrides ya reescribe el store selector por selector,
    // pero si algún selector no encontró elemento (ej. cambió el DOM) no
    // queda borrado del store — se fuerza acá para no dejar basura.
    var freshStore = getOverridesStore();
    delete freshStore[pageOverrideKey()];
    setOverridesStore(freshStore);
  }
  function updateOverrideIndicator() {
    var count = countAllOverrides();
    pill.classList.toggle('has-overrides', count > 0);
    restoreBtn.classList.toggle('has-overrides', count > 0);
    pillResetAllBtn.classList.toggle('show', count > 0);
    pillResetAllCount.textContent = count;
    pillCopyCssBtn.classList.toggle('show', count > 0);
    refreshModifiedMarkers();
  }

  function copyText(text) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).catch(function () { fallbackCopy(text); });
    } else {
      fallbackCopy(text);
    }
  }
  function fallbackCopy(text) {
    var ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    try { document.execCommand('copy'); } catch (e) {}
    document.body.removeChild(ta);
  }

  // Fila copiable: label + valor + ícono 📋→✅
  function makeRow(label, value) {
    var row = document.createElement('div');
    row.className = 'row-copy';
    var k = document.createElement('span');
    k.className = 'k';
    k.textContent = label;
    var v = document.createElement('span');
    v.className = 'v';
    v.textContent = value;
    var ic = document.createElement('span');
    ic.className = 'ic';
    ic.textContent = '📋';
    row.appendChild(k);
    row.appendChild(v);
    row.appendChild(ic);
    row.addEventListener('click', function (e) {
      e.stopPropagation();
      copyText(String(value));
      ic.textContent = '✅';
      setTimeout(function () { ic.textContent = '📋'; }, 1200);
    });
    return row;
  }
  // Fila copiable apilada: la etiqueta arriba, cada valor (ej. cada clase
  // de utilidad detectada) en su propia línea abajo, SIN truncar — a
  // diferencia de makeRow (una sola línea con ellipsis), pensada para
  // listas de clases que si se cortan no se pueden leer/copiar completas.
  function makeStackedRow(label, items) {
    var row = document.createElement('div');
    row.className = 'row-copy-stack';
    var head = document.createElement('div');
    head.className = 'head';
    var k = document.createElement('span');
    k.className = 'k';
    k.textContent = label;
    var ic = document.createElement('span');
    ic.className = 'ic';
    ic.textContent = '📋';
    head.appendChild(k);
    head.appendChild(ic);
    row.appendChild(head);
    var list = document.createElement('div');
    list.className = 'vlist';
    var fullText = items && items.length ? items.join(' ') : tr('none');
    if (items && items.length) {
      items.forEach(function (cls) {
        var s = document.createElement('span');
        s.textContent = cls;
        list.appendChild(s);
      });
    } else {
      var empty = document.createElement('span');
      empty.className = 'empty';
      empty.textContent = tr('none');
      list.appendChild(empty);
    }
    row.appendChild(list);
    row.addEventListener('click', function (e) {
      e.stopPropagation();
      copyText(fullText);
      ic.textContent = '✅';
      setTimeout(function () { ic.textContent = '📋'; }, 1200);
    });
    return row;
  }
  // rgb()/rgba() -> #rrggbb o #rrggbbaa (alpha embebido) si alpha < 1
  function rgbToHex(str) {
    var c = parseRGB(str);
    if (!c) return null;
    function h(n) { n = Math.max(0, Math.min(255, Math.round(n))); return ('0' + n.toString(16)).slice(-2); }
    var hex = '#' + h(c.r) + h(c.g) + h(c.b);
    if (c.a !== undefined && c.a < 1) hex += h(c.a * 255);
    return hex;
  }
  // Fila copiable para valores de color: cuadrito con el color real + valor en hexadecimal
  function makeColorRow(label, value) {
    var hex = rgbToHex(value);
    if (!hex) return makeRow(label, value);
    var row = document.createElement('div');
    row.className = 'row-copy';
    var k = document.createElement('span');
    k.className = 'k';
    k.textContent = label;
    var swatch = document.createElement('span');
    swatch.className = 'swatch';
    swatch.style.background = value;
    var v = document.createElement('span');
    v.className = 'v';
    v.textContent = hex;
    var ic = document.createElement('span');
    ic.className = 'ic';
    ic.textContent = '📋';
    row.appendChild(k);
    row.appendChild(swatch);
    row.appendChild(v);
    row.appendChild(ic);
    row.addEventListener('click', function (e) {
      e.stopPropagation();
      copyText(hex);
      ic.textContent = '✅';
      setTimeout(function () { ic.textContent = '📋'; }, 1200);
    });
    return row;
  }
  // Fila editable: como makeRow, pero con lápiz ✏️ que abre un input para
  // cambiar el valor y aplicarlo al instante sobre el elemento fijado (vista
  // previa, ver comentario de "Vista previa de estilos" más arriba). Si esa
  // propiedad ya tiene un override guardado, la fila queda resaltada.
  function commitStyleEdit(prop, rawValue) {
    if (!pinnedEl) return;
    var value = rawValue.trim();
    if (!value) return;
    setElementOverride(pinnedEl, cssSelectorFor(pinnedEl), prop, value);
    updateOverrideIndicator();
    refreshPanelKeepScroll();
    // Señal de "guardado" en la fila recién reconstruida — sobre todo para
    // el picker de color: es un diálogo nativo del navegador, no se le
    // puede poner un botón de cerrar adentro, así que esto avisa que el
    // cambio quedó aplicado apenas el picker se cierra solo.
    var savedRow = panel.querySelector('[data-prop="' + prop + '"]');
    if (savedRow) {
      savedRow.classList.add('just-saved');
      setTimeout(function () { savedRow.classList.remove('just-saved'); }, 700);
    }
  }
  // Aviso de vista previa + restablecer, compartido por Estilos y Layout:
  // solo aparece si el elemento fijado tiene overrides guardados (ver
  // "Vista previa de estilos" en la Ayuda). No son estilos reales — vuelven
  // a lo de siempre al restablecer o al borrar el localStorage.
  function renderPreviewBanner(el) {
    var selector = cssSelectorFor(el);
    var overrides = getElementOverrides(selector);
    var overrideCount = Object.keys(overrides).length;
    if (!overrideCount) return;
    var banner = document.createElement('div');
    banner.className = 'preview-banner';
    var msg = document.createElement('span');
    msg.textContent = tr('previewPrefix') + overrideCount + (overrideCount === 1 ? tr('changeSingular') : tr('changePlural'));
    var actions = document.createElement('div');
    actions.style.cssText = 'display:flex;gap:6px;';
    // Acotado a este elemento (a diferencia del atajo global G, que junta
    // TODA la página). Modo TWCSS: clases sueltas sin selector, para pegar
    // en class="" (propsToTailwindClasses) — modo normal: selector real +
    // propiedades, para pegar en un .css (buildModifiedCss).
    var copyCssLabel = twcssInput.checked ? '📄 TWCSS' : '📄 CSS';
    var copyCssBtn = document.createElement('button');
    copyCssBtn.className = 'preview-reset';
    copyCssBtn.textContent = copyCssLabel;
    copyCssBtn.title = tr('copyCss');
    copyCssBtn.addEventListener('click', function (e) {
      e.stopPropagation();
      var css;
      if (twcssInput.checked) {
        css = propsToTailwindClasses(getElementOverrides(selector));
      } else {
        var map = {};
        map[selector] = getElementOverrides(selector);
        css = buildModifiedCss(map);
      }
      if (!css) { flashButtonFeedback(copyCssBtn, '⚠️', copyCssLabel, 1500); return; }
      copyText(css);
      flashButtonFeedback(copyCssBtn, '✅', copyCssLabel, 1200);
    });
    var resetBtn = document.createElement('button');
    resetBtn.className = 'preview-reset';
    resetBtn.textContent = '↺';
    resetBtn.title = tr('reset');
    resetBtn.addEventListener('click', function (e) {
      e.stopPropagation();
      clearElementOverrides(el, selector);
      updateOverrideIndicator();
      refreshPanelKeepScroll();
    });
    actions.appendChild(copyCssBtn);
    actions.appendChild(resetBtn);
    banner.appendChild(msg);
    banner.appendChild(actions);
    panel.appendChild(banner);
  }
  // Autocompletado liviano con <datalist> nativo del navegador — sin
  // dependencias ni librería aparte. "multiToken" trata el valor como una
  // lista separada por espacios (ej. clases CSS): el navegador filtra el
  // datalist contra el INPUT COMPLETO, así que si se lo dejara así después
  // de la primera clase nunca matchearía nada — en cambio, se recalculan
  // las opciones en cada tecleo completando solo el último token, con lo
  // ya escrito antes pegado adelante.
  // El <datalist> nativo NO funciona para inputs que viven dentro de un
  // Shadow DOM (bug real y conocido de los navegadores, confirmado: la
  // propiedad input.list resuelve bien por JS, pero el desplegable visual
  // nunca aparece) — así que el autocompletado es un dropdown propio,
  // liviano, sin dependencias. "multiToken" trata el valor como una lista
  // separada por espacios (ej. clases CSS): solo completa/reemplaza el
  // último token que se está escribiendo, con lo ya tecleado antes intacto.
  function attachAutocomplete(input, options, multiToken) {
    var dropdown = document.createElement('div');
    dropdown.className = 'ac-dropdown';
    input.insertAdjacentElement('afterend', dropdown);
    function currentToken() {
      if (!multiToken) return input.value;
      var parts = input.value.split(' ');
      return parts[parts.length - 1];
    }
    function position() {
      var r = input.getBoundingClientRect();
      var width = Math.max(r.width, 160);
      // Con la herramienta pegada al borde derecho, el input suele quedar
      // cerca de ese borde — un ancho mínimo de 160px partiendo de r.left
      // se sale del viewport. Se recorta contra el borde derecho real.
      var left = Math.min(r.left, window.innerWidth - width - 4);
      dropdown.style.left = Math.max(4, left) + 'px';
      dropdown.style.top = (r.bottom + 2) + 'px';
      dropdown.style.width = width + 'px';
    }
    var currentMatches = [];
    var highlightedIndex = -1;
    function hide() { dropdown.classList.remove('show'); dropdown.innerHTML = ''; currentMatches = []; highlightedIndex = -1; }
    function selectMatch(m) {
      if (multiToken) {
        var parts = input.value.split(' ');
        parts[parts.length - 1] = m;
        input.value = parts.join(' ');
      } else {
        input.value = m;
      }
      hide();
      input.focus({ preventScroll: true });
    }
    // Resalta visualmente la opción activa (.ac-active) y la mantiene a la
    // vista si la lista scrollea — no toca el input, solo la UI del
    // dropdown, para poder navegar con las flechas sin perder lo escrito.
    function updateHighlight() {
      var items = dropdown.querySelectorAll('.ac-item');
      items.forEach(function (item, i) {
        var active = i === highlightedIndex;
        item.classList.toggle('ac-active', active);
        if (active) item.scrollIntoView({ block: 'nearest' });
      });
    }
    function render() {
      var q = currentToken();
      if (!q) { hide(); return; }
      var qLower = q.toLowerCase();
      currentMatches = options.filter(function (o) { return o.toLowerCase().indexOf(qLower) === 0 && o.toLowerCase() !== qLower; }).slice(0, 30);
      if (!currentMatches.length) { hide(); return; }
      dropdown.innerHTML = '';
      highlightedIndex = -1;
      currentMatches.forEach(function (m, i) {
        var item = document.createElement('div');
        item.className = 'ac-item';
        item.textContent = m;
        // mousedown (no click): dispara ANTES del blur del input, si no el
        // blur cierra/comitea la edición antes de que el click llegue a
        // registrarse.
        item.addEventListener('mousedown', function (e) { e.preventDefault(); selectMatch(m); });
        item.addEventListener('mouseenter', function () { highlightedIndex = i; updateHighlight(); });
        dropdown.appendChild(item);
      });
      position();
      dropdown.classList.add('show');
    }
    input.addEventListener('input', render);
    input.addEventListener('focus', render);
    input.addEventListener('blur', function () { setTimeout(hide, 150); });
    // ↑/↓ mueven la selección entre las sugerencias (cicla en los dos
    // extremos) sin tocar el texto escrito. Tab y Enter confirman la
    // resaltada — o la primera, si todavía no navegaste con las flechas.
    // Enter además dispara el listener de más abajo (el de startInlineEdit,
    // registrado después — no se le pisa nada, solo se corre primero acá):
    // como selectMatch ya dejó el valor elegido en el input ANTES de que
    // ese otro listener corra finish(true), Enter termina seleccionando Y
    // confirmando de una, en vez de solo autocompletar como Tab.
    input.addEventListener('keydown', function (e) {
      if (!currentMatches.length) return;
      if (e.key === 'ArrowDown') {
        e.preventDefault(); e.stopPropagation();
        highlightedIndex = (highlightedIndex + 1) % currentMatches.length;
        updateHighlight();
      } else if (e.key === 'ArrowUp') {
        e.preventDefault(); e.stopPropagation();
        highlightedIndex = (highlightedIndex - 1 + currentMatches.length) % currentMatches.length;
        updateHighlight();
      } else if (e.key === 'Tab' || e.key === 'Enter') {
        e.preventDefault();
        selectMatch(currentMatches[highlightedIndex >= 0 ? highlightedIndex : 0]);
      }
    });
  }
  function startInlineEdit(v, currentText, onCommit, inputClass, suggestions, widthContainer) {
    var input = document.createElement('input');
    input.type = 'text';
    input.className = inputClass || 'row-edit-input';
    input.value = currentText;
    v.replaceWith(input);
    if (suggestions && suggestions.options && suggestions.options.length) {
      attachAutocomplete(input, suggestions.options, !!suggestions.multiToken);
    }
    // Ancho "a medida": por default estas clases traen flex:1 (se estira a
    // repartir el espacio de la fila), lo que en textos largos dejaba el
    // input angosto con scroll interno del texto, ilegible. Acá se mide con
    // un <span> espejo (mismo font, oculto) y se fuerza el ancho real del
    // contenido, recalculado en cada tecla — con flex:1 activo el ancho
    // explícito no tendría efecto, por eso se apaga primero. Tope: el ancho
    // del contenedor inmediato, para no desbordar la fila/línea.
    input.style.flex = '0 0 auto';
    // La fila (.row-copy) usa justify-content:space-between — con el input
    // ya sin flex:1, ese espacio sobrante se repartía entre TODOS los
    // huecos (separaba el input de los íconos ✏️/📋, no solo de la
    // etiqueta). margin-left:auto concentra TODO ese sobrante en un único
    // lugar (antes del input), dejando input+íconos siempre pegados —
    // mismo efecto que ya lograba flex:1 + text-align:right en el span de
    // solo lectura. Esto es específico de las filas de Estilos/Layout
    // (.row-copy) — en el árbol HTML (ver widthContainer) el input tiene
    // que quedar A LA IZQUIERDA, donde arrancaba el span original dentro
    // del texto que fluye (clase/texto), no empujado al fondo de la línea:
    // con anchos bastante más grandes ahí (ver resizeToContent), quedaba
    // flotando lejos y desconectado del elemento que se estaba editando.
    if (!widthContainer) input.style.marginLeft = 'auto';
    var sizer = document.createElement('span');
    sizer.style.cssText = 'position:absolute;visibility:hidden;white-space:pre;top:-9999px;left:-9999px;';
    document.body.appendChild(sizer);
    function resizeToContent() {
      var cs = getComputedStyle(input);
      sizer.style.font = cs.font;
      sizer.textContent = input.value;
      var extra = parseFloat(cs.paddingLeft) + parseFloat(cs.paddingRight) + parseFloat(cs.borderLeftWidth) + parseFloat(cs.borderRightWidth) + 4;
      var maxW = 480;
      if (widthContainer) {
        // Para casos donde el padre INMEDIATO del input es un <span> inline
        // angosto que solo mide lo que ya ocupaba su propio contenido (ej.
        // el editor de clases del árbol HTML: el padre real es el <span>
        // de la etiqueta de apertura, no el ancho disponible de verdad) —
        // acá se pasa explícitamente el contenedor grande de referencia
        // (ej. el popup completo) para poder mostrar bastante más texto de
        // una, en vez de quedar atado al ancho ínfimo del span.
        maxW = Math.max(160, widthContainer.getBoundingClientRect().width - 60);
      } else if (input.parentElement) {
        // El tope real no es el ancho de LA FILA entera — hay que restarle
        // lo que ya ocupan sus hermanos (etiqueta, ✏️, 📋, y a veces un ✕
        // extra en las propiedades agregadas) más el gap del flex entre
        // ellos. Sin esto el input podía crecer hasta pisar/apretar esos
        // íconos en vez de dejarles su lugar.
        var parent = input.parentElement;
        var siblingsWidth = 0;
        Array.prototype.forEach.call(parent.children, function (child) {
          if (child === input) return;
          // El dropdown de autocompletado (.ac-dropdown, ver attachAutocomplete)
          // se inserta como hermano del input pero es position:fixed — NO
          // ocupa espacio real en la fila, aunque getBoundingClientRect()
          // igual devuelve su ancho. Sin este chequeo, apenas aparecía
          // (con cualquier tecla que dispare sugerencias) su ancho se
          // restaba del disponible y el input se achicaba de golpe.
          if (getComputedStyle(child).position === 'fixed') return;
          siblingsWidth += child.getBoundingClientRect().width;
        });
        var gapPx = parseFloat(getComputedStyle(parent).columnGap) || 0;
        var gapTotal = Math.max(0, parent.children.length - 1) * gapPx;
        maxW = Math.max(40, parent.getBoundingClientRect().width - siblingsWidth - gapTotal - 4);
      }
      input.style.width = Math.min(sizer.offsetWidth + extra, maxW) + 'px';
    }
    input.addEventListener('input', resizeToContent);
    resizeToContent();
    // preventScroll: si no, el navegador hace scroll automático para poner
    // el input recién enfocado "a la vista" — que pisaba el scroll del
    // panel apenas se abría una edición, antes incluso de llegar a
    // confirmar el cambio.
    input.focus({ preventScroll: true });
    // Cursor al final, no seleccionar todo — seleccionar todo invitaba a
    // "escribir encima" y perder el valor existente sin querer.
    input.setSelectionRange(input.value.length, input.value.length);
    // Mientras se edita, un scroll/resize en la página no puede volver a
    // dibujar el panel (refreshOverlaysOnScrollResize llama renderStyles),
    // porque eso borraría este input a mitad de la escritura.
    editingStyleRow = true;
    var done = false;
    function finish(commit) {
      if (done) return;
      done = true;
      editingStyleRow = false;
      cancelActiveStyleEdit = null;
      sizer.remove();
      // Restaurar el span original SIEMPRE, antes de avisarle al caller —
      // los editores de Estilos/Layout redibujan todo el panel en su
      // onCommit (así que esto es un no-op visual para ellos), pero otros
      // usos (ej. el árbol de estructura) actualizan el DOM a mano sin
      // redibujar nada, y necesitan que el span ya esté de vuelta.
      input.replaceWith(v);
      // Comparado contra el valor con el que arrancó (currentText), no solo
      // "hubo commit o no": blur SIEMPRE llama finish(true), aunque no se
      // haya tocado una sola tecla — sin este chequeo, solo con ENTRAR a
      // editar y salir (clic afuera) ya se marcaba la propiedad como
      // "modificada" (entraba un override idéntico al valor real), aunque
      // el valor final fuera exactamente el mismo que tenía antes.
      if (commit && input.value !== currentText) onCommit(input.value);
    }
    // Cancelar (Escape) se maneja centralizado desde onShortcutKeydown, no
    // acá adentro — así respeta la misma prioridad que ayuda/árbol HTML en
    // vez de competir con ellos por el evento.
    cancelActiveStyleEdit = function () { finish(false); };
    input.addEventListener('keydown', function (e) {
      e.stopPropagation();
      if (e.key === 'Enter') finish(true);
    });
    input.addEventListener('blur', function () { finish(true); });
    input.addEventListener('click', function (e) { e.stopPropagation(); });
  }
  function makeEditableRow(label, prop, value) {
    var overridden = !!getElementOverrides(cssSelectorFor(pinnedEl))[prop];
    var row = document.createElement('div');
    row.className = 'row-copy' + (overridden ? ' overridden' : '');
    row.dataset.prop = prop;
    var k = document.createElement('span');
    k.className = 'k';
    k.textContent = label;
    var v = document.createElement('span');
    v.className = 'v';
    v.textContent = value;
    var edit = document.createElement('span');
    edit.className = 'ic';
    edit.title = tr('edit');
    edit.textContent = '✏️';
    var ic = document.createElement('span');
    ic.className = 'ic';
    ic.textContent = '📋';
    row.appendChild(k);
    row.appendChild(v);
    // Aviso de valor negativo (ej. margin-top:-20px, letter-spacing:-1px):
    // suele ser intencional pero también una causa muy común de bugs de
    // maquetación difíciles de notar solo mirando el número — un ⚠️ al
    // lado lo hace saltar a la vista. Detecta "-" seguido de un dígito para
    // no confundir con valores que arrancan con guion por otro motivo.
    if (/^-\d/.test(String(value).trim())) {
      var negWarn = document.createElement('span');
      negWarn.className = 'ic';
      negWarn.title = tr('negativeValueWarning');
      negWarn.textContent = '⚠️';
      row.appendChild(negWarn);
    }
    // Selector de clases (🔢 escala numérica generada / 🔤 clases de
    // tipografía detectadas en el proyecto) — solo con Modo TWCSS activo,
    // ver TW_SPACING_SCALE_PROPS/TW_DETECT_PROPS y openVarPickerDropdown
    // más abajo en el archivo. Aplica siempre el valor real resuelto sobre
    // el elemento; en TWCSS copia además el nombre de la clase.
    if (twcssInput.checked && (TW_SPACING_SCALE_PROPS[prop] || TW_DETECT_PROPS[prop])) {
      var isScale = !!TW_SPACING_SCALE_PROPS[prop];
      var varBtn = document.createElement('span');
      varBtn.className = 'ic';
      varBtn.title = isScale ? tr('numericScale') : tr('detectedClasses');
      varBtn.textContent = isScale ? '🔢' : '🔤';
      varBtn.addEventListener('click', function (e) {
        e.stopPropagation();
        var candidates = isScale ? numericScaleCandidatesFor(prop) : getProjectUtilityClassesFor(prop);
        openVarPickerDropdown(varBtn, prop, value, candidates, isScale);
      });
      row.appendChild(varBtn);
    }
    row.appendChild(edit);
    row.appendChild(ic);
    row.addEventListener('click', function (e) {
      e.stopPropagation();
      copyText(twcssInput.checked ? valueToTailwindClass(prop, value) : String(value));
      ic.textContent = '✅';
      setTimeout(function () { ic.textContent = '📋'; }, 1200);
    });
    edit.addEventListener('click', function (e) {
      e.stopPropagation();
      var opts = CSS_VALUE_SUGGESTIONS[prop];
      startInlineEdit(v, value, function (newValue) { commitStyleEdit(prop, newValue); }, undefined, opts ? { options: opts } : undefined);
    });
    return row;
  }
  // Como makeEditableRow, pero con un ✕ extra para dejar de rastrear la
  // propiedad (sacarla de customStyleProps) — solo tiene sentido para las
  // agregadas a mano, las fijas del panel no se pueden quitar.
  function makeCustomPropRow(prop, value) {
    var row = makeEditableRow(prop, prop, value);
    var del = document.createElement('span');
    del.className = 'ic';
    del.title = tr('remove');
    del.textContent = '✕';
    del.addEventListener('click', function (e) {
      e.stopPropagation();
      var idx = customStyleProps.indexOf(prop);
      if (idx !== -1) customStyleProps.splice(idx, 1);
      saveState();
      refreshPanelKeepScroll();
    });
    row.appendChild(del);
    return row;
  }
  // Dropdown flotante con las variables --color-* del proyecto (nombre +
  // muestra), para elegir en vez de tipear a mano. Elegir una SIEMPRE
  // aplica var(--color-x) sobre el elemento (queda enlazado al token),
  // en los dos modos — en modo TWCSS, además, copia la clase de Tailwind
  // equivalente (reusa valueToTailwindClass/findUtilityClassFor,
  // que ya sabe encontrar "text-primary" etc. si existe en el proyecto).
  var colorVarDropdownEl = null, colorVarDropdownAnchor = null;
  function closeColorVarDropdown() {
    if (colorVarDropdownEl) { colorVarDropdownEl.remove(); colorVarDropdownEl = null; colorVarDropdownAnchor = null; }
  }
  // Los tres selectores de "elegir una clase/variable" (colores, escala
  // numérica + clases detectadas, presets de tipografía — ver más abajo en
  // el archivo) comparten esta función para cerrarse entre sí: sin esto,
  // abrir uno mientras otro ya estaba abierto dejaba los dos apilados en
  // el DOM (confirmado en vivo: dos .color-var-dropdown a la vez, el
  // querySelector de turno agarraba cualquiera de los dos al azar).
  function closeAllVariantDropdowns() {
    closeColorVarDropdown();
    closeVarPickerDropdown();
    closeTypographyPresetDropdown();
  }
  // Posiciona (y hace visible) cualquiera de los tres desplegables de
  // "elegir clase/variable" — compartido para no repetir 3 veces la misma
  // lógica de flip vertical/horizontal. rect es el getBoundingClientRect()
  // del botón que lo abrió. Vertical: si abrir hacia abajo no entra en el
  // viewport, abre hacia arriba. Horizontal: alineado por el borde
  // IZQUIERDO del botón por default — pero con la herramienta pegada al
  // borde derecho de la pantalla (ver host.style.cssText más arriba en el
  // archivo), un desplegable ancho podía salirse del viewport por la
  // derecha; en ese caso se alinea por el borde DERECHO del botón en su
  // lugar (crece hacia la izquierda).
  function positionVariantDropdown(dd, rect) {
    root.appendChild(dd);
    var ddRect = dd.getBoundingClientRect();
    var top = rect.bottom + 4;
    if (top + ddRect.height > window.innerHeight) top = Math.max(4, rect.top - ddRect.height - 4);
    var left = rect.left;
    if (left + ddRect.width > window.innerWidth) left = Math.max(4, rect.right - ddRect.width);
    dd.style.left = left + 'px';
    dd.style.top = top + 'px';
    dd.style.visibility = 'visible';
  }
  function openColorVarDropdown(anchorBtn, prop, currentHex) {
    var wasOpenForThisBtn = colorVarDropdownAnchor === anchorBtn;
    closeAllVariantDropdowns();
    if (wasOpenForThisBtn) return;
    var vars = getProjectColorVariables();
    var rect = anchorBtn.getBoundingClientRect();
    var dd = document.createElement('div');
    dd.className = 'color-var-dropdown';
    // Se posiciona recién después de armar el contenido (ver más abajo):
    // hace falta medir su alto real para decidir si abre hacia abajo o
    // hacia arriba — visibility:hidden en vez de display:none para poder
    // medir con getBoundingClientRect() sin que parpadee en pantalla.
    dd.style.cssText = 'left:' + rect.left + 'px;top:0px;visibility:hidden;';
    if (!vars.length) {
      var empty = document.createElement('div');
      empty.className = 'color-var-empty';
      empty.textContent = tr('noColorVars');
      dd.appendChild(empty);
    } else {
      // Marca la variable que YA coincide con el color actual del elemento
      // (mismo probe fuera de pantalla que usa findUtilityClassFor, para
      // resolver cualquier sintaxis de color — hex/oklch/lo que sea — a
      // como el navegador la ve de verdad).
      var probe = tailwindProbeElement();
      var currentTarget = normalizeForCompare(prop, currentHex);
      vars.forEach(function (cv) {
        var item = document.createElement('div');
        item.className = 'color-var-item';
        probe.style.setProperty(prop, cv.value);
        var resolved = getComputedStyle(probe).getPropertyValue(prop);
        probe.style.removeProperty(prop);
        var isActive = normalizeForCompare(prop, resolved) === currentTarget;
        if (isActive) item.classList.add('active');
        var sw = document.createElement('span');
        sw.className = 'color-var-swatch';
        sw.style.background = cv.value;
        var name = document.createElement('span');
        name.textContent = cv.name;
        var check = document.createElement('span');
        check.className = 'color-var-check';
        check.textContent = '✓';
        check.style.visibility = isActive ? 'visible' : 'hidden';
        item.appendChild(sw);
        item.appendChild(name);
        item.appendChild(check);
        item.addEventListener('click', function (e) {
          e.stopPropagation();
          // Se aplica SIEMPRE (los dos modos) — elegir una variable es
          // elegirla para el elemento, no solo para copiar texto. El modo
          // TWCSS solo cambia qué agrega ENCIMA: ahí también copia la
          // clase de Tailwind equivalente, para pegar en el código real.
          commitStyleEdit(prop, 'var(' + cv.varName + ')');
          if (twcssInput.checked) {
            // Ya se sabe el token elegido — directo TW_PROP_PREFIX[prop] +
            // nombre, sin pasar por valueToTailwindClass/findUtilityClassFor
            // (que solo pueden devolver una clase si YA está compilada tal
            // cual en el proyecto; si no, caían al arbitrario text-[#hex]).
            copyText(TW_PROP_PREFIX[prop] ? TW_PROP_PREFIX[prop] + '-' + cv.name : valueToTailwindClass(prop, cv.value));
            check.style.visibility = 'visible';
            item.classList.add('picked');
            setTimeout(closeColorVarDropdown, 500);
          } else {
            closeColorVarDropdown();
          }
        });
        dd.appendChild(item);
      });
    }
    positionVariantDropdown(dd, rect);
    colorVarDropdownEl = dd;
    colorVarDropdownAnchor = anchorBtn;
  }
  root.addEventListener('click', function (e) {
    if (colorVarDropdownEl && e.target !== colorVarDropdownAnchor && !colorVarDropdownEl.contains(e.target)) closeColorVarDropdown();
  });
  function makeEditableColorRow(label, prop, value) {
    var hex = rgbToHex(value);
    if (!hex) return makeEditableRow(label, prop, value);
    var overridden = !!getElementOverrides(cssSelectorFor(pinnedEl))[prop];
    var row = document.createElement('div');
    row.className = 'row-copy' + (overridden ? ' overridden' : '');
    row.dataset.prop = prop;
    var k = document.createElement('span');
    k.className = 'k';
    k.textContent = label;
    var swatch = document.createElement('span');
    swatch.className = 'swatch swatch-pickable';
    swatch.style.background = value;
    swatch.title = tr('chooseColor');
    // <input type="color"> nativo, invisible pero cubriendo todo el swatch
    // (así el clic real siempre le llega a él, no hace falta reenviarlo) —
    // el picker del sistema operativo/navegador, sin armar uno propio. Solo
    // acepta #rrggbb (sin alpha), de ahí el slice(0,7).
    var colorPicker = document.createElement('input');
    colorPicker.type = 'color';
    colorPicker.className = 'swatch-picker-input';
    colorPicker.value = /^#[0-9a-fA-F]{6}/.test(hex) ? hex.slice(0, 7) : '#000000';
    swatch.appendChild(colorPicker);
    colorPicker.addEventListener('click', function (e) { e.stopPropagation(); });
    // "input" dispara en cada arrastre dentro del picker abierto — se usa
    // solo para pintar en vivo sobre el elemento real, SIN reconstruir el
    // panel (eso destruiría este mismo <input> a mitad de la interacción y
    // cerraría el picker solo). El guardado real (localStorage + panel) pasa
    // recién en "change", cuando el picker se cierra.
    colorPicker.addEventListener('input', function (e) {
      e.stopPropagation();
      if (pinnedEl) pinnedEl.style.setProperty(prop, colorPicker.value);
    });
    colorPicker.addEventListener('change', function (e) {
      e.stopPropagation();
      commitStyleEdit(prop, colorPicker.value);
    });
    // El picker es el diálogo nativo del navegador — no se le puede meter
    // un botón de cerrar ADENTRO (no es nuestro), pero blur() sobre el
    // input SÍ lo cierra en Chrome, así que esto lo cierra desde afuera sin
    // tener que clickear en otro lado ni usar Esc. No hay forma de saber
    // las coordenadas reales del popup nativo (el navegador no las expone),
    // así que esto flota fixed cerca del cuadrito (a la derecha, no debajo,
    // para no quedar tapado por el propio popup que suele abrir hacia
    // abajo) y solo se muestra mientras el input tiene foco — que es,
    // aproximado, mientras el picker está abierto (foco y popup abren y
    // cierran juntos en Chrome).
    var closePicker = document.createElement('button');
    closePicker.className = 'swatch-close-x';
    closePicker.title = tr('closePicker');
    closePicker.textContent = '✕';
    function positionClosePicker() {
      var r = swatch.getBoundingClientRect();
      closePicker.style.left = (r.right + 6) + 'px';
      closePicker.style.top = (r.top - 4) + 'px';
    }
    colorPicker.addEventListener('focus', function () {
      positionClosePicker();
      closePicker.classList.add('show');
    });
    colorPicker.addEventListener('blur', function () {
      closePicker.classList.remove('show');
    });
    closePicker.addEventListener('mousedown', function (e) {
      // mousedown (no click): si no, el blur del input dispara ANTES y
      // esconde el botón antes de que el click llegue a registrarse.
      e.preventDefault();
      e.stopPropagation();
      colorPicker.blur();
    });
    var varsBtn = document.createElement('span');
    varsBtn.className = 'ic';
    varsBtn.title = tr('colorVariables');
    varsBtn.textContent = '🎨';
    varsBtn.addEventListener('click', function (e) {
      e.stopPropagation();
      openColorVarDropdown(varsBtn, prop, hex);
    });
    var v = document.createElement('span');
    v.className = 'v';
    v.textContent = hex;
    var edit = document.createElement('span');
    edit.className = 'ic';
    edit.title = tr('edit');
    edit.textContent = '✏️';
    var ic = document.createElement('span');
    ic.className = 'ic';
    ic.textContent = '📋';
    row.appendChild(k);
    row.appendChild(swatch);
    row.appendChild(closePicker);
    row.appendChild(varsBtn);
    row.appendChild(v);
    row.appendChild(edit);
    row.appendChild(ic);
    row.addEventListener('click', function (e) {
      e.stopPropagation();
      copyText(twcssInput.checked ? valueToTailwindClass(prop, hex) : hex);
      ic.textContent = '✅';
      setTimeout(function () { ic.textContent = '📋'; }, 1200);
    });
    edit.addEventListener('click', function (e) {
      e.stopPropagation();
      startInlineEdit(v, hex, function (newValue) { commitStyleEdit(prop, newValue); });
    });
    return row;
  }
  // Buscador de propiedades para Estilos/Layout (mismo espíritu que el
  // buscador del árbol de estructura, pero acá oculta directo las filas que
  // no matchean en vez de solo atenuarlas). Un solo query compartido entre
  // las dos vistas — persiste entre recargas via saveState/restoreState.
  function applyPropertyFilter(panelEl, query) {
    var q = query.trim().toLowerCase();
    var rows = panelEl.querySelectorAll('.row-copy[data-prop]');
    rows.forEach(function (row) {
      // Compara contra el nombre real de la propiedad CSS (data-prop, ej.
      // "padding-top") Y el texto visible de la fila (label + valor) — si
      // no, escribir "padding" no encontraba nada, porque "Padding" es el
      // <h4> de la sección, no el texto de cada fila individual ("top",
      // "right"...).
      var match = !q || row.dataset.prop.toLowerCase().indexOf(q) !== -1 || row.textContent.toLowerCase().indexOf(q) !== -1;
      row.style.display = match ? '' : 'none';
    });
    var headers = panelEl.querySelectorAll('h4');
    headers.forEach(function (h4) {
      var visible = !q;
      var node = h4.nextElementSibling;
      while (!visible && node && node.tagName !== 'H4') {
        if (node.classList.contains('row-copy') && node.style.display !== 'none') visible = true;
        node = node.nextElementSibling;
      }
      h4.style.display = visible ? '' : 'none';
    });
  }
  // Slider de transparencia del overlay de margin/border/padding/content
  // (los 4 recuadros de color que se dibujan en vivo sobre la página real,
  // ver spacingOverlayOpacity) — sin texto/label: por la posición, pegado
  // debajo del diagrama, ya se entiende para qué es. Tope 30% (nunca
  // 100%) para que el overlay no llegue a tapar del todo el elemento real.
  function makeSpacingOpacitySlider() {
    var wrap = document.createElement('div');
    wrap.className = 'opacity-slider-wrap';
    var input = document.createElement('input');
    input.type = 'range';
    input.min = '0';
    input.max = '30';
    input.step = '1';
    input.value = String(Math.round(spacingOverlayOpacity * 100));
    input.title = tr('overlayTransparency');
    input.addEventListener('click', function (e) { e.stopPropagation(); });
    input.addEventListener('input', function () {
      spacingOverlayOpacity = Number(input.value) / 100;
      applySpacingOverlayOpacity();
      // input dispara muy seguido mientras se arrastra — debounce para no
      // escribir en localStorage en cada pixel (mismo patrón que el scroll
      // del panel).
      clearTimeout(opacitySliderSaveTimer);
      opacitySliderSaveTimer = setTimeout(saveState, 250);
    });
    wrap.appendChild(input);
    return wrap;
  }
  // Snapshot COMPLETO del estilo actual de un elemento (cambiado u
  // original, da igual — getComputedStyle ya refleja cualquier override
  // aplicado) — mismas propiedades y misma lógica condicional (flex/grid/
  // position) que ya usan renderStyles/renderLayout para sus filas, así
  // "copiar todo y reusarlo en otro elemento" no depende de que haya
  // overrides guardados.
  function collectAllStyleProps(el) {
    var cs = getComputedStyle(el);
    var props = {};
    function add(prop, value) { props[prop] = { value: value }; }
    add('font-family', cs.fontFamily);
    add('font-size', cs.fontSize);
    add('font-weight', cs.fontWeight);
    add('line-height', cs.lineHeight);
    add('letter-spacing', cs.letterSpacing);
    add('text-align', cs.textAlign);
    add('text-transform', cs.textTransform);
    add('color', cs.color);
    add('width', cs.width);
    add('height', cs.height);
    add('padding-top', cs.paddingTop);
    add('padding-right', cs.paddingRight);
    add('padding-bottom', cs.paddingBottom);
    add('padding-left', cs.paddingLeft);
    add('margin-top', cs.marginTop);
    add('margin-right', cs.marginRight);
    add('margin-bottom', cs.marginBottom);
    add('margin-left', cs.marginLeft);
    add('border-top-width', cs.borderTopWidth);
    add('border-right-width', cs.borderRightWidth);
    add('border-bottom-width', cs.borderBottomWidth);
    add('border-left-width', cs.borderLeftWidth);
    add('border-style', cs.borderStyle);
    add('border-color', cs.borderColor);
    add('border-top-left-radius', cs.borderTopLeftRadius);
    add('border-top-right-radius', cs.borderTopRightRadius);
    add('border-bottom-right-radius', cs.borderBottomRightRadius);
    add('border-bottom-left-radius', cs.borderBottomLeftRadius);
    add('background-color', cs.backgroundColor);
    add('box-shadow', cs.boxShadow);
    add('opacity', cs.opacity);
    add('overflow', cs.overflow);
    add('cursor', cs.cursor);
    add('display', cs.display);
    if (cs.display.indexOf('flex') !== -1) {
      add('flex-direction', cs.flexDirection);
      add('flex-wrap', cs.flexWrap);
      add('justify-content', cs.justifyContent);
      add('align-items', cs.alignItems);
      add('gap', cs.rowGap + ' ' + cs.columnGap);
    } else if (cs.display.indexOf('grid') !== -1) {
      add('grid-template-columns', cs.gridTemplateColumns);
      add('grid-template-rows', cs.gridTemplateRows);
      add('gap', cs.rowGap + ' ' + cs.columnGap);
    }
    var parentCs = el.parentElement ? getComputedStyle(el.parentElement) : null;
    if (parentCs && parentCs.display.indexOf('flex') !== -1) {
      add('flex', cs.flexGrow + ' ' + cs.flexShrink + ' ' + cs.flexBasis);
      add('align-self', cs.alignSelf);
      add('order', cs.order);
    }
    if (parentCs && parentCs.display.indexOf('grid') !== -1) {
      add('grid-column', cs.gridColumn);
      add('grid-row', cs.gridRow);
    }
    add('position', cs.position);
    if (cs.position !== 'static') {
      add('top', cs.top);
      add('right', cs.right);
      add('bottom', cs.bottom);
      add('left', cs.left);
      add('z-index', cs.zIndex);
    }
    return props;
  }
  function makeFilterBar(panelEl) {
    var bar = document.createElement('div');
    bar.className = 'filter-bar';
    var input = document.createElement('input');
    input.type = 'text';
    input.placeholder = tr('filterProperties');
    input.value = propertyFilterQuery;
    // Copia TODO el estilo del elemento fijado (cambiado u original, ver
    // collectAllStyleProps) — vive en esta barra, siempre visible arriba
    // del panel, para no depender del banner de "Vista previa" (que solo
    // aparece si hay overrides) ni sumar otro botón a la píldora.
    var copyAllBtn = document.createElement('button');
    copyAllBtn.className = 'filter-clear';
    copyAllBtn.title = tr('copyAllStyle');
    copyAllBtn.textContent = '📦';
    var clearBtn = document.createElement('button');
    clearBtn.className = 'filter-clear';
    clearBtn.title = tr('clearFilter');
    clearBtn.textContent = '↺';
    bar.appendChild(input);
    bar.appendChild(copyAllBtn);
    bar.appendChild(clearBtn);
    copyAllBtn.addEventListener('click', function (e) {
      e.stopPropagation();
      if (!pinnedEl) { flashButtonFeedback(copyAllBtn, '⚠️', '📦', 1500); return; }
      var propsMap = collectAllStyleProps(pinnedEl);
      var css;
      if (twcssInput.checked) {
        css = propsToTailwindClasses(propsMap);
      } else {
        var displaySelector = findOriginalSelector(pinnedEl) || cssSelectorFor(pinnedEl);
        css = propsToCssBlock(displaySelector, propsMap);
      }
      copyText(css);
      flashButtonFeedback(copyAllBtn, '✅', '📦', 1200);
    });
    input.addEventListener('click', function (e) { e.stopPropagation(); });
    input.addEventListener('input', function () {
      propertyFilterQuery = input.value;
      applyPropertyFilter(panelEl, propertyFilterQuery);
      saveState();
    });
    // Enter saca el foco del campo — si no, los atajos de una sola letra
    // (L, S, R...) se quedaban escribiendo acá adentro en vez de disparar.
    input.addEventListener('keydown', function (e) {
      if (e.key === 'Enter') { e.preventDefault(); input.blur(); }
    });
    clearBtn.addEventListener('click', function (e) {
      e.stopPropagation();
      propertyFilterQuery = '';
      input.value = '';
      applyPropertyFilter(panelEl, propertyFilterQuery);
      saveState();
      input.focus();
    });
    return bar;
  }
  function makeHeader(text) {
    var h = document.createElement('h4');
    h.textContent = text;
    return h;
  }
  function clearPanel() { panel.innerHTML = ''; }

  function relLuminance(r, g, b) {
    function ch(c) { c /= 255; return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); }
    return 0.2126 * ch(r) + 0.7152 * ch(g) + 0.0722 * ch(b);
  }
  function parseRGB(str) {
    var m = str.match(/rgba?\(([^)]+)\)/);
    if (!m) return null;
    var parts = m[1].split(',').map(function (s) { return parseFloat(s); });
    return { r: parts[0], g: parts[1], b: parts[2], a: parts.length > 3 ? parts[3] : 1 };
  }
  function effectiveBg(el) {
    var node = el;
    while (node) {
      var rgb = parseRGB(getComputedStyle(node).backgroundColor);
      if (rgb && rgb.a > 0) return rgb;
      node = node.parentElement;
    }
    return { r: 255, g: 255, b: 255, a: 1 };
  }
  function contrastRatio(rgb1, rgb2) {
    var l1 = relLuminance(rgb1.r, rgb1.g, rgb1.b) + 0.05;
    var l2 = relLuminance(rgb2.r, rgb2.g, rgb2.b) + 0.05;
    return l1 > l2 ? l1 / l2 : l2 / l1;
  }
  // Divide un selector por comas de nivel superior, ignorando comas dentro
  // de paréntesis (:is(a, button), :not(.x, .y), etc. — muy comunes en el
  // CSS que compila Tailwind v4).
  function splitSelectorList(sel) {
    var parts = [], depth = 0, cur = '';
    for (var i = 0; i < sel.length; i++) {
      var ch = sel[i];
      if (ch === '(') depth++;
      else if (ch === ')') depth--;
      if (ch === ',' && depth === 0) { parts.push(cur); cur = ''; }
      else cur += ch;
    }
    if (cur.trim()) parts.push(cur);
    return parts.map(function (p) { return p.trim(); }).filter(Boolean);
  }
  // Resuelve el "&" de CSS nesting nativo contra el selector ya resuelto del
  // padre (el CSSOM expone selectorText tal cual está escrito, con "&"
  // literal, no resuelto — hay que resolverlo a mano para poder usar
  // el.matches()).
  function resolveNestedSelectors(selectorText, parentResolved) {
    var parts = splitSelectorList(selectorText);
    var parentWrapped = parentResolved ? (parentResolved.indexOf(',') > -1 ? ':is(' + parentResolved + ')' : parentResolved) : '';
    return parts.map(function (p) {
      if (p.indexOf('&') === -1) return parentResolved ? (parentWrapped + ' ' + p) : p;
      return p.split('&').join(parentWrapped);
    });
  }
  // Encuentra declaraciones CSS de reglas :hover que aplicarían a `el`.
  // No dispara un hover real (no hay acceso a CDP forceState desde JS de
  // página): en vez de eso recorre document.styleSheets (incl. dentro de
  // @layer/@media y CSS nesting nativo con "&"), ubica selectores resueltos
  // que contienen ":hover" y, sacando ese ":hover", chequea con el.matches()
  // si el elemento calzaría con el resto del selector. Es una aproximación
  // (no resuelve cascada/especificidad entre reglas, y pseudo-clases
  // combinadas como :hover:focus se evalúan con el estado ACTUAL del resto
  // de pseudo-clases) pero cubre el caso real de uso: ver qué reglas de
  // hover (incl. utilidades hover: de Tailwind y componentes con &:hover)
  // tocan este elemento.
  function getHoverDeclarations(el) {
    var matches = [];
    function walkRules(rules, parentResolved) {
      if (!rules) return;
      for (var i = 0; i < rules.length; i++) {
        var rule = rules[i];
        if (!rule.selectorText) {
          if (rule.cssRules) walkRules(rule.cssRules, parentResolved);
          continue;
        }
        var resolvedList = resolveNestedSelectors(rule.selectorText, parentResolved);
        resolvedList.forEach(function (fullSel) {
          if (fullSel.indexOf(':hover') === -1 || fullSel.indexOf('::') !== -1) return;
          var probe = fullSel.replace(/:hover\b/g, '');
          if (!probe) return;
          try {
            if (el.matches(probe)) {
              var decls = [];
              for (var k = 0; k < rule.style.length; k++) {
                var prop = rule.style[k];
                decls.push({ prop: prop, value: rule.style.getPropertyValue(prop) });
              }
              if (decls.length) matches.push({ selector: fullSel, decls: decls });
            }
          } catch (e) { /* selector inválido para matches(), se ignora */ }
        });
        if (rule.cssRules && rule.cssRules.length) walkRules(rule.cssRules, resolvedList.join(', '));
      }
    }
    for (var s = 0; s < document.styleSheets.length; s++) {
      try { walkRules(document.styleSheets[s].cssRules, null); } catch (e) { /* hoja cross-origin sin acceso, se ignora */ }
    }
    return matches;
  }
  // Aproximación de especificidad CSS (id > clase/atributo/pseudo-clase >
  // elemento), suficiente para elegir el "ganador" entre varios selectores
  // que matchean el mismo elemento — no hace falta que sea exacta.
  function cssSpecificity(sel) {
    var ids = (sel.match(/#[\w-]+/g) || []).length;
    var classesAttrsPseudo = (sel.match(/\.[\w-]+|\[[^\]]*\]|:[\w-]+/g) || []).length;
    var elements = (sel.match(/(^|[\s>+~(,])[a-zA-Z][\w-]*/g) || []).length;
    return ids * 10000 + classesAttrsPseudo * 100 + elements;
  }
  // Prefijos de utilidades de Tailwind (spacing, tamaño, tipografía, color/
  // borde, flex/grid, posición, efectos...) — no es la lista completa de
  // Tailwind, pero cubre lo que realmente aparece en clases del core de
  // este proyecto. Sirve para descartarlas como selector "de identidad":
  // .mb-12 la comparten decenas de elementos sin relación entre sí, así
  // que no dicen nada sobre qué es este elemento en particular.
  var TW_UTILITY_PREFIXES = [
    'm', 'mt', 'mb', 'ml', 'mr', 'mx', 'my', 'ms', 'me',
    'p', 'pt', 'pb', 'pl', 'pr', 'px', 'py', 'ps', 'pe',
    'w', 'h', 'min-w', 'min-h', 'max-w', 'max-h', 'size',
    'text', 'font', 'leading', 'tracking', 'indent', 'decoration', 'align', 'whitespace', 'break',
    'bg', 'border', 'rounded', 'shadow', 'ring', 'outline', 'divide', 'from', 'via', 'to', 'fill', 'stroke',
    'flex', 'grid', 'gap', 'items', 'justify', 'content', 'self', 'place', 'order', 'col', 'row', 'space',
    'top', 'bottom', 'left', 'right', 'inset', 'z',
    'opacity', 'cursor', 'select', 'overflow', 'pointer-events', 'resize', 'appearance', 'will-change',
    'transition', 'duration', 'ease', 'delay', 'animate', 'scale', 'rotate', 'translate', 'skew', 'origin',
    'blur', 'brightness', 'contrast', 'grayscale', 'invert', 'saturate', 'sepia', 'backdrop',
    'aspect', 'object', 'list', 'table', 'caption', 'columns'
  ];
  var TW_BARE_UTILITIES = [
    'flex', 'grid', 'block', 'inline', 'hidden', 'table', 'contents', 'flow-root',
    'inline-block', 'inline-flex', 'inline-grid', 'uppercase', 'lowercase', 'capitalize',
    'italic', 'underline', 'truncate', 'container', 'sr-only', 'antialiased',
    'static', 'relative', 'absolute', 'fixed', 'sticky', 'isolate'
  ];
  function isTailwindUtilityClass(cls) {
    var name = cls.replace(/^!/, '').replace(/^-/, '');
    // Corta variantes tipo "sm:", "hover:", "dark:", "group-hover:" — se
    // queda solo con la utilidad base, después de los ":" fuera de
    // corchetes (variantes arbitrarias tipo "[&:nth-child(2)]:").
    var lastColon = -1, depth = 0;
    for (var i = 0; i < name.length; i++) {
      if (name[i] === '[') depth++;
      else if (name[i] === ']') depth--;
      else if (name[i] === ':' && depth === 0) lastColon = i;
    }
    if (lastColon > -1) name = name.slice(lastColon + 1);
    if (TW_BARE_UTILITIES.indexOf(name) !== -1) return true;
    var dash = name.indexOf('-');
    if (dash === -1) return false;
    return TW_UTILITY_PREFIXES.indexOf(name.slice(0, dash)) !== -1;
  }
  // true si TODAS las clases del selector son utilidades de Tailwind (un
  // selector sin clases, ej. solo tag/id, no cae acá — ese no es el
  // problema que se busca evitar). El regex admite caracteres escapados
  // (\: \/ \[ ...) — un selector CSS real de una variante de Tailwind se
  // ve como ".group-hover\:scale-105", y sin esto el token se cortaba en
  // la barra invertida, dejando "group-hover" suelto (no reconocido como
  // utilidad) en vez de "group-hover:scale-105" completo.
  function selectorIsPureTailwindUtility(fullSel) {
    var classTokens = fullSel.match(/\.(?:[a-zA-Z_-]|\\.)(?:[\w-]|\\.)*/g);
    if (!classTokens || !classTokens.length) return false;
    return classTokens.every(function (tok) { return isTailwindUtilityClass(tok.slice(1).replace(/\\(.)/g, '$1')); });
  }
  // Busca, en el theme.css PROPIO del proyecto (mismo motivo que
  // findUtilityClassFor: buscar en TODAS las hojas traía selectores de
  // Elementor/WP core/plugins que matchean por casualidad pero no dicen
  // nada), el selector que YA existe y le pega a `el` en su estado normal
  // — se descartan selectores con pseudo-clases de estado (:hover/:focus/
  // :active), pseudo-elementos (::before), compuestos enteramente por
  // utilidades de Tailwind (ver selectorIsPureTailwindUtility) y los que
  // no tienen NINGUNA clase ni id (ej. "html *" o "body" — matchean
  // cualquier cosa, no identifican nada en particular). Entre los que
  // quedan, se queda con el de mayor especificidad. Solo se usa para el
  // TEXTO que se copia al exportar CSS — el selector interno que guarda y
  // reaplica la vista previa sigue siendo el de cssSelectorFor(), único
  // por elemento.
  function findOriginalSelector(el) {
    var best = null, bestSpecificity = -1;
    function walkRules(rules, parentResolved) {
      if (!rules) return;
      for (var i = 0; i < rules.length; i++) {
        var rule = rules[i];
        if (!rule.selectorText) {
          if (rule.cssRules) walkRules(rule.cssRules, parentResolved);
          continue;
        }
        var resolvedList = resolveNestedSelectors(rule.selectorText, parentResolved);
        resolvedList.forEach(function (fullSel) {
          if (/::|:(hover|focus(-visible|-within)?|active)\b/.test(fullSel)) return;
          if (!/[.#]/.test(fullSel)) return;
          if (selectorIsPureTailwindUtility(fullSel)) return;
          try {
            if (el.matches(fullSel)) {
              var spec = cssSpecificity(fullSel);
              if (spec > bestSpecificity) { bestSpecificity = spec; best = fullSel; }
            }
          } catch (e) { /* selector inválido para matches(), se ignora */ }
        });
        if (rule.cssRules && rule.cssRules.length) walkRules(rule.cssRules, resolvedList.join(', '));
      }
    }
    var ownSheet = getOwnThemeStyleSheet();
    if (ownSheet) { try { walkRules(ownSheet.cssRules, null); } catch (e) { /* no debería pasar, es same-origin */ } }
    return best;
  }
  // Como findOriginalSelector pero devuelve el VALOR declarado de `prop` (o null si nadie lo fija explícitamente).
  function specifiedValueFor(el, prop) {
    var inline = el.style && el.style.getPropertyValue(prop);
    if (inline) return inline;
    var best = null, bestSpecificity = -1;
    function walkRules(rules, parentResolved) {
      if (!rules) return;
      for (var i = 0; i < rules.length; i++) {
        var rule = rules[i];
        if (!rule.selectorText) {
          if (rule.cssRules) walkRules(rule.cssRules, parentResolved);
          continue;
        }
        var val = rule.style && rule.style.getPropertyValue(prop);
        var resolvedList = resolveNestedSelectors(rule.selectorText, parentResolved);
        if (val) {
          resolvedList.forEach(function (fullSel) {
            if (/::|:(hover|focus(-visible|-within)?|active)\b/.test(fullSel)) return;
            try {
              if (el.matches(fullSel)) {
                var spec = cssSpecificity(fullSel);
                if (spec > bestSpecificity) { bestSpecificity = spec; best = val; }
              }
            } catch (e) { /* selector inválido para matches(), se ignora */ }
          });
        }
        if (rule.cssRules && rule.cssRules.length) walkRules(rule.cssRules, resolvedList.join(', '));
      }
    }
    for (var s = 0; s < document.styleSheets.length; s++) {
      try { walkRules(document.styleSheets[s].cssRules, null); } catch (e) { /* hoja cross-origin sin acceso, se ignora */ }
    }
    return best;
  }
  // Ubica el theme.css compilado del PROPIO tema hijo, no el del padre (un
  // tema hijo de WP suele heredar uno con el mismo nombre de archivo) — se
  // deriva la ruta desde el <script> del propio tema, mismo truco que ya
  // usa inject-inspector.js. Comparación por .href (resuelta), no por
  // selector [href^=...]: detrás de un proxy (browser-sync) el atributo
  // crudo del <link> suele venir protocol-relative y el selector no
  // matchea aunque el link sea el correcto.
  function getOwnThemeStyleSheet() {
    var ownThemeScript = document.querySelector('script[src*="/assets/js/theme.js"]');
    var themeBase = ownThemeScript ? ownThemeScript.src.replace(/\/js\/theme\.js(\?.*)?$/, '') : null;
    if (!themeBase) return null;
    var cssLinkPrefix = themeBase + '/css/theme.css';
    var cssLinks = document.querySelectorAll('link[rel="stylesheet"]');
    var themeLink = null;
    for (var i = 0; i < cssLinks.length; i++) {
      if (cssLinks[i].href.indexOf(cssLinkPrefix) === 0) { themeLink = cssLinks[i]; break; }
    }
    if (!themeLink) return null;
    for (var i = 0; i < document.styleSheets.length; i++) {
      if (document.styleSheets[i].ownerNode === themeLink) return document.styleSheets[i];
    }
    return null;
  }
  // Tokens --color-* del theme.css real del proyecto (colores de marca:
  // primary, secondary, on-primary, etc.), para el selector de variables de
  // color (ver makeEditableColorRow) — nombre amigable = el token sin el
  // prefijo "--color-". Se computa una sola vez (el CSS del proyecto no
  // cambia en runtime) y se cachea.
  var projectColorVarsCache = null;
  function getProjectColorVariables() {
    if (projectColorVarsCache) return projectColorVarsCache;
    var result = [];
    var sheet = getOwnThemeStyleSheet();
    (function walk(rules) {
      if (!rules) return;
      for (var i = 0; i < rules.length; i++) {
        var rule = rules[i];
        if (rule.style && rule.selectorText && /(^|,)\s*(:root|:host)\s*(,|$)/.test(rule.selectorText)) {
          for (var j = 0; j < rule.style.length; j++) {
            var prop = rule.style[j];
            // Se descarta la paleta numérica "de fábrica" de Tailwind
            // (--color-red-500, --color-gray-900, etc. — viene siempre en
            // @theme aunque el proyecto no la use a propósito) para
            // quedarse solo con los tokens de marca reales (primary,
            // secondary, background, success...), que es lo que se pidió.
            if (prop.indexOf('--color-') === 0 && !/-\d{2,3}$/.test(prop)) {
              result.push({ name: prop.slice('--color-'.length), varName: prop, value: rule.style.getPropertyValue(prop) });
            }
          }
        }
        if (rule.cssRules && rule.cssRules.length) walk(rule.cssRules);
      }
    })(sheet && sheet.cssRules);
    projectColorVarsCache = result;
    return result;
  }

  // ---------------------------------------------------------------------
  // Modo TWCSS: convierte un valor CSS ya calculado en la clase de
  // Tailwind equivalente, para copiar/exportar clases en vez de CSS plano.
  // No asume nada de UN proyecto en particular: primero busca si esa
  // propiedad+valor YA sale de alguna clase simple cargada en la página
  // actual (cualquier framework, no solo Tailwind), y solo si no encuentra
  // nada arma una utilidad de Tailwind "genérica" con vocabulario público
  // de Tailwind (no específico de ningún proyecto).
  // ---------------------------------------------------------------------
  var COLOR_PROPS = { color: 1, 'background-color': 1, 'border-color': 1 };
  // Compara valores CSS "peras con peras": para color, todo pasa por
  // rgbToHex (acepta rgb()/rgba(); si el string ya es hex, rgbToHex
  // devuelve null y cae al string tal cual, que ya está en ese formato).
  function normalizeForCompare(prop, value) {
    if (COLOR_PROPS[prop]) {
      var hex = rgbToHex(value);
      if (hex) return hex.toLowerCase();
    }
    return String(value).replace(/\s+/g, ' ').trim().toLowerCase();
  }
  // Palabra clave -> clase exacta de Tailwind, para propiedades tipo enum
  // donde el nombre de la utilidad no es simplemente "prefijo-valor".
  var TW_KEYWORD_CLASS = {
    display: { flex: 'flex', grid: 'grid', block: 'block', inline: 'inline', 'inline-block': 'inline-block', 'inline-flex': 'inline-flex', 'inline-grid': 'inline-grid', none: 'hidden', table: 'table', 'flow-root': 'flow-root', contents: 'contents', 'list-item': 'list-item' },
    position: { static: 'static', relative: 'relative', absolute: 'absolute', fixed: 'fixed', sticky: 'sticky' },
    'flex-direction': { row: 'flex-row', 'row-reverse': 'flex-row-reverse', column: 'flex-col', 'column-reverse': 'flex-col-reverse' },
    'flex-wrap': { nowrap: 'flex-nowrap', wrap: 'flex-wrap', 'wrap-reverse': 'flex-wrap-reverse' },
    'justify-content': { 'flex-start': 'justify-start', start: 'justify-start', 'flex-end': 'justify-end', end: 'justify-end', center: 'justify-center', 'space-between': 'justify-between', 'space-around': 'justify-around', 'space-evenly': 'justify-evenly', normal: 'justify-normal' },
    'align-items': { 'flex-start': 'items-start', start: 'items-start', 'flex-end': 'items-end', end: 'items-end', center: 'items-center', baseline: 'items-baseline', stretch: 'items-stretch', normal: 'items-stretch' },
    'align-self': { auto: 'self-auto', 'flex-start': 'self-start', start: 'self-start', 'flex-end': 'self-end', end: 'self-end', center: 'self-center', baseline: 'self-baseline', stretch: 'self-stretch' },
    'text-align': { left: 'text-left', center: 'text-center', right: 'text-right', justify: 'text-justify', start: 'text-start', end: 'text-end' },
    'text-transform': { uppercase: 'uppercase', lowercase: 'lowercase', capitalize: 'capitalize', none: 'normal-case' },
    overflow: { visible: 'overflow-visible', hidden: 'overflow-hidden', scroll: 'overflow-scroll', auto: 'overflow-auto', clip: 'overflow-clip' },
    'border-style': { solid: 'border-solid', dashed: 'border-dashed', dotted: 'border-dotted', double: 'border-double', none: 'border-none', hidden: 'border-hidden' },
    'font-weight': { '100': 'font-thin', '200': 'font-extralight', '300': 'font-light', '400': 'font-normal', normal: 'font-normal', '500': 'font-medium', '600': 'font-semibold', '700': 'font-bold', bold: 'font-bold', '800': 'font-extrabold', '900': 'font-black' }
  };
  // Propiedades donde el sufijo de la clase es literalmente el valor CSS
  // (cursor-pointer, cursor-not-allowed...): alcanza con un prefijo simple.
  var TW_KEYWORD_PREFIX = { cursor: 'cursor' };
  // Propiedad -> prefijo de utilidad para valores numéricos/color, armado
  // como prefijo-[valor] (sintaxis de valor arbitrario de Tailwind).
  var TW_PROP_PREFIX = {
    'font-size': 'text', color: 'text', 'background-color': 'bg', 'border-color': 'border',
    'line-height': 'leading', 'letter-spacing': 'tracking',
    width: 'w', height: 'h', 'min-width': 'min-w', 'max-width': 'max-w', 'min-height': 'min-h', 'max-height': 'max-h',
    'padding-top': 'pt', 'padding-right': 'pr', 'padding-bottom': 'pb', 'padding-left': 'pl',
    'margin-top': 'mt', 'margin-right': 'mr', 'margin-bottom': 'mb', 'margin-left': 'ml',
    'border-top-width': 'border-t', 'border-right-width': 'border-r', 'border-bottom-width': 'border-b', 'border-left-width': 'border-l',
    'border-top-left-radius': 'rounded-tl', 'border-top-right-radius': 'rounded-tr', 'border-bottom-right-radius': 'rounded-br', 'border-bottom-left-radius': 'rounded-bl',
    'box-shadow': 'shadow', opacity: 'opacity', 'z-index': 'z',
    top: 'top', right: 'right', bottom: 'bottom', left: 'left',
    gap: 'gap', order: 'order', flex: 'flex',
    'grid-template-columns': 'grid-cols', 'grid-template-rows': 'grid-rows'
  };
  // Espacios -> "_" dentro de corchetes: Tailwind corta la clase en el
  // primer espacio si no van escapados así.
  function tailwindArbitraryValue(value) {
    return String(value).trim().replace(/\s+/g, '_');
  }
  // <div> de prueba fuera de pantalla: aplicarle una clase candidata y leer
  // su estilo YA CALCULADO es la única forma de comparar peras con peras
  // (el valor "de fuente" de una regla puede estar en rem/var()/etc., el
  // valor ya calculado del elemento real siempre está resuelto a px/rgb())
  // sin tener que parsear unidades a mano.
  // Vive en el documento PRINCIPAL a propósito (no en el iframe aislado):
  // prueba clases que YA existen en el CSS real del proyecto (findUtility-
  // ClassFor), y esas clases solo tienen efecto donde el theme.css real
  // está cargado. El iframe aislado no lo tiene (solo el Tailwind genérico
  // del CDN) — ponerle ahí "text-primary" no hacía nada y siempre caía al
  // fallback arbitrario text-[#...]. Es seguro: nunca dispara el CDN,
  // porque el CDN ya no observa el documento principal (ver
  // ensureTailwindCDN) — sea cual sea la clase que se le ponga acá, no hay
  // nada escuchando del otro lado.
  var twProbeEl = null;
  function tailwindProbeElement() {
    if (!twProbeEl || !twProbeEl.isConnected) {
      twProbeEl = document.createElement('div');
      twProbeEl.style.cssText = 'position:absolute;visibility:hidden;pointer-events:none;left:-99999px;top:-99999px;';
      document.body.appendChild(twProbeEl);
    }
    return twProbeEl;
  }
  // Este SÍ vive dentro del iframe aislado — para el caso contrario:
  // compilar una clase de stock que el proyecto todavía NO tiene (ver
  // stockClassToStyleDiff), que necesita al CDN de verdad.
  var twCdnProbeEl = null;
  function twcdnProbeElement() {
    if (!twCdnProbeEl || !twCdnProbeEl.isConnected) {
      var doc = (twFrame && twFrame.contentDocument) || document;
      twCdnProbeEl = doc.createElement('div');
      twCdnProbeEl.style.cssText = 'position:absolute;visibility:hidden;pointer-events:none;left:-99999px;top:-99999px;';
      (doc.body || document.body).appendChild(twCdnProbeEl);
    }
    return twCdnProbeEl;
  }
  // ¿ya existe una regla REAL (del proyecto, no del CDN aislado) para esta
  // clase en las hojas del documento principal? Si sí, con poner la clase
  // alcanza — no hace falta nada más. Si no (clase de stock recién escrita
  // en el editor de árbol, que el build real todavía no compiló), hace
  // falta compilarla aparte para que se vea en vivo — ver
  // stockClassToStyleDiff.
  function classHasRealCss(cls) {
    var re = new RegExp('\\.' + cls.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '(?![\\w-])');
    function walk(rules) {
      if (!rules) return false;
      for (var i = 0; i < rules.length; i++) {
        var rule = rules[i];
        if (rule.selectorText && re.test(rule.selectorText)) return true;
        if (rule.cssRules && rule.cssRules.length && walk(rule.cssRules)) return true;
      }
      return false;
    }
    for (var s = 0; s < document.styleSheets.length; s++) {
      try { if (walk(document.styleSheets[s].cssRules)) return true; } catch (e) { /* hoja cross-origin sin acceso, se ignora */ }
    }
    return false;
  }
  // Compila una clase de utilidad "de stock" DENTRO del iframe aislado
  // (donde vive el Tailwind CDN, ver ensureTailwindCDN) y devuelve solo las
  // propiedades CSS reales que esa clase termina fijando — nunca la regla
  // ".clase{...}" en sí, que es lo que rompía la página antes. Compara el
  // estilo calculado del probe sin clase vs. con la clase puesta: la
  // diferencia ES el efecto real de esa clase, ya resuelto a valores
  // concretos (px/rgb/matrix()), listo para aplicar como CSS nativo con
  // setElementOverride sobre el elemento real — sin que el CDN participe
  // nunca del cascade de la página. Asíncrono a propósito: el CDN recompila
  // con SU PROPIO MutationObserver (async por naturaleza), así que leer el
  // estilo calculado inmediatamente después de poner la clase todavía trae
  // el resultado viejo — verificado en vivo, sin esta espera el diff da
  // siempre vacío.
  function stockClassToStyleDiff(cls, callback) {
    var probe = twcdnProbeElement();
    var win = (twFrame && twFrame.contentWindow) || window;
    probe.className = '';
    var before = win.getComputedStyle(probe);
    var beforeProps = {};
    for (var i = 0; i < before.length; i++) { beforeProps[before[i]] = before.getPropertyValue(before[i]); }
    probe.className = cls;
    setTimeout(function () {
      var after = win.getComputedStyle(probe);
      var diff = {};
      for (var i = 0; i < after.length; i++) {
        var prop = after[i];
        if (prop.indexOf('--') === 0) continue; // variables internas de Tailwind (--tw-*): sin la clase que las compone no dicen nada por sí solas
        var val = after.getPropertyValue(prop);
        if (beforeProps[prop] !== val) diff[prop] = val;
      }
      probe.className = '';
      callback(diff);
    }, 150);
  }
  // Para cada clase de `classString` que NO tenga ya CSS real en el
  // proyecto, la compila en el iframe aislado y aplica el resultado como
  // overrides de "vista previa" normales (mismo sistema que el editor de
  // estilos: localStorage, indicador ámbar, restablecer, exportar CSS) —
  // así una clase de stock recién escrita se ve en vivo sin que el CDN
  // toque jamás el cascade real de la página. Una clase a la vez (no en
  // paralelo): todas comparten el mismo elemento de prueba, así que
  // diffear dos a la vez las pisaría entre sí.
  function applyUnknownClassesLive(el, classString) {
    var selector = cssSelectorFor(el);
    var pending = classString.trim().split(/\s+/).filter(function (cls) { return cls && !classHasRealCss(cls); });
    function next(i) {
      if (i >= pending.length) { updateOverrideIndicator(); return; }
      stockClassToStyleDiff(pending[i], function (diff) {
        Object.keys(diff).forEach(function (prop) { setElementOverride(el, selector, prop, diff[prop]); });
        next(i + 1);
      });
    }
    next(0);
  }
  // Prefijos casi universales de clases generadas por el CMS/framework
  // (WordPress/Gutenberg, Elementor, Drupal, Wagtail...), no por el
  // proyecto — lista corta a propósito: la señal más fuerte y genérica es
  // BEM (__ / --, ver isFrameworkClass), esto solo suma los casos
  // comunes que no siempre siguen esa convención.
  var CMS_CLASS_PREFIXES = ['wp-', 'elementor-', 'block-', 'region-', 'field-', 'node-', 'views-', 'paragraph-', 'wagtail-', 'django-'];
  // ¿esta clase huele a "scaffolding" de un CMS/framework en vez de una
  // utilidad de diseño reusable? Señal principal: separadores BEM (__
  // elemento, -- modificador) típicos de clases de bloque/componente
  // autogeneradas (wp-block-navigation__container, paragraph--type-hero)
  // — una utilidad real (mt-4, text-red-500) casi nunca los lleva. Señal
  // secundaria: prefijos de CMS conocidos, para los casos sin BEM
  // (wp-block-group, has-large-font-size).
  function isFrameworkClass(cls) {
    if (cls.indexOf('__') !== -1 || cls.indexOf('--') !== -1) return true;
    for (var i = 0; i < CMS_CLASS_PREFIXES.length; i++) {
      if (cls.indexOf(CMS_CLASS_PREFIXES[i]) === 0) return true;
    }
    return false;
  }
  // (a) ¿esta propiedad+valor ya sale de alguna clase simple (un solo
  // selector de clase, sin combinadores/variantes) del theme.css PROPIO
  // del proyecto? Primero junta candidatas cuya regla declara la propiedad
  // (aunque sea vía shorthand o var(), CSSOM ya la expone expandida), y
  // recién ahí las prueba una por una en el elemento de prueba — así el
  // trabajo pesado (getComputedStyle) se hace solo sobre un puñado de
  // clases, no sobre todas las de la hoja. Ojo: se busca SOLO en la hoja
  // propia, no en TODAS las cargadas — Elementor, WP core, Font Awesome,
  // plugins (hfe-*, e-con, fab, screen-reader-text...) también pueden
  // coincidir por casualidad en el valor exacto (ej. cursor:auto lo
  // comparte medio internet), pero no son utilidades reales para copiar.
  // Restringido así, cualquier candidata que quede ya es del proyecto —
  // isFrameworkClass se usa igual como filtro extra por las dudas (una
  // clase BEM propia del proyecto tampoco es una "utilidad" reusable),
  // pero ya no hay fallback a una de scaffolding: si no hay nada limpio,
  // no se devuelve nada (valueToTailwindClass cae al valor arbitrario).
  function findUtilityClassFor(prop, value) {
    var candidates = [];
    function walkRules(rules, parentResolved) {
      if (!rules) return;
      for (var i = 0; i < rules.length; i++) {
        var rule = rules[i];
        if (!rule.selectorText) {
          if (rule.cssRules) walkRules(rule.cssRules, parentResolved);
          continue;
        }
        var resolvedList = resolveNestedSelectors(rule.selectorText, parentResolved);
        if (rule.style && rule.style.getPropertyValue(prop)) {
          resolvedList.forEach(function (fullSel) {
            if (/^\.[a-zA-Z_-][\w-]*$/.test(fullSel)) candidates.push(fullSel.slice(1));
          });
        }
        if (rule.cssRules && rule.cssRules.length) walkRules(rule.cssRules, resolvedList.join(', '));
      }
    }
    var ownSheet = getOwnThemeStyleSheet();
    if (ownSheet) { try { walkRules(ownSheet.cssRules, null); } catch (e) { /* no debería pasar, es same-origin */ } }
    var target = normalizeForCompare(prop, value);
    var probe = tailwindProbeElement();
    for (var c = 0; c < candidates.length; c++) {
      var cls = candidates[c];
      // Lista BLANCA, no negra: tiene que tener la FORMA de una utilidad
      // real (prefijo conocido de Tailwind — text-, bg-, border-, w-...) o
      // ser una de las "sueltas" (sr-only, flex, static...). Restringir a
      // la hoja propia (arriba) ya sacaba lo de otros plugins, pero cosas
      // como Swiper o clases de test (test-responsive) a veces terminan
      // compiladas DENTRO del mismo theme.css (@import) — esto las saca
      // sin tener que nombrarlas una por una.
      if (!isTailwindUtilityClass(cls)) continue;
      if (isFrameworkClass(cls)) continue;
      probe.className = cls;
      var computed = getComputedStyle(probe).getPropertyValue(prop);
      if (normalizeForCompare(prop, computed) !== target) continue;
      probe.className = '';
      return cls;
    }
    probe.className = '';
    return null;
  }
  var TW_COLOR_PROPS = { color: 1, 'background-color': 1, 'border-color': 1 };
  // Para "copiar TODO el estilo" (📦): ese flujo lee getComputedStyle, que
  // SIEMPRE devuelve el color ya resuelto (rgb/oklch) aunque se haya
  // fijado con var(--color-x) — para cuando eso pasa, y findUtilityClassFor
  // no encontró una clase ya compilada, se compara ese resuelto contra los
  // tokens de marca del proyecto (mismo probe que usa el "activo" del
  // dropdown de colores) antes de rendirse al valor arbitrario.
  function findColorVariableClassFor(prop, value) {
    if (!TW_COLOR_PROPS[prop]) return null;
    var vars = getProjectColorVariables();
    if (!vars.length) return null;
    var probe = tailwindProbeElement();
    var target = normalizeForCompare(prop, value);
    for (var i = 0; i < vars.length; i++) {
      probe.style.setProperty(prop, vars[i].value);
      var resolved = getComputedStyle(probe).getPropertyValue(prop);
      probe.style.removeProperty(prop);
      if (normalizeForCompare(prop, resolved) === target) return TW_PROP_PREFIX[prop] + '-' + vars[i].name;
    }
    return null;
  }
  // Punto de entrada del modo TWCSS: reusar > variable de color detectada >
  // palabra clave > valor arbitrario con prefijo conocido > propiedad
  // arbitraria (esta última cubre CUALQUIER propiedad CSS, así que siempre
  // hay algo para copiar).
  function valueToTailwindClass(prop, value) {
    // El selector de variables de color (ver openColorVarDropdown) guarda
    // el override como var(--color-x) literal — a propósito, para que la
    // página lo resuelva en vivo. Pero ese texto crudo no es comparable
    // contra un valor ya resuelto (rgb/oklch), así que buscar una clase
    // que "matchee" ese valor siempre fallaba y terminaba en el arbitrario
    // text-[var(--color-x)], que no es lo que nadie quiere copiar. Si ya
    // sabemos que es una referencia a un token de color, el nombre corto
    // sale directo del propio token — no hace falta buscar ni adivinar.
    var colorVarMatch = /^var\(\s*(--color-[\w-]+)\s*\)$/.exec(String(value).trim());
    if (colorVarMatch && TW_PROP_PREFIX[prop]) {
      return TW_PROP_PREFIX[prop] + '-' + colorVarMatch[1].slice('--color-'.length);
    }
    var reused = findUtilityClassFor(prop, value);
    if (reused) return reused;
    var colorVarClass = findColorVariableClassFor(prop, value);
    if (colorVarClass) return colorVarClass;
    var keywordMap = TW_KEYWORD_CLASS[prop];
    if (keywordMap && keywordMap[value] != null) return keywordMap[value];
    if (TW_KEYWORD_PREFIX[prop]) return TW_KEYWORD_PREFIX[prop] + '-' + value;
    if (TW_PROP_PREFIX[prop]) return TW_PROP_PREFIX[prop] + '-[' + tailwindArbitraryValue(value) + ']';
    return '[' + prop + ':' + tailwindArbitraryValue(value) + ']';
  }

  // ---------------------------------------------------------------------
  // Modo TWCSS — selector de escala numérica (margin/padding/width/height/
  // gap/posición) y de clases de tipografía detectadas (font-size/weight/
  // family/line-height/letter-spacing), botón 🔢/🔤 junto al ✏️ de cada fila
  // (ver makeEditableRow más abajo). Mismo espíritu que el selector de
  // variables de color (🎨, ver openColorVarDropdown/makeEditableColorRow
  // más arriba): elegir una opción aplica siempre el VALOR REAL resuelto
  // sobre el elemento (nunca el nombre de la clase, así la fila sigue
  // mostrando lo mismo que el inspector de Chrome), y en modo TWCSS
  // además copia el nombre de la clase para pegar en el código.
  // ---------------------------------------------------------------------

  // Propiedades que en Tailwind salen de la escala numérica de espaciado
  // (spacing scale) — mismo prefijo que ya usa TW_PROP_PREFIX para copiar.
  // Deliberadamente NO incluye border-width (escala 0/1/2/4/8, no 0..12) ni
  // border-radius (escala por nombre: sm/md/lg/xl, no numérica).
  var TW_SPACING_SCALE_PROPS = {
    'margin-top': 1, 'margin-right': 1, 'margin-bottom': 1, 'margin-left': 1,
    'padding-top': 1, 'padding-right': 1, 'padding-bottom': 1, 'padding-left': 1,
    width: 1, height: 1, 'min-width': 1, 'max-width': 1, 'min-height': 1, 'max-height': 1,
    gap: 1, top: 1, right: 1, bottom: 1, left: 1
  };
  var NUMERIC_SCALE_MAX = 12; // "un número razonable" pedido explícitamente
  // Base real de la escala de espaciado del proyecto: en Tailwind v4 vive en
  // la variable --spacing (@theme), heredable desde :root — se lee tal cual
  // en vez de asumir el default de fábrica (0.25rem), por si el proyecto la
  // personalizó. Si no está definida (proyecto sin Tailwind v4), cae a ese
  // default igual: la escala sigue siendo útil aunque no sea exacta.
  function spacingBaseRem() {
    var v = getComputedStyle(document.documentElement).getPropertyValue('--spacing').trim();
    return v || '0.25rem';
  }
  // Se resuelve con un calc() real contra --spacing (heredado de :root, ver
  // spacingBaseRem) en vez de compilar la clase de a una por el CDN — mismo
  // resultado final que tendría la clase ya compilada del proyecto, sin
  // esperar al iframe aislado (que además solo conoce la escala default de
  // Tailwind, no la personalizada del proyecto).
  function numericScaleCandidatesFor(prop) {
    var prefix = TW_PROP_PREFIX[prop];
    if (!prefix) return [];
    var probe = tailwindProbeElement();
    var base = spacingBaseRem();
    var candidates = [];
    for (var n = 0; n <= NUMERIC_SCALE_MAX; n++) {
      probe.style.setProperty(prop, 'calc(' + base + ' * ' + n + ')');
      var resolved = getComputedStyle(probe).getPropertyValue(prop);
      probe.style.removeProperty(prop);
      candidates.push({ className: prefix + '-' + n, value: resolved });
    }
    return candidates;
  }

  // Propiedades de Tipografía con selector de clases DETECTADAS (no
  // generadas): junta las clases reales del theme.css propio del proyecto
  // que afectan justo esa propiedad — igual criterio de "limpieza" que
  // findUtilityClassFor (selector de una sola clase, con forma de utilidad
  // real de Tailwind, sin BEM) pero sin buscar un valor puntual: se listan
  // TODAS, para elegir en el desplegable. Cacheado por propiedad (el CSS
  // del proyecto no cambia en runtime).
  var TW_DETECT_PROPS = { 'font-size': 1, 'font-weight': 1, 'font-family': 1, 'line-height': 1, 'letter-spacing': 1 };
  var projectUtilityClassesCache = {};
  function getProjectUtilityClassesFor(prop) {
    if (projectUtilityClassesCache[prop]) return projectUtilityClassesCache[prop];
    var seen = {};
    var result = [];
    var probe = tailwindProbeElement();
    function walkRules(rules) {
      if (!rules) return;
      for (var i = 0; i < rules.length; i++) {
        var rule = rules[i];
        if (!rule.selectorText) { if (rule.cssRules) walkRules(rule.cssRules); continue; }
        if (rule.style && rule.style.getPropertyValue(prop)) {
          var m = /^\.([a-zA-Z_-][\w-]*)$/.exec(rule.selectorText.trim());
          if (m && !seen[m[1]] && isTailwindUtilityClass(m[1]) && !isFrameworkClass(m[1])) {
            seen[m[1]] = true;
            probe.className = m[1];
            result.push({ className: m[1], value: getComputedStyle(probe).getPropertyValue(prop) });
            probe.className = '';
          }
        }
        if (rule.cssRules && rule.cssRules.length) walkRules(rule.cssRules);
      }
    }
    var sheet = getOwnThemeStyleSheet();
    if (sheet) { try { walkRules(sheet.cssRules); } catch (e) { /* no debería pasar, es same-origin */ } }
    // Orden pedido: de mayor a menor valor numérico (ej. tamaños de fuente,
    // el más grande arriba) — las que no tienen un valor numérico (ej.
    // font-family, un string) quedan al final, sin reordenarse entre sí.
    result.sort(function (a, b) {
      var av = parseFloat(a.value), bv = parseFloat(b.value);
      var aNaN = isNaN(av), bNaN = isNaN(bv);
      if (aNaN && bNaN) return 0;
      if (aNaN) return 1;
      if (bNaN) return -1;
      return bv - av;
    });
    projectUtilityClassesCache[prop] = result;
    return result;
  }

  // "Preset" de tipografía: una clase del proyecto que en una sola regla
  // fija 2 o más propiedades tipográficas a la vez (ej. una clase propia
  // "text-h2" con font-size + font-weight + line-height juntos) — no
  // cualquier clase con una sola propiedad, esas ya las cubre el selector
  // por fila (🔤, ver TW_DETECT_PROPS). Vive junto al header "Tipografía"
  // (ver renderStyles) para aplicar todo el combo de una — elegir uno
  // resuelve CADA propiedad que esa clase fija (por separado, vía el mismo
  // probe que el resto) y las aplica todas, así las filas de abajo quedan
  // mostrando el valor real resultante de cada una.
  var TYPOGRAPHY_PRESET_PROPS = ['font-family', 'font-size', 'font-weight', 'line-height', 'letter-spacing'];
  var projectTypographyPresetsCache = null;
  function getProjectTypographyPresets() {
    if (projectTypographyPresetsCache) return projectTypographyPresetsCache;
    var byClass = {};
    function walkRules(rules) {
      if (!rules) return;
      for (var i = 0; i < rules.length; i++) {
        var rule = rules[i];
        if (!rule.selectorText) { if (rule.cssRules) walkRules(rule.cssRules); continue; }
        var m = /^\.([a-zA-Z_-][\w-]*)$/.exec(rule.selectorText.trim());
        if (m && rule.style) {
          var matchedProps = TYPOGRAPHY_PRESET_PROPS.filter(function (p) { return !!rule.style.getPropertyValue(p); });
          if (matchedProps.length >= 2 && isTailwindUtilityClass(m[1]) && !isFrameworkClass(m[1])) {
            if (!byClass[m[1]]) byClass[m[1]] = { className: m[1], props: [] };
            matchedProps.forEach(function (p) { if (byClass[m[1]].props.indexOf(p) === -1) byClass[m[1]].props.push(p); });
          }
        }
        if (rule.cssRules && rule.cssRules.length) walkRules(rule.cssRules);
      }
    }
    var sheet = getOwnThemeStyleSheet();
    if (sheet) { try { walkRules(sheet.cssRules); } catch (e) { /* no debería pasar, es same-origin */ } }
    projectTypographyPresetsCache = Object.keys(byClass).map(function (k) { return byClass[k]; });
    // Orden pedido: de mayor a menor tamaño de fuente (el preset más grande
    // arriba, ej. text-h1 antes que text-h6) — resuelto vía el mismo probe
    // de siempre. Los presets que no fijan font-size (rarísimo, pero
    // posible si alguno solo combina peso+letter-spacing) quedan al final.
    var probe = tailwindProbeElement();
    projectTypographyPresetsCache.forEach(function (preset) {
      if (preset.props.indexOf('font-size') !== -1) {
        probe.className = preset.className;
        preset._sortSize = parseFloat(getComputedStyle(probe).getPropertyValue('font-size'));
        probe.className = '';
      } else {
        preset._sortSize = NaN;
      }
    });
    projectTypographyPresetsCache.sort(function (a, b) {
      var aNaN = isNaN(a._sortSize), bNaN = isNaN(b._sortSize);
      if (aNaN && bNaN) return 0;
      if (aNaN) return 1;
      if (bNaN) return -1;
      return b._sortSize - a._sortSize;
    });
    return projectTypographyPresetsCache;
  }
  // Aplica TODAS las propiedades de un preset (ver getProjectTypographyPresets)
  // sobre el elemento fijado, cada una resuelta a su valor real vía el mismo
  // probe de siempre — un solo refresco de panel al final, no uno por
  // propiedad.
  function applyTypographyPreset(preset) {
    if (!pinnedEl) return;
    var selector = cssSelectorFor(pinnedEl);
    var probe = tailwindProbeElement();
    probe.className = preset.className;
    preset.props.forEach(function (p) {
      setElementOverride(pinnedEl, selector, p, getComputedStyle(probe).getPropertyValue(p));
    });
    probe.className = '';
    updateOverrideIndicator();
    if (twcssInput.checked) copyText(preset.className);
    refreshPanelKeepScroll();
  }
  var typographyPresetDropdownEl = null, typographyPresetDropdownAnchor = null;
  function closeTypographyPresetDropdown() {
    if (typographyPresetDropdownEl) { typographyPresetDropdownEl.remove(); typographyPresetDropdownEl = null; typographyPresetDropdownAnchor = null; }
  }
  function openTypographyPresetDropdown(anchorBtn) {
    var wasOpenForThisBtn = typographyPresetDropdownAnchor === anchorBtn;
    closeAllVariantDropdowns();
    if (wasOpenForThisBtn) return;
    var presets = getProjectTypographyPresets();
    var rect = anchorBtn.getBoundingClientRect();
    var dd = document.createElement('div');
    dd.className = 'color-var-dropdown';
    dd.style.cssText = 'left:' + rect.left + 'px;top:0px;visibility:hidden;';
    if (!presets.length) {
      var empty = document.createElement('div');
      empty.className = 'color-var-empty';
      empty.textContent = tr('noTypographyPresets');
      dd.appendChild(empty);
    } else {
      presets.forEach(function (preset) {
        var item = document.createElement('div');
        item.className = 'color-var-item';
        var name = document.createElement('span');
        name.textContent = preset.className;
        item.appendChild(name);
        // Sin la lista de propiedades que toca (preset.props) acá a
        // propósito: pedido explícito — en ESTE selector (el general, con
        // varios presets a la vez) esa lista siempre repite casi lo mismo
        // (font-family · font-size · font-weight · line-height en todas
        // las filas) y no aporta nada para diferenciar una opción de otra.
        // Los selectores POR PROPIEDAD (🔤, ver openVarPickerDropdown) sí
        // siguen mostrando su propio preview (el valor real resuelto) —
        // eso no se toca.
        item.addEventListener('click', function (e) {
          e.stopPropagation();
          applyTypographyPreset(preset);
          item.classList.add('picked');
          setTimeout(closeTypographyPresetDropdown, 500);
        });
        dd.appendChild(item);
      });
    }
    positionVariantDropdown(dd, rect);
    typographyPresetDropdownEl = dd;
    typographyPresetDropdownAnchor = anchorBtn;
  }
  root.addEventListener('click', function (e) {
    if (typographyPresetDropdownEl && e.target !== typographyPresetDropdownAnchor && !typographyPresetDropdownEl.contains(e.target)) closeTypographyPresetDropdown();
  });

  // Desplegable genérico (numérico o detectado, según quién llame) —
  // separado de openColorVarDropdown (que además pinta un swatch de color)
  // pero comparte sus mismas clases CSS de lista (.color-var-*, ver <style>
  // del panel). candidates: [{className, value}], value ya es el real
  // resuelto en el proyecto.
  var varPickerDropdownEl = null, varPickerDropdownAnchor = null;
  function closeVarPickerDropdown() {
    if (varPickerDropdownEl) { varPickerDropdownEl.remove(); varPickerDropdownEl = null; varPickerDropdownAnchor = null; }
  }
  function openVarPickerDropdown(anchorBtn, prop, currentValue, candidates, allowCustomNumber) {
    var wasOpenForThisBtn = varPickerDropdownAnchor === anchorBtn;
    closeAllVariantDropdowns();
    if (wasOpenForThisBtn) return;
    var rect = anchorBtn.getBoundingClientRect();
    var dd = document.createElement('div');
    dd.className = 'color-var-dropdown';
    dd.style.cssText = 'left:' + rect.left + 'px;top:0px;visibility:hidden;';
    if (!candidates.length) {
      var empty = document.createElement('div');
      empty.className = 'color-var-empty';
      empty.textContent = tr('noClassesDetected');
      dd.appendChild(empty);
    } else {
      var target = normalizeForCompare(prop, currentValue);
      candidates.forEach(function (cand) {
        var item = document.createElement('div');
        item.className = 'color-var-item';
        var isActive = normalizeForCompare(prop, cand.value) === target;
        if (isActive) item.classList.add('active');
        var name = document.createElement('span');
        name.textContent = cand.className;
        var valuePreview = document.createElement('span');
        valuePreview.className = 'var-item-value';
        valuePreview.textContent = cand.value;
        var check = document.createElement('span');
        check.className = 'color-var-check';
        check.textContent = '✓';
        check.style.visibility = isActive ? 'visible' : 'hidden';
        item.appendChild(name);
        item.appendChild(valuePreview);
        item.appendChild(check);
        item.addEventListener('click', function (e) {
          e.stopPropagation();
          // Se aplica SIEMPRE el valor real (los dos modos) — mismo criterio
          // que el selector de colores. En TWCSS además copia el nombre de
          // la clase, para pegar en el código real.
          commitStyleEdit(prop, cand.value);
          if (twcssInput.checked) {
            copyText(cand.className);
            check.style.visibility = 'visible';
            item.classList.add('picked');
            setTimeout(closeVarPickerDropdown, 500);
          } else {
            closeVarPickerDropdown();
          }
        });
        dd.appendChild(item);
      });
    }
    // Fila final: campo numérico libre, para valores fuera de la escala
    // 0-12 generada (ver numericScaleCandidatesFor) — solo en el selector
    // de escala numérica (🔢), no en el de clases detectadas (🔤, esas son
    // las que YA existen de verdad en el proyecto, un número inventado no
    // aplica ahí). Recalcula el valor real en vivo con cada tecla (mismo
    // calc(var(--spacing) * N) que las candidatas generadas) y aplica +
    // copia (si TWCSS) recién al confirmar con Enter.
    if (allowCustomNumber) {
      var prefix = TW_PROP_PREFIX[prop];
      var customRow = document.createElement('div');
      customRow.className = 'color-var-custom';
      var prefixLabel = document.createElement('span');
      prefixLabel.textContent = prefix + '-';
      var numInput = document.createElement('input');
      numInput.type = 'number';
      numInput.className = 'var-custom-input';
      numInput.placeholder = 'N';
      var customPreview = document.createElement('span');
      customPreview.className = 'var-item-value';
      function resolveCustom(n) {
        var probe = tailwindProbeElement();
        probe.style.setProperty(prop, 'calc(' + spacingBaseRem() + ' * ' + n + ')');
        var resolved = getComputedStyle(probe).getPropertyValue(prop);
        probe.style.removeProperty(prop);
        return resolved;
      }
      numInput.addEventListener('click', function (e) { e.stopPropagation(); });
      numInput.addEventListener('input', function (e) {
        e.stopPropagation();
        var n = parseFloat(numInput.value);
        customPreview.textContent = isNaN(n) ? '' : resolveCustom(n);
      });
      numInput.addEventListener('keydown', function (e) {
        e.stopPropagation();
        if (e.key !== 'Enter') return;
        var n = parseFloat(numInput.value);
        if (isNaN(n)) return;
        var resolved = resolveCustom(n);
        commitStyleEdit(prop, resolved);
        if (twcssInput.checked) copyText(prefix + '-' + n);
        closeVarPickerDropdown();
      });
      customRow.appendChild(prefixLabel);
      customRow.appendChild(numInput);
      customRow.appendChild(customPreview);
      dd.appendChild(customRow);
    }
    positionVariantDropdown(dd, rect);
    varPickerDropdownEl = dd;
    varPickerDropdownAnchor = anchorBtn;
  }
  root.addEventListener('click', function (e) {
    if (varPickerDropdownEl && e.target !== varPickerDropdownAnchor && !varPickerDropdownEl.contains(e.target)) closeVarPickerDropdown();
  });

  function reactSourceFor(el) {
    var key = Object.keys(el).find(function (k) { return k.indexOf('__reactFiber$') === 0 || k.indexOf('__reactInternalInstance$') === 0; });
    if (!key) return null;
    var node = el[key], depth = 0;
    while (node && depth < 15) {
      if (node._debugSource) {
        var name = (node.type && (node.type.displayName || node.type.name)) || (typeof node.type === 'string' ? node.type : null);
        return { name: name, fileName: node._debugSource.fileName, lineNumber: node._debugSource.lineNumber, columnNumber: node._debugSource.columnNumber };
      }
      node = node.return; depth++;
    }
    return null;
  }
  // Primera clase de `el` que no sea utilidad de Tailwind ni de CMS/framework
  // (isTailwindUtilityClass/isFrameworkClass, ya usadas para lo mismo en
  // findOriginalSelector/findUtilityClassFor) — o null si no tiene ninguna
  // clase "propia" del proyecto.
  function firstMeaningfulClass(el) {
    if (!el.className || typeof el.className !== 'string') return null;
    var classes = el.className.trim().split(/\s+/).filter(Boolean);
    for (var i = 0; i < classes.length; i++) {
      if (!isTailwindUtilityClass(classes[i]) && !isFrameworkClass(classes[i])) return classes[i];
    }
    return null;
  }
  function labelFor(el) {
    var tag = el.tagName.toLowerCase();
    var ownClasses = (el.className && typeof el.className === 'string') ? el.className.trim().split(/\s+/).slice(0, 3).join('.') : '';
    var label = '<' + tag + '>' + (ownClasses ? '.' + ownClasses : '');
    // Prefijo "contenedor →": primero el landmark semántico más cercano
    // (section/article/...) si tiene una clase útil. Si no hay ninguno de
    // esos tags, o no tiene clase útil, sube por CUALQUIER ancestro (hasta
    // 8 niveles) buscando la primera clase que no sea utilidad/framework —
    // así proyectos armados solo con <div> sin semántica igual muestran
    // algo de contexto en vez de perder el prefijo entero.
    var section = el.closest('section,article,header,footer,aside,main,nav');
    var rootClass = section && section !== el ? firstMeaningfulClass(section) : null;
    if (!rootClass) {
      var node = el.parentElement, depth = 0;
      while (node && depth < 8 && !rootClass) {
        rootClass = firstMeaningfulClass(node);
        node = node.parentElement;
        depth++;
      }
    }
    if (rootClass) label = rootClass + ' → ' + label;
    return label;
  }
  // Scroll + resalta brevemente un elemento de la página real (usado por
  // A11y y por el popup de Estructura HTML al clickear un nodo).
  function highlightElementBriefly(el) {
    // Ver scrollIntoViewInstant (junto a flashElementInTree): scroll-
    // behavior:smooth en el <html> del proyecto anima cualquier scroll, así
    // que se fuerza instantáneo antes de medir la posición final.
    scrollIntoViewInstant(el);
    setRect(hoverOutline, el.getBoundingClientRect());
    setTimeout(function () { hoverOutline.style.display = 'none'; }, 1500);
  }

  // ---------------------------------------------------------------------
  // Estado: selección siempre activa — cualquier clic en la página
  // selecciona/reemplaza el elemento actual, sin pasos previos. Ese
  // elemento persiste al cambiar de herramienta (y entre recargas, vía
  // localStorage).
  // ---------------------------------------------------------------------
  var pinnedEl = null;
  var activeTool = 'component'; // default para primer uso (sin nada en localStorage): ya queda preseleccionada
  var inspectingActive = true; // default para primer uso: selector activo
  // 3 switches de la vista Layout (ver switches propios más abajo, junto a
  // bpInput/twcssInput): permiten apagar por separado cada capa del overlay
  // de estructura cuando el componente es muy denso y se vuelve ilegible.
  // Todos arrancan en true — mismo comportamiento de siempre por default.
  // Display/Position ya "apagan" su propio recuadro cuando no hace falta
  // (ver renderStructureOverlay); Outline es la única capa "de puro
  // contexto" que se puede apagar del todo sin perder ninguna etiqueta.
  var layoutShowDisplay = true;
  var layoutShowPosition = true;
  var layoutShowOutline = true;

  function toggleInspecting() {
    inspectingActive = !inspectingActive;
    pillInspectBtn.classList.toggle('active', inspectingActive);
    if (!inspectingActive) hoverOutline.style.display = 'none';
    // Redibuja YA el panel activo (si hay uno): aplica al toque el
    // apagado/prendido de los overlays sobre la página real (pinOutline,
    // spacing, structure/position), en vez de esperar al próximo scroll o
    // edición para que se note.
    if (pinnedEl) refreshPanelKeepScroll();
    refreshModifiedMarkers();
    refreshCloneMarkers();
    updateHotkeyHintsVisibility();
    saveState();
  }
  function goParent() { if (pinnedEl && pinnedEl.parentElement) pin(pinnedEl.parentElement); }
  function goChild() { if (pinnedEl && pinnedEl.firstElementChild) pin(pinnedEl.firstElementChild); }
  function goPrevSibling() { if (pinnedEl && pinnedEl.previousElementSibling) pin(pinnedEl.previousElementSibling); }
  function goNextSibling() { if (pinnedEl && pinnedEl.nextElementSibling) pin(pinnedEl.nextElementSibling); }

  // Sincroniza tanto los botones del panel grande como el ícono externo de
  // Layout en la pastilla (resaltado en rosa cuando esa es la herramienta activa).
  function syncToolButtons() {
    Object.keys(buttons).forEach(function (bid) { buttons[bid].classList.toggle('active', bid === activeTool); });
    pillLayoutBtn.classList.toggle('active', activeTool === 'layout');
    pillStylesBtn.classList.toggle('active', activeTool === 'styles');
  }

  function selectTool(id) {
    activeTool = id;
    syncToolButtons();
    if (id === 'a11y') { runA11yScan(); saveState(); return; }
    if (!pinnedEl) {
      panel.textContent = tr('clickElementFirst');
      saveState();
      return;
    }
    renderActiveTool();
    saveState();
  }

  function pin(el) {
    pinnedEl = el;
    pinnedInfo.textContent = '📌 ' + labelFor(el);
    setRect(pinOutline, el.getBoundingClientRect());
    // copyClasses/copyComponent/capture ya no son "vistas" (son acciones
    // rápidas con su propio botón) — si quedó guardado un activeTool viejo
    // de esos en localStorage, cae a 'component' en vez de romper.
    if (!activeTool || activeTool === 'a11y' || activeTool === 'copyClasses' || activeTool === 'copyComponent' || activeTool === 'capture') {
      activeTool = 'component';
    }
    syncToolButtons();
    renderActiveTool();
    saveState();
  }

  // Igual que renderActiveTool(), pero conserva el scroll del panel — para
  // usar SOLO cuando el refresco es consecuencia de un cambio (editar,
  // restablecer), no de elegir un elemento o vista nuevos (ahí sí conviene
  // arrancar arriba, es contenido distinto).
  function refreshPanelKeepScroll() {
    var savedScroll = panel.scrollTop;
    renderActiveTool();
    panel.scrollTop = savedScroll;
  }
  function renderActiveTool() {
    if (!pinnedEl || !activeTool) return;
    hideOverlays();
    // Con Inspección apagada no se dibuja NINGÚN overlay sobre la página
    // real (ni el contorno del fijado ni los de spacing/layout más abajo)
    // — solo queda el panel para seguir editando, sin ensuciar la vista.
    if (inspectingActive) setRect(pinOutline, pinnedEl.getBoundingClientRect());
    else pinOutline.style.display = 'none';
    if (activeTool === 'component') return renderComponent(pinnedEl);
    if (activeTool === 'styles') return renderStyles(pinnedEl);
    if (activeTool === 'contrast') return renderContrast(pinnedEl);
    if (activeTool === 'layout') return renderLayout(pinnedEl);
  }

  // helpHost es un segundo host de Shadow DOM aparte (para el modal de
  // Ayuda) — un clic ahí adentro también tiene que quedar afuera de la
  // intercepción de clics de selección de elementos, si no, el capture-phase
  // listener de más abajo hace stopPropagation() antes de que el evento
  // llegue a los botones del modal (ej. el de cerrar) y quedan rotos.
  function isInsideHost(e) {
    var path = e.composedPath();
    return path.indexOf(host) !== -1 || path.indexOf(helpHost) !== -1 || path.indexOf(treeHost) !== -1 || path.indexOf(bpHost) !== -1 || path.indexOf(modifiedMarkersRoot) !== -1 || path.indexOf(cloneMarkersRoot) !== -1 || path.indexOf(layoutOverlayRoot) !== -1;
  }

  function onMouseMove(e) {
    if (!inspectingActive) return;
    if (isInsideHost(e) || e.target === badge) return;
    var el = e.composedPath()[0];
    setRect(hoverOutline, el.getBoundingClientRect());
  }
  function onClick(e) {
    if (isInsideHost(e)) return;
    if (!inspectingActive) return; // inspección apagada: el clic pasa normal a la página (links/botones funcionan)
    e.preventDefault();
    e.stopPropagation();
    // El clic sostenido (ver onLeftPressStart/End) ya hizo pin()+abrió el
    // árbol — este "click" normal que viene después (mousedown→timer→
    // mouseup→click) no debe repetir/pisar nada.
    if (leftPressFired) { leftPressFired = false; return; }
    hoverOutline.style.display = 'none';
    pin(e.composedPath()[0]);
  }
  // Clic sostenido (mantener presionado el botón izquierdo ~500ms) como
  // alternativa al clic central para abrir el árbol de estructura — pensado
  // para mouses donde el botón del medio no anda bien. Si soltás antes de
  // los 500ms, es un clic normal de toda la vida (fija nomás, vía onClick).
  var LEFT_LONG_PRESS_MS = 500;
  var leftPressTimer = null;
  var leftPressTarget = null;
  var leftPressFired = false;
  function onLeftPressStart(e) {
    if (e.button !== 0) return;
    if (isInsideHost(e)) return;
    if (!inspectingActive) return;
    leftPressTarget = e.composedPath()[0];
    leftPressFired = false;
    clearTimeout(leftPressTimer);
    leftPressTimer = setTimeout(function () {
      leftPressFired = true;
      hoverOutline.style.display = 'none';
      pin(leftPressTarget);
      openTreeModal(leftPressTarget);
    }, LEFT_LONG_PRESS_MS);
  }
  function onLeftPressEnd() { clearTimeout(leftPressTimer); }
  // Doble clic con Inspección ON: copia directo las clases del elemento
  // (mismo destino que 📋 Copiar clases en la pastilla) sin tener que abrir
  // nada — el o los clics simples previos ya lo fijaron vía onClick/pin().
  function onDblClick(e) {
    if (isInsideHost(e)) return;
    if (!inspectingActive) return;
    e.preventDefault();
    e.stopPropagation();
    doCopyClasses(pillCopyClassesBtn);
  }
  // Clic central (rueda del mouse) con Inspección ON: fija el elemento Y
  // abre de una el popup de estructura HTML — combina selección + V en un
  // solo clic. No depende de Inspección (a diferencia del clic izquierdo):
  // el botón del medio no hace nada útil en una página normal, así que no
  // hace falta apagarlo aparte. Se engancha en mousedown+mouseup (guardando
  // el elemento del mousedown) en vez de "auxclick": es más robusto — en
  // algunos navegadores/SO "auxclick" no llega a dispararse si el
  // mousedown ya activó el autoscroll nativo antes, mientras que
  // mousedown/mouseup con comprobación de e.button siempre disparan.
  var middleClickTarget = null;
  function onMiddleMouseDown(e) {
    if (e.button !== 1) return;
    if (isInsideHost(e)) return;
    middleClickTarget = e.composedPath()[0];
    e.preventDefault(); // evita el autoscroll nativo del navegador
  }
  function onMiddleMouseUp(e) {
    if (e.button !== 1) return;
    if (isInsideHost(e)) return;
    if (!middleClickTarget) return;
    e.preventDefault();
    e.stopPropagation();
    hoverOutline.style.display = 'none';
    var el = middleClickTarget;
    middleClickTarget = null;
    pin(el);
    openTreeModal(el);
  }
  document.addEventListener('mousemove', onMouseMove, true);
  document.addEventListener('click', onClick, true);
  document.addEventListener('dblclick', onDblClick, true);
  document.addEventListener('mousedown', onMiddleMouseDown, true);
  document.addEventListener('mouseup', onMiddleMouseUp, true);
  document.addEventListener('mousedown', onLeftPressStart, true);
  document.addEventListener('mouseup', onLeftPressEnd, true);

  // Atajos de teclado: Shift+tecla funciona siempre; la tecla sola (sin
  // Shift) solo dispara con Inspección ON, para no comerse el tipeo normal
  // en la página cuando la selección está apagada. Mapeo fijo a la fila de
  // teclas del teclado (z/x/c/v/b/n/m + espacio), en el mismo orden que los
  // íconos de la pastilla. No incluye el ícono de mover: no tiene atajo.
  function isEditableTarget(el) {
    if (!el) return false;
    var tag = el.tagName;
    return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || el.isContentEditable;
  }
  // e.target y document.activeElement quedan "retargeteados" al host cuando
  // el foco real está adentro de nuestro shadow root (ej. el input de
  // edición de estilos, o el buscador del árbol HTML) — por eso un chequeo
  // directo con esos dos nunca detecta que se está escribiendo, y las
  // teclas sueltas (S, L, I...) se comen el tipeo. composedPath() sí trae
  // el elemento real (los shadow roots acá son "open"), y para el foco
  // hay que bajar manualmente por shadowRoot.activeElement.
  function trueEventTarget(e) {
    var path = e.composedPath && e.composedPath();
    return (path && path[0]) || e.target;
  }
  function trueActiveElement() {
    var el = document.activeElement;
    while (el && el.shadowRoot && el.shadowRoot.activeElement) el = el.shadowRoot.activeElement;
    return el;
  }
  // Letra "de fila de teclado" (posición física, sin relación al nombre) +
  // letra "mnemotécnica" (inicial del nombre de la herramienta, en español
  // si no choca, si no en un sinónimo en inglés) apuntando ambas a la misma
  // acción — igual patrón que M/P para Captura.
  function toggleLayoutTool() { selectTool(activeTool === 'layout' ? 'component' : 'layout'); }
  function toggleStylesTool() { selectTool(activeTool === 'styles' ? 'component' : 'styles'); }
  function doTreeShortcut() { if (!pinnedEl) { flashButtonFeedback(pillTreeBtn, '⚠️'); return; } openTreeModal(pinnedEl); }
  function doCopyClassesShortcut() { doCopyClasses(pillCopyClassesBtn); }
  function doCopyComponentShortcut() { doCopyComponent(pillCopyComponentBtn); }
  function doCaptureShortcut() { if (pinnedEl) doCapture(pinnedEl, pillCaptureBtn); else flashButtonFeedback(pillCaptureBtn, '⚠️'); }
  function doCloneShortcut() { if (pinnedEl) addCloneForPinned(); else flashButtonFeedback(pillCloneBtn, '⚠️'); }
  function resetAllStylesShortcut() {
    clearAllOverrides();
    updateOverrideIndicator();
    if (pinnedEl) refreshPanelKeepScroll();
  }
  // Copia el CSS real (selector + propiedades) de TODOS los overrides de la
  // página, listo para pegar en un archivo .css. No hay un botón dedicado
  // para esto (para no saturar más la pastilla) — el feedback ✅/⚠️ se
  // flashea sobre el propio label "Inspector", mismo patrón que
  // flashButtonFeedback en cualquier otro botón.
  function copyAllModifiedCss(feedbackEl, revertContent) {
    var store = getOverridesStore();
    var page = store[pageOverrideKey()] || {};
    var css = buildModifiedCss(page);
    if (!css) { flashButtonFeedback(feedbackEl, '⚠️', revertContent, 1500); return; }
    copyText(css);
    flashButtonFeedback(feedbackEl, '✅', revertContent, 1200);
  }
  // Atajo de teclado: sin botón propio a la vista, el feedback ✅/⚠️ se
  // flashea sobre el label "Inspector" (mismo patrón de siempre). El botón
  // 📄 de la píldora (pillCopyCssBtn, ver más abajo) hace lo mismo pero con
  // feedback directo sobre sí mismo.
  function copyAllModifiedCssShortcut() { copyAllModifiedCss(pillLabel); }
  var SHORTCUT_ACTIONS = {
    ' ': toggleBarPanel,
    'i': toggleInspecting, // Inspección
    'l': toggleLayoutTool, // Layout
    's': toggleStylesTool, // Estilos (Styles)
    'v': doTreeShortcut, // Ver estructura HTML
    'enter': doTreeShortcut, // Ver estructura HTML (adicional)
    'c': doCopyClassesShortcut, // Copiar clases
    't': doCopyComponentShortcut, // Copiar clase componente (Tag)
    'p': doCaptureShortcut, // Captura (Print)
    'h': toggleBarHidden, // Hidden
    'r': resetAllStylesShortcut, // Restablecer todos los estilos en vista previa
    'g': copyAllModifiedCssShortcut, // Copiar el CSS modificado de toda la página
    'd': doCloneShortcut, // Duplicate — "C" ya es Copiar clases, D es el mnemónico estándar de "duplicar" (Figma/Sketch/etc.)
    // Padre/Hijo/Hermanos: solo con las flechas del teclado, sin letra ni
    // botón/popup propios.
    'arrowup': goParent,
    'arrowdown': goChild,
    'arrowleft': goPrevSibling,
    'arrowright': goNextSibling
  };
  function onShortcutKeydown(e) {
    if (e.ctrlKey || e.metaKey || e.altKey) return; // no pisar copiar/pegar/negrita/etc. del sistema
    // Esc para salir de popups: siempre activo (no depende de Shift ni de
    // Inspección) y funciona aunque el foco esté en un campo editable (ej.
    // el buscador del árbol) — si no hay ningún popup nuestro abierto, se
    // deja pasar sin tocar (no pisa el Escape normal de la página).
    if (e.key === 'Escape') {
      if (cancelActiveStyleEdit) { e.preventDefault(); e.stopPropagation(); cancelActiveStyleEdit(); return; }
      if (helpHost.style.display === 'block') { e.preventDefault(); e.stopPropagation(); closeHelp(); return; }
      if (bpHost.style.display === 'block') { e.preventDefault(); e.stopPropagation(); closeBpConfig(); return; }
      if (treeHost.style.display === 'block') { e.preventDefault(); e.stopPropagation(); closeTreeModal(); return; }
      return;
    }
    if (isEditableTarget(trueEventTarget(e)) || isEditableTarget(trueActiveElement())) return;
    var key = (e.key === ' ' || e.code === 'Space') ? ' ' : e.key.toLowerCase();
    // R es contextual: con el árbol de estructura abierto, restablece SOLO
    // el elemento de ese árbol (el botón ↺ del popup), no toda la página.
    // Funciona igual con o sin Inspección activa, como Esc — es una acción
    // del popup, no un atajo que compite con el tipeo normal de la página.
    if (key === 'r' && treeHost.style.display === 'block') {
      e.preventDefault(); e.stopPropagation();
      resetTreeRootElement();
      return;
    }
    // F también es contextual, mismo criterio que R: va directo al
    // buscador de la ventana en la que estás — el del árbol de estructura
    // si ese popup está abierto, o el de filtrar propiedades si el panel
    // está en Estilos/Layout. Si ninguno aplica, no hace nada (no hay
    // buscador en Componente/Contraste/A11y).
    if (key === 'f') {
      if (treeHost.style.display === 'block') {
        e.preventDefault(); e.stopPropagation();
        treeSearchInput.focus();
        return;
      }
      if (bar.classList.contains('open') && (activeTool === 'styles' || activeTool === 'layout')) {
        var filterInput = panel.querySelector('.filter-bar input');
        if (filterInput) { e.preventDefault(); e.stopPropagation(); filterInput.focus(); return; }
      }
    }
    var action = SHORTCUT_ACTIONS[key];
    if (!action) return;
    if (!e.shiftKey && !inspectingActive) return; // sin Shift, requiere el puntero (Inspección) activo
    e.preventDefault();
    e.stopPropagation();
    action();
  }
  document.addEventListener('keydown', onShortcutKeydown, true);

  // Mantener Shift apretado (con la barra visible) revela la letra de cada
  // atajo encima de su ícono, vía .show-hotkeys (ver CSS de .hotkey-badge).
  // Solo visual — no preventDefault/stopPropagation, no compite con nada.
  // Visibles con Shift apretado O con Inspección ON (para verlas "de una"
  // mientras el puntero está activo, sin necesidad de tocar Shift) — nunca
  // con la barra oculta. updateHotkeyHintsVisibility() se re-llama desde
  // toggleInspecting()/setBarHidden()/restoreState() cada vez que cambia
  // cualquiera de esas tres condiciones.
  var shiftHeld = false;
  function updateHotkeyHintsVisibility() {
    pill.classList.toggle('show-hotkeys', !barHidden && (shiftHeld || inspectingActive));
  }
  function onShiftKeydown(e) { if (e.key === 'Shift') { shiftHeld = true; updateHotkeyHintsVisibility(); } }
  function onShiftKeyup(e) { if (e.key === 'Shift') { shiftHeld = false; updateHotkeyHintsVisibility(); } }
  function onWindowBlurHideHints() { shiftHeld = false; updateHotkeyHintsVisibility(); }
  document.addEventListener('keydown', onShiftKeydown);
  document.addEventListener('keyup', onShiftKeyup);
  window.addEventListener('blur', onWindowBlurHideHints);

  // Reposicionar overlays "en vivo" (spacing/layout/pin) si la página se mueve/redimensiona
  function refreshOverlaysOnScrollResize() {
    refreshModifiedMarkers();
    refreshCloneMarkers();
    if (!pinnedEl) return;
    if (inspectingActive) setRect(pinOutline, pinnedEl.getBoundingClientRect());
    if (editingStyleRow) return; // no pisar un input de edición a mitad de escritura
    // Scrollear la PÁGINA (no el panel) también dispara este refresco, para
    // reposicionar el diagrama/overlay en vivo — pero eso reconstruye el
    // panel entero, así que sin esto el scroll propio del panel se iba a 0
    // cada vez que se scrolleaba la página de fondo.
    var savedScroll = panel.scrollTop;
    if (activeTool === 'styles') renderStyles(pinnedEl);
    else if (activeTool === 'layout') renderLayout(pinnedEl);
    panel.scrollTop = savedScroll;
  }
  window.addEventListener('resize', refreshOverlaysOnScrollResize);
  window.addEventListener('scroll', refreshOverlaysOnScrollResize, true);

  // ---------------------------------------------------------------------
  // Herramienta: Componente
  // ---------------------------------------------------------------------
  function renderComponent(el) {
    clearPanel();
    var section = el.closest('section,article,header,footer,aside,main,nav') || el;
    var rootClass = section && section.className && typeof section.className === 'string' && section.className.trim()
      ? section.className.trim().split(/\s+/)[0]
      : null;

    panel.appendChild(makeFilterBar(panel));
    renderPreviewBanner(el);

    panel.appendChild(makeHeader(tr('element')));
    panel.appendChild(makeRow('tag', '<' + el.tagName.toLowerCase() + '>'));
    if (el.id) panel.appendChild(makeRow('id', '#' + el.id));
    panel.appendChild(makeRow(tr('classesLabel'), el.className || tr('none')));

    panel.appendChild(makeHeader(tr('containerComponent')));
    panel.appendChild(makeRow('tag', '<' + section.tagName.toLowerCase() + '>'));
    if (rootClass) panel.appendChild(makeRow(tr('mainClass'), rootClass));
    panel.appendChild(makeRow(tr('fullClasses'), section.className || tr('none')));

    var reactInfo = reactSourceFor(el);
    panel.appendChild(makeHeader(tr('sourceLabel')));
    if (reactInfo) {
      panel.appendChild(makeRow(tr('reactComponent'), reactInfo.name || tr('anonymous')));
      panel.appendChild(makeRow(tr('fileLabel'), reactInfo.fileName + ':' + reactInfo.lineNumber));
    } else {
      var hint = document.createElement('div');
      hint.className = 'hint';
      hint.textContent = tr('noReactSourcePrefix') + (rootClass || tr('noClassLabel')) + tr('noReactSourceSuffix');
      panel.appendChild(hint);
    }
  }

  // ---------------------------------------------------------------------
  // Herramienta: Estilos + tipografía
  // ---------------------------------------------------------------------
  function renderStyles(el) {
    clearPanel();
    var rect = el.getBoundingClientRect();
    var cs = getComputedStyle(el);
    var classes = (el.className && typeof el.className === 'string') ? el.className.trim().split(/\s+/) : [];
    var typo = classes.filter(function (c) { return TYPO_PREFIX_RE.test(c); });

    // Overlay en vivo sobre la página + diagrama box-model, primero en el
    // panel (antes era la herramienta "Espaciado" separada, ahora vive acá).
    var mt = px(cs.marginTop), mr = px(cs.marginRight), mb = px(cs.marginBottom), ml = px(cs.marginLeft);
    var bt = px(cs.borderTopWidth), br = px(cs.borderRightWidth), bb = px(cs.borderBottomWidth), bl = px(cs.borderLeftWidth);
    var pt = px(cs.paddingTop), pr = px(cs.paddingRight), pb = px(cs.paddingBottom), pl = px(cs.paddingLeft);
    // El diagrama de abajo (dentro del panel) se arma igual; el overlay
    // sobre la página REAL solo se dibuja con Inspección encendida.
    if (inspectingActive) {
      setRect(marginOverlay, { top: rect.top - mt, left: rect.left - ml, width: rect.width + ml + mr, height: rect.height + mt + mb });
      setRect(borderOverlay, rect);
      setRect(paddingOverlay, { top: rect.top + bt, left: rect.left + bl, width: rect.width - bl - br, height: rect.height - bt - bb });
      setRect(contentOverlay, { top: rect.top + bt + pt, left: rect.left + bl + pl, width: rect.width - bl - br - pl - pr, height: rect.height - bt - bb - pt - pb });
    }

    var bmContent = document.createElement('div');
    bmContent.className = 'bm-content';
    bmContent.title = tr('goToPrefix') + tr('zoneSize');
    bmContent.addEventListener('click', function () { jumpToZone(tr('zoneSize')); });
    var bmWidth = document.createElement('span');
    bmWidth.className = 'bm-content-num';
    bmWidth.title = tr('goToPrefix') + 'width';
    bmWidth.textContent = Math.round(rect.width - bl - br - pl - pr);
    bmWidth.addEventListener('click', function (e) { e.stopPropagation(); jumpToProp('width'); });
    var bmSep = document.createElement('span');
    bmSep.textContent = ' × ';
    var heightSpecified = specifiedValueFor(el, 'height');
    var heightIsAuto = !heightSpecified || heightSpecified.trim().toLowerCase() === 'auto';
    var bmHeight = document.createElement('span');
    bmHeight.className = 'bm-content-num';
    bmHeight.title = tr('goToPrefix') + 'height';
    bmHeight.textContent = Math.round(rect.height - bt - bb - pt - pb);
    bmHeight.addEventListener('click', function (e) { e.stopPropagation(); jumpToProp('height'); });
    // A = auto (por contenido), D = definido — ver specifiedValueFor().
    var bmHeightSrc = document.createElement('span');
    bmHeightSrc.className = 'bm-src-badge';
    bmHeightSrc.textContent = heightIsAuto ? 'A' : 'D';
    bmHeightSrc.title = heightIsAuto ? 'height: auto' : 'height: ' + cs.height;
    bmHeightSrc.addEventListener('click', function (e) { e.stopPropagation(); jumpToProp('height'); });
    bmContent.appendChild(bmWidth);
    bmContent.appendChild(bmSep);
    bmContent.appendChild(bmHeight);
    bmContent.appendChild(bmHeightSrc);
    // Ícono por borde si ese min/max está configurado — ver BM_CONSTRAINTS más abajo.
    BM_CONSTRAINTS.forEach(function (c) {
      var val = specifiedValueFor(el, c.prop);
      if (val === null) return;
      var dot = document.createElement('span');
      dot.className = 'bm-constraint-dot';
      dot.style.cssText = c.corner;
      dot.textContent = c.icon;
      dot.title = c.prop + ': ' + val;
      dot.addEventListener('click', function (e) { e.stopPropagation(); jumpToProp(c.prop); });
      bmContent.appendChild(dot);
    });
    var diagram = document.createElement('div');
    diagram.className = 'boxmodel';
    diagram.appendChild(
      bmBand('margin', '#fed7aa', mt, mr, mb, ml,
        bmBand('border', '#fef08a', bt, br, bb, bl,
          bmBand('padding', '#bbf7d0', pt, pr, pb, pl, bmContent, 'bl'), 'tr'), 'tl')
    );
    panel.appendChild(diagram);
    panel.appendChild(makeSpacingOpacitySlider());
    panel.appendChild(makeFilterBar(panel));
    renderPreviewBanner(el);

    var typoHeader = makeHeader(tr('typography'));
    // Botón ✨ junto al título: presets de tipografía detectados en el
    // proyecto (clases con 2+ propiedades juntas, ver
    // getProjectTypographyPresets) — solo con Modo TWCSS activo y solo si
    // hay al menos uno, para no mostrar un botón que siempre abre "vacío".
    if (twcssInput.checked && getProjectTypographyPresets().length) {
      typoHeader.style.cssText += 'display:flex;align-items:center;justify-content:space-between;gap:6px;';
      var presetBtn = document.createElement('button');
      presetBtn.type = 'button';
      // 'ic' NO alcanza acá: esa clase solo tiene estilo dentro de
      // .row-copy/.row-copy-stack (ver <style>) — este botón vive suelto
      // dentro del <h4>, así que sin su propia clase quedaba con el fondo
      // blanco de fábrica del navegador (gotcha ya resuelto, no reintroducir:
      // cualquier <button> nuevo fuera de esos dos contenedores necesita su
      // propio reset de fondo/borde, .ic solo no hace nada ahí).
      presetBtn.className = 'typo-preset-btn';
      presetBtn.title = tr('typographyPreset');
      presetBtn.textContent = '✨';
      presetBtn.addEventListener('click', function (e) { e.stopPropagation(); openTypographyPresetDropdown(presetBtn); });
      typoHeader.appendChild(presetBtn);
    }
    panel.appendChild(typoHeader);
    panel.appendChild(makeEditableRow(tr('family'), 'font-family', cs.fontFamily));
    panel.appendChild(makeEditableRow(tr('sizeLower'), 'font-size', cs.fontSize));
    panel.appendChild(makeEditableRow(tr('weight'), 'font-weight', cs.fontWeight));
    panel.appendChild(makeEditableRow('line-height', 'line-height', cs.lineHeight));
    panel.appendChild(makeEditableRow('letter-spacing', 'letter-spacing', cs.letterSpacing));
    panel.appendChild(makeEditableRow('text-align', 'text-align', cs.textAlign));
    panel.appendChild(makeEditableRow('text-transform', 'text-transform', cs.textTransform));
    panel.appendChild(makeEditableColorRow('color', 'color', cs.color));
    panel.appendChild(makeStackedRow(tr('utilityClasses'), typo));

    panel.appendChild(makeHeader(tr('zoneSize')));
    panel.appendChild(makeEditableRow('width', 'width', cs.width));
    panel.appendChild(makeEditableRow('height', 'height', heightIsAuto ? 'auto' : cs.height));
    panel.appendChild(makeEditableRow('min-width', 'min-width', cs.minWidth));
    panel.appendChild(makeEditableRow('max-width', 'max-width', cs.maxWidth));
    panel.appendChild(makeEditableRow('min-height', 'min-height', cs.minHeight));
    panel.appendChild(makeEditableRow('max-height', 'max-height', cs.maxHeight));

    panel.appendChild(makeHeader('Padding'));
    panel.appendChild(makeEditableRow('top', 'padding-top', cs.paddingTop));
    panel.appendChild(makeEditableRow('right', 'padding-right', cs.paddingRight));
    panel.appendChild(makeEditableRow('bottom', 'padding-bottom', cs.paddingBottom));
    panel.appendChild(makeEditableRow('left', 'padding-left', cs.paddingLeft));

    panel.appendChild(makeHeader('Margin'));
    panel.appendChild(makeEditableRow('top', 'margin-top', cs.marginTop));
    panel.appendChild(makeEditableRow('right', 'margin-right', cs.marginRight));
    panel.appendChild(makeEditableRow('bottom', 'margin-bottom', cs.marginBottom));
    panel.appendChild(makeEditableRow('left', 'margin-left', cs.marginLeft));

    panel.appendChild(makeHeader(tr('zoneBorder')));
    panel.appendChild(makeEditableRow('top', 'border-top-width', cs.borderTopWidth));
    panel.appendChild(makeEditableRow('right', 'border-right-width', cs.borderRightWidth));
    panel.appendChild(makeEditableRow('bottom', 'border-bottom-width', cs.borderBottomWidth));
    panel.appendChild(makeEditableRow('left', 'border-left-width', cs.borderLeftWidth));
    panel.appendChild(makeEditableRow('style', 'border-style', cs.borderStyle));
    panel.appendChild(makeEditableColorRow('color', 'border-color', cs.borderColor));

    panel.appendChild(makeHeader('Border-radius'));
    panel.appendChild(makeEditableRow('top-left', 'border-top-left-radius', cs.borderTopLeftRadius));
    panel.appendChild(makeEditableRow('top-right', 'border-top-right-radius', cs.borderTopRightRadius));
    panel.appendChild(makeEditableRow('bottom-right', 'border-bottom-right-radius', cs.borderBottomRightRadius));
    panel.appendChild(makeEditableRow('bottom-left', 'border-bottom-left-radius', cs.borderBottomLeftRadius));

    panel.appendChild(makeHeader(tr('backgroundEffects')));
    panel.appendChild(makeEditableColorRow('background-color', 'background-color', cs.backgroundColor));
    panel.appendChild(makeEditableRow('box-shadow', 'box-shadow', cs.boxShadow));
    panel.appendChild(makeEditableRow('opacity', 'opacity', cs.opacity));
    panel.appendChild(makeEditableRow('overflow', 'overflow', cs.overflow));
    panel.appendChild(makeEditableRow('cursor', 'cursor', cs.cursor));

    panel.appendChild(makeHeader('Hover'));
    var hoverRules = getHoverDeclarations(el);
    if (!hoverRules.length) {
      var noHover = document.createElement('div');
      noHover.className = 'hint';
      noHover.textContent = tr('noHoverStyles');
      panel.appendChild(noHover);
    } else {
      hoverRules.forEach(function (rule) {
        var selLabel = document.createElement('div');
        selLabel.className = 'hint';
        selLabel.style.cssText = 'margin:6px 0 2px;font-family:ui-monospace,monospace;';
        selLabel.textContent = rule.selector;
        panel.appendChild(selLabel);
        rule.decls.forEach(function (d) {
          panel.appendChild(makeColorRow(d.prop, d.value));
        });
      });
    }

    // Agregar cualquier propiedad CSS que no esté en la lista fija de
    // arriba — si el elemento ya la tiene asignada (heredada, por una
    // regla real, o lo que sea), se carga con ese valor de una; si no,
    // arranca vacía y se edita igual con el ✏️. Global (no por elemento):
    // una vez agregada "backdrop-filter", aparece para cualquier elemento
    // que inspecciones después, cada uno con su propio valor.
    panel.appendChild(makeHeader(tr('addProperty')));
    var addPropRow = document.createElement('div');
    addPropRow.className = 'filter-bar';
    var addPropInput = document.createElement('input');
    addPropInput.type = 'text';
    addPropInput.placeholder = tr('egBackdropFilter');
    var addPropBtn = document.createElement('button');
    addPropBtn.className = 'filter-clear';
    addPropBtn.textContent = '+';
    addPropBtn.title = tr('addProperty');
    function addCustomProp() {
      var name = addPropInput.value.trim();
      if (!name || customStyleProps.indexOf(name) !== -1) return;
      customStyleProps.push(name);
      saveState();
      refreshPanelKeepScroll();
    }
    addPropBtn.addEventListener('click', addCustomProp);
    addPropInput.addEventListener('keydown', function (e) {
      e.stopPropagation();
      if (e.key === 'Enter') { e.preventDefault(); addCustomProp(); }
    });
    addPropRow.appendChild(addPropInput);
    addPropRow.appendChild(addPropBtn);
    panel.appendChild(addPropRow);
    // Recién ahora, con el input ya insertado en el DOM: attachAutocomplete
    // usa insertAdjacentElement('afterend', ...), que necesita que el
    // input ya tenga padre — llamarlo antes de insertarlo lo dejaba mudo
    // (el dropdown quedaba huérfano, sin mostrarse nunca).
    attachAutocomplete(addPropInput, KNOWN_CSS_PROPERTIES, false);
    if (customStyleProps.length) {
      panel.appendChild(makeHeader(tr('addedProperties')));
      customStyleProps.forEach(function (propName) {
        panel.appendChild(makeCustomPropRow(propName, cs.getPropertyValue(propName)));
      });
    }

    if (propertyFilterQuery) applyPropertyFilter(panel, propertyFilterQuery);
  }

  // ---------------------------------------------------------------------
  // Herramienta: Contraste
  // ---------------------------------------------------------------------
  function renderContrast(el) {
    clearPanel();
    var cs = getComputedStyle(el);
    var fg = parseRGB(cs.color) || { r: 0, g: 0, b: 0 };
    var bg = effectiveBg(el);
    var ratio = contrastRatio(fg, bg);
    var fontSize = px(cs.fontSize);
    var bold = parseInt(cs.fontWeight, 10) >= 700;
    var isLarge = fontSize >= 24 || (fontSize >= 18.66 && bold);
    var aaT = isLarge ? 3 : 4.5, aaaT = isLarge ? 4.5 : 7;

    panel.appendChild(makeHeader(tr('contrastHeader')));
    panel.appendChild(makeColorRow(tr('textLabel'), 'rgb(' + fg.r + ',' + fg.g + ',' + fg.b + ')'));
    panel.appendChild(makeColorRow(tr('effectiveBackground'), 'rgb(' + bg.r + ',' + bg.g + ',' + bg.b + ')'));
    panel.appendChild(makeRow(tr('sizeLower'), fontSize.toFixed(1) + 'px (' + (isLarge ? tr('large') : tr('normalLabel')) + ')'));
    panel.appendChild(makeRow('ratio', ratio.toFixed(2) + ':1'));
    panel.appendChild(makeRow('WCAG AA (' + aaT + ':1)', ratio >= aaT ? tr('pass') : tr('fail')));
    panel.appendChild(makeRow('WCAG AAA (' + aaaT + ':1)', ratio >= aaaT ? tr('pass') : tr('fail')));
  }

  // ---------------------------------------------------------------------
  // Herramienta: Espaciado — overlay en vivo + diagrama box-model con números
  // ---------------------------------------------------------------------
  // El diagrama es ESQUEMÁTICO, no a escala: el grosor de cada banda es fijo
  // sin importar el valor real (que puede ser 0, o 500) — lo único que
  // importa es que las partes y los números se lean claro. El valor real
  // sigue mostrándose como texto en cada número; solo el dibujo es simbólico.
  var BM_BAND_THICKNESS = 24;
  // Nombre de cada banda en una esquina distinta para no superponerse entre niveles anidados.
  var BM_TAG_POS = { tl: 'top:3px;left:4px;', tr: 'top:3px;right:4px;', bl: 'bottom:3px;left:4px;' };
  // Banda -> título de sección y props por lado (orden top/right/bottom/left) para el diagrama clicable.
  // Función (no objeto fijo): 'border' es la única que cambia por idioma, y
  // tiene que leerse en el momento del render para reflejar el idioma actual.
  function zoneHeaderFor(name) {
    if (name === 'margin') return 'Margin';
    if (name === 'padding') return 'Padding';
    if (name === 'border') return tr('zoneBorder');
    return null;
  }
  var BM_PROP_NAMES = {
    margin: ['margin-top', 'margin-right', 'margin-bottom', 'margin-left'],
    padding: ['padding-top', 'padding-right', 'padding-bottom', 'padding-left'],
    border: ['border-top-width', 'border-right-width', 'border-bottom-width', 'border-left-width']
  };
  // Íconos de min/max width/height centrados en el borde correspondiente del cuadro azul.
  var BM_CONSTRAINTS = [
    { prop: 'min-width', corner: 'left:1px;top:50%;transform:translateY(-50%);', icon: '↦' },
    { prop: 'max-width', corner: 'right:1px;top:50%;transform:translateY(-50%);', icon: '↤' },
    { prop: 'max-height', corner: 'top:1px;left:50%;transform:translateX(-50%);', icon: '↧' },
    { prop: 'min-height', corner: 'bottom:1px;left:50%;transform:translateX(-50%);', icon: '↥' }
  ];
  // Scrollea el panel hasta `target` y le aplica un flash breve.
  function scrollPanelToElement(target) {
    if (!target) return;
    target.scrollIntoView({ behavior: 'smooth', block: 'center' });
    target.classList.add('jump-flash');
    setTimeout(function () { target.classList.remove('jump-flash'); }, 900);
  }
  function jumpToProp(prop) {
    scrollPanelToElement(panel.querySelector('.row-copy[data-prop="' + prop + '"]'));
  }
  function jumpToZone(headerText) {
    var headers = panel.querySelectorAll('h4');
    for (var i = 0; i < headers.length; i++) {
      if (headers[i].textContent === headerText) { scrollPanelToElement(headers[i]); return; }
    }
  }
  function bmBand(name, bg, t, r, b, l, inner, tagPos) {
    var d = document.createElement('div');
    d.className = 'bm-band';
    d.style.background = bg;
    d.style.padding = BM_BAND_THICKNESS + 'px';
    var propNames = BM_PROP_NAMES[name];
    // Los números de arriba/abajo van horizontales de siempre — los de los
    // LATERALES (izquierda/derecha) van en texto vertical (writing-mode),
    // porque esas bandas son angostas (BM_BAND_THICKNESS, 24px) y un valor
    // largo (ej. "37.8") desbordaba horizontalmente el ancho de la banda.
    // En vertical usan el ALTO de la banda (mucho más generoso) en vez del
    // ancho, así siempre entran sin importar cuántos dígitos tengan.
    function num(value, posCss, propName, vertical) {
      var n = document.createElement('span');
      // Solo margin puede dar negativo de verdad (border-width/padding
      // nunca) — mismo criterio que el aviso ⚠️ de las filas del panel,
      // pero acá directo en el número del diagrama: color llamativo en vez
      // del fondo translúcido de siempre, para que salte a la vista sin
      // tener que ir a buscarlo en la lista de propiedades.
      n.className = 'bm-num' + (vertical ? ' bm-num-vertical' : '') + (value < 0 ? ' bm-num-negative' : '');
      n.textContent = value;
      n.style.cssText += posCss;
      // vertical-rl de fábrica deja el PRIMER carácter arriba (rota cada
      // glifo 90° en sentido horario) — pedido explícito: al revés, el
      // primer carácter (ej. el "3" de "37.8") tiene que quedar abajo.
      // Un rotate(180deg) extra sobre el bloque ya vertical logra las dos
      // cosas de una: invierte el ORDEN (lo de abajo pasa a arriba y
      // viceversa) Y reorienta cada glifo a 270°/-90° (se sigue leyendo
      // bien, solo que inclinando la cabeza para el otro lado) — evita
      // depender de writing-mode:sideways-lr, que Chrome no soporta.
      if (vertical) n.style.transform += ' rotate(180deg)';
      if (propName) {
        n.title = tr('goToPrefix') + propName;
        n.addEventListener('click', function (e) { e.stopPropagation(); jumpToProp(propName); });
      }
      d.appendChild(n);
    }
    num(t, 'top:1px;left:50%;transform:translateX(-50%);', propNames && propNames[0]);
    num(r, 'right:1px;top:50%;transform:translateY(-50%);', propNames && propNames[1], true);
    num(b, 'bottom:1px;left:50%;transform:translateX(-50%);', propNames && propNames[2]);
    num(l, 'left:1px;top:50%;transform:translateY(-50%);', propNames && propNames[3], true);
    var tag = document.createElement('span');
    tag.className = 'bm-tag';
    tag.style.cssText = BM_TAG_POS[tagPos] || BM_TAG_POS.tl;
    tag.textContent = name;
    // 'margin'/'padding' quedan iguales en ES/EN (nombres de propiedad CSS);
    // solo 'border' se muestra traducido ('Bordes'/'Border') — zoneHeaderFor
    // se evalúa en cada render (no es un objeto fijo) para que devuelva el
    // idioma actual, y jumpToZone(zoneHeader) más abajo compara contra el
    // mismo string exacto que usa el <h4> real (ver renderStyles).
    var zoneHeader = zoneHeaderFor(name);
    if (zoneHeader) {
      tag.title = tr('goToPrefix') + zoneHeader;
      tag.addEventListener('click', function (e) { e.stopPropagation(); jumpToZone(zoneHeader); });
    }
    d.appendChild(tag);
    d.appendChild(inner);
    return d;
  }


  // ---------------------------------------------------------------------
  // Herramienta: Layout — overlay visual (flex / grid / position)
  // ---------------------------------------------------------------------
  function layEl(cssText) {
    var d = document.createElement('div');
    d.style.cssText = 'position:fixed;box-sizing:border-box;' + cssText;
    layoutOverlayRoot.appendChild(d);
    return d;
  }
  // Mismo criterio "toca la línea, crece hacia adentro" que layLabelByDepth/
  // layPositionCornerLabel: ancla en el borde del ELEMENTO (no en el punto
  // medio del gap hacia su ancestro posicionado, que puede caer afuera del
  // elemento y recortarse) y crece hacia el centro de la caja.
  function layLabel(text, edge, rect, bg) {
    var css;
    if (edge === 'top') css = 'left:' + (rect.left + rect.width / 2) + 'px;top:' + rect.top + 'px;transform:translate(-50%,0%);';
    else if (edge === 'bottom') css = 'left:' + (rect.left + rect.width / 2) + 'px;top:' + rect.bottom + 'px;transform:translate(-50%,-100%);';
    else if (edge === 'left') css = 'left:' + rect.left + 'px;top:' + (rect.top + rect.height / 2) + 'px;transform:translate(0%,-50%);';
    else css = 'left:' + rect.right + 'px;top:' + (rect.top + rect.height / 2) + 'px;transform:translate(-100%,-50%);';
    var l = layEl(css + 'background:' + (bg || '#7c3aed') + ';color:#fff;font:700 11px ui-sans-serif,system-ui,sans-serif;padding:2px 5px;border-radius:3px;white-space:nowrap;');
    l.textContent = text;
    return l;
  }
  // Etiqueta posicionada según profundidad, SOLO sobre la línea de arriba o
  // la de abajo de esa caja (nunca izquierda/derecha — esas se pueden salir
  // del viewport si la caja está cerca del borde, según su ancho/scroll).
  // Sobre esa línea horizontal, se alinea a la izquierda/centro/derecha —
  // 2 líneas × 3 alineaciones = 6 posiciones posibles, cicla cada 6 niveles.
  // El transform controla la alineación para que el label crezca siempre
  // HACIA ADENTRO de su propia caja en los DOS ejes (nunca hacia afuera del
  // viewport): en X, izquierda ancla en rect.left y crece a la derecha
  // (0%), derecha ancla en rect.right y crece a la izquierda (-100%),
  // centro se centra (-50%). En Y, toca la línea pero crece hacia adentro
  // de la caja: arriba ancla en rect.top y crece hacia abajo (0%), abajo
  // ancla en rect.bottom y crece hacia arriba (-100%) — antes quedaba a
  // medio camino sobre la línea (-50%), así que la mitad de afuera se
  // recortaba cuando esa línea caía cerca del borde del viewport.
  function layLabelByDepth(text, rect, depthMod6, bg, fg) {
    var onTop = depthMod6 < 3;
    var align = depthMod6 % 3; // 0=centro, 1=izquierda, 2=derecha
    var y = onTop ? rect.top : rect.bottom;
    var ty = onTop ? '0%' : '-100%';
    var x, tx;
    if (align === 0) { x = rect.left + rect.width / 2; tx = '-50%'; }
    else if (align === 1) { x = rect.left; tx = '0%'; }
    else { x = rect.right; tx = '-100%'; }
    var posCss = 'left:' + x + 'px;top:' + y + 'px;transform:translate(' + tx + ',' + ty + ');';
    var l = layEl(posCss + 'background:' + bg + ';color:' + fg + ';font:700 11px ui-sans-serif,system-ui,sans-serif;padding:2px 5px;border-radius:3px;white-space:nowrap;');
    l.textContent = text;
    return l;
  }
  // Etiqueta del contenedor/hijos flex-grid resaltado (ver renderStructureOverlay):
  // posición FIJA, no cíclica por profundidad — centrada arriba para el
  // contenedor, centrada abajo para sus hijos. Como el hijo está anidado
  // ADENTRO del padre, arriba/abajo opuestos los separa siempre, sin
  // importar el tamaño de ninguno de los dos. Mismo criterio "toca la
  // línea, crece hacia adentro" que layLabelByDepth.
  function layLabelFixed(text, rect, position, bg, fg) {
    var y = position === 'top' ? rect.top : rect.bottom;
    var ty = position === 'top' ? '0%' : '-100%';
    var x = rect.left + rect.width / 2;
    var posCss = 'left:' + x + 'px;top:' + y + 'px;transform:translate(-50%,' + ty + ');';
    var l = layEl(posCss + 'background:' + bg + ';color:' + fg + ';font:700 11px ui-sans-serif,system-ui,sans-serif;padding:2px 5px;border-radius:3px;white-space:nowrap;');
    l.textContent = text;
    return l;
  }

  // Etiqueta de position: SIEMPRE en una esquina FIJA según el tipo (no
  // cíclica por profundidad) — absolute siempre arriba-derecha, el resto
  // (relative/fixed/sticky) siempre arriba-izquierda. La razón: un absolute
  // se posiciona respecto a su ancestro posicionado más cercano, que casi
  // siempre es relative/fixed/sticky — si ambas etiquetas cayeran en la
  // misma esquina se solaparían todo el tiempo. Mismo criterio "toca la
  // línea, crece hacia adentro" de siempre en los dos ejes.
  function layPositionCornerLabel(text, rect, cornerIdx, bg) {
    var onTop = cornerIdx < 2;
    var alignLeft = cornerIdx % 2 === 0;
    var y = onTop ? rect.top : rect.bottom;
    var ty = onTop ? '0%' : '-100%';
    var x = alignLeft ? rect.left : rect.right;
    var tx = alignLeft ? '0%' : '-100%';
    var posCss = 'left:' + x + 'px;top:' + y + 'px;transform:translate(' + tx + ',' + ty + ');';
    var l = layEl(posCss + 'background:' + (bg || '#ec4899') + ';color:#fff;font:700 11px ui-sans-serif,system-ui,sans-serif;padding:2px 5px;border-radius:3px;white-space:nowrap;');
    l.textContent = text;
    return l;
  }

  // Señaliza una referencia (el ancestro posicionado real de un absolute, o
  // el contenedor real de un item — click en su etiqueta, ver
  // renderStructureOverlay): un marco alrededor del elemento MÁS un brillo
  // en la etiqueta PROPIA de esa referencia, ya dibujada — ninguno de los
  // dos clicks que llaman esto hace pin() (eso re-dibujaría todo el overlay
  // con otra raíz e invalidaría la etiqueta), así que sigue existiendo en
  // el DOM y se puede iluminar directo. refLabelsByEl (armado en
  // renderStructureOverlay) trae el color EXACTO que ya tiene esa etiqueta
  // — no uno inventado aparte — para que el marco y el brillo se vean como
  // una continuación de la etiqueta real, no como un color nuevo.
  function flashAncestorHighlight(el, refLabelsByEl) {
    var entry = refLabelsByEl.filter(function (x) { return x.el === el; })[0];
    var color = entry ? entry.color : (POSITION_TYPE_COLORS[getComputedStyle(el).position] || '#fff');
    var r = el.getBoundingClientRect();
    var box = layEl('top:' + r.top + 'px;left:' + r.left + 'px;width:' + r.width + 'px;height:' + r.height + 'px;border:3px solid #fff;box-shadow:0 0 0 3px ' + color + ',0 0 20px 6px ' + hexToRgba(color, .7) + ';border-radius:2px;opacity:1;transition:opacity .3s ease;');
    setTimeout(function () { box.style.opacity = '0'; }, 700);
    setTimeout(function () { box.remove(); }, 1000);
    if (entry) {
      var original = entry.label.style.boxShadow || '';
      entry.label.style.transition = 'box-shadow .2s ease';
      entry.label.style.boxShadow = '0 0 0 3px #fff, 0 0 20px 6px ' + hexToRgba(color, .8);
      setTimeout(function () { entry.label.style.boxShadow = original; }, 700);
    }
  }

  // Misma escala de colores por nivel de anidamiento que la utility .test
  // de este proyecto (tailwindcss/utilities/_test.css): rojo, amarillo,
  // verde, azul, púrpura, amarillo oscuro — para que la lectura visual sea
  // consistente con lo que el usuario ya usa para depurar. Texto claro/oscuro
  // según qué tan clara sea cada color de fondo, para que siempre se lea bien.
  var DEPTH_COLORS = ['#ef4444', '#facc15', '#4ade80', '#60a5fa', '#c084fc', '#a16207'];
  var DEPTH_TEXT = ['#fff', '#111', '#111', '#fff', '#111', '#fff'];
  var STRUCTURE_MAX_DEPTH = 4;

  // Abreviaciones estilo Tailwind para justify-content / align-items, para
  // que la lectura del overlay se sienta familiar a quien ya piensa en
  // clases TW en vez de en los nombres largos de la propiedad CSS.
  var JUSTIFY_TW = { 'flex-start': 'start', 'start': 'start', 'normal': 'start', 'flex-end': 'end', 'end': 'end', 'center': 'center', 'space-between': 'between', 'space-around': 'around', 'space-evenly': 'evenly' };
  var ITEMS_TW = { 'flex-start': 'start', 'start': 'start', 'flex-end': 'end', 'end': 'end', 'center': 'center', 'stretch': 'stretch', 'normal': 'stretch', 'baseline': 'baseline' };

  function shortLayoutLabel(cs) {
    if (cs.display.indexOf('flex') !== -1) {
      var parts = ['flex', cs.flexDirection];
      if (cs.flexWrap !== 'nowrap') parts.push(cs.flexWrap);
      var gap = Math.max(px(cs.rowGap), px(cs.columnGap));
      if (gap > 0) parts.push('gap ' + Math.round(gap));
      var justify = JUSTIFY_TW[cs.justifyContent] || cs.justifyContent;
      var items = ITEMS_TW[cs.alignItems] || cs.alignItems;
      if (justify === 'center' && items === 'center') parts.push('flex-center');
      else { parts.push('justify-' + justify); parts.push('items-' + items); }
      return parts.join('  ');
    }
    if (cs.display.indexOf('grid') !== -1) {
      var cols = cs.gridTemplateColumns.split(/\s+/).filter(Boolean).length;
      var rows = cs.gridTemplateRows.split(/\s+/).filter(Boolean).length;
      var parts2 = ['grid', cols + 'col×' + rows + 'row'];
      var gap2 = Math.max(px(cs.rowGap), px(cs.columnGap));
      if (gap2 > 0) parts2.push('gap ' + Math.round(gap2));
      return parts2.join('  ');
    }
    return '';
  }

  // Etiqueta de anchura para un hijo directo de un contenedor flex: grow,
  // shrink y basis en formato compacto ("1 1 200px"), sin prefijo — solo se
  // muestra cuando difiere del default del navegador (0 1 auto), igual que
  // shortLayoutLabel omite flex-wrap/gap cuando están en su valor por
  // defecto, para no saturar de etiquetas listados con muchos hijos sin
  // flex configurado explícitamente.
  function flexItemWidthLabel(cs) {
    var grow = cs.flexGrow, shrink = cs.flexShrink, basis = cs.flexBasis;
    if (grow === '0' && shrink === '1' && basis === 'auto') return '';
    // basis redondeado a 1 decimal (33.3333% sin redondear no entra legible
    // en una etiqueta chica) — grow/shrink casi siempre son enteros.
    var basisRounded = basis.replace(/(-?\d+\.\d+)/, function (m) { return (Math.round(parseFloat(m) * 10) / 10).toString(); });
    // Sintaxis de declaración CSS real ("flex: 0 1 33.3%") en vez de los
    // 3 números pelados — ya se sabe qué significa sin explicar nada más.
    return 'flex: ' + grow + ' ' + shrink + ' ' + basisRounded;
  }

  // Elementos con position distinto de static (relative/absolute/fixed/sticky)
  // también se etiquetan en el overlay de estructura, no solo el elemento
  // raíz seleccionado. Solo el nombre de la posición, sin valores de
  // top/right/bottom/left (esos ya se ven en el panel al fijar el elemento).
  function positionLabel(cs) {
    if (cs.position === 'static') return '';
    return cs.position;
  }
  // Un color fijo por tipo (no por profundidad): así de un vistazo se sabe
  // qué mecanismo de posicionamiento es cada caja, sin tener que leer el
  // texto. Mismo color en la etiqueta de tipo (positionLabel/layPosition-
  // CornerLabel) y en las guías/valores del elemento fijado (renderPosition-
  // Overlay), para que ambos sistemas se lean como una sola cosa.
  var POSITION_TYPE_COLORS = { relative: '#ec4899', absolute: '#f97316', fixed: '#3b82f6', sticky: '#a855f7' };

  // ---------------------------------------------------------------------
  // Grid: overlay de áreas nombradas (grid-template-areas). getComputedStyle
  // SIEMPRE resuelve grid-template-columns/rows a píxeles absolutos (nunca
  // deja "1fr" sin resolver), así que se puede reconstruir la grilla de
  // celdas en px y cruzarla contra el string de grid-template-areas para
  // agrupar las celdas contiguas que comparten nombre. Si el grid no usa
  // áreas nombradas (gridTemplateAreas === 'none') no devuelve nada.
  // ---------------------------------------------------------------------
  var AREA_COLORS = ['#f97316', '#06b6d4', '#84cc16', '#e879f9', '#f43f5e', '#3b82f6', '#eab308', '#10b981'];

  function parseGridAreas(cs, rect) {
    if (cs.gridTemplateAreas === 'none') return null;
    var rowStrings = cs.gridTemplateAreas.match(/"[^"]*"/g);
    if (!rowStrings) return null;
    var grid = rowStrings.map(function (r) { return r.replace(/"/g, '').trim().split(/\s+/); });

    var colSizes = cs.gridTemplateColumns.split(/\s+/).filter(Boolean).map(px);
    var rowSizes = cs.gridTemplateRows.split(/\s+/).filter(Boolean).map(px);
    var colGap = px(cs.columnGap), rowGap = px(cs.rowGap);

    var colOffsets = [0];
    colSizes.forEach(function (w, i) { colOffsets.push(colOffsets[i] + w + colGap); });
    var rowOffsets = [0];
    rowSizes.forEach(function (h, i) { rowOffsets.push(rowOffsets[i] + h + rowGap); });

    var areas = {};
    var order = [];
    grid.forEach(function (rowArr, r) {
      rowArr.forEach(function (name, c) {
        if (name === '.' || colOffsets[c + 1] === undefined || rowOffsets[r + 1] === undefined) return;
        if (!areas[name]) { areas[name] = { minR: r, maxR: r, minC: c, maxC: c }; order.push(name); }
        var a = areas[name];
        a.minR = Math.min(a.minR, r); a.maxR = Math.max(a.maxR, r);
        a.minC = Math.min(a.minC, c); a.maxC = Math.max(a.maxC, c);
      });
    });

    return order.map(function (name, i) {
      var a = areas[name];
      return {
        name: name,
        left: rect.left + colOffsets[a.minC],
        top: rect.top + rowOffsets[a.minR],
        width: colOffsets[a.maxC + 1] - colOffsets[a.minC] - colGap,
        height: rowOffsets[a.maxR + 1] - rowOffsets[a.minR] - rowGap,
        color: AREA_COLORS[i % AREA_COLORS.length]
      };
    });
  }

  // Dibuja el rectángulo semitransparente de cada área INMEDIATAMENTE (queda
  // debajo de los bordes de los hijos, dibujados después) y encola su
  // etiqueta de nombre en labelQueue para que se dibuje al final, por encima
  // de todo — igual que el resto de las etiquetas de renderStructureOverlay.
  function renderGridAreasOverlay(cs, rect, labelQueue) {
    var areas = parseGridAreas(cs, rect);
    if (!areas) return;
    areas.forEach(function (a) {
      layEl('top:' + a.top + 'px;left:' + a.left + 'px;width:' + a.width + 'px;height:' + a.height + 'px;border:2px dashed ' + a.color + ';background:' + a.color + '1a;');
      labelQueue.push({ isArea: true, text: a.name, x: a.left + a.width / 2, y: a.top + a.height / 2, color: a.color });
    });
  }

  function isFlexOrGrid(node) {
    var d = getComputedStyle(node).display;
    return d.indexOf('flex') !== -1 || d.indexOf('grid') !== -1;
  }
  // Nivel más superficial (0 = root) donde aparece CUALQUIER flex/grid,
  // mirando el nivel completo antes de decidir — si hay varios flex/grid
  // en ese mismo nivel, todos cuentan por igual (no se queda con el
  // primero que encuentra al recorrer). -1 si no hay ninguno en todo el
  // subárbol (hasta STRUCTURE_MAX_DEPTH).
  function findFirstFlexGridDepth(root) {
    var level = [root], depth = 0;
    while (level.length && depth <= STRUCTURE_MAX_DEPTH) {
      if (level.some(isFlexOrGrid)) return depth;
      var next = [];
      level.forEach(function (node) { Array.prototype.forEach.call(node.children, function (child) { next.push(child); }); });
      level = next;
      depth++;
    }
    return -1;
  }
  // Mismo patrón que findFirstFlexGridDepth, pero buscando el primer nivel
  // con algún elemento fuera del flujo normal (relative/absolute/fixed/
  // sticky) — así la etiqueta de tipo de posición también se recorta a una
  // ventana de 2 niveles (el encontrado + sus hijos directos) en vez de
  // mostrarse en TODO el subárbol, igual que ya se hace con flex/grid.
  function findFirstPositionedDepth(root) {
    var level = [root], depth = 0;
    while (level.length && depth <= STRUCTURE_MAX_DEPTH) {
      if (level.some(function (n) { return getComputedStyle(n).position !== 'static'; })) return depth;
      var next = [];
      level.forEach(function (node) { Array.prototype.forEach.call(node.children, function (child) { next.push(child); }); });
      level = next;
      depth++;
    }
    return -1;
  }

  // Dibuja el elemento y TODOS sus descendientes (hasta STRUCTURE_MAX_DEPTH)
  // — el contorno SIEMPRE, en todos los niveles. Las etiquetas (layout,
  // position, ancho de flex-item, áreas de grid) solo en el primer nivel
  // con flex/grid que encuentra (mirando el nivel entero, ver
  // findFirstFlexGridDepth) y el siguiente (sus hijos): con anidamientos
  // profundos de flex/grid, etiquetar cada nivel se vuelve ilegible, así
  // que de ahí para abajo (y para arriba, antes de llegar a ese nivel)
  // queda solo el contorno. Si no hay ningún flex/grid en el subárbol,
  // etiqueta todos los niveles como antes (acá esta reducción no aplica).
  // Colores fijos para los dos niveles resaltados (contenedor flex/grid +
  // sus hijos). Dos decisiones de diseño acá:
  // 1) Flex vs grid: frío (índigo) vs cálido (naranja) — se distingue de
  //    un vistazo, sin comparar de cerca.
  // 2) Contenedor vs hijos: colores DISTINTOS entre sí (no un tono más
  //    claro/oscuro del mismo color) — un mismo color en dos intensidades
  //    se diluye igual de parecido con el overlay translúcido a opacidad
  //    baja, sin importar cuánto se separen los tonos ni el multiplicador
  //    de alpha que se use (ya probado). Con colores realmente distintos
  //    el contraste sale solo, no hace falta jugar con la opacidad.
  var FLEX_CONTAINER_COLOR = '#4338ca'; // índigo-700
  var FLEX_CHILD_COLOR = '#ca8a04';     // amarillo/dorado-600 — complementario real del índigo (azul-violeta vs amarillo)
  var GRID_CONTAINER_COLOR = '#c2410c'; // naranja-700
  var GRID_CHILD_COLOR = '#65a30d';     // lime-600 (bien distinto del naranja)
  function hexToRgba(hex, alpha) {
    var r = parseInt(hex.slice(1, 3), 16);
    var g = parseInt(hex.slice(3, 5), 16);
    var b = parseInt(hex.slice(5, 7), 16);
    return 'rgba(' + r + ',' + g + ',' + b + ',' + alpha + ')';
  }
  function containerTypeColors(cs) {
    if (cs.display.indexOf('flex') !== -1) return { type: 'flex', container: FLEX_CONTAINER_COLOR, child: FLEX_CHILD_COLOR };
    if (cs.display.indexOf('grid') !== -1) return { type: 'grid', container: GRID_CONTAINER_COLOR, child: GRID_CHILD_COLOR };
    return null;
  }
  // Análogo a flexItemWidthLabel pero para hijos de un grid: posición
  // explícita (columna/fila) si el hijo la tiene seteada, vacío si no
  // (colocación automática, el caso más común).
  // Sintaxis de declaración CSS real ("grid-column: 2/4") en vez de un
  // formato inventado ("col 2/4") — ya se sabe qué significa sin explicar
  // nada más, mismo motivo que "flex: 0 1 33.3%" en flexItemWidthLabel.
  function gridItemPlacementLabel(cs) {
    var parts = [];
    if (cs.gridColumn && cs.gridColumn.indexOf('auto') === -1) parts.push('grid-column: ' + cs.gridColumn.replace(/\s+/g, ''));
    if (cs.gridRow && cs.gridRow.indexOf('auto') === -1) parts.push('grid-row: ' + cs.gridRow.replace(/\s+/g, ''));
    return parts.join('; ');
  }
  // Etiqueta del nivel de HIJOS (ver renderStructureOverlay) — a propósito
  // NUNCA usa shortLayoutLabel: no importa si el hijo es flex/grid él
  // mismo (ni sus clases propias, que podían nombrarse igual que una
  // utilidad de layout y confundir) — acá es "item", no "padre". Número
  // pegado a "item" (itemN, no "item N" — un número suelto antes de otros
  // números confundía) + la propiedad ya calculada según el tipo del
  // padre, con sintaxis de declaración CSS real (ver flexItemWidthLabel/
  // gridItemPlacementLabel) — "itemN" solo si no tiene ninguna.
  function childItemLabel(cs, parentTypeColors, siblingIndex) {
    var itemProps = parentTypeColors && parentTypeColors.type === 'grid' ? gridItemPlacementLabel(cs) : flexItemWidthLabel(cs);
    var base = 'item' + siblingIndex;
    return itemProps ? base + '  ' + itemProps : base;
  }

  function renderStructureOverlay(root) {
    // Con el switch apagado, se trata como "no hay flex/grid" o "no hay
    // position" en TODO el subárbol (-2, no -1: ese valor ya tiene su
    // propio significado especial — "no se encontró ninguno, etiquetar
    // todos los niveles como fallback" — y acá lo que queremos es lo
    // opuesto, cero etiquetas de esa capa).
    var firstFlexGridDepth = layoutShowDisplay ? findFirstFlexGridDepth(root) : -2;
    var firstPositionedDepth = layoutShowPosition ? findFirstPositionedDepth(root) : -2;
    // Dos pasadas: primero TODOS los bordes (padre + hijos + nietos...),
    // recién después TODAS las etiquetas — así ninguna etiqueta queda tapada
    // por un borde de un nivel más profundo dibujado más tarde.
    var labelQueue = [];
    // absoluteEls: TODOS los absolute encontrados en el walk, sin importar
    // si cayeron dentro de la ventana de profundidad — se usan después para
    // la búsqueda inversa (ver más abajo). positionedLabeled: nodos que ya
    // tienen (o van a tener) etiqueta de tipo de posición, para que esa
    // búsqueda inversa no la duplique si el ancestro ya estaba etiquetado.
    var absoluteEls = [];
    var positionedLabeled = [];
    // el → { label, color } de cada etiqueta clickeable ya dibujada (de
    // posición o de layout) — así flashAncestorHighlight puede iluminar la
    // etiqueta REAL de una referencia (ancestro/contenedor) con su mismo
    // color, en vez de inventar una aparte. Se completa más abajo, al
    // dibujar cada etiqueta.
    var refLabelsByEl = [];
    // parentTypeColors: {container,child} del contenedor flex/grid ancestro
    // más cercano en la rama actual — así sus hijos (nivel N+1) usan el
    // tono "child" de SU propio padre, no uno genérico. null si esta rama
    // todavía no entró en el nivel resaltado.
    function walk(node, depth, parentTypeColors, siblingIndex) {
      if (depth > STRUCTURE_MAX_DEPTH) return;
      var rect = node.getBoundingClientRect();
      if (rect.width < 2 || rect.height < 2) return;
      var cs = getComputedStyle(node);
      var showLabel = firstFlexGridDepth === -1 || depth === firstFlexGridDepth || depth === firstFlexGridDepth + 1;
      var showPositionLabel = firstPositionedDepth !== -1 && (depth === firstPositionedDepth || depth === firstPositionedDepth + 1);

      var color, fg, fillColor = null, typeColorsHere = null;
      if (showLabel && firstFlexGridDepth !== -1) {
        if (depth === firstFlexGridDepth) {
          // Nivel del contenedor: tono oscuro según SU PROPIO tipo (si
          // hubiera un hermano no flex/grid justo en este nivel, cae al
          // esquema normal).
          typeColorsHere = containerTypeColors(cs);
          color = typeColorsHere ? typeColorsHere.container : DEPTH_COLORS[depth % DEPTH_COLORS.length];
          fg = typeColorsHere ? '#fff' : DEPTH_TEXT[depth % DEPTH_TEXT.length];
          fillColor = typeColorsHere && typeColorsHere.container;
        } else {
          // Nivel de los hijos: color propio, distinto del padre (ver
          // FLEX_CHILD_COLOR/GRID_CHILD_COLOR más arriba).
          color = parentTypeColors ? parentTypeColors.child : DEPTH_COLORS[depth % DEPTH_COLORS.length];
          fg = parentTypeColors ? '#fff' : DEPTH_TEXT[depth % DEPTH_TEXT.length];
          fillColor = parentTypeColors && parentTypeColors.child;
        }
      } else {
        color = DEPTH_COLORS[depth % DEPTH_COLORS.length];
        fg = DEPTH_TEXT[depth % DEPTH_TEXT.length];
      }
      // El recuadro de este nivel se dibuja si: Delineado está prendido
      // (se ve todo, como siempre), o si hace falta igual para sostener una
      // etiqueta de Display o de Position que SÍ se va a mostrar en este
      // nivel. El elemento fijado en sí NO se fuerza acá — ya tiene su
      // propio contorno verde entrecortado (pinOutline), forzar otro más
      // (blanco, al no tener un tipo de posición real si es static) era
      // redundante y quedaba feo.
      var neededForDisplay = layoutShowDisplay && showLabel;
      // showPositionLabel solo dice "este NIVEL de profundidad es la
      // ventana de Position" — TODOS los hermanos de ese nivel caen ahí,
      // aunque sean static (sin ningún tipo de posición real). Sin el
      // chequeo de cs.position !== 'static' de acá, esos hermanos static
      // también se marcaban como "necesarios para Position" y, al no tener
      // color propio en POSITION_TYPE_COLORS, salían con el recuadro
      // blanco de reserva — el bug real detrás de "las líneas blancas".
      var neededForPosition = layoutShowPosition && showPositionLabel && cs.position !== 'static';
      if (layoutShowOutline || neededForDisplay || neededForPosition) {
        // Si el recuadro existe SOLO por Position (Display no lo pide),
        // usa el color de SU tipo de posición — mismo lenguaje visual que
        // su etiqueta de esquina — en vez del ciclado genérico.
        var boxColor = (neededForPosition && !neededForDisplay) ? (POSITION_TYPE_COLORS[cs.position] || '#fff') : color;
        var boxCss = 'top:' + rect.top + 'px;left:' + rect.left + 'px;width:' + rect.width + 'px;height:' + rect.height + 'px;border:2px solid ' + boxColor + ';';
        // Relleno translúcido SOLO en los dos niveles resaltados, mismo color
        // que el contorno y misma variable de opacidad de base que el
        // overlay de spacing de Estilos (spacingOverlayOpacity) — el
        // contraste principal sale de que padre e hijo son colores distintos
        // (ver arriba), más un empuje suave (x1.6, tope 0.5) en el hijo para
        // reforzarlo sin pasarse. El borde va aparte con rgba() (no con la
        // propiedad opacity, que también lo desvanecería).
        if (fillColor) {
          var fillAlpha = depth === firstFlexGridDepth + 1 ? Math.min(spacingOverlayOpacity * 1.6, 0.5) : spacingOverlayOpacity;
          boxCss += 'background:' + hexToRgba(fillColor, fillAlpha) + ';';
        }
        layEl(boxCss);
      }

      if (layoutShowDisplay && showLabel) {
        // Posición fija (arriba para el contenedor, abajo para sus hijos)
        // solo en los dos niveles resaltados — el resto de las etiquetas
        // (fallback sin flex/grid, position) sigue con el ciclado por
        // profundidad de siempre.
        var fixedPos = null;
        var isChildLevel = false;
        if (firstFlexGridDepth !== -1) {
          if (depth === firstFlexGridDepth) fixedPos = 'top';
          else if (depth === firstFlexGridDepth + 1) { fixedPos = 'bottom'; isChildLevel = true; }
        }
        // Contenedor (y fallback sin flex/grid): shortLayoutLabel, como
        // siempre. Hijos: NUNCA como si fueran su propio contenedor — ver
        // childItemLabel.
        var layoutText = isChildLevel ? childItemLabel(cs, parentTypeColors, siblingIndex) : shortLayoutLabel(cs);
        if (layoutText) labelQueue.push({ text: layoutText, rect: rect, depth: depth, color: color, fg: fg, fixedPos: fixedPos, el: node, isChildLevel: isChildLevel });
        // El ancho de flex-item / la posición de grid-item ya van adentro
        // de childItemLabel (ver arriba) — no se pushean por separado.
        if (cs.display.indexOf('grid') !== -1) renderGridAreasOverlay(cs, rect, labelQueue);
      }
      // Etiqueta de tipo de posición: A PROPÓSITO con su PROPIA ventana de
      // profundidad (firstPositionedDepth), independiente de la de flex/grid
      // — mismo criterio "primer nivel encontrado + sus hijos" para no
      // saturar de etiquetas en anidamientos profundos, pero sin depender
      // de si ese elemento es o no flex/grid.
      if (layoutShowPosition && cs.position === 'absolute') absoluteEls.push(node);
      if (showPositionLabel) {
        var posText = positionLabel(cs);
        if (posText) {
          labelQueue.push({ text: posText, rect: rect, isCorner: true, positionType: cs.position, el: node });
          positionedLabeled.push(node);
        }
      }

      var childTypeColors = depth === firstFlexGridDepth ? typeColorsHere : parentTypeColors;
      Array.prototype.forEach.call(node.children, function (child, i) { walk(child, depth + 1, childTypeColors, i + 1); });
    }
    walk(root, 0, null, 1);
    // Búsqueda inversa: TODO absolute encontrado (esté o no dentro de la
    // ventana de profundidad normal) fuerza SU PROPIA etiqueta si no la
    // tenía, y además dispara la búsqueda de su ancestro posicionado real
    // (offsetParent — el navegador ya resuelve ahí "el primer ancestro con
    // position distinto de static", exactamente lo que hace falta), que
    // también se agrega si no la tenía ya. Sin esto, un absolute muy
    // anidado (como las flechas del slider, debajo de su .swiper relative)
    // podía quedar sin ninguna marca — ni la propia ni la de su referencia.
    // Con Delineado apagado, estos dos (el absolute forzado y su ancestro)
    // no pasaron por el walk() de arriba con un recuadro propio (cayeron
    // fuera de la ventana normal) — sin esto, quedaban con una etiqueta
    // flotando sin ninguna caja de referencia.
    function boxIfNoOutline(el, cs) {
      if (layoutShowOutline) return;
      var r = el.getBoundingClientRect();
      var boxColor = POSITION_TYPE_COLORS[cs.position] || '#fff';
      layEl('top:' + r.top + 'px;left:' + r.left + 'px;width:' + r.width + 'px;height:' + r.height + 'px;border:2px solid ' + boxColor + ';');
    }
    absoluteEls.forEach(function (absEl) {
      if (positionedLabeled.indexOf(absEl) === -1) {
        labelQueue.push({ text: 'absolute', rect: absEl.getBoundingClientRect(), isCorner: true, positionType: 'absolute', el: absEl });
        positionedLabeled.push(absEl);
        boxIfNoOutline(absEl, { position: 'absolute' });
      }
      var anc = absEl.offsetParent;
      if (!anc || positionedLabeled.indexOf(anc) !== -1) return;
      var ancCs = getComputedStyle(anc);
      var ancText = positionLabel(ancCs);
      if (!ancText) return;
      labelQueue.push({ text: ancText, rect: anc.getBoundingClientRect(), isCorner: true, positionType: ancCs.position, el: anc });
      positionedLabeled.push(anc);
      boxIfNoOutline(anc, ancCs);
    });
    // Se pushean padre-antes-que-hijo (pre-order); dibujar en orden INVERSO
    // hace que los hijos (más profundos) se dibujen primero y el padre
    // siempre termine encima, sin importar cuántos niveles de anidamiento haya.
    for (var i = labelQueue.length - 1; i >= 0; i--) {
      var item = labelQueue[i];
      if (item.isCorner) {
        var cornerLabel = layPositionCornerLabel(item.text, item.rect, item.positionType === 'absolute' ? 1 : 0, POSITION_TYPE_COLORS[item.positionType]);
        if (item.el) {
          var isAbsolute = item.positionType === 'absolute';
          var cornerColor = POSITION_TYPE_COLORS[item.positionType] || '#ec4899';
          refLabelsByEl.push({ el: item.el, label: cornerLabel, color: cornerColor });
          cornerLabel.style.pointerEvents = 'auto';
          cornerLabel.style.cursor = 'pointer';
          // absolute SOLO busca su ancestro (no selecciona) — es el único
          // tipo con una referencia que vale la pena señalar aparte;
          // relative/fixed/sticky sí seleccionan (pin), igual que el resto
          // de indicadores clickeables del inspector (✎ de cambios,
          // marcadores de clon). pointer-events:auto pisa el "none" del
          // contenedor (layoutOverlayRoot es puramente decorativo por
          // default).
          cornerLabel.title = isAbsolute ? tr('showPositionedAncestor') : tr('selectElement');
          cornerLabel.addEventListener('click', function (el, absoluteType) {
            return function (e) {
              e.stopPropagation();
              if (absoluteType) {
                var anc = el.offsetParent;
                if (anc) flashAncestorHighlight(anc, refLabelsByEl);
              } else {
                pin(el);
              }
            };
          }(item.el, isAbsolute));
        }
      }
      else if (item.isArea) {
        var al = layEl('top:' + item.y + 'px;left:' + item.x + 'px;transform:translate(-50%,-50%);background:' + item.color + ';color:#fff;font:700 12px ui-sans-serif,system-ui,sans-serif;padding:3px 7px;border-radius:3px;white-space:nowrap;');
        al.textContent = item.text;
      }
      else {
        var layoutLabel = item.fixedPos
          ? layLabelFixed(item.text, item.rect, item.fixedPos, item.color, item.fg)
          : layLabelByDepth(item.text, item.rect, item.depth % 6, item.color, item.fg);
        if (item.el) {
          refLabelsByEl.push({ el: item.el, label: layoutLabel, color: item.color });
          // Mismo criterio "seleccionar vs. encontrar referencia" que las
          // etiquetas de position: el contenedor (o el fallback sin
          // flex/grid, que no tiene concepto de "hijo") selecciona (pin) su
          // elemento; el hijo/item busca y resalta a SU padre (el
          // contenedor real, node.parentElement) en vez de seleccionarse a
          // sí mismo — no tiene mucho sentido fijar "item2", lo útil es ver
          // de qué contenedor es hijo.
          layoutLabel.style.pointerEvents = 'auto';
          layoutLabel.style.cursor = 'pointer';
          layoutLabel.title = item.isChildLevel ? tr('showPositionedAncestor') : tr('selectElement');
          layoutLabel.addEventListener('click', function (el, isChild) {
            return function (e) {
              e.stopPropagation();
              if (isChild) {
                var parent = el.parentElement;
                if (parent) flashAncestorHighlight(parent, refLabelsByEl);
              } else {
                pin(el);
              }
            };
          }(item.el, item.isChildLevel));
        }
      }
    }
  }

  function renderLayout(el) {
    clearPanel();
    layoutOverlayRoot.innerHTML = '';
    var cs = getComputedStyle(el);
    var rect = el.getBoundingClientRect();

    if (inspectingActive) renderStructureOverlay(el);
    panel.appendChild(layoutViewRow);
    // Mismo slider y misma variable (spacingOverlayOpacity) que en
    // Estilos: ahora también controla el relleno de los recuadros
    // flex/grid resaltados acá (ver renderStructureOverlay), así que
    // tiene que poder ajustarse sin salir de Layout. Sin Display no hay
    // ningún relleno que ajustar (ese relleno SOLO existe en los niveles
    // resaltados de flex/grid) — se deshabilita ACÁ nomás, en esta llamada
    // puntual: makeSpacingOpacitySlider() crea un input nuevo cada vez, así
    // que esto no toca para nada el slider de Estilos (otra llamada
    // separada, siempre habilitado).
    var layoutOpacitySlider = makeSpacingOpacitySlider();
    layoutOpacitySlider.querySelector('input').disabled = !layoutShowDisplay;
    panel.appendChild(layoutOpacitySlider);
    panel.appendChild(makeFilterBar(panel));
    renderPreviewBanner(el);

    panel.appendChild(makeHeader(tr('displayPinned')));
    panel.appendChild(makeEditableRow('display', 'display', cs.display));

    if (cs.display.indexOf('flex') !== -1) {
      panel.appendChild(makeHeader('Flex container'));
      panel.appendChild(makeEditableRow('flex-direction', 'flex-direction', cs.flexDirection));
      panel.appendChild(makeEditableRow('flex-wrap', 'flex-wrap', cs.flexWrap));
      panel.appendChild(makeEditableRow('justify-content', 'justify-content', cs.justifyContent));
      panel.appendChild(makeEditableRow('align-items', 'align-items', cs.alignItems));
      panel.appendChild(makeEditableRow('gap', 'gap', cs.rowGap + ' ' + cs.columnGap));
    } else if (cs.display.indexOf('grid') !== -1) {
      panel.appendChild(makeHeader('Grid container'));
      panel.appendChild(makeEditableRow('grid-template-columns', 'grid-template-columns', cs.gridTemplateColumns));
      panel.appendChild(makeEditableRow('grid-template-rows', 'grid-template-rows', cs.gridTemplateRows));
      panel.appendChild(makeEditableRow('gap', 'gap', cs.rowGap + ' ' + cs.columnGap));
    }

    var parentCs = el.parentElement ? getComputedStyle(el.parentElement) : null;
    if (parentCs && parentCs.display.indexOf('flex') !== -1) {
      panel.appendChild(makeHeader(tr('thisIsFlexItem')));
      panel.appendChild(makeEditableRow('flex (grow/shrink/basis)', 'flex', cs.flexGrow + ' ' + cs.flexShrink + ' ' + cs.flexBasis));
      panel.appendChild(makeEditableRow('align-self', 'align-self', cs.alignSelf));
      panel.appendChild(makeEditableRow('order', 'order', cs.order));
    }
    if (parentCs && parentCs.display.indexOf('grid') !== -1) {
      panel.appendChild(makeHeader(tr('thisIsGridItem')));
      panel.appendChild(makeEditableRow('grid-column', 'grid-column', cs.gridColumn));
      panel.appendChild(makeEditableRow('grid-row', 'grid-row', cs.gridRow));
    }

    panel.appendChild(makeHeader('Position'));
    panel.appendChild(makeEditableRow('position', 'position', cs.position));
    if (cs.position !== 'static') {
      if (inspectingActive && layoutShowPosition) renderPositionOverlay(el, cs, rect);
      panel.appendChild(makeEditableRow('top', 'top', cs.top));
      panel.appendChild(makeEditableRow('right', 'right', cs.right));
      panel.appendChild(makeEditableRow('bottom', 'bottom', cs.bottom));
      panel.appendChild(makeEditableRow('left', 'left', cs.left));
      panel.appendChild(makeEditableRow('z-index', 'z-index', cs.zIndex));
      var op = el.offsetParent;
      panel.appendChild(makeRow('offsetParent', op ? '<' + op.tagName.toLowerCase() + (op.className ? '.' + String(op.className).trim().split(/\s+/)[0] : '') + '>' : tr('noneOrViewport')));
    }
    if (propertyFilterQuery) applyPropertyFilter(panel, propertyFilterQuery);
  }

  function renderPositionOverlay(el, cs, rect) {
    // Mismo color que la etiqueta de tipo (POSITION_TYPE_COLORS): las guías
    // y valores del elemento fijado se leen como parte del mismo lenguaje
    // visual que su etiqueta relative/absolute/fixed/sticky en el overlay.
    var color = POSITION_TYPE_COLORS[cs.position] || '#ec4899';
    var refEl = el.offsetParent || document.documentElement;
    var refRect = refEl.getBoundingClientRect();
    function guide(x1, y1, x2, y2) {
      var length = Math.hypot(x2 - x1, y2 - y1);
      var angle = Math.atan2(y2 - y1, x2 - x1) * 180 / Math.PI;
      var g = layEl('top:' + y1 + 'px;left:' + x1 + 'px;width:' + length + 'px;height:0;border-top:1.5px dashed ' + color + ';transform-origin:0 0;transform:rotate(' + angle + 'deg);');
      return g;
    }
    if (cs.top !== 'auto') { guide(rect.left + rect.width / 2, refRect.top, rect.left + rect.width / 2, rect.top); layLabel(cs.top, 'top', rect, color); }
    if (cs.left !== 'auto') { guide(refRect.left, rect.top + rect.height / 2, rect.left, rect.top + rect.height / 2); layLabel(cs.left, 'left', rect, color); }
    if (cs.right !== 'auto') { guide(rect.right, rect.top + rect.height / 2, refRect.right, rect.top + rect.height / 2); layLabel(cs.right, 'right', rect, color); }
    if (cs.bottom !== 'auto') { guide(rect.left + rect.width / 2, rect.bottom, rect.left + rect.width / 2, refRect.bottom); layLabel(cs.bottom, 'bottom', rect, color); }
    layEl('top:' + refRect.top + 'px;left:' + refRect.left + 'px;width:' + refRect.width + 'px;height:' + refRect.height + 'px;border:1.5px dashed ' + hexToRgba(color, .5) + ';');
  }

  // ---------------------------------------------------------------------
  // Acción rápida: Captura para pegar en el chat — retroalimenta en el
  // propio botón (flashButtonFeedback), NUNCA toca el panel/vista activa.
  // ---------------------------------------------------------------------
  function doCapture(el, btn) {
    if (!window.modernScreenshot) { flashButtonFeedback(btn, '⚠️'); return; }
    if (btn.dataset.capturing === '1') return; // evita doble clic mientras hay una captura en curso
    btn.dataset.capturing = '1';
    // innerHTML completo (ícono + badge del atajo P), no un '📸' pelado: si
    // no, al restablecer más abajo (flashButtonFeedback) el badge se pierde
    // para siempre, porque nunca se vuelve a agregar.
    var original = btn.innerHTML;
    btn.textContent = '⏳';
    var label = labelFor(el);
    // Preferimos el contenedor "de componente" más chico (card/slide/list item)
    // antes que el landmark estructural grande: si no, capturar un botón dentro
    // de un slider termina renderizando el slider entero (todos los slides,
    // incluidos los duplicados de Swiper en loop) solo para recortar un ícono.
    var ancestor = el.closest('.swiper-slide, .card, li, [class*="-card"], [class*="_card"]')
      || el.closest('section,article,header,footer,aside,main')
      || el.parentElement || el;
    var scale = Math.min(window.devicePixelRatio || 1, 2);

    window.modernScreenshot
      .domToCanvas(ancestor, { scale: scale })
      .then(function (fullCanvas) {
        var elRect = el.getBoundingClientRect();
        var ancRect = ancestor.getBoundingClientRect();
        var sx = (elRect.left - ancRect.left) * scale;
        var sy = (elRect.top - ancRect.top) * scale;
        var sw = elRect.width * scale;
        var sh = elRect.height * scale;
        var stripH = 24 * scale;

        var out = document.createElement('canvas');
        out.width = sw;
        out.height = sh + stripH;
        var ctx = out.getContext('2d');
        ctx.drawImage(fullCanvas, sx, sy, sw, sh, 0, stripH, sw, sh);
        ctx.fillStyle = '#ec4899';
        ctx.fillRect(0, 0, sw, stripH);
        ctx.fillStyle = '#ffffff';
        ctx.font = 'bold ' + (11 * scale) + 'px ui-sans-serif, system-ui, sans-serif';
        ctx.textBaseline = 'middle';
        ctx.fillText('📍 ' + label, 6 * scale, stripH / 2, sw - 12 * scale);
        ctx.strokeStyle = '#ec4899';
        ctx.lineWidth = 3 * scale;
        ctx.strokeRect(1.5 * scale, stripH + 1.5 * scale, sw - 3 * scale, sh - 3 * scale);

        return new Promise(function (resolve, reject) {
          out.toBlob(function (blob) { blob ? resolve(blob) : reject(new Error('toBlob devolvió null')); }, 'image/png');
        });
      })
      .then(function (blob) { return navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]); })
      .then(function () { flashButtonFeedback(btn, '✅', original); })
      .catch(function () { flashButtonFeedback(btn, '❌', original, 2000); })
      .finally(function () { delete btn.dataset.capturing; });
  }

  // ---------------------------------------------------------------------
  // Herramienta: A11y (página completa, no depende del pin)
  // ---------------------------------------------------------------------
  function runA11yScan() {
    clearPanel();
    var issues = [];
    document.querySelectorAll('img:not([alt])').forEach(function (img) { issues.push({ el: img, msg: tr('imgNoAlt') }); });
    document.querySelectorAll('input, select, textarea').forEach(function (field) {
      if (field.type === 'hidden' || field.type === 'submit' || field.type === 'button') return;
      var hasLabel = field.id && document.querySelector('label[for="' + CSS.escape(field.id) + '"]');
      var hasAria = field.getAttribute('aria-label') || field.getAttribute('aria-labelledby');
      if (!hasLabel && !hasAria) issues.push({ el: field, msg: tr('fieldNoLabelPrefix') + field.tagName.toLowerCase() + tr('fieldNoLabelSuffix') });
    });
    var headings = Array.prototype.slice.call(document.querySelectorAll('h1,h2,h3,h4,h5,h6'));
    var lastLevel = 0;
    headings.forEach(function (h) {
      var level = parseInt(h.tagName[1], 10);
      if (lastLevel && level - lastLevel > 1) issues.push({ el: h, msg: tr('headingSkipPrefix') + lastLevel + ' → h' + level + ' ("' + h.textContent.trim().slice(0, 40) + '")' });
      lastLevel = level;
    });

    panel.appendChild(makeHeader(issues.length + tr('issuesFoundSuffix')));
    issues.forEach(function (issue) {
      var item = document.createElement('div');
      item.className = 'list-item';
      item.textContent = '• ' + issue.msg;
      item.addEventListener('click', function () { highlightElementBriefly(issue.el); });
      panel.appendChild(item);
    });
    if (!issues.length) {
      var ok = document.createElement('div');
      ok.textContent = tr('noIssues');
      panel.appendChild(ok);
    }
  }

  // ---------------------------------------------------------------------
  // Indicador de breakpoint
  //
  // Modo Auto (detectados del CSS ya cargado) o Manual (lista editable,
  // arranca con la escala default de Tailwind) — mutuamente excluyentes,
  // se elige en el modal de configuración (bpConfigBtn/openBpConfig más
  // abajo). Se persiste aparte del resto del estado del inspector.
  // ---------------------------------------------------------------------
  var BP_STORAGE_KEY = '__claudeInspectorBreakpoints';
  var BP_PALETTE = ['#eab308', '#22c55e', '#3b82f6', '#a855f7', '#78350f', '#ec4899', '#06b6d4', '#f97316'];
  function defaultManualBreakpoints() {
    return [
      { name: 'sm', op: '>=', value: 640 },
      { name: 'md', op: '>=', value: 768 },
      { name: 'lg', op: '>=', value: 1024 },
      { name: 'xl', op: '>=', value: 1280 },
      { name: '2xl', op: '>=', value: 1536 },
    ];
  }
  function loadBpConfig() {
    try {
      var raw = localStorage.getItem(BP_STORAGE_KEY);
      if (raw) {
        var parsed = JSON.parse(raw);
        if (parsed && parsed.manual) return parsed;
      }
    } catch (e) {}
    return { mode: 'auto', manual: defaultManualBreakpoints(), autoCache: null };
  }
  function saveBpConfig() {
    try { localStorage.setItem(BP_STORAGE_KEY, JSON.stringify(bpConfig)); } catch (e) {}
  }
  var bpConfig = loadBpConfig();

  // "Nrem"/"Npx"/"Nem" -> px. Sin unidad = px. rem/em se resuelven contra
  // el font-size del <html> (aproximación razonable también para em).
  function bpLengthToPx(raw) {
    var m = String(raw).trim().match(/^(-?[\d.]+)(px|rem|em)?$/);
    if (!m) return null;
    var num = parseFloat(m[1]);
    var unit = m[2] || 'px';
    if (unit === 'px') return num;
    var rootFontSize = parseFloat(getComputedStyle(document.documentElement).fontSize) || 16;
    return num * rootFontSize;
  }
  // Tier 1: variables --breakpoint-* (convención de Tailwind v4 @theme, ya
  // compiladas a CSS real) declaradas en cualquier hoja cargada.
  function detectBreakpointsFromCssVars() {
    var found = [], seen = {};
    function walkRules(rules) {
      if (!rules) return;
      for (var i = 0; i < rules.length; i++) {
        var rule = rules[i];
        if (rule.style && rule.style.length) {
          for (var j = 0; j < rule.style.length; j++) {
            var prop = rule.style[j];
            if (prop.indexOf('--breakpoint-') !== 0) continue;
            var name = prop.slice('--breakpoint-'.length);
            if (seen[name]) continue;
            var px = bpLengthToPx(rule.style.getPropertyValue(prop));
            if (px == null) continue;
            seen[name] = true;
            found.push({ name: name, op: '>=', value: Math.round(px) });
          }
        }
        if (rule.cssRules) walkRules(rule.cssRules);
      }
    }
    for (var s = 0; s < document.styleSheets.length; s++) {
      try { walkRules(document.styleSheets[s].cssRules); } catch (e) { /* hoja cross-origin, se ignora */ }
    }
    found.sort(function (a, b) { return a.value - b.value; });
    return found;
  }
  // Tier 2 (respaldo): cualquier condición de ancho en un @media ya
  // cargado (min-width/max-width clásico, o "width >= Npx" moderno) —
  // cubre proyectos sin variables de Tailwind, incluida su salida
  // compilada real (los @media que arma para sm:/md:/etc. son de este
  // tipo, aunque acá no se les pueda recuperar el nombre original).
  function detectBreakpointsFromMediaQueries() {
    var found = [], seen = {};
    var reClassic = /\(\s*(min-width|max-width)\s*:\s*([\d.]+)(px|rem|em)?\s*\)/g;
    var reModernA = /\(\s*width\s*(>=|<=|>|<)\s*([\d.]+)(px|rem|em)?\s*\)/g;
    var reModernB = /\(\s*([\d.]+)(px|rem|em)?\s*(>=|<=|>|<)\s*width\s*\)/g;
    var flipOp = { '>=': '<=', '<=': '>=', '>': '<', '<': '>' };
    function addPx(op, valueStr, unit) {
      var px = bpLengthToPx(valueStr + (unit || 'px'));
      if (px == null) return;
      px = Math.round(px);
      var key = op + ':' + px;
      if (seen[key]) return;
      seen[key] = true;
      found.push({ name: '', op: op, value: px });
    }
    function scan(mediaText) {
      var m;
      reClassic.lastIndex = 0;
      while ((m = reClassic.exec(mediaText))) addPx(m[1] === 'min-width' ? '>=' : '<=', m[2], m[3]);
      reModernA.lastIndex = 0;
      while ((m = reModernA.exec(mediaText))) addPx(m[1], m[2], m[3]);
      reModernB.lastIndex = 0;
      while ((m = reModernB.exec(mediaText))) addPx(flipOp[m[3]], m[1], m[2]);
    }
    function walkRules(rules) {
      if (!rules) return;
      for (var i = 0; i < rules.length; i++) {
        var rule = rules[i];
        if (rule.media && rule.media.mediaText) scan(rule.media.mediaText);
        if (rule.cssRules) walkRules(rule.cssRules);
      }
    }
    for (var s = 0; s < document.styleSheets.length; s++) {
      try { walkRules(document.styleSheets[s].cssRules); } catch (e) { /* hoja cross-origin, se ignora */ }
    }
    found.sort(function (a, b) { return a.value - b.value; });
    return found;
  }
  function detectAutoBreakpoints() {
    var fromVars = detectBreakpointsFromCssVars();
    var list = fromVars.length ? fromVars : detectBreakpointsFromMediaQueries();
    list.forEach(function (bp, i) { bp.color = BP_PALETTE[i % BP_PALETTE.length]; });
    return { list: list, source: fromVars.length ? 'vars' : 'media' };
  }
  function bpLabel(bp) {
    var opSymbol = bp.op === '>=' ? '≥' : bp.op === '<=' ? '≤' : bp.op;
    return bp.name ? bp.name : (opSymbol + bp.value + 'px');
  }
  function bpMatches(w, bp) {
    if (bp.op === '>') return w > bp.value;
    if (bp.op === '>=') return w >= bp.value;
    if (bp.op === '<=') return w <= bp.value;
    if (bp.op === '<') return w < bp.value;
    return false;
  }
  // Lista final a usar para el badge, según el modo elegido.
  function activeBpList() {
    if (bpConfig.mode === 'manual') {
      return bpConfig.manual.map(function (bp, i) {
        return { name: bp.name, op: bp.op, value: bp.value, color: BP_PALETTE[i % BP_PALETTE.length] };
      });
    }
    if (!bpConfig.autoCache) bpConfig.autoCache = detectAutoBreakpoints();
    return bpConfig.autoCache.list;
  }

  var bpActiveTab = bpConfig.mode === 'manual' ? 'manual' : 'auto';
  function switchBpTab(tab) { bpActiveTab = tab; renderBpModal(); }
  bpAutoTab.addEventListener('click', function () { switchBpTab('auto'); });
  bpManualTab.addEventListener('click', function () { switchBpTab('manual'); });
  function commitBpMode(mode) { bpConfig.mode = mode; saveBpConfig(); updateBadge(); }

  // Dropdown propio para elegir dirección (>,>=,<=,<) — ver comentario junto
  // a opBtn en renderBpManualTab. Uno solo compartido por todas las filas,
  // se reposiciona con getBoundingClientRect() del botón que lo abrió.
  var opDropdownEl = null, opDropdownAnchor = null;
  function closeOpDropdown() {
    if (opDropdownEl) { opDropdownEl.remove(); opDropdownEl = null; opDropdownAnchor = null; }
  }
  function openOpDropdown(anchorBtn, currentOp, onPick) {
    if (opDropdownAnchor === anchorBtn) { closeOpDropdown(); return; } // clic de nuevo en el mismo = cerrar
    closeOpDropdown();
    var rect = anchorBtn.getBoundingClientRect();
    var dd = document.createElement('div');
    dd.className = 'bp-op-dropdown';
    dd.style.cssText = 'position:fixed;top:' + (rect.bottom + 4) + 'px;left:' + rect.left + 'px;';
    ['>', '>=', '<=', '<'].forEach(function (op) {
      var item = document.createElement('div');
      item.className = 'bp-op-item' + (op === currentOp ? ' active' : '');
      item.textContent = op;
      item.addEventListener('click', function (e) {
        e.stopPropagation();
        closeOpDropdown();
        onPick(op);
      });
      dd.appendChild(item);
    });
    bpRoot.appendChild(dd);
    opDropdownEl = dd;
    opDropdownAnchor = anchorBtn;
  }
  // Cualquier otro clic dentro del modal (fuera del propio botón que lo
  // abrió, que ya maneja su propio toggle) cierra el dropdown.
  bpModal.addEventListener('click', function (e) {
    if (opDropdownEl && e.target !== opDropdownAnchor) closeOpDropdown();
  });

  function renderBpModal() {
    closeOpDropdown();
    bpAutoTab.classList.toggle('active', bpActiveTab === 'auto');
    bpManualTab.classList.toggle('active', bpActiveTab === 'manual');
    bpBody.innerHTML = '';
    if (bpActiveTab === 'auto') renderBpAutoTab(); else renderBpManualTab();
  }
  function renderBpAutoTab() {
    commitBpMode('auto');
    var hint = document.createElement('div');
    hint.className = 'bp-hint';
    hint.textContent = tr('bpAutoHint');
    bpBody.appendChild(hint);
    if (!bpConfig.autoCache) bpConfig.autoCache = detectAutoBreakpoints();
    var source = document.createElement('div');
    source.className = 'bp-auto-source';
    source.textContent = bpConfig.autoCache.source === 'vars'
      ? tr('bpSourceVars')
      : (bpConfig.autoCache.list.length ? tr('bpSourceMedia') : tr('bpSourceNone'));
    bpBody.appendChild(source);
    bpConfig.autoCache.list.forEach(function (bp) {
      var row = document.createElement('div');
      row.className = 'bp-auto-row';
      var swatch = document.createElement('span');
      swatch.className = 'swatch';
      swatch.style.background = bp.color;
      row.appendChild(swatch);
      var label = document.createElement('span');
      label.textContent = bpLabel(bp) + ' — ' + bp.op + ' ' + bp.value + 'px';
      row.appendChild(label);
      bpBody.appendChild(row);
    });
    if (!bpConfig.autoCache.list.length) {
      var empty = document.createElement('div');
      empty.className = 'bp-empty';
      empty.textContent = tr('bpNoneDetected');
      bpBody.appendChild(empty);
    }
    var refreshBtn = document.createElement('button');
    refreshBtn.className = 'bp-refresh';
    refreshBtn.textContent = tr('bpRedetect');
    refreshBtn.addEventListener('click', function () {
      bpConfig.autoCache = detectAutoBreakpoints();
      saveBpConfig();
      updateBadge();
      renderBpModal();
    });
    bpBody.appendChild(refreshBtn);
  }
  function renderBpManualTab() {
    commitBpMode('manual');
    var hint = document.createElement('div');
    hint.className = 'bp-hint';
    hint.textContent = tr('bpManualHint');
    bpBody.appendChild(hint);
    bpConfig.manual.forEach(function (bp, i) {
      var row = document.createElement('div');
      row.className = 'bp-row';
      var swatch = document.createElement('span');
      swatch.className = 'swatch';
      swatch.style.background = BP_PALETTE[i % BP_PALETTE.length];
      row.appendChild(swatch);

      var nameInput = document.createElement('input');
      nameInput.type = 'text';
      nameInput.className = 'bp-name';
      nameInput.value = bp.name;
      nameInput.addEventListener('click', function (e) { e.stopPropagation(); });
      nameInput.addEventListener('input', function () { bp.name = nameInput.value; saveBpConfig(); updateBadge(); });
      row.appendChild(nameInput);

      // <select> nativo, no: dentro de Shadow DOM Chrome a veces calcula mal
      // dónde abrir el popup de opciones (aparece lejos del control). Un
      // dropdown propio (mismo espíritu que .ac-dropdown del autocompletado
      // de clases) siempre se posiciona donde le decimos.
      var opBtn = document.createElement('button');
      opBtn.type = 'button';
      opBtn.className = 'bp-op-btn';
      opBtn.textContent = bp.op;
      opBtn.addEventListener('click', function (e) {
        e.stopPropagation();
        openOpDropdown(opBtn, bp.op, function (newOp) {
          bp.op = newOp;
          opBtn.textContent = newOp;
          saveBpConfig();
          updateBadge();
        });
      });
      row.appendChild(opBtn);

      var valueInput = document.createElement('input');
      valueInput.type = 'number';
      valueInput.value = bp.value;
      valueInput.addEventListener('click', function (e) { e.stopPropagation(); });
      valueInput.addEventListener('input', function () {
        var n = parseFloat(valueInput.value);
        if (!isNaN(n)) { bp.value = n; saveBpConfig(); updateBadge(); }
      });
      row.appendChild(valueInput);

      var unit = document.createElement('span');
      unit.className = 'bp-unit';
      unit.textContent = 'px';
      row.appendChild(unit);

      var delBtn = document.createElement('button');
      delBtn.className = 'bp-row-del';
      delBtn.textContent = '✕';
      delBtn.title = tr('bpDelete');
      delBtn.addEventListener('click', function (e) {
        e.stopPropagation();
        bpConfig.manual.splice(i, 1);
        saveBpConfig();
        updateBadge();
        renderBpModal();
      });
      row.appendChild(delBtn);

      bpBody.appendChild(row);
    });
    if (!bpConfig.manual.length) {
      var empty = document.createElement('div');
      empty.className = 'bp-empty';
      empty.textContent = tr('bpNoneManual');
      bpBody.appendChild(empty);
    }
    var addBtn = document.createElement('button');
    addBtn.className = 'bp-add';
    addBtn.textContent = tr('bpAddBreakpoint');
    addBtn.addEventListener('click', function () {
      bpConfig.manual.push({ name: 'bp' + (bpConfig.manual.length + 1), op: '>=', value: 320 });
      saveBpConfig();
      updateBadge();
      renderBpModal();
    });
    bpBody.appendChild(addBtn);
  }

  function updateBadge() {
    if (!bpInput.checked) { badge.style.display = 'none'; return; }
    var w = window.innerWidth;
    var list = activeBpList();
    var active = null, bestDist = Infinity;
    list.forEach(function (bp) {
      if (!bpMatches(w, bp)) return;
      var dist = Math.abs(w - bp.value);
      if (dist < bestDist) { bestDist = dist; active = bp; }
    });
    badge.style.display = 'block';
    badge.style.background = active ? active.color : '#6b7280';
    badge.textContent = '📱 ' + w + 'px' + (active ? '  ·  ' + bpLabel(active) + ' (' + active.op + active.value + ')' : '  ·  base');
  }
  bpInput.addEventListener('change', updateBadge);
  window.addEventListener('resize', updateBadge);
  // Redibuja el panel activo al togglear el modo: así el label del botón
  // 📄 CSS/TWCSS del banner de vista previa (ver renderPreviewBanner) se
  // actualiza al toque, sin esperar a la próxima edición.
  twcssInput.addEventListener('change', function () { refreshPanelKeepScroll(); saveState(); });

  // ---------------------------------------------------------------------
  // Persistencia entre recargas (localStorage): elemento fijado + herramienta
  // ---------------------------------------------------------------------
  function saveState() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({
        selector: pinnedEl ? cssSelectorFor(pinnedEl) : null,
        tool: activeTool,
        showBreakpoint: bpInput.checked,
        twcssMode: twcssInput.checked,
        barOpen: bar.classList.contains('open'),
        inspectingActive: inspectingActive,
        barHidden: barHidden,
        panelScroll: panel.scrollTop,
        propertyFilter: propertyFilterQuery,
        spacingOverlayOpacity: spacingOverlayOpacity,
        customStyleProps: customStyleProps,
        layoutShowDisplay: layoutShowDisplay,
        layoutShowPosition: layoutShowPosition,
        layoutShowOutline: layoutShowOutline,
      }));
    } catch (e) {}
  }
  function restoreState() {
    try {
      var raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      var state = JSON.parse(raw);
      if (state.showBreakpoint) { bpInput.checked = true; updateBadge(); }
      if (state.twcssMode) twcssInput.checked = true;
      if (state.barOpen === false) bar.classList.remove('open');
      updatePillSlotAbsolute();
      if (state.barHidden) setBarHidden(true);
      if (state.inspectingActive === false) {
        inspectingActive = false;
        pillInspectBtn.classList.remove('active');
        hoverOutline.style.display = 'none';
      }
      if (state.propertyFilter) propertyFilterQuery = state.propertyFilter;
      if (Array.isArray(state.customStyleProps)) customStyleProps = state.customStyleProps;
      if (typeof state.spacingOverlayOpacity === 'number') {
        // clamp por si quedó un valor guardado de antes de bajar el tope
        spacingOverlayOpacity = Math.min(state.spacingOverlayOpacity, 0.3);
        applySpacingOverlayOpacity();
      }
      if (state.layoutShowDisplay === false) { layoutShowDisplay = false; layoutDisplayInput.checked = false; }
      if (state.layoutShowPosition === false) { layoutShowPosition = false; layoutPositionInput.checked = false; }
      if (state.layoutShowOutline === false) { layoutShowOutline = false; layoutOutlineInput.checked = false; }
      // Por si quedó guardado un estado viejo (de antes de esta regla) con
      // los 3 apagados a la vez: forzar Delineado de vuelta a activo.
      if (!layoutShowDisplay && !layoutShowPosition && !layoutShowOutline) {
        layoutShowOutline = true;
        layoutOutlineInput.checked = true;
      }
      refreshModifiedMarkers();
      refreshCloneMarkers();
      activeTool = state.tool || 'component';
      syncToolButtons();
      if (!state.selector) return;
      var el = document.querySelector(state.selector);
      if (!el) return;
      pin(el);
      // pin() ya dibujó el panel de una — acá solo se reubica el scroll
      // guardado, para que quede exacto donde estaba antes de recargar.
      if (state.panelScroll) panel.scrollTop = state.panelScroll;
    } catch (e) {}
  }
  // Guarda el scroll del panel para la próxima recarga — con un pequeño
  // debounce (el evento "scroll" dispara muy seguido) para no escribir en
  // localStorage en cada pixel.
  var savePanelScrollTimer = null;
  panel.addEventListener('scroll', function () {
    clearTimeout(savePanelScrollTimer);
    savePanelScrollTimer = setTimeout(saveState, 250);
  });

  // ---------------------------------------------------------------------
  // API pública / cleanup
  // ---------------------------------------------------------------------
  window.__claudeInspector = {
    toggle: function () { bar.classList.toggle('open'); },
    destroy: function () {
      document.removeEventListener('mousemove', onMouseMove, true);
      document.removeEventListener('click', onClick, true);
      document.removeEventListener('dblclick', onDblClick, true);
      document.removeEventListener('keydown', onShortcutKeydown, true);
      document.removeEventListener('keydown', onShiftKeydown);
      document.removeEventListener('keyup', onShiftKeyup);
      window.removeEventListener('blur', onWindowBlurHideHints);
      window.removeEventListener('resize', refreshOverlaysOnScrollResize);
      window.removeEventListener('scroll', refreshOverlaysOnScrollResize, true);
      window.removeEventListener('resize', updateBadge);
      [host, bpHost, hoverOutline, pinOutline, marginOverlay, borderOverlay, paddingOverlay, contentOverlay, layoutOverlayRoot, badge, modifiedMarkersRoot, cloneMarkersRoot, twFrame].forEach(function (n) { n && n.remove(); });
      window.__claudeInspector = null;
    },
  };

  bar.classList.add('open');
  updatePillSlotAbsolute();
  // Clones ANTES que overrides: si algún override apunta a la posición de
  // un clon (nth-of-type), el clon tiene que existir ya en el DOM para que
  // ese selector matchee.
  applyStoredClones();
  applyStoredOverrides();
  updateOverrideIndicator();
  refreshCloneMarkers();
  restoreState();
  syncPillLabel();
  syncBarSpacing();
  updateHotkeyHintsVisibility();
  enforceMobileHidden();
})();
