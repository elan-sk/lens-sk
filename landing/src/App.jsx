import { useState } from 'react'
import Nav from './components/Nav.jsx'
import Hero from './components/Hero.jsx'
import Problema from './components/Problema.jsx'
import AIHighlights from './components/AIHighlights.jsx'
import KeyboardHighlight from './components/KeyboardHighlight.jsx'
import Comparativa from './components/Comparativa.jsx'
import Funciones from './components/Funciones.jsx'
import ModoNormal from './components/ModoNormal.jsx'
import Instalacion from './components/Instalacion.jsx'
import Acerca from './components/Acerca.jsx'
import Footer from './components/Footer.jsx'
import Docs from './components/Docs.jsx'

function App() {
  const [view, setView] = useState('home') // 'home' | 'docs'

  if (view === 'docs') {
    return (
      <>
        <Nav view={view} setView={setView} />
        <Docs />
        <Footer />
      </>
    )
  }

  return (
    <>
      <Nav view={view} setView={setView} />
      <Hero setView={setView} />
      <Problema />
      <AIHighlights setView={setView} />
      <KeyboardHighlight />
      <Comparativa />
      <Funciones />
      <ModoNormal />
      <Instalacion />
      <Acerca />
      <Footer />
    </>
  )
}

export default App
