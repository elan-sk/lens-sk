import shot from '../assets/manual/01-panel-inicial.png'

export default function Hero({ setView }) {
  return (
    <section className="hero">
      <div className="wrap hero-grid">
        <div>
          <div className="eyebrow"><span className="dot"></span><span className="label">Barra de inspección visual · cualquier stack</span></div>
          <h1>Ajustá la interfaz<br />a simple vista.<br /><em>Sin perderlo al recargar.</em></h1>
          <p className="lead">Lens-SK se inyecta sobre cualquier página — WordPress, React, Vue o HTML puro — y convierte el navegador en tu mesa de trabajo: seleccioná un elemento, editá sus estilos en vivo, y si tenés Claude Code escuchando, pedile el cambio en texto libre y mandalo directo al código fuente. Cada cambio sobrevive a un F5.</p>
          <div className="install-chip">
            <span className="mono sigil">$</span>
            <span className="mono">cp -r dev-inspector-toolbar ~/.claude/skills/</span>
          </div>
          <div className="hero-actions">
            <a href="#instalar" className="btn btn-solid">Ver instalación</a>
            <button className="btn" onClick={() => setView('docs')}>Ver documentación</button>
          </div>
        </div>
        <div className="hero-shot bracket">
          <span className="bk-tr"></span><span className="bk-bl"></span>
          <img src={shot} alt="Panel de Lens-SK abierto sobre una página real, con la pastilla de accesos directos a la derecha" />
          <span className="readout readout-tl">5 vistas · modo IA opcional</span>
          <span className="readout readout-br">captura real, sin retocar</span>
        </div>
      </div>
    </section>
  )
}
