import shot1 from '../assets/manual/09-clonar-elemento.png'
import shot2 from '../assets/manual/05-arbol-html.png'

export default function Funciones() {
  return (
    <section id="funciones">
      <div className="wrap">
        <div className="section-head">
          <span className="label">03 — Funciones</span>
          <h2>Pensada para tocar, no solo para mirar</h2>
        </div>
        <div className="feature-grid">
          <div className="feature">
            <h3>Selección persistente</h3>
            <p>Un interruptor ON/OFF, no un botón de un solo uso. El elemento fijado, la vista activa y el scroll del panel sobreviven a cualquier recarga completa.</p>
          </div>
          <div className="feature">
            <h3>Consciente de Tailwind</h3>
            <p>Si el proyecto usa Tailwind, elegís directo entre la escala real de espaciado y tipografía del proyecto — nunca un valor inventado.</p>
          </div>
          <div className="feature">
            <h3>Avisos de valores negativos</h3>
            <p>Un margin negativo puede descuadrar todo un layout sin avisar. Lens-SK lo marca en la fila y en el diagrama box-model.</p>
            <span className="warn-tag">⚠ -20px detectado</span>
          </div>
          <div className="feature wide with-shot">
            <h3>Ocultar, clonar y señalar</h3>
            <p>Ocultá un bloque con cascada visual a sus hijos, duplicalo para probar un layout con más ítems, o señalalo en la página sin salir del árbol ni depender de hover.</p>
            <div className="shot"><img src={shot1} alt="Un elemento clonado junto al original, con marcadores numerados" /></div>
          </div>
          <div className="feature with-shot">
            <h3>Árbol HTML editable</h3>
            <p>El DOM completo como un editor de código, con clases y texto editables por nodo, y un ojo por fila para ocultar sin perder de vista la estructura.</p>
            <div className="shot"><img src={shot2} alt="Árbol HTML anidado con clases Tailwind reales" /></div>
          </div>
        </div>
      </div>
    </section>
  )
}
