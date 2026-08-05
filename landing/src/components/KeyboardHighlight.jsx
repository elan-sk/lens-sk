export default function KeyboardHighlight() {
  return (
    <section id="teclado">
      <div className="wrap">
        <div className="section-head">
          <span className="label">— Sin mouse, si querés</span>
          <h2>Casi todo tiene atajo. El menú grande es opcional.</h2>
          <p>Cambiar de vista, copiar clases, aplicar el CSS modificado, navegar padre/hijo/hermanos, clonar un elemento — se puede hacer entero desde el teclado, sin abrir el panel ni tocar el mouse. Cualquier programador que vive en el teclado lo va a notar.</p>
        </div>
        <div className="kbd-strip">
          <kbd>Espacio</kbd><span className="kbd-arrow">panel</span>
          <kbd>I</kbd><span className="kbd-arrow">inspección</span>
          <kbd>S</kbd><span className="kbd-arrow">estilos</span>
          <kbd>L</kbd><span className="kbd-arrow">layout</span>
          <kbd>V</kbd><span className="kbd-arrow">árbol HTML</span>
          <kbd>C</kbd><span className="kbd-arrow">copiar clases</span>
          <kbd>G</kbd><span className="kbd-arrow">copiar CSS</span>
          <kbd>D</kbd><span className="kbd-arrow">clonar</span>
          <kbd>↑ ↓ ← →</kbd><span className="kbd-arrow">padre/hijo/hermanos</span>
        </div>
      </div>
    </section>
  )
}
