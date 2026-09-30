import { useEffect, useRef, useState } from 'react';
import { obtenerUbicacionesDeAmigas } from '../api/cliente.js';
import { conectarUbicaciones } from '../api/ubicacionSocket.js';

const HAY_GPS = 'geolocation' in navigator;

// Cada cuánto se reenvía la última ubicación aunque la persona no se mueva
// (el GPS solo avisa cuando hay cambios, y un envío puede perderse si el WebSocket aún no conectaba)
const REENVIO_MS = 10000;

/**
 * Ubicaciones de las amigas (carga inicial + actualizaciones en vivo)
 * y, si `compartiendo` está activo, envía la ubicación propia del dispositivo.
 * `onAlerta` recibe las alertas de las amigas que te tienen como contacto de emergencia.
 */
export default function useUbicaciones(usuario, compartiendo, onAlerta) {
  const [amigas, setAmigas] = useState({}); // { [usuarioId]: UbicacionAmiga }
  const [miPosicion, setMiPosicion] = useState(null); // { lat, lng }
  const [errorGps, setErrorGps] = useState(null);
  const socketRef = useRef(null);
  const ultimaRef = useRef(null); // última ubicación propia { lat, lng, precision }
  const compartiendoRef = useRef(compartiendo);
  const alertaRef = useRef(onAlerta);
  const usuarioId = usuario?.id;
  const token = usuario?.token;

  const enviarUltima = () => {
    const u = ultimaRef.current;
    if (compartiendoRef.current && u) socketRef.current?.enviar(u.lat, u.lng, u.precision);
  };

  useEffect(() => {
    compartiendoRef.current = compartiendo;
  }, [compartiendo]);

  useEffect(() => {
    alertaRef.current = onAlerta;
  }, [onAlerta]);

  // Carga inicial + WebSocket
  useEffect(() => {
    if (!token) return;
    let activo = true;

    obtenerUbicacionesDeAmigas()
      .then((lista) => {
        if (!activo) return;
        setAmigas(Object.fromEntries(lista.map((a) => [a.usuarioId, a])));
      })
      .catch(() => {});

    socketRef.current = conectarUbicaciones(token, {
      onUbicacion: (u) => setAmigas((prev) => ({ ...prev, [u.usuarioId]: u })),
      onOculta: ({ usuarioId: id }) =>
        setAmigas((prev) => {
          const { [id]: _, ...resto } = prev;
          return resto;
        }),
      onAlerta: (a) => alertaRef.current?.(a),
      // En cuanto conecta (o reconecta) manda la ubicación que ya se tenía
      onConectado: enviarUltima,
    });

    return () => {
      activo = false;
      socketRef.current?.desconectar();
      socketRef.current = null;
      setAmigas({});
    };
  }, [token]);

  // Envío de la ubicación propia mientras se comparte
  useEffect(() => {
    if (!usuarioId || !compartiendo || !HAY_GPS) return;

    const watchId = navigator.geolocation.watchPosition(
      ({ coords }) => {
        setErrorGps(null);
        setMiPosicion({ lat: coords.latitude, lng: coords.longitude });
        ultimaRef.current = { lat: coords.latitude, lng: coords.longitude, precision: coords.accuracy };
        enviarUltima();
      },
      (err) => setErrorGps(
        err.code === err.PERMISSION_DENIED
          ? 'Debes permitir el acceso a tu ubicación en el navegador'
          : 'No se pudo obtener tu ubicación',
      ),
      { enableHighAccuracy: true, maximumAge: 10000 },
    );

    const reenvio = setInterval(enviarUltima, REENVIO_MS);

    return () => {
      navigator.geolocation.clearWatch(watchId);
      clearInterval(reenvio);
    };
  }, [usuarioId, compartiendo]);

  return {
    amigas: Object.values(amigas),
    miPosicion,
    errorGps: compartiendo && !HAY_GPS ? 'Este dispositivo no permite obtener la ubicación' : errorGps,
  };
}
