import { Capacitor } from '@capacitor/core';
import { BleClient, dataViewToText, textToDataView } from '@capacitor-community/bluetooth-le';

// Deben coincidir con el firmware del dije (dije_ble.ino)
const NOMBRE_DIJE = 'Dije-Seguro';
const SERVICE_UUID = '4fafc201-1fb5-459e-8fcc-c5c9c331914b';
const CHAR_UUID = 'beb5483e-36e1-4688-b7f5-ea07361b26a8';

/** Error que se lanza si la usuaria no enciende el Bluetooth cuando se le pide. */
export const BLUETOOTH_APAGADO = 'BLUETOOTH_APAGADO';

// En la APK el Bluetooth lo da el plugin nativo; en el navegador, Web Bluetooth (Chrome/Edge con https)
export const HAY_BLUETOOTH = Capacitor.isNativePlatform() || 'bluetooth' in navigator;

/**
 * Busca un dije cercano y se conecta a él por Bluetooth (BLE).
 * Hay que llamarla desde un toque de la usuaria: el navegador solo así deja buscar dispositivos.
 */
export async function conectarDije({ onMensaje, onDesconectado }) {
  await BleClient.initialize();
  // En Android, si el Bluetooth está apagado se pide encenderlo (sale el aviso del sistema)
  if (Capacitor.getPlatform() === 'android' && !(await BleClient.isEnabled())) {
    try {
      await BleClient.requestEnable();
    } catch {
      throw new Error(BLUETOOTH_APAGADO);
    }
  }
  const { deviceId } = await BleClient.requestDevice({
    name: NOMBRE_DIJE,
    optionalServices: [SERVICE_UUID],
  });
  await BleClient.connect(deviceId, onDesconectado);
  await BleClient.startNotifications(deviceId, SERVICE_UUID, CHAR_UUID, (valor) =>
    onMensaje(dataViewToText(valor)),
  );

  return {
    /** Manda un texto al dije: "VIBRAR" (prueba) u "OK" (confirma que la alerta llegó). */
    enviar(texto) {
      return BleClient.write(deviceId, SERVICE_UUID, CHAR_UUID, textToDataView(texto));
    },
    desconectar() {
      return BleClient.disconnect(deviceId);
    },
  };
}
