export default function Comparativa() {
  return (
    <section id="comparativa">
      <div className="wrap">
        <div className="section-head">
          <span className="label">02 — Comparativa</span>
          <h2>No reemplaza a DevTools.<br />Ataca donde es más débil.</h2>
          <p>Network, Performance y breakpoints de JS siguen siendo terreno de DevTools. Lens-SK se enfoca en el ciclo de ajuste visual iterativo de tu propio proyecto.</p>
        </div>
        <div className="spec-sheet">
          <div className="spec-row head">
            <div></div>
            <div className="spec-head-label">DevTools nativo</div>
            <div className="spec-head-label lens">Lens-SK</div>
          </div>
          <Row label="Selección" native="Ícono de lupa, hay que reactivarlo cada vez" lens="Siempre activa con un interruptor ON/OFF" />
          <Row label="Persistencia" native="Cero — todo se pierde al recargar" lens="Cada cambio vive en localStorage, por página" />
          <Row label="Conciencia de Tailwind" native="Solo el valor final calculado" lens="Escala real de espaciado y tipografía del proyecto" />
          <Row label="Valores peligrosos" native="Ningún aviso" lens="⚠️ en cualquier valor negativo, en la fila y en el diagrama" />
          <Row label="Uso táctil" native="El hover no existe en touch — queda ciego" lens="Botón de lupa temporizado, sin depender de hover" />
          <Row label="Exportar el resultado" native="Declaración por declaración, a mano" lens="Un botón copia todo el CSS modificado, ya armado" />
          <Row label="Pedir un cambio" native="No existe — el humano decide y escribe todo" lens="Texto libre a Claude Code, con captura adjunta automática" />
        </div>
      </div>
    </section>
  )
}

function Row({ label, native, lens }) {
  return (
    <div className="spec-row">
      <div className="label">{label}</div>
      <div className="col native">{native}</div>
      <div className="col lens">{lens}</div>
    </div>
  )
}
