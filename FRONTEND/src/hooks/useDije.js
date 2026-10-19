import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { servicioDije, HAY_BLUETOOTH, alAvisar, recordarPosicion } from '../ble/instancia.js';
import { VIBRACION } from '../ble/protocolo.js';

/**
 * Conexión con el dije (Bluetooth). Toda la lógica está en ble/servicioDije.js; aquí solo se conecta a React.
 * - Con sesión iniciada recuerda el dije emparejado y se reconecta solo.
 * - Al presionar el botón del dije: avisa a los contactos de emergencia con la ubicación del teléfono,
 *   el dije vibra para confirmar y su audio se descarga y se sube (ver Mis evidencias).
 * `onAviso(texto)` muestra un mensaje a la usuaria. `usuarioId` es la usuaria con sesión (o null).
 */
export default function useDije(onAviso, usuarioId) {
  const estado = useSyncExternalStore(servicioDije.suscribir, servicioDije.obtenerEstado);
  const [posicion, setPosicion] = useState(null); // { lat, lng } del teléfono mientras el dije está conectado
  const avisoRef = useRef(onAviso);

  useEffect(() => {
    avisoRef.current = onAviso;
  }, [onAviso]);

  useEffect(() => {
    alAvisar((texto) => avisoRef.current?.(texto));
    return () => alAvisar(null);
  }, []);

  // Con sesión: reconexión automática y subida de audios pendientes. Sin sesión: se suelta el dije.
  useEffect(() => {
    if (!usuarioId) return;
    servicioDije.activar();
    return () => {
      servicioDije.desactivar();
    };
  }, [usuarioId]);

  // Al volver a la app se reintenta ya, sin esperar al siguiente intento programado
  useEffect(() => {
    const alVolver = () => {
      if (document.visibilityState === 'visible') servicioDije.reintentarYa();
    };
    document.addEventListener('visibilitychange', alVolver);
    window.addEventListener('online', alVolver);
    return () => {
      document.removeEventListener('visibilitychange', alVolver);
      window.removeEventListener('online', alVolver);
    };
  }, []);

  const conectado = estado.fase === 'conectado';

  // Ubicación del teléfono mientras el dije está conectado (el dije no tiene GPS: está a unos metros)
  useEffect(() => {
    if (!conectado || !('geolocation' in navigator)) return;
    const watchId = navigator.geolocation.watchPosition(
      ({ coords }) => {
        const p = { lat: coords.latitude, lng: coords.longitude };
        recordarPosicion(p);
        setPosicion(p);
      },
      () => {},
      { enableHighAccuracy: true, maximumAge: 10000 },
    );
    return () => {
      navigator.geolocation.clearWatch(watchId);
      setPosicion(null);
    };
  }, [conectado]);

  return {
    ...estado,
    hayBluetooth: HAY_BLUETOOTH,
    conectado,
    conectando: estado.fase === 'conectando',
    reconectando: estado.fase === 'reconectando',
    recordado: Boolean(estado.dispositivo),
    posicion,
    buscar: servicioDije.buscar,
    detenerBusqueda: servicioDije.detenerBusqueda,
    emparejar: servicioDije.emparejar,
    conectar: servicioDije.conectar,
    desconectar: servicioDije.desconectar,
    olvidar: servicioDije.olvidar,
    vibrar: () => servicioDije.vibrar(VIBRACION.ENCONTRAR),
    configurarGrabacion: servicioDije.configurarGrabacion,
    cambiarModo: servicioDije.cambiarModo,
    simularAlerta: servicioDije.simularAlerta,
  };
}
