export default function Instalacion() {
  return (
    <section id="instalar">
      <div className="wrap">
        <div className="section-head">
          <span className="label">04 — Instalación</span>
          <h2>Tres formas de tenerla. Una ya funciona hoy.</h2>
          <p>Sin configuración, sin dependencias nuevas en producción — se inyecta como un script suelto, nunca se bundlea con el proyecto.</p>
        </div>
        <div className="install-grid">
          <div className="install-panel">
            <div className="bar"><span className="tag">Skill de Claude Code</span><span className="mono" style={{ fontSize: '.72rem', color: 'var(--muted)' }}>disponible hoy</span></div>
            <pre className="mono"><span className="c1"># copiar la carpeta del skill a tu Claude Code</span>
cp -r dev-inspector-toolbar <span className="c2">~/.claude/skills/</span></pre>
            <div className="install-note">Sin marketplace todavía — se comparte como carpeta (o el <code>.zip</code>). Una vez copiada, pedile a Claude Code "inyectá Lens-SK en esta página" en cualquier proyecto abierto, vía el MCP de Chrome DevTools, sin tocar el repo del proyecto.</div>
          </div>
          <div className="install-panel">
            <div className="bar"><span className="tag">Script tag</span><span className="mono" style={{ fontSize: '.72rem', color: 'var(--muted)' }}>autohospedado</span></div>
            <pre className="mono"><span className="c1">// copiás scripts/toolbar.js al proyecto</span>
<span className="c1">// y lo enqueueás como script clásico</span>
&lt;script <span className="c2">src</span>=<span className="c1">"/assets/dev-tools/toolbar.js"</span>&gt;&lt;/script&gt;</pre>
            <div className="install-note">Sin build step, sin dependencias — funciona igual en WordPress/PHP renderizado, HTML estático, o cualquier página que puedas tocar. Es lo que ya usa este mismo proyecto.</div>
          </div>
          <div className="install-panel">
            <div className="bar"><span className="tag roadmap">npm</span><span className="mono" style={{ fontSize: '.72rem', color: 'var(--muted)' }}>en el roadmap</span></div>
            <pre className="mono"><span className="c1"># todavía no publicado</span>
npm install -D lens-sk
<span className="c1">import</span> "lens-sk/auto";</pre>
            <div className="install-note">Empaquetar como devDependency real (auto-inyectada en desarrollo, excluida del build de producción) es el siguiente paso evaluado — no está disponible todavía.</div>
          </div>
        </div>
      </div>
    </section>
  )
}
