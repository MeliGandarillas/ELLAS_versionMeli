import { useEffect, useRef, useState } from 'react';
import { BLUETOOTH_APAGADO, conectarDije, HAY_BLUETOOTH } from '../api/dije.js';
import { enviarAlerta, mensajeDeError } from '../api/cliente.js';

/**
 * Conexión por Bluetooth con el dije.
 * - Al conectarse, el dije vibra y se empieza a seguir su ubicación (la del teléfono:
 *   el dije no tiene GPS, pero está a unos metros mientras dure la conexión).
 * - Cuando se presiona el botón del dije, avisa a los contactos de emergencia
 *   y el dije vibra para confirmar que la alerta sí se envió.
 * `onAviso(texto)` muestra un mensaje a la usuaria.
 */
export default function useDije(onAviso) {
  const [conectado, setConectado] = useState(false);
  const [conectando, setConectando] = useState(false);
  const [posicion, setPosicion] = useState(null); // { lat, lng }
  const [error, setError] = useState(null);
  const dijeRef = useRef(null);
  const posicionRef = useRef(null);
  const avisoRef = useRef(onAviso);

  useEffect(() => {
    avisoRef.current = onAviso;
  }, [onAviso]);

  const alRecibir = async (texto) => {
    if (texto.trim() !== 'ALERTA') return;
    try {
      const { enviadas } = await enviarAlerta(posicionRef.current);
      if (enviadas === 0) {
        avisoRef.current('No tienes contactos de emergencia. Márcalos con la ★ en tu lista de amigos');
        return;
      }
      avisoRef.current('Alerta enviada a tus contactos de emergencia');
    } catch (err) {
      avisoRef.current(`No se pudo enviar la alerta: ${mensajeDeError(err)}`);
      return;
    }
    dijeRef.current?.enviar('OK').catch(() => {});
  };

  const desconectar = () => {
    const dije = dijeRef.current;
    dijeRef.current = null;
    setConectado(false);
    dije?.desconectar().catch(() => {});
  };

  /** Busca un dije cercano, lo conecta y lo hace vibrar. Devuelve true si quedó conectado. */
  const conectar = async () => {
    if (!HAY_BLUETOOTH) {
      setError('Este dispositivo no permite conectar el dije por Bluetooth');
      return false;
    }
    setConectando(true);
    setError(null);
    let dije = null;
    try {
      dije = await conectarDije({
        onMensaje: alRecibir,
        onDesconectado: () => {
          dijeRef.current = null;
          setConectado(false);
        },
      });
      await dije.enviar('VIBRAR');
      dijeRef.current = dije;
      setConectado(true);
      return true;
    } catch (err) {
      dije?.desconectar().catch(() => {});
      setError(
        err?.message === BLUETOOTH_APAGADO
          ? 'Enciende el Bluetooth para conectar tu dije'
          : 'No se encontró tu dije. Acércalo, revisa que el Bluetooth esté encendido e inténtalo de nuevo',
      );
      return false;
    } finally {
      setConectando(false);
    }
  };

  /** Hace vibrar el dije (para encontrarlo o comprobar que funciona). */
  const vibrar = () =>
    dijeRef.current?.enviar('VIBRAR').catch(() => avisoRef.current('No se pudo hacer vibrar el dije'));

  // Ubicación del dije mientras está conectado
  useEffect(() => {
    if (!conectado || !('geolocation' in navigator)) return;

    const watchId = navigator.geolocation.watchPosition(
      ({ coords }) => {
        posicionRef.current = { lat: coords.latitude, lng: coords.longitude };
        setPosicion(posicionRef.current);
      },
      () => {},
      { enableHighAccuracy: true, maximumAge: 10000 },
    );

    return () => {
      navigator.geolocation.clearWatch(watchId);
      posicionRef.current = null;
      setPosicion(null);
    };
  }, [conectado]);

  // Al cerrar la app se suelta el dije
  useEffect(() => () => {
    dijeRef.current?.desconectar().catch(() => {});
  }, []);

  return { conectado, conectando, posicion, error, conectar, desconectar, vibrar };
}
