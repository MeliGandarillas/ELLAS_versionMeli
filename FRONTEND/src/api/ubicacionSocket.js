import { Client } from '@stomp/stompjs';

/**
 * Conecta al WebSocket del backend para recibir las ubicaciones de las amigas en vivo
 * y enviar la propia. La usuaria se identifica con su token (JWT) al conectarse.
 */
export function conectarUbicaciones(token, { onUbicacion, onOculta, onConectado }) {
  const protocolo = window.location.protocol === 'https:' ? 'wss:' : 'ws:';

  const client = new Client({
    // /ws pasa por el proxy de Vite hacia el backend (ver vite.config.js)
    brokerURL: `${protocolo}//${window.location.host}/ws`,
    connectHeaders: { Authorization: `Bearer ${token}` },
    reconnectDelay: 5000,
    onConnect: () => {
      client.subscribe('/user/queue/ubicaciones', (m) => onUbicacion(JSON.parse(m.body)));
      client.subscribe('/user/queue/ubicaciones-ocultas', (m) => onOculta(JSON.parse(m.body)));
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
