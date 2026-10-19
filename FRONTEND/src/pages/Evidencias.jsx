import React, { useEffect, useRef, useState } from 'react';
import { Play, Pause, Download, Trash2 } from 'lucide-react';
import { eliminarEvidencia, mensajeDeError, obtenerAudioEvidencia, obtenerEvidencias } from '../api/cliente.js';
import { guardarArchivo } from '../api/archivos.js';

const formatoFecha = (iso) =>
  new Date(iso).toLocaleString('es-MX', { dateStyle: 'medium', timeStyle: 'short' });
const formatoDuracion = (s) => (s == null ? '' : s >= 60 ? `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')} min` : `${s} s`);
const formatoTamano = (b) => (b >= 1048576 ? `${(b / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(b / 1024))} KB`);
const nombreArchivo = (e) => `ellas-evidencia-${e.creadaEn.replace(/[-:]/g, '').slice(0, 15)}-${e.id.slice(0, 8)}.wav`;

// Pantalla "Mis evidencias": audios grabados por el dije en cada alerta (solo los ve su dueña)
export default function Evidencias({ onVolver }) {
  const [lista, setLista] = useState(null); // null = cargando
  const [aviso, setAviso] = useState(null);
  const [trabajando, setTrabajando] = useState(null); // id con una operación en curso
  const [confirmando, setConfirmando] = useState(null); // id pendiente de confirmar el borrado
  const [sonando, setSonando] = useState(null); // { id, url }
  const audioRef = useRef(null);

  const mostrarError = (err) => setAviso({ tipo: 'error', texto: mensajeDeError(err) });

  const cargar = () =>
    obtenerEvidencias()
      .then(setLista)
      .catch((err) => {
        setLista([]);
        mostrarError(err);
      });

  useEffect(() => {
    cargar();
  }, []);

  // Libera el audio descifrado de la memoria al salir o al cambiar de evidencia
  useEffect(() => () => sonando && URL.revokeObjectURL(sonando.url), [sonando]);

  const reproducir = async (e) => {
    if (sonando?.id === e.id) {
      setSonando(null);
      return;
    }
    setTrabajando(e.id);
    setAviso(null);
    try {
      const blob = await obtenerAudioEvidencia(e.id);
      setSonando({ id: e.id, url: URL.createObjectURL(blob) });
    } catch (err) {
      mostrarError(err);
    } finally {
      setTrabajando(null);
    }
  };

  useEffect(() => {
    audioRef.current?.play().catch(() => {});
  }, [sonando]);

  const descargar = async (e) => {
    setTrabajando(e.id);
    setAviso(null);
    try {
      const blob = await obtenerAudioEvidencia(e.id);
      const guardado = await guardarArchivo(blob, nombreArchivo(e));
      if (guardado) setAviso({ tipo: 'ok', texto: 'Evidencia lista para entregar. Conserva el archivo tal cual: no lo edites.' });
    } catch (err) {
      mostrarError(err);
    } finally {
      setTrabajando(null);
    }
  };

  const borrar = async (e) => {
    setTrabajando(e.id);
    try {
      await eliminarEvidencia(e.id);
      if (sonando?.id === e.id) setSonando(null);
      setConfirmando(null);
      setAviso({ tipo: 'ok', texto: 'Evidencia eliminada' });
      await cargar();
    } catch (err) {
      mostrarError(err);
    } finally {
      setTrabajando(null);
    }
  };

  return (
    <div className="friends-panel">
      <h2 className="friends-title">Mis evidencias</h2>
      <p className="friends-empty">
        Audios grabados por tu dije cuando enviaste una alerta. Solo tú puedes escucharlos; en el servidor están cifrados.
        Descárgalos para entregarlos a las autoridades.
      </p>
      {aviso && <p className={`aviso aviso-${aviso.tipo}`}>{aviso.texto}</p>}

      {lista === null && <p className="friends-empty">Cargando…</p>}
      {lista?.length === 0 && <p className="friends-empty">Todavía no tienes evidencias.</p>}

      {lista?.map((e) => (
        <div key={e.id} className="evidencia">
          <div className="evidencia-fila">
            <div className="friend-info">
              <span className="friend-name">{formatoFecha(e.creadaEn)}</span>
              <span className="friend-tag">
                {[formatoDuracion(e.duracionSeg), formatoTamano(e.tamanoBytes)].filter(Boolean).join(' · ')}
              </span>
            </div>
            <button className="evidencia-btn" onClick={() => reproducir(e)} disabled={trabajando === e.id} title={sonando?.id === e.id ? 'Detener' : 'Reproducir'}>
              {sonando?.id === e.id ? <Pause size={18} /> : <Play size={18} />}
            </button>
            <button className="evidencia-btn" onClick={() => descargar(e)} disabled={trabajando === e.id} title="Descargar o compartir">
              <Download size={18} />
            </button>
            <button className="evidencia-btn" onClick={() => setConfirmando(confirmando === e.id ? null : e.id)} disabled={trabajando === e.id} title="Eliminar">
              <Trash2 size={18} />
            </button>
          </div>

          {sonando?.id === e.id && (
            // eslint-disable-next-line jsx-a11y/media-has-caption
            <audio ref={audioRef} className="evidencia-audio" src={sonando.url} controls onEnded={() => setSonando(null)} />
          )}

          {confirmando === e.id && (
            <div className="evidencia-confirmar">
              <span>¿Eliminar para siempre? No se puede deshacer.</span>
              <button className="small-btn" onClick={() => borrar(e)} disabled={trabajando === e.id}>Sí, eliminar</button>
              <button className="link-btn" onClick={() => setConfirmando(null)}>Cancelar</button>
            </div>
          )}

          <span className="evidencia-huella" title="Huella SHA-256 del archivo original, para comprobar que no fue alterado">
            SHA-256 {e.sha256.slice(0, 16)}…
          </span>
        </div>
      ))}

      <button className="back-btn" onClick={onVolver}>← Volver</button>
    </div>
  );
}
