export default function ModoNormal() {
  return (
    <section id="sin-ia">
      <div className="wrap">
        <div className="section-head">
          <span className="label">— Sin Claude Code</span>
          <h2>Todo lo de arriba con 🪄/📤 es solo con Claude. El resto funciona igual, siempre.</h2>
          <p>Lens-SK no depende de ninguna sesión de IA para ser útil — la mayoría de la herramienta es 100% local, corre entera en el navegador. Esto es lo que tenés desde el minuto uno, sin conectar nada:</p>
        </div>
        <div className="normal-grid">
          <div className="normal-card">
            <span className="ico">🎨</span>
            <h3>Variables reales del proyecto</h3>
            <p>El picker de color infiere los <code>--color-*</code> directo del CSS ya cargado en la página — nunca un valor inventado, sea cual sea el stack.</p>
          </div>
          <div className="normal-card">
            <span className="ico">🌓</span>
            <h3>Contraste WCAG</h3>
            <p>Ratio de contraste texto/fondo del elemento fijado, con el estándar de accesibilidad que cumple (o no) a simple vista.</p>
          </div>
          <div className="normal-card">
            <span className="ico">♿</span>
            <h3>A11y de página completa</h3>
            <p>Escaneo rápido: imágenes sin texto alternativo, campos de formulario sin etiqueta, encabezados mal ordenados.</p>
          </div>
          <div className="normal-card">
            <span className="ico">📄</span>
            <h3>Exportar el CSS modificado</h3>
            <p>Un botón copia todo lo que cambiaste en la sesión, ya armado como CSS o clases Tailwind reales, listo para pegar.</p>
          </div>
          <div className="normal-card">
            <span className="ico">🔢</span>
            <h3>Escala real de Tailwind</h3>
            <p>Con TWCSS activo, los valores de spacing/tipografía se eligen de la escala que el proyecto ya usa, no de una tabla genérica.</p>
          </div>
          <div className="normal-card">
            <span className="ico">📱</span>
            <h3>Breakpoints del proyecto</h3>
            <p>Detecta automáticamente los breakpoints ya definidos en el CSS, o dejá tu propia lista manual.</p>
          </div>
          <div className="normal-card">
            <span className="ico">💾</span>
            <h3>Persistencia total</h3>
            <p>Selección, vista activa, clones, elementos ocultos y estilos editados sobreviven a cualquier F5 — todo vive en <code>localStorage</code>, por página.</p>
          </div>
          <div className="normal-card">
            <span className="ico">🇪🇸</span>
            <h3>Bilingüe ES/EN</h3>
            <p>Detecta el idioma del navegador al primer uso; cambiar de idioma reescribe la interfaz en vivo, sin recargar.</p>
          </div>
        </div>
      </div>
    </section>
  )
}
