# Lens-SK — landing (React)

Sitio de producto de `dev-inspector-toolbar`: landing + documentación por temas.
Proyecto aparte, hermano de `../react/` (que es el puerto del WIDGET, no esto) —
ninguno de los dos reemplaza al vanilla (`../scripts/toolbar.js`).

## Estructura

- `src/components/` — una sección por archivo (`Hero`, `AIHighlights`,
  `KeyboardHighlight`, `Comparativa`, `Funciones`, `ModoNormal`, `Instalacion`,
  `Acerca`, `Footer`) más `Docs.jsx` (documentación por temas, sidebar + contenido,
  reusa las capturas de `../assets/manual/` + 3 propias en `src/assets/manual/ai-*.png`).
- `src/index.css` — mismo sistema de diseño del `landing-mockup.html` original
  (tokens `--bg`/`--ink`/`--accent`/etc., motivo de "esquinas" tipo retícula,
  tipografía Big Shoulders + IBM Plex Mono/Sans vía Google Fonts), sin el
  `@font-face` en base64 que tenía el mockup — más liviano.
- `App.jsx` tiene un switch simple `view: 'home' | 'docs'` (sin react-router,
  no hace falta para un sitio de una sola página + una vista de docs).

## Contenido honesto (importante si se edita `Instalacion.jsx`/`Hero.jsx`)

Solo la instalación como **skill de Claude Code** (copiar la carpeta a
`~/.claude/skills/`) es real hoy. **npm** está marcado explícitamente como
roadmap (no publicado). No hay ningún marketplace/plugin real todavía — no
reintroducir un comando `/plugin install` inventado, se probó y no existe tal
registro (ver `~/.claude/plugins/installed_plugins.json`).

## Comandos

```
npm install
npm run dev     # servidor de Vite con hot-reload
npm run build    # build de producción a dist/ (sitio estático, cualquier host sirve)
npm run preview  # sirve el build de dist/
```

## Pendiente / ideas para después

- Optimizar las imágenes de `src/assets/manual/` (hoy son PNG sin comprimir,
  el build pesa ~10MB) — convertir a WebP o comprimir antes de un deploy real.
- Si se publica de verdad (dominio propio), reemplazar los `href="#ancla"`
  del nav por rutas reales si `Docs` crece a necesitar URLs por tema.
