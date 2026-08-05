import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Build en modo librería: un solo archivo IIFE clásico (sin type="module"),
// mismo criterio que toolbar.js — se inyecta con <script src="...">, nunca
// se importa. Sin CSS externo: todo el estilo vive en objetos inline dentro
// de los componentes (ver src/styles/), así no hay ningún <link>/<style>
// global que pueda chocar con el CSS de la página host.
export default defineConfig({
  plugins: [react()],
  // React (empaquetado adentro del bundle final, no lo aporta la página
  // host) chequea `process.env.NODE_ENV` en runtime — Vite lo resuelve solo
  // en modo "app" normal, pero en modo librería hay que declararlo a mano
  // o queda como referencia real a un global `process` que no existe en el
  // navegador ("Uncaught ReferenceError: process is not defined", visto en
  // la primera inyección de prueba real).
  define: {
    'process.env.NODE_ENV': JSON.stringify('production'),
  },
  build: {
    lib: {
      entry: new URL('src/main.jsx', import.meta.url).pathname,
      name: 'LensSkReactInspector',
      formats: ['iife'],
      fileName: () => 'lens-sk-react.js',
    },
    outDir: 'dist',
    cssCodeSplit: false,
    emptyOutDir: true,
  },
})
