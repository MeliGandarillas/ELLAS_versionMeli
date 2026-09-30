import React from 'react';
import { Calendar, Users, Handshake, Stethoscope } from 'lucide-react';
import botonDeFlor from '../assets/boton de flor.png';
import logo from '../assets/Logo.png';
import Mapa from '../components/Mapa.jsx';

// Vista principal (Imagen 1)
export default function Inicio({
  amigas, miPosicion, onAbrirModal, onVerAmigos, onVerCalendario, onVerApoyo, onVerSalud,
}) {
  return (
    <div className="inicio">
      {/* Header Superior */}
      <div className="header">
        <div className="header-logo">
          <img src={logo} alt="Ellas" />
        </div>
        <span className="header-date">290926</span>
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

      {/* Mapa con tu ubicación y la de tus amigas */}
      <div className="inicio-mapa">
        <Mapa amigas={amigas} miPosicion={miPosicion} />
      </div>

      {/* Panel Inferior con Botones */}
      <div className="bottom-panel">
        {/* Botón de Corazón con ubicación: Abre el Modal (Imagen 3) */}
        <div className="heart-wrapper">
          <button
            className="heart-btn"
            onClick={onAbrirModal}
            aria-label="Activar la ubicación del chip"
          >
            <img className="heart-icon" src={botonDeFlor} alt="" />
          </button>
          <span className="heart-tooltip">Activar la ubicación del chip</span>
        </div>

        {/* El botón del chatbot lo pone Botpress (scripts en index.html) */}
      </div>
    </div>
  );
}
