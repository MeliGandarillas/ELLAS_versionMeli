// Dirección del backend.
// - En desarrollo se deja vacía: /api y /ws pasan por el proxy de Vite (ver vite.config.js).
// - En producción se define VITE_API_URL al compilar (ej. https://api.midominio.com),
//   salvo que el frontend y el backend se sirvan desde el mismo dominio.
const BASE = (import.meta.env.VITE_API_URL ?? '').trim().replace(/\/+$/, '');

/** URL base de la API REST. */
export const API_URL = `${BASE}/api`;

/** URL del WebSocket de ubicaciones (ws:// o wss:// según sea http o https). */
export const WS_URL = `${(BASE || window.location.origin).replace(/^http/, 'ws')}/ws`;
