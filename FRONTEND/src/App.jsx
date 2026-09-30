import React, { useEffect, useState } from 'react';
import './App.css';
import Inicio from './pages/Inicio.jsx';
import Amigos from './pages/Amigos.jsx';
import Registro from './pages/Registro.jsx';
import SaludReproductiva from './pages/SaludReproductiva.jsx';
import CentrosApoyo from './pages/CentrosApoyo.jsx';
import CentrosSalud from './pages/CentrosSalud.jsx';
import useUbicaciones from './hooks/useUbicaciones.js';
import { leerUsuario, guardarUsuario, borrarUsuario } from './api/sesion.js';
import { cambiarCompartir, mensajeDeError, alVencerLaSesion } from './api/cliente.js';

export default function App() {
  // Usuaria actual (se guarda en el navegador)
  const [usuario, setUsuario] = useState(leerUsuario);
  // Estado para alternar entre vistas
  const [currentView, setCurrentView] = useState('main'); // 'main' | 'friends' | 'calendar' | 'support' | 'health'
  // Estado para controlar la visibilidad del modal (3ra imagen)
  const [isModalOpen, setIsModalOpen] = useState(false);
  // Si este dispositivo está enviando su ubicación.
  // Se comparte automáticamente en cuanto la usuaria entra: solo se pide el permiso del navegador.
  const [compartiendo, setCompartiendo] = useState(() => Boolean(leerUsuario()));
  const [errorCompartir, setErrorCompartir] = useState(null);

  const { amigas, miPosicion, errorGps } = useUbicaciones(usuario, compartiendo);

  const volverAInicio = () => setCurrentView('main');

  const entrar = (u) => {
    guardarUsuario(u);
    setUsuario(u);
    setCompartiendo(true);
  };

  const salir = () => {
    borrarUsuario();
    setUsuario(null);
    setCompartiendo(false);
    setIsModalOpen(false);
    setCurrentView('main');
  };

  // Si el token de sesión vence o deja de ser válido, se vuelve a la pantalla de inicio de sesión
  useEffect(() => {
    alVencerLaSesion(salir);
    return () => alVencerLaSesion(null);
  }, []);

  // Al entrar, se activa en el backend que sus amistades reciban su ubicación.
  // Si la cuenta guardada ya no existe (p. ej. se reinició la base de datos), se cierra la sesión.
  const usuarioId = usuario?.id;
  useEffect(() => {
    if (!usuarioId) return;
    cambiarCompartir(true)
      .then(() => setErrorCompartir(null))
      .catch((err) => {
        if (err.response?.status === 404) salir();
        else setErrorCompartir(mensajeDeError(err));
      });
  }, [usuarioId]);

  // Prende/apaga compartir la ubicación con las amistades
  const alternarCompartir = async () => {
    setErrorCompartir(null);
    try {
      await cambiarCompartir(!compartiendo);
      setCompartiendo(!compartiendo);
    } catch (err) {
      setErrorCompartir(mensajeDeError(err));
    }
  };

  if (!usuario) {
    return (
      <div className="mobile-container">
        <Registro onEntrar={entrar} />
      </div>
    );
  }

  return (
    <div className="mobile-container">

      {currentView === 'main' && (
        <Inicio
          amigas={amigas}
          miPosicion={miPosicion}
          onAbrirModal={() => setIsModalOpen(true)}
          onVerAmigos={() => setCurrentView('friends')}
          onVerCalendario={() => setCurrentView('calendar')}
          onVerApoyo={() => setCurrentView('support')}
          onVerSalud={() => setCurrentView('health')}
        />
      )}

      {currentView === 'friends' && (
        <Amigos amigas={amigas} onVolver={volverAInicio} />
      )}

      {currentView === 'calendar' && (
        <SaludReproductiva usuarioId={usuario.id} onVolver={volverAInicio} />
      )}

      {currentView === 'support' && (
        <CentrosApoyo onVolver={volverAInicio} />
      )}

      {currentView === 'health' && (
        <CentrosSalud onVolver={volverAInicio} />
      )}

      {isModalOpen && (
        <div className="app-modal-overlay" onClick={() => setIsModalOpen(false)}>
          <div className="app-modal" onClick={(e) => e.stopPropagation()}>
            <button
              className="app-modal-cerrar"
              onClick={() => setIsModalOpen(false)}
            >
              ✕
            </button>

            {/* Compartir ubicación */}
            <div className="app-modal-body">
              <p className="modal-title">
                Hola, {usuario.nombre}
              </p>
              <button
                className={`primary-btn ${compartiendo ? 'activo' : ''}`}
                onClick={alternarCompartir}
              >
                {compartiendo ? 'Dejar de compartir' : 'Compartir mi ubicación'}
              </button>
              <p className="modal-estado">
                {errorCompartir || errorGps ||
                  (compartiendo ? 'Tus amigas pueden verte en el mapa' : 'Tu ubicación está oculta')}
              </p>
              <button className="link-btn" onClick={salir}>Cerrar sesión</button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
