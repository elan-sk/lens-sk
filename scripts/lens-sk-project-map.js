#!/usr/bin/env node
// Mapa rápido "clase → archivo:línea" del proyecto, para que el modo live
// (ver lens-sk-live-server.js) no tenga que grepear el theme entero en cada
// pedido de "Ir al código"/"Aplicar" — es un atajo de velocidad, NO una
// verdad absoluta: solo indexa clases que aparecen como texto literal en el
// PHP (después de sacar los bloques <?php ... ?>/<?= ... ?> de adentro del
// atributo class="..."). Una clase armada 100% dinámicamente (ej.
// resolve_bg_color_class()) simplemente no queda en este índice — ahí sigue
// haciendo falta grep + lectura + criterio, como antes de que existiera este
// archivo.
//
// Además del mapa por clase (componentMap: identificador → {file, line} del
// tag raíz), `elementIndex` guarda, por archivo, cada tagName → sus líneas en
// orden de aparición — el navegador lo usa para bajar de "archivo de la
// card" a "línea del elemento específico clickeado" (ver
// resolveElementLine() en toolbar.js). Mismo criterio de "atajo, no verdad
// absoluta": si un archivo repite un tag dentro de su propio loop (no el de
// una card hija), la correspondencia posición-a-posición puede fallar — ahí
// cae de nuevo a la línea raíz del componente, nunca a una línea de otro
// archivo.
//
// Uso:
//   node lens-sk-project-map.js          -> genera el mapa una vez y termina
//   node lens-sk-project-map.js --watch  -> genera y vuelve a generar en cada
//                                           guardado (mismo patrón que
//                                           sort-tw-classes.js --watch)
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const OUT_DIR = path.join(ROOT, '.lens-sk-cache');
const OUT_JSON = path.join(OUT_DIR, 'project-map.json');
const OUT_MD = path.join(OUT_DIR, 'project-map.md');

// Directorios recorridos por completo, más una lista fija de templates raíz
// (que no viven en ningún directorio de componentes, van sueltos en la raíz
// del theme). `includes` cubre header/footer (header.php, header-desktop.php,
// header-mobile.php, footer.php) — antes quedaban afuera del mapa, así que
// "Ir al código" en cualquier link del menú o del footer siempre caía en
// pedirme ayuda a mí en vez de resolverse solo en el navegador.
const SCAN_DIRS = ['components', 'cards', 'loops', 'templates', 'includes'];
const ROOT_FILES = ['page.php', 'single.php', 'index.php', 'category.php', 'archive-historia.php', 'single-historia.php'];

// Utilities PROPIAS del proyecto (@utility, ver tailwindcss/utilities/*.css)
// — a diferencia de una utility nativa de Tailwind (que yo ya conozco de
// memoria), estas las inventó este proyecto y no tengo forma de saber cómo
// funcionan sin leer su definición real. Pedido explícito (2026-08-03,
// después de fallar con flex-grid-2 — esa clase no pone nada en el propio
// elemento, define un `& > *` que afecta a los HIJOS, así que un override
// de estilo sobre el elemento fijado nunca la iba a poder replicar): mapear
// estas definiciones de antemano, igual que ya se mapean componente→archivo,
// para no tener que grepear a ciegas cada vez que un pedido de Sugerir
// menciona una clase que no es Tailwind estándar.
const TW_SCAN_DIRS = ['atoms', 'bases', 'components', 'libraries', 'plugins', 'settings', 'utilities'];

function collectCssFiles() {
  const files = [];
  for (const dir of TW_SCAN_DIRS) {
    const full = path.join(ROOT, 'tailwindcss', dir);
    if (!fs.existsSync(full)) continue;
    const entries = fs.readdirSync(full, { recursive: true, withFileTypes: true });
    for (const entry of entries) {
      if (entry.isFile() && entry.name.endsWith('.css')) {
        const entryDir = entry.parentPath || entry.path || full;
        files.push(path.relative(ROOT, path.join(entryDir, entry.name)));
      }
    }
  }
  return files;
}

// `@utility nombre { ... }` (o `nombre-*` para las paramétricas, ej.
// flex-grid-*) — el cuerpo puede tener llaves anidadas (@apply, & > *,
// @media, etc.), así que hace falta contar profundidad en vez de un regex
// simple con [^}]*.
const UTILITY_START_RE = /@utility\s+([a-zA-Z0-9_-]+(?:-\*)?)\s*\{/g;
// Heurística de "¿esto toca a los HIJOS, no al propio elemento?": un
// combinador de descendencia/hijo directo pegado al "&" (& > *, & .foo,
// & + *), o un :where()/:is() (patrón típico de Tailwind v4 para grupos de
// selectores anidados). Si matchea, un override de estilo sobre el
// elemento fijado NO alcanza — hace falta childOverrides.
const AFFECTS_CHILDREN_RE = /&\s*[>~+]|&\s+[a-zA-Z.\[:#*]|:where\(|:is\(/;

function scanCssFile(relPath) {
  const full = path.join(ROOT, relPath);
  let content;
  try { content = fs.readFileSync(full, 'utf8'); } catch (e) { return []; }
  const results = [];
  UTILITY_START_RE.lastIndex = 0;
  let m;
  while ((m = UTILITY_START_RE.exec(content))) {
    const name = m[1];
    const bodyStart = m.index + m[0].length;
    let depth = 1;
    let i = bodyStart;
    while (i < content.length && depth > 0) {
      if (content[i] === '{') depth++;
      else if (content[i] === '}') depth--;
      i++;
    }
    const body = content.slice(bodyStart, i - 1).trim();
    const line = content.slice(0, m.index).split('\n').length;
    results.push({ name, file: relPath, line, body, affectsChildren: AFFECTS_CHILDREN_RE.test(body) });
  }
  return results;
}

function buildCustomUtilitiesMap() {
  const customUtilities = {};
  for (const rel of collectCssFiles()) {
    scanCssFile(rel).forEach((u) => { customUtilities[u.name] = u; });
  }
  return customUtilities;
}

// ---------------------------------------------------------------------
// Tokens de color reales (--color-{rol}) — la fuente de verdad NO es el
// CSS compilado (assets/css/theme.css, puede estar desactualizado si se
// editó la paleta y todavía no se corrió el build) sino los plugins JS de
// Tailwind bajo tailwindcss/plugins/*.js (ver el comentario "FUENTE ÚNICA
// DE VERDAD" al principio de variables.js). Tailwind v4 "hornea" cada hex
// directo adentro de cada utility ya generada, sin dejar ningún
// var(--color-rol) reusable en el :root del compilado salvo el que este
// mismo plugin registra a mano vía addBase — grepear el compilado para
// buscar "el amarillo más parecido" es buscar en una copia derivada, no en
// la fuente (pedido explícito del usuario, después de que eso pasara en
// esta misma sesión). Extracción simple por regex, no un parser JS
// completo: matchea pares 'rol': '#hex' literales dentro de los objetos
// exportados, ignora referencias a otras variables (ej.
// 'on-a': bgColors['secondary-dk']) porque esas no tienen un hex propio —
// el rol de origen ('secondary-dk') ya queda cubierto aparte.
// ---------------------------------------------------------------------
const COLOR_TOKEN_RE = /['"]([a-zA-Z0-9_-]+)['"]\s*:\s*['"](#[0-9a-fA-F]{3,8})['"]/g;
function collectPluginJsFiles() {
  const dir = path.join(ROOT, 'tailwindcss', 'plugins');
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir)
    .filter((f) => f.endsWith('.js'))
    .map((f) => path.join('tailwindcss', 'plugins', f));
}
function buildColorTokensMap() {
  const tokens = {};
  for (const rel of collectPluginJsFiles()) {
    const full = path.join(ROOT, rel);
    let content;
    try { content = fs.readFileSync(full, 'utf8'); } catch (e) { continue; }
    COLOR_TOKEN_RE.lastIndex = 0;
    let m;
    while ((m = COLOR_TOKEN_RE.exec(content))) {
      const line = content.slice(0, m.index).split('\n').length;
      tokens[m[1]] = { hex: m[2], file: rel, line };
    }
  }
  return tokens;
}

function collectPhpFiles() {
  const files = [];
  for (const rel of ROOT_FILES) {
    const full = path.join(ROOT, rel);
    if (fs.existsSync(full)) files.push(rel);
  }
  for (const dir of SCAN_DIRS) {
    const full = path.join(ROOT, dir);
    if (!fs.existsSync(full)) continue;
    const entries = fs.readdirSync(full, { recursive: true, withFileTypes: true });
    for (const entry of entries) {
      if (entry.isFile() && entry.name.endsWith('.php')) {
        const entryDir = entry.parentPath || entry.path || full;
        files.push(path.relative(ROOT, path.join(entryDir, entry.name)));
      }
    }
  }
  return files;
}

const PHP_BLOCK_RE = /<\?(php)?=?[\s\S]*?\?>/g;

// Saca los bloques <?php ... ?> / <?= ... ?> de ADENTRO de un atributo
// class="...", dejando solo lo literal (separado por espacios, como
// cualquier lista de clases real).
function literalClassesFrom(rawAttrValue) {
  const stripped = rawAttrValue.replace(PHP_BLOCK_RE, ' ');
  return stripped.split(/\s+/).map((c) => c.trim()).filter(Boolean);
}

const TAG_CLASS_RE = /<([a-zA-Z][a-zA-Z0-9]*)\b[^>]*?\bclass=("([^"]*)"|'([^']*)')/g;
// Convención dominante de este proyecto (22/30 componentes): la primera
// línea de cada archivo arma "$class_name = 'root-class';" y ese string se
// inyecta después vía PHP en el tag raíz — así que en el HTML final la
// clase raíz NUNCA aparece como texto literal (TAG_CLASS_RE no la ve), pero
// acá SÍ está literal, en el propio PHP. Esta señal es más valiosa que
// TAG_CLASS_RE para resolver justo el caso más común de "componentGuess"
// (labelFor() del toolbar usa esta misma raíz semántica).
const CLASS_NAME_VAR_RE = /\$class_name\s*=\s*['"]([^'"]+)['"]/g;
// Cualquier tag HTML de apertura (no solo los que tienen class="...") — para
// armar, por archivo, "línea de la N-ésima aparición de este tag" (ver
// elementIndex en buildMap). Sirve para bajar de "archivo de la card" a
// "línea del elemento específico" sin depender de que ese elemento tenga
// clase propia: como cada card es una plantilla PHP estática (mismo orden de
// tags siempre, aunque el contenido cambie), la N-ésima aparición de <h3> en
// el DOM renderizado de UNA instancia siempre corresponde a la N-ésima
// aparición de <h3> en el archivo fuente de esa card — ver
// resolveElementLine() en toolbar.js.
const ANY_TAG_RE = /<([a-zA-Z][a-zA-Z0-9-]*)(?=[\s\/>])/g;

// iframe (embeds de terceros, ej. YouTube vía wp_oembed_get) y script
// (analytics/tracking en header/footer) — pedido explícito: no son destinos
// útiles de "Ir al código" y contarlos en elementIndex/componentMap solo
// suma ruido (varios por página, sin relación con ningún componente propio).
const EXCLUDED_TAGS = new Set(['iframe', 'script']);

function scanFile(relPath) {
  const full = path.join(ROOT, relPath);
  let content;
  try { content = fs.readFileSync(full, 'utf8'); } catch (e) { return { occurrences: [], tagLines: {} }; }
  const lines = content.split('\n');
  const results = [];
  const tagLines = {};
  lines.forEach((lineText, idx) => {
    // Un atributo con PHP embebido ANTES de class="..." en el mismo tag (ej.
    // href="<?php the_permalink(); ?>" class="...") trae un '>' de cierre
    // que corta [^>]*? antes de llegar al class= real — TAG_CLASS_RE nunca
    // ve ese tag. Se pisan los bloques PHP de TODA la línea (no solo del
    // valor de class) antes de matchear el tag — el valor de class="..." ya
    // sale limpio de acá, así que literalClassesFrom no tiene nada más que
    // sacar (no-op inofensivo sobre el resultado, pero necesario para que
    // TAG_CLASS_RE encuentre el tag en primer lugar).
    const scanLine = lineText.replace(PHP_BLOCK_RE, ' ');
    TAG_CLASS_RE.lastIndex = 0;
    let m;
    while ((m = TAG_CLASS_RE.exec(scanLine))) {
      const tag = m[1];
      if (EXCLUDED_TAGS.has(tag.toLowerCase())) continue;
      const raw = m[3] !== undefined ? m[3] : m[4];
      const classes = literalClassesFrom(raw || '');
      if (classes.length) results.push({ line: idx + 1, tag, classes, kind: 'tag_class' });
    }
    CLASS_NAME_VAR_RE.lastIndex = 0;
    let mv;
    while ((mv = CLASS_NAME_VAR_RE.exec(scanLine))) {
      results.push({ line: idx + 1, tag: null, classes: [mv[1]], kind: 'class_name_var' });
    }
    ANY_TAG_RE.lastIndex = 0;
    let mt;
    while ((mt = ANY_TAG_RE.exec(scanLine))) {
      const tagName = mt[1].toLowerCase();
      if (EXCLUDED_TAGS.has(tagName)) continue;
      if (!tagLines[tagName]) tagLines[tagName] = [];
      tagLines[tagName].push(idx + 1);
    }
  });
  return { occurrences: results, tagLines };
}

function buildMap() {
  const files = {};
  const byClass = {};
  // Mapa a nivel de componente/card: identificador → {file, line}. `line`
  // apunta al tag raíz del archivo (ver rootTagOcc más abajo), para que el
  // navegador pueda abrir vscode://file/...:línea directo en el elemento en
  // vez de solo el archivo. Pensado para que el NAVEGADOR resuelva "Ir al
  // código" solo, sin pedirme ayuda — ver doLiveLocate/resolveComponentFileClientSide
  // en toolbar.js.
  // Dos fuentes de identificador por archivo:
  //  1. El nombre de archivo sin extensión (siempre) — ej. "hero-slider-card"
  //     para cards/hero-slider-card.php. Es lo único que tienen las cards,
  //     que reciben $class_name del componente padre por parámetro
  //     (extract($args)) en vez de declarar el suyo propio.
  //  2. El valor real de "$class_name = '...'" si el archivo lo declara
  //     (la mayoría de los components) — en la práctica casi siempre
  //     coincide con el nombre de archivo, pero se guarda igual por las
  //     dudas de que alguna vez difieran.
  const componentMap = {};
  // Por archivo: tagName → [línea, línea, ...] en orden de aparición en el
  // PHP fuente. El navegador usa esto para bajar de "archivo de la card" a
  // "línea del elemento clickeado": cuenta qué posición ocupa ese tag dentro
  // del DOM de ESA instancia de card (ej. "el primer <h3>") y busca esa
  // misma posición acá — ver resolveElementLine() en toolbar.js.
  const elementIndex = {};
  const allFiles = collectPhpFiles();
  for (const rel of allFiles) {
    const { occurrences, tagLines } = scanFile(rel);
    const base = path.basename(rel, '.php');
    // Línea del tag raíz del componente/card, para que "Ir al código" pueda
    // abrir directo en el elemento en vez de solo el archivo. Convención
    // verificada en todo el proyecto: el primer tag con class="..." de cada
    // archivo (kind 'tag_class') es siempre su wrapper raíz — `$class_name =
    // '...'` (kind 'class_name_var') va ANTES en el archivo pero es la
    // declaración de la variable, no el tag en sí, así que se descarta acá.
    const rootTagOcc = occurrences.find((occ) => occ.kind === 'tag_class');
    const rootEntry = rootTagOcc ? { file: rel, line: rootTagOcc.line } : { file: rel };
    componentMap[base] = rootEntry;
    if (Object.keys(tagLines).length) elementIndex[rel] = tagLines;
    if (!occurrences.length) continue;
    files[rel] = occurrences;
    occurrences.forEach((occ) => {
      if (occ.kind === 'class_name_var') {
        occ.classes.forEach((cls) => { componentMap[cls] = rootEntry; });
      }
      occ.classes.forEach((cls) => {
        if (!byClass[cls]) byClass[cls] = [];
        byClass[cls].push({ file: rel, line: occ.line, tag: occ.tag, kind: occ.kind });
      });
    });
  }
  const customUtilities = buildCustomUtilitiesMap();
  const colorTokens = buildColorTokensMap();
  return { generatedAt: new Date().toISOString(), themeRoot: ROOT, files, byClass, componentMap, elementIndex, customUtilities, colorTokens };
}

function renderMarkdown(map) {
  const lines = [
    '# Mapa del proyecto (generado automáticamente — no editar a mano)',
    '',
    'Atajo de velocidad para el modo live de Lens-SK: qué archivo/línea define cada clase HTML literal del theme. Se regenera solo — ver `scripts/lens-sk-project-map.js`.',
    '',
    `Generado: ${map.generatedAt}`,
    '',
  ];
  Object.keys(map.files).sort().forEach((rel) => {
    lines.push(`## ${rel}`);
    map.files[rel].forEach((occ) => {
      const label = occ.kind === 'class_name_var' ? '`$class_name`' : `\`<${occ.tag}>\``;
      lines.push(`- L${occ.line} ${label} ${occ.classes.map((c) => '.' + c).join(' ')}`);
    });
    lines.push('');
  });
  const utilNames = Object.keys(map.customUtilities || {}).sort();
  if (utilNames.length) {
    lines.push('# Utilities propias del proyecto (`@utility`, no nativas de Tailwind)');
    lines.push('');
    lines.push('Antes de responder un pedido de Sugerir que mencione una de estas clases, leer su cuerpo acá — si `affectsChildren` es true, un override de estilo sobre el elemento fijado NO alcanza (el efecto real vive en un selector de hijos), hace falta `childOverrides`.');
    lines.push('');
    utilNames.forEach((name) => {
      const u = map.customUtilities[name];
      lines.push(`## ${name}${u.affectsChildren ? ' ⚠️ afecta a los hijos' : ''}`);
      lines.push(`${u.file}:${u.line}`);
      lines.push('```css');
      lines.push(u.body);
      lines.push('```');
      lines.push('');
    });
  }
  const tokenNames = Object.keys(map.colorTokens || {}).sort();
  if (tokenNames.length) {
    lines.push('# Tokens de color reales (`--color-{rol}`, fuente: tailwindcss/plugins/*.js)');
    lines.push('');
    lines.push('Fuente de verdad de la paleta — NO el CSS compilado, que puede estar desactualizado.');
    lines.push('');
    tokenNames.forEach((name) => {
      const t = map.colorTokens[name];
      lines.push(`- \`--color-${name}\`: \`${t.hex}\` (${t.file}:${t.line})`);
    });
    lines.push('');
  }
  return lines.join('\n');
}

function writeMap() {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  const map = buildMap();
  fs.writeFileSync(OUT_JSON, JSON.stringify(map, null, 2));
  fs.writeFileSync(OUT_MD, renderMarkdown(map));
  const fileCount = Object.keys(map.files).length;
  const classCount = Object.keys(map.byClass).length;
  const componentCount = Object.keys(map.componentMap).length;
  const elementIndexCount = Object.keys(map.elementIndex).length;
  const utilCount = Object.keys(map.customUtilities || {}).length;
  const colorTokenCount = Object.keys(map.colorTokens || {}).length;
  console.log(`[lens-sk-project-map] ${fileCount} archivo(s), ${classCount} clase(s), ${componentCount} identificador(es) de componente/card, ${elementIndexCount} archivo(s) con índice de elementos, ${utilCount} utility(s) propia(s), ${colorTokenCount} token(s) de color -> .lens-sk-cache/project-map.{json,md}`);
}

function runWatch() {
  writeMap();
  let timer = null;
  const trigger = () => {
    clearTimeout(timer);
    timer = setTimeout(writeMap, 300);
  };
  for (const dir of SCAN_DIRS) {
    const full = path.join(ROOT, dir);
    if (!fs.existsSync(full)) continue;
    fs.watch(full, { recursive: true }, (_event, filename) => {
      if (filename && !filename.endsWith('.php')) return;
      trigger();
    });
  }
  for (const dir of TW_SCAN_DIRS) {
    const full = path.join(ROOT, 'tailwindcss', dir);
    if (!fs.existsSync(full)) continue;
    fs.watch(full, { recursive: true }, (_event, filename) => {
      if (filename && !filename.endsWith('.css')) return;
      trigger();
    });
  }
  // Los templates raíz también pueden cambiar — se vigilan uno por uno
  // (no hay un directorio único que los agrupe a todos).
  ROOT_FILES.forEach((rel) => {
    const full = path.join(ROOT, rel);
    if (fs.existsSync(full)) fs.watch(full, () => trigger());
  });
}

if (process.argv.includes('--watch')) {
  runWatch();
} else {
  writeMap();
}
