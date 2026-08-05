export default function Footer() {
  return (
    <footer>
      <div className="spec-plate wrap" style={{ paddingLeft: 0, paddingRight: 0 }}>
        <div className="plate-field"><span className="label">Versión</span><span className="val">1.2.7 · skill de Claude Code</span></div>
        <div className="plate-field"><span className="label">Licencia</span><span className="val">Uso libre</span></div>
        <div className="plate-field"><span className="label">Compatibilidad</span><span className="val">WordPress · React · Vue · HTML</span></div>
        <div className="plate-field"><span className="label">Aislamiento</span><span className="val">Shadow DOM, sin dependencias</span></div>
      </div>
      <div className="foot-row">
        <span className="tagline">Lens-SK — una lupa para tu propio código.</span>
        <span className="credit">Skill de Claude Code · npm en el roadmap</span>
      </div>
    </footer>
  )
}
