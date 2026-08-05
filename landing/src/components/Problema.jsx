export default function Problema() {
  return (
    <section id="problema">
      <div className="wrap">
        <div className="section-head">
          <span className="label">01 — El problema</span>
          <h2>DevTools no sabe nada de tu proyecto</h2>
        </div>
        <div className="problem-body">
          <div>
            <p>Ajustar un componente a mano en el navegador funciona, pero tiene fricción constante: el panel Elements muestra todo el árbol sin distinguir tu componente del wrapper del framework, cada valor que tocás en Styles desaparece en el próximo refresh o re-render, y si el resultado te convenció, tenés que traducirlo a mano al archivo fuente — adivinando cuál es, si el proyecto no te lo dice.</p>
            <p>Ese ciclo se repite cada vez que abrís la pestaña: seleccionar, tocar, perder, repetir. En una sesión larga de ajuste fino de layout, esa fricción se vuelve el costo real del trabajo.</p>
          </div>
          <div className="problem-aside">
            <div>
              <div className="stat">0</div>
              <p>cambios de Styles que sobreviven a un F5 en el inspector nativo</p>
            </div>
            <div>
              <div className="stat">1</div>
              <p>skill de Claude Code para tener Lens-SK en cualquier proyecto, sin instalar nada en producción</p>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}
