import { Client } from '@stomp/stompjs';
import { WS_URL } from './config.js';

/**
 * Conecta al WebSocket del backend para recibir las ubicaciones de las amigas en vivo
 * y enviar la propia. La usuaria se identifica con su token (JWT) al conectarse.
 */
export function conectarUbicaciones(token, { onUbicacion, onOculta, onAlerta, onConectado }) {
  const client = new Client({
    brokerURL: WS_URL,
    connectHeaders: { Authorization: `Bearer ${token}` },
    reconnectDelay: 5000,
    onConnect: () => {
      client.subscribe('/user/queue/ubicaciones', (m) => onUbicacion(JSON.parse(m.body)));
      client.subscribe('/user/queue/ubicaciones-ocultas', (m) => onOculta(JSON.parse(m.body)));
      // Una amiga que te eligió como contacto de emergencia presionó el botón de su dije
      client.subscribe('/user/queue/alertas', (m) => onAlerta(JSON.parse(m.body)));
      onConectado?.();
    },
  });
  client.activate();

  return {
    enviar(lat, lng, precision) {
      if (!client.connected) return;
      client.publish({
        destination: '/app/ubicacion',
        body: JSON.stringify({ lat, lng, precision }),
      });
    },
    desconectar() {
      client.deactivate();
    },
  };
}
