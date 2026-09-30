import React, { useEffect, useState } from 'react';
import './App.css';
import Inicio from './pages/Inicio.jsx';
import Amigos from './pages/Amigos.jsx';
import Registro from './pages/Registro.jsx';
import SaludReproductiva from './pages/SaludReproductiva.jsx';
import CentrosApoyo from './pages/CentrosApoyo.jsx';
import CentrosSalud from './pages/CentrosSalud.jsx';
import useUbicaciones from './hooks/useUbicaciones.js';
import useDije from './hooks/useDije.js';
import { leerUsuario, guardarUsuario, borrarUsuario } from './api/sesion.js';
import { cambiarCompartir, mensajeDeError, alVencerLaSesion } from './api/cliente.js';

// Cuánto tiempo se muestra en rojo a la amiga que envió una alerta
const DURACION_ALERTA_MS = 30000;

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
  // Mensaje que se muestra como alerta encima de cualquier pantalla
  const [aviso, setAviso] = useState(null);
  // Última alerta de una amiga que te tiene como contacto de emergencia: { usuarioId, nombre, lat, lng }
  const [alerta, setAlerta] = useState(null);

  // A los 30 s la amiga deja de verse en rojo (una alerta nueva reinicia la cuenta)
  useEffect(() => {
    if (!alerta) return;
    const temporizador = setTimeout(() => setAlerta(null), DURACION_ALERTA_MS);
    return () => clearTimeout(temporizador);
  }, [alerta]);
  const dije = useDije(setAviso);

  // Una amiga presionó el botón de su dije: se avisa y se muestra dónde está en el mapa
  const recibirAlerta = (a) => {
    setAlerta(a);
    setAviso(`Asegura la localización de ${a.nombre}`);
    setCurrentView('main');
    navigator.vibrate?.([400, 200, 400]);
  };

  const { amigas, miPosicion, errorGps } = useUbicaciones(usuario, compartiendo, recibirAlerta);

  const volverAInicio = () => setCurrentView('main');

  const entrar = (u) => {
    guardarUsuario(u);
    setUsuario(u);
    setCompartiendo(true);
  };

  const salir = () => {
    dije.desconectar();
    borrarUsuario();
    setUsuario(null);
    setCompartiendo(false);
    setIsModalOpen(false);
    setAviso(null);
    setAlerta(null);
    setCurrentView('main');
  };

  // Busca un dije cercano por Bluetooth: si lo encuentra, el dije vibra y aparece en el mapa.
  // Si no, se abre el menú, que muestra el motivo y deja volver a intentarlo.
  const activarDije = async () => {
    const conectado = await dije.conectar();
    setIsModalOpen(!conectado);
    if (conectado) setAviso('Accesorio funcionando');
  };

  // Corazón: si el dije ya está conectado lo hace vibrar; si no, lo busca y lo conecta
  const alPresionarCorazon = () => {
    if (dije.conectando) return;
    if (dije.conectado) dije.vibrar();
    else activarDije();
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
          dije={dije.posicion}
          alerta={alerta}
          onCorazon={alPresionarCorazon}
          onAbrirMenu={() => setIsModalOpen(true)}
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

              {/* Dije (Bluetooth) */}
              <button
                className={`primary-btn ${dije.conectado ? 'activo' : ''}`}
                onClick={dije.conectado ? dije.desconectar : activarDije}
                disabled={dije.conectando}
              >
                {dije.conectando ? 'Buscando dije…' : dije.conectado ? 'Desconectar dije' : 'Conectar dije'}
              </button>
              <p className="modal-estado">
                {dije.error || (dije.conectado ? 'Tu dije está conectado' : 'Tu dije está desconectado')}
              </p>
              <button className="link-btn" onClick={salir}>Cerrar sesión</button>
            </div>
          </div>
        </div>
      )}

      {/* Alertas: dije funcionando, alerta enviada, alerta de una amiga */}
      {aviso && (
        <div className="app-modal-overlay" onClick={() => setAviso(null)}>
          <div className="app-modal" role="alertdialog" onClick={(e) => e.stopPropagation()}>
            <div className="app-modal-body">
              <p className="modal-title">{aviso}</p>
              <button className="primary-btn" onClick={() => setAviso(null)}>Aceptar</button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
