export default function Nav({ view, setView }) {
  function goHome(hash) {
    setView('home')
    if (hash) {
      requestAnimationFrame(() => {
        document.getElementById(hash)?.scrollIntoView({ behavior: 'smooth' })
      })
    }
  }

  return (
    <header className="nav">
      <div className="wrap nav-row">
        <button className="wordmark" onClick={() => goHome()}>
          <span className="lens">🔍</span> Lens-SK
          <span className="prelaunch">skill · v1.2.7</span>
        </button>
        <nav className="nav-links">
          <button onClick={() => goHome('ia')}>IA</button>
          <button onClick={() => goHome('comparativa')}>Comparativa</button>
          <button onClick={() => goHome('funciones')}>Funciones</button>
          <button
            className="nav-cta"
            style={view === 'docs' ? { color: 'var(--accent)' } : undefined}
            onClick={() => setView('docs')}
          >
            Documentación
          </button>
          <button className="btn btn-ghost" style={{ border: 'none', padding: 0 }} onClick={() => goHome('instalar')}>Instalar</button>
        </nav>
      </div>
    </header>
  )
}
