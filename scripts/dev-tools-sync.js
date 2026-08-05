#!/usr/bin/env node
// Copia (modo "copy") o borra (modo "clean") los archivos del inspector de
// depuración entre js/dev-tools/ (fuente, gitignoreada) y assets/dev-tools/
// (lo único que js/dev-tools/inject-inspector.js pide por fetch en runtime).
//
// "npm run dev" corre esto en "copy" antes de levantar (hook "predev").
// "npm run build" corre esto en "clean" antes de compilar (hook "prebuild"),
// así assets/dev-tools/ NUNCA queda en un build de producción, sin importar
// si antes se corrió "npm run dev" en esa misma carpeta.
const fs = require('fs');
const path = require('path');

const SRC_DIR = path.resolve(__dirname, '../js/dev-tools');
const DEST_DIR = path.resolve(__dirname, '../assets/dev-tools');
const FILES = [
  'toolbar.js', 'modern-screenshot.umd.js',
  // Adjuntar documentos en Asistencia Claude (PDF/DOCX/XLSX) — vendoreadas
  // como script clásico (ver inject-inspector.js: "nada de import()"), pdf.js
  // en su versión 3.11.174 a propósito porque es la última con build no-ESM
  // (v4+ de pdfjs-dist solo distribuye .mjs). Se cargan lazy desde toolbar.js
  // solo cuando el usuario adjunta un archivo, no en cada carga de página.
  'pdf.min.js', 'pdf.worker.min.js', 'mammoth.browser.min.js', 'xlsx.full.min.js',
];

const mode = process.argv[2];

if (mode === 'clean') {
  fs.rmSync(DEST_DIR, { recursive: true, force: true });
  console.log('[dev-tools-sync] assets/dev-tools/ eliminado.');
} else if (mode === 'copy') {
  fs.mkdirSync(DEST_DIR, { recursive: true });
  let copied = 0;
  FILES.forEach((file) => {
    const src = path.join(SRC_DIR, file);
    if (fs.existsSync(src)) {
      fs.copyFileSync(src, path.join(DEST_DIR, file));
      copied++;
    }
  });
  console.log(`[dev-tools-sync] ${copied}/${FILES.length} archivo(s) copiados a assets/dev-tools/.`);
} else {
  console.error('Uso: node dev-tools-sync.js <copy|clean>');
  process.exit(1);
}
