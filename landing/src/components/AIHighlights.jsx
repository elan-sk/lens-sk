import shot1 from '../assets/manual/ai-01-pedir-cambio.png'
import shot2 from '../assets/manual/ai-02-pregunta-opciones.png'
import shot3 from '../assets/manual/ai-03-overlay-heredado.png'

export default function AIHighlights() {
  return (
    <section id="ia" className="ai-section">
      <div className="wrap">
        <div className="section-head">
          <span className="ai-badge">✨ Con Claude Code</span>
          <h2>Le pedís el cambio en texto libre. Claude ve exactamente lo que vos ves.</h2>
          <p>Con una sesión de Claude Code escuchando del otro lado, el panel suma un canal de ida y vuelta en vivo — sin salir del navegador, sin copiar y pegar nada en otra ventana.</p>
        </div>

        <div className="ai-grid">
          <div className="ai-card">
            <h3>🪄 Pedís el cambio hablando, no clase por clase</h3>
            <p>Describí qué querés en español simple ("poné el título en dorado", "achicá el padding acá") — Claude decide el valor real y lo aplica como vista previa, editable después. El textarea tiene autocompletado propio: <code>/</code> para invocar skills relevantes del proyecto, <code>@</code> para referenciar un archivo real por nombre.</p>
            <div className="shot"><img src={shot1} alt="Textarea de Pedir cambio con el menú de autocompletado / abierto, mostrando skills del proyecto" /></div>
          </div>
          <div className="ai-card">
            <h3>👁️ Claude ve lo que vos ves</h3>
            <p>Cada pedido lleva la captura del elemento adjunta automáticamente — no hace falta describir colores o layout con palabras, Claude mira la imagen real. Si algo necesita más contexto, puede preguntarte directo desde el panel, con opciones para elegir o una respuesta libre.</p>
            <div className="shot"><img src={shot2} alt="Modal de pregunta de Claude con opciones para elegir, mostrado dentro del panel del navegador" /></div>
          </div>
          <div className="ai-card">
            <h3>🗺️ Conoce la estructura del proyecto, no solo el DOM</h3>
            <p>Del otro lado, Claude tiene el mapa real del proyecto (qué archivo/línea define cada componente, qué clases propias existen, los colores reales de la paleta) — así "Ir al código" salta exacto, y una sugerencia de color usa la marca real del proyecto, no un valor inventado.</p>
          </div>
          <div className="ai-card">
            <h3>🖼️ Overlay heredado, sin perder la referencia visual</h3>
            <p>Si veías la grilla de Layout o el box-model de Estilos antes de abrir Asistencia, esa referencia se sigue mostrando — y siguiendo al elemento si scrolleás — mientras escribís el pedido. No hace falta memorizar el layout de memoria.</p>
            <div className="shot"><img src={shot3} alt="Panel de Asistencia Claude abierto con el overlay de grilla de Layout todavía visible detrás" /></div>
          </div>
        </div>

        <div className="ai-note">
          <b>Adjuntar archivos sin gastar de más:</b> podés sumar un PDF, un Word, un Excel o una imagen al pedido (botón, arrastrar-soltar o pegar) — pero el archivo original nunca se manda tal cual. Cada uno se procesa en el navegador a texto plano/Markdown, o una imagen se comprime, antes de llegar a Claude. Menos tokens gastados, misma información útil.
        </div>
      </div>
    </section>
  )
}
