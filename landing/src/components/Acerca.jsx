import { useState } from 'react'
import logo from '../assets/logo-elan-sk.svg'
import paypalIcon from '../assets/paypal-icon-example.svg'

export default function Acerca() {
  const [toast, setToast] = useState('')

  async function copyKey() {
    try {
      await navigator.clipboard.writeText('elan-sk@hotmail.com')
      setToast('Correo copiado al portapapeles')
    } catch {
      setToast('No se pudo copiar — copiá manualmente: elan-sk@hotmail.com')
    }
    setTimeout(() => setToast(''), 2200)
  }

  return (
    <section id="acerca" className="about-section">
      <div className="wrap">
        <img src={logo} alt="ELAN-SK · Elan SK Soft" className="about-logo" />
        <h2 className="about-title" style={{ textTransform: 'none' }}>Sobre Lens-SK</h2>
        <p className="about-text">
          Lens-SK es un proyecto de ELAN-SK · Elan SK Soft — una barra de inspección visual
          pensada para el ciclo de ajuste fino que DevTools no cubre bien, con un puente
          opcional a Claude Code para pedir cambios en texto libre. Se distribuye como skill
          de Claude Code, gratis.
        </p>
        <hr className="about-divider" />
        <div className="about-details">
          <div className="about-row">
            <span className="row-label"><span aria-hidden="true">✉️</span> Contacto</span>
            <a href="mailto:elan-sk@hotmail.com" className="row-value">elan-sk@hotmail.com</a>
          </div>
          <div className="about-row">
            <span className="row-label"><img src={paypalIcon} alt="" style={{ height: '16px' }} /> PayPal</span>
            <a href="https://www.paypal.com/paypalme/elansk" target="_blank" rel="noreferrer" className="row-value">Donar por PayPal</a>
          </div>
          <div className="about-row">
            <span className="row-label"><span aria-hidden="true">⚡</span> Bre-B</span>
            <button type="button" className="row-value" onClick={copyKey} title="Copiar">elan-sk@hotmail.com</button>
          </div>
        </div>
        <p className="about-footer">Elaborado por ELAN-SK · Elan SK Soft · {new Date().getFullYear()}</p>
      </div>
      <div className={`toast${toast ? ' show' : ''}`}>{toast}</div>
    </section>
  )
}
