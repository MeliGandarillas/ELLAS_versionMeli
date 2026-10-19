// Pruebas del servicio del dije (alerta + descarga + subida) contra el dije simulado, sin hardware ni red.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { VIBRACION } from '../src/ble/protocolo.js';
import { crearDijeSimulado } from '../src/ble/dijeSimulado.js';
import { crearAlmacenLocal } from '../src/ble/almacenLocal.js';
import { crearServicioDije } from '../src/ble/servicioDije.js';

const esperar = (ms) => new Promise((r) => setTimeout(r, ms));
async function hasta(cond, ms = 4000, quien = 'condición') {
  const t0 = Date.now();
  while (!(await cond())) {
    if (Date.now() - t0 > ms) throw new Error(`Tiempo agotado esperando: ${quien}`);
    await esperar(15);
  }
}

/** Arma servicio + dije simulado + API falsa. `api.falla` permite simular que no hay internet. */
function montar({ clipsAntes = 0, usuarioId = 7, enviadas = 2, tiempos = {} } = {}) {
  const dije = crearDijeSimulado({ retardoMs: 0, segundosClip: 3 });
  for (let i = 0; i < clipsAntes; i++) dije.control.simularAlerta({ segundos: 2 });
  const almacen = crearAlmacenLocal({ memoria: true });
  const prefs = (() => {
    const m = new Map();
    return { leer: (k) => m.get(k) ?? null, escribir: (k, v) => void m.set(k, v), borrar: (k) => void m.delete(k) };
  })();
  const llamadas = { alertas: [], subidas: [] };
  const api = {
    falla: { alerta: 0, subida: 0 }, // cuántas llamadas fallarán antes de funcionar
    siguienteAlerta: 100,
    async enviarAlerta(ubicacion) {
      llamadas.alertas.push(ubicacion);
      if (api.falla.alerta-- > 0) throw new Error('sin internet');
      return { enviadas, alertaId: api.siguienteAlerta++ };
    },
    async subirEvidencia(datos) {
      if (api.falla.subida-- > 0) throw new Error('sin internet');
      llamadas.subidas.push(datos);
      return { id: `ev-${llamadas.subidas.length}` };
    },
  };
  const avisos = [];
  const servicio = crearServicioDije({
    transporte: () => dije.transporte,
    simulador: () => dije,
    almacen,
    prefs,
    api,
    android: true,
    usuarioId: () => usuarioId,
    obtenerPosicion: async () => ({ lat: 19.43, lng: -99.13 }),
    avisar: (t) => avisos.push(t),
    mensajeDeError: (e) => e.message,
    tiempos: { reconexionMs: [40], reintentoAlertaMs: [0, 30], pausaDescargaMs: 10, subidaCadaMs: 100000, duracionBusquedaMs: 400, ...tiempos },
  });
  return { dije, almacen, prefs, api, servicio, llamadas, avisos };
}

async function emparejado(m) {
  await m.servicio.activar();
  await m.servicio.buscar();
  const [d] = m.servicio.obtenerEstado().encontrados;
  assert.ok(d, 'el dije simulado debe aparecer en la búsqueda');
  assert.equal(await m.servicio.emparejar(d), true);
  // El dije vibra una vez al emparejarse: se espera y se limpia para contar solo lo que venga después
  await hasta(() => m.dije.control.estado.vibraciones.length === 1, 1000, 'vibración al emparejar');
  m.dije.control.estado.vibraciones.length = 0;
  return d;
}

test('Emparejar: queda conectado, recordado y con batería', async () => {
  const m = montar();
  const d = await emparejado(m);
  const e = m.servicio.obtenerEstado();
  assert.equal(e.fase, 'conectado');
  assert.equal(e.bateria.porcentaje, 87);
  assert.deepEqual(m.prefs.leer('dispositivo.real'), d);
  assert.equal(m.dije.control.estado.emparejado, true);
  await m.servicio.desactivar();
});

test('ALERTA: avisa a los contactos con la ubicación del teléfono, el dije vibra, el audio se descarga y se sube', async () => {
  const m = montar();
  await emparejado(m);
  m.dije.control.estado.vibraciones.length = 0;

  const { alertaId } = m.dije.control.simularAlerta({ segundos: 3 });

  await hasta(() => m.llamadas.subidas.length === 1, 5000, 'subida del audio');
  assert.equal(m.llamadas.alertas.length, 1, 'una sola alerta a contactos');
  assert.deepEqual(m.llamadas.alertas[0], { lat: 19.43, lng: -99.13 });
  assert.ok(m.avisos.includes('Alerta enviada a tus contactos de emergencia'));
  assert.deepEqual(m.dije.control.estado.vibraciones.map((v) => v.patron), [VIBRACION.CONFIRMA_ALERTA]);

  const sub = m.llamadas.subidas[0];
  assert.equal(sub.alertaId, 100, 'el audio se liga a la alerta del servidor');
  assert.equal(sub.duracionSeg, 3);
  assert.equal(new TextDecoder().decode(sub.wav.subarray(0, 4)), 'RIFF');
  assert.equal(sub.wav.length, 44 + 2 * Math.ceil((3 * 16000) / 505) * 505);
  assert.equal(alertaId, 1);

  await hasta(() => m.dije.control.estado.clips.length === 0, 2000, 'el dije borra el clip tras la confirmación');
  assert.deepEqual(await m.almacen.listarSubidas(), [], 'cola local vacía');
  await m.servicio.desactivar();
});

test('ALERTA sin conexión con el dije: se atiende y sube al reconectar', async () => {
  const m = montar();
  await emparejado(m);
  m.dije.control.fueraDeAlcance(true);
  await hasta(() => m.servicio.obtenerEstado().fase === 'reconectando', 2000, 'detectar el corte');
  m.dije.control.simularAlerta({ segundos: 2 });
  m.dije.control.simularAlerta({ segundos: 2 });
  await esperar(500);
  assert.equal(m.llamadas.alertas.length, 0, 'sin conexión no hay forma de saber de la alerta');

  m.dije.control.fueraDeAlcance(false);
  await hasta(() => m.llamadas.subidas.length === 2, 6000, 'subir los dos clips acumulados');
  assert.equal(m.llamadas.alertas.length, 2, 'una alerta por cada clip nuevo');
  assert.deepEqual(m.llamadas.subidas.map((s) => s.alertaId).sort(), [100, 101]);
  assert.equal(m.dije.control.estado.clips.length, 0);
  await m.servicio.desactivar();
});

test('Reconexión automática: se cae y vuelve solo', async () => {
  const m = montar();
  await emparejado(m);
  m.dije.control.cortarConexion();
  await hasta(() => m.servicio.obtenerEstado().fase === 'reconectando', 2000, 'estado reconectando');
  await hasta(() => m.servicio.obtenerEstado().fase === 'conectado', 4000, 'reconexión');
  assert.equal(m.dije.control.estado.conectado, true);
  await m.servicio.desactivar();
});

test('Desconectar a mano detiene la reconexión; conectar la reanuda', async () => {
  const m = montar();
  await emparejado(m);
  await m.servicio.desconectar();
  await esperar(250);
  assert.equal(m.servicio.obtenerEstado().fase, 'inactivo');
  assert.equal(m.dije.control.estado.conectado, false);
  assert.equal(await m.servicio.conectar(), true);
  assert.equal(m.servicio.obtenerEstado().fase, 'conectado');
  await m.servicio.desactivar();
});

test('Recuerda el dije: al activar de nuevo se reconecta sin buscar', async () => {
  const m = montar();
  await emparejado(m);
  await m.servicio.desactivar();
  assert.equal(m.dije.control.estado.conectado, false);
  await m.servicio.activar();
  await hasta(() => m.servicio.obtenerEstado().fase === 'conectado', 4000, 'reconexión al abrir');
  await m.servicio.desactivar();
});

test('Lo grabado ANTES de emparejar no dispara una alerta falsa', async () => {
  const m = montar({ clipsAntes: 2 });
  await esperar(450);
  await emparejado(m);
  await esperar(500);
  assert.equal(m.llamadas.alertas.length, 0);
  assert.equal(m.llamadas.subidas.length, 0);
  assert.equal(m.dije.control.estado.clips.length, 2, 'los clips viejos no se tocan');
  await m.servicio.desactivar();
});

test('Sin internet al subir: el audio queda en la cola local y se sube después, una sola vez', async () => {
  const m = montar();
  m.api.falla.subida = 1000; // sin internet
  await emparejado(m);
  m.dije.control.simularAlerta({ segundos: 2 });
  await hasta(() => m.dije.control.estado.clips.length === 0 && m.llamadas.alertas.length === 1, 5000, 'descarga y confirmación');
  await hasta(async () => (await m.almacen.listarSubidas()).length === 1, 2000, 'audio encolado');
  assert.equal(m.llamadas.subidas.length, 0, 'sin internet no se sube, pero el dije ya pudo borrar su copia');

  await m.servicio._subirPendientes();
  assert.equal(m.llamadas.subidas.length, 0, 'sigue sin internet');
  m.api.falla.subida = 0; // vuelve el internet
  await m.servicio._subirPendientes();
  assert.equal(m.llamadas.subidas.length, 1);
  await m.servicio._subirPendientes();
  assert.equal(m.llamadas.subidas.length, 1, 'no se duplica');
  assert.deepEqual(await m.almacen.listarSubidas(), []);
  await m.servicio.desactivar();
});

test('Sin internet al avisar: la alerta se reintenta y el audio espera a tener alerta en el servidor', async () => {
  const m = montar();
  m.api.falla.alerta = 2;
  await emparejado(m);
  m.dije.control.simularAlerta({ segundos: 2 });
  await hasta(() => m.llamadas.alertas.length === 3, 5000, 'reintentos de la alerta');
  await hasta(() => m.llamadas.subidas.length === 1, 5000, 'subida después de registrar la alerta');
  assert.ok(m.avisos.some((a) => a.startsWith('No se pudo enviar la alerta')));
  assert.ok(m.avisos.includes('Alerta enviada a tus contactos de emergencia'));
  await m.servicio.desactivar();
});

test('Sin contactos de emergencia: se avisa y el dije no vibra como confirmación', async () => {
  const m = montar({ enviadas: 0 });
  await emparejado(m);
  m.dije.control.estado.vibraciones.length = 0;
  m.dije.control.simularAlerta({ segundos: 2 });
  await hasta(() => m.llamadas.subidas.length === 1, 5000, 'subida');
  assert.ok(m.avisos.some((a) => a.startsWith('No tienes contactos de emergencia')));
  assert.equal(m.dije.control.estado.vibraciones.length, 0);
  await m.servicio.desactivar();
});

test('Descarga cortada: se reanuda al reconectar y se sube un solo audio completo e idéntico', async () => {
  const m = montar();
  await emparejado(m);
  m.dije.control.cortarEnBloque(4);
  m.dije.control.simularAlerta({ segundos: 8 });
  await hasta(() => m.llamadas.subidas.length === 1, 8000, 'subida tras el corte y la reconexión');
  assert.equal(m.llamadas.alertas.length, 1, 'el corte no repite la alerta');
  assert.equal(m.dije.control.estado.clips.length, 0);
  const sub = m.llamadas.subidas[0];
  assert.equal(sub.duracionSeg, 8);
  await m.servicio.desactivar();
});

test('Bloque dañado en el aire: la descarga se corrige sola', async () => {
  const m = montar();
  await emparejado(m);
  m.dije.control.corromperBloque(2);
  m.dije.control.simularAlerta({ segundos: 6 });
  await hasta(() => m.llamadas.subidas.length === 1, 8000, 'subida');
  assert.equal(m.llamadas.subidas.length, 1);
  await m.servicio.desactivar();
});

test('Cola de subida por usuaria: otra usuaria en el mismo teléfono no sube los audios ajenos', async () => {
  let usuario = 7;
  const m = montar();
  m.api.falla.subida = 99;
  await emparejado(m);
  m.dije.control.simularAlerta({ segundos: 2 });
  await hasta(async () => (await m.almacen.listarSubidas()).length === 1, 5000, 'audio en cola');
  await m.servicio.desactivar();

  const otro = crearServicioDije({
    transporte: () => m.dije.transporte, almacen: m.almacen, prefs: m.prefs,
    api: { ...m.api, falla: undefined, subirEvidencia: async () => { throw new Error('no debe subir'); } },
    android: true, usuarioId: () => 8, obtenerPosicion: async () => null,
  });
  await otro._subirPendientes();
  assert.equal((await m.almacen.listarSubidas()).length, 1, 'sigue en la cola de la dueña');
  assert.equal(usuario, 7);
});

test('Búsqueda sin dije cerca: mensaje claro', async () => {
  const m = montar();
  m.dije.control.dormir();
  await m.servicio.activar();
  await m.servicio.buscar();
  assert.match(m.servicio.obtenerEstado().error, /No encontramos ningún dije/);
  await m.servicio.desactivar();
});
