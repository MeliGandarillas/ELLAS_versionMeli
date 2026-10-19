// Instancia única del servicio del dije, conectada a las piezas reales de la app:
// BLE nativo (APK) o Web Bluetooth (navegador), el dije simulado, IndexedDB y la API del backend.
import { Capacitor } from '@capacitor/core';
import { BleClient } from '@capacitor-community/bluetooth-le';
import { enviarAlerta, mensajeDeError, subirEvidencia } from '../api/cliente.js';
import { leerUsuario } from '../api/sesion.js';
import { crearAlmacenLocal } from './almacenLocal.js';
import { crearDijeSimulado } from './dijeSimulado.js';
import { crearServicioDije } from './servicioDije.js';

/** El teléfono (APK) o el navegador puede hablar BLE con el dije. */
export const HAY_BLUETOOTH = Capacitor.isNativePlatform() || (typeof navigator !== 'undefined' && 'bluetooth' in navigator);

let simulado = null;
const dijeSimulado = () => (simulado ??= crearDijeSimulado());

const prefs = {
  leer(clave) {
    try {
      return JSON.parse(localStorage.getItem(`ellas.dije.${clave}`));
    } catch {
      return null;
    }
  },
  escribir(clave, valor) {
    try {
      localStorage.setItem(`ellas.dije.${clave}`, JSON.stringify(valor));
    } catch {
      /* almacenamiento bloqueado: no se recuerda el dije */
    }
  },
  borrar(clave) {
    try {
      localStorage.removeItem(`ellas.dije.${clave}`);
    } catch {
      /* ver arriba */
    }
  },
};

let ultimaPosicion = null;
/** Ubicación del teléfono en el momento de la alerta (la última conocida si el GPS no responde a tiempo). */
export function recordarPosicion(posicion) {
  ultimaPosicion = posicion;
}
function obtenerPosicion() {
  return new Promise((resolver) => {
    if (typeof navigator === 'undefined' || !('geolocation' in navigator)) return resolver(ultimaPosicion);
    navigator.geolocation.getCurrentPosition(
      ({ coords }) => resolver((ultimaPosicion = { lat: coords.latitude, lng: coords.longitude })),
      () => resolver(ultimaPosicion),
      { enableHighAccuracy: true, timeout: 8000, maximumAge: 15000 },
    );
  });
}

let avisador = null;
/** La app registra aquí cómo mostrar los mensajes (el aviso modal de siempre). */
export function alAvisar(f) {
  avisador = f;
}

export const servicioDije = crearServicioDije({
  transporte: (modo) => (modo === 'simulado' ? dijeSimulado().transporte : BleClient),
  simulador: dijeSimulado,
  almacen: crearAlmacenLocal(),
  prefs,
  api: { enviarAlerta, subirEvidencia },
  android: Capacitor.getPlatform() === 'android',
  navegador: !Capacitor.isNativePlatform(),
  hayBluetooth: HAY_BLUETOOTH,
  usuarioId: () => leerUsuario()?.id ?? null,
  obtenerPosicion,
  mensajeDeError,
  avisar: (texto) => avisador?.(texto),
});
