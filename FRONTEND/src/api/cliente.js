import axios from 'axios';
import { leerUsuario } from './sesion.js';
import { API_URL } from './config.js';

// La dirección del backend se configura en config.js (VITE_API_URL en producción)
const api = axios.create({ baseURL: API_URL });

// Cada petición lleva el token de sesión (JWT); el backend sabe quién es la usuaria por él
api.interceptors.request.use((config) => {
  const usuario = leerUsuario();
  if (usuario) config.headers.Authorization = `Bearer ${usuario.token}`;
  return config;
});

// Si el token venció o no es válido (401), se avisa para cerrar la sesión.
// No aplica a iniciar sesión, donde el 401 significa "nombre o contraseña incorrectos".
let alVencerSesion = null;
export function alVencerLaSesion(callback) {
  alVencerSesion = callback;
}

api.interceptors.response.use(undefined, (error) => {
  if (error.response?.status === 401 && !error.config.url.endsWith('/login')) {
    alVencerSesion?.();
  }
  return Promise.reject(error);
});

/** Mensaje de error legible a partir de la respuesta del backend. */
export function mensajeDeError(error) {
  const data = error.response?.data;
  if (data?.message) return data.message;
  if (data?.detail) return data.detail;
  if (!error.response) return 'No se pudo conectar con el servidor';
  return `Error ${error.response.status}`;
}

// Usuarias
export const registrar = (nombre, correo, password) =>
  api.post('/usuarios', { nombre, correo, password }).then((r) => r.data);

export const iniciarSesion = (nombre, password) =>
  api.post('/usuarios/login', { nombre, password }).then((r) => r.data);

export const cambiarCompartir = (activo) =>
  api.patch('/usuarios/me/compartir', { activo }).then((r) => r.data);

// Amistades
export const solicitarAmistad = (correo) =>
  api.post('/amistades/solicitar', { correo }).then((r) => r.data);

export const obtenerPendientes = () =>
  api.get('/amistades/pendientes').then((r) => r.data);

export const aceptarAmistad = (id) =>
  api.post(`/amistades/${id}/aceptar`).then((r) => r.data);

export const eliminarAmistad = (id) =>
  api.delete(`/amistades/${id}`);

export const obtenerAmigas = () =>
  api.get('/amistades').then((r) => r.data);

export const marcarFavorita = (id, favorita) =>
  api.put(`/amistades/${id}/favorita`, { favorita }).then((r) => r.data);

export const obtenerUbicacionesDeAmigas = () =>
  api.get('/amistades/ubicaciones').then((r) => r.data);

// Alertas del dije: avisa a los contactos de emergencia. `ubicacion` es { lat, lng } o null.
export const enviarAlerta = (ubicacion) =>
  api.post('/alertas', ubicacion ?? {}).then((r) => r.data);

// Evidencias de audio del dije (solo su dueña las ve; el servidor las guarda cifradas)
/** Sube el WAV de una alerta. `clave` hace el reintento idempotente (no duplica si la primera sí llegó). */
export const subirEvidencia = ({ wav, alertaId, duracionSeg, clave }) => {
  const datos = new FormData();
  datos.append('archivo', new Blob([wav], { type: 'audio/wav' }), 'evidencia.wav');
  datos.append('alertaId', String(alertaId));
  if (duracionSeg != null) datos.append('duracionSeg', String(duracionSeg));
  if (clave) datos.append('clave', clave);
  return api.post('/evidencias', datos, { timeout: 120000 }).then((r) => r.data);
};

export const obtenerEvidencias = () => api.get('/evidencias').then((r) => r.data);

/** Audio descifrado de una evidencia, como Blob (para reproducirlo o descargarlo). */
export const obtenerAudioEvidencia = (id) =>
  api.get(`/evidencias/${id}/audio`, { responseType: 'blob', timeout: 120000 }).then((r) => r.data);

export const eliminarEvidencia = (id) => api.delete(`/evidencias/${id}`);
