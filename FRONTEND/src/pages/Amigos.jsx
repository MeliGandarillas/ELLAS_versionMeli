import React, { useEffect, useState } from 'react';
import {
  solicitarAmistad, obtenerPendientes, aceptarAmistad, eliminarAmistad,
  obtenerAmigas, marcarFavorita, mensajeDeError,
} from '../api/cliente.js';

// Máximo de amigas que se pueden elegir como contacto de emergencia (igual que en el backend)
const MAX_FAVORITAS = 2;

// Vista de lista de amigos (Imagen 2)
export default function Amigos({ amigas: enElMapa, onVolver }) {
  const [correo, setCorreo] = useState('');
  const [pendientes, setPendientes] = useState([]);
  const [amigas, setAmigas] = useState([]);
  const [aviso, setAviso] = useState(null); // { tipo: 'ok' | 'error', texto }

  const mostrarError = (err) => setAviso({ tipo: 'error', texto: mensajeDeError(err) });

  const cargar = () =>
    Promise.all([obtenerPendientes(), obtenerAmigas()])
      .then(([p, a]) => {
        setPendientes(p);
        setAmigas(a);
      })
      .catch(mostrarError);

  useEffect(() => {
    cargar();
  }, []);

  const enviarSolicitud = async (e) => {
    e.preventDefault();
    try {
      await solicitarAmistad(correo);
      setAviso({ tipo: 'ok', texto: 'Solicitud enviada' });
      setCorreo('');
    } catch (err) {
      mostrarError(err);
    }
  };

  const responder = async (id, aceptar) => {
    try {
      await (aceptar ? aceptarAmistad(id) : eliminarAmistad(id));
      await cargar();
    } catch (err) {
      mostrarError(err);
    }
  };

  const favoritas = amigas.filter((a) => a.favorita).length;

  const alternarFavorita = async (amiga) => {
    if (!amiga.favorita && favoritas >= MAX_FAVORITAS) {
      setAviso({ tipo: 'error', texto: `Solo puedes tener ${MAX_FAVORITAS} contactos de emergencia` });
      return;
    }
    try {
      const actualizada = await marcarFavorita(amiga.id, !amiga.favorita);
      setAmigas((prev) => prev.map((a) => (a.id === actualizada.id ? actualizada : a)));
      setAviso({
        tipo: 'ok',
        texto: actualizada.favorita
          ? `${actualizada.otroNombre} es tu contacto de emergencia`
          : `${actualizada.otroNombre} ya no es tu contacto de emergencia`,
      });
    } catch (err) {
      mostrarError(err);
    }
  };

  // Favoritas primero, luego por nombre
  const amigasOrdenadas = [...amigas].sort(
    (a, b) => b.favorita - a.favorita || a.otroNombre.localeCompare(b.otroNombre),
  );
  const idsEnElMapa = new Set(enElMapa.map((u) => u.usuarioId));

  return (
    <div className="friends-panel">
      <h2 className="friends-title">Lista de Amigos</h2>

      {/* Buscar por correo y enviar solicitud */}
      <form className="search-bar" onSubmit={enviarSolicitud}>
        <input
          type="email"
          placeholder="Correo de tu amiga"
          value={correo}
          onChange={(e) => setCorreo(e.target.value)}
          required
        />
        <button title="Enviar solicitud">+</button>
      </form>
      {aviso && <p className={`aviso aviso-${aviso.tipo}`}>{aviso.texto}</p>}

      {/* Solicitudes que te enviaron */}
      {pendientes.length > 0 && <h3 className="friends-subtitle">Solicitudes</h3>}
      {pendientes.map((p) => (
        <div key={p.id} className="friend-item">
          <span className="friend-name">{p.otroNombre}</span>
          <button className="friend-action" onClick={() => responder(p.id, true)} title="Aceptar">✓</button>
          <button className="friend-action" onClick={() => responder(p.id, false)} title="Rechazar">✕</button>
        </div>
      ))}

      {/* Amistades aceptadas: la estrella marca a los contactos de emergencia */}
      <h3 className="friends-subtitle">
        Mis amigas · Contactos de emergencia {favoritas}/{MAX_FAVORITAS}
      </h3>
      {amigas.length === 0 ? (
        <p className="friends-empty">Todavía no tienes amigas agregadas</p>
      ) : (
        <p className="friends-empty">Toca la ★ para elegir hasta {MAX_FAVORITAS} contactos de emergencia</p>
      )}
      {amigasOrdenadas.map((a) => (
        <div key={a.id} className={`friend-item ${a.favorita ? 'favorita' : ''}`}>
          <div className="friend-info">
            <span className="friend-name">{a.otroNombre}</span>
            {idsEnElMapa.has(a.otroUsuarioId) && <span className="friend-tag">En el mapa</span>}
          </div>
          <button
            className={`friend-fav ${a.favorita ? 'activa' : ''}`}
            onClick={() => alternarFavorita(a)}
            title={a.favorita ? 'Quitar como contacto de emergencia' : 'Elegir como contacto de emergencia'}
            aria-pressed={a.favorita}
          >
            {a.favorita ? '★' : '☆'}
          </button>
        </div>
      ))}

      {/* Botón para regresar a la vista principal */}
      <button className="back-btn" onClick={onVolver}>
        ← Volver
      </button>
    </div>
  );
}
