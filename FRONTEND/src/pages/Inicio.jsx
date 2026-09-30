import React from 'react';
import { Calendar, Users, Handshake, Stethoscope, User } from 'lucide-react';
import botonDeFlor from '../assets/boton de flor.png';
import logo from '../assets/Logo.png';
import Mapa from '../components/Mapa.jsx';

// Vista principal (Imagen 1)
export default function Inicio({
  amigas, miPosicion, dije, alerta, onCorazon, onAbrirMenu, onVerAmigos, onVerCalendario, onVerApoyo, onVerSalud,
}) {
  return (
    <div className="inicio">
      {/* Header Superior */}
      <div className="header">
        <div className="header-logo">
          <img src={logo} alt="Ellas" />
        </div>
        <div className="header-right">
          <span className="header-date">290926</span>
          {/* Menú de la usuaria: compartir ubicación, dije y cerrar sesión */}
          <button className="header-user" onClick={onAbrirMenu} title="Mi cuenta" aria-label="Mi cuenta">
            <User />
          </button>
        </div>
      </div>

      {/* Bloque con las Tarjetas */}
      <div className="cards-container">
        <button className="card-box" onClick={onVerCalendario} title="Salud Reproductiva">
          <Calendar className="card-icon" />
        </button>
        <button className="card-box" onClick={onVerAmigos} title="Amigos">
          <Users className="card-icon" />
        </button>
        <button className="card-box" onClick={onVerApoyo} title="Centros de Apoyo">
          <Handshake className="card-icon" />
        </button>
        <button className="card-box" onClick={onVerSalud} title="Centros de Salud">
          <Stethoscope className="card-icon" />
        </button>
      </div>

      {/* Mapa con tu ubicación, la de tu dije y la de tus amigas */}
      <div className="inicio-mapa">
        <Mapa amigas={amigas} miPosicion={miPosicion} dije={dije} alerta={alerta} />
      </div>

      {/* Panel Inferior con Botones */}
      <div className="bottom-panel">
        {/* Botón de Corazón: busca y conecta el dije por Bluetooth; ya conectado, lo hace vibrar */}
        <div className="heart-wrapper">
          <button
            className="heart-btn"
            onClick={onCorazon}
            aria-label="Activar la ubicación del chip"
          >
            <img className="heart-icon" src={botonDeFlor} alt="" />
          </button>
          <span className="heart-tooltip">Activar la ubicación del chip</span>
        </div>

        {/* Burbuja de contacto: abre la app de correo */}
        <a className="correo-burbuja" href="mailto:somossoloellas@gmail.com">somossoloellas@gmail.com</a>

        {/* El botón del chatbot lo pone Botpress (scripts en index.html) */}
      </div>
    </div>
  );
}
