// Pruebas del protocolo y del cliente BLE contra el dije simulado (sin hardware ni navegador).
//   npm test        (o: node --test scripts/)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import {
  EVENTO, UUID, VIBRACION, adpcmDecodificar, clipAWav, crc16, crc32, leerBloque, armarBloque,
} from '../src/ble/protocolo.js';
import { crearDijeSimulado } from '../src/ble/dijeSimulado.js';
import { buscarDijes, conectarDije } from '../src/ble/dijeBle.js';

const aqui = dirname(fileURLToPath(import.meta.url));
const vec = (n) => new Uint8Array(readFileSync(join(aqui, 'vectores', n)));

const nuevoDije = (opciones = {}) => crearDijeSimulado({ retardoMs: 0, segundosClip: 4, ...opciones });
const esperar = (ms) => new Promise((r) => setTimeout(r, ms));
async function conectado(dije, opciones = {}) {
  return conectarDije(dije.transporte, dije.control.id, { android: true, ...opciones });
}
async function conClip(dije, segundos) {
  const { control } = dije;
  const conexion = await conectado(dije);
  control.simularAlerta({ segundos });
  await esperar(450);
  return conexion;
}

test('CRC: valores de referencia estándar', () => {
  const t = new TextEncoder().encode('123456789');
  assert.equal(crc32(t), 0xcbf43926);
  assert.equal(crc16(t), 0x29b1);
  assert.equal(crc32(t.subarray(4), crc32(t.subarray(0, 4))), 0xcbf43926, 'CRC-32 incremental');
});

test('ADPCM: la app decodifica EXACTAMENTE lo que produce el codificador C++ del firmware', () => {
  const adpcm = vec('clip.adp');
  const esperado = new Int16Array(vec('clip.pcm').buffer.slice(0));
  const pcm = adpcmDecodificar(adpcm);
  assert.equal(pcm.length, esperado.length);
  assert.ok(pcm.every((v, i) => v === esperado[i]));
  assert.equal(crc32(adpcm), Number(readFileSync(join(aqui, 'vectores', 'crc.txt'), 'utf8')));
});

test('WAV: cabecera válida y duración correcta', () => {
  const { wav, segundos } = clipAWav(vec('clip.adp'));
  assert.equal(new TextDecoder().decode(wav.subarray(0, 4)), 'RIFF');
  assert.equal(new TextDecoder().decode(wav.subarray(8, 12)), 'WAVE');
  assert.equal(new DataView(wav.buffer).getUint32(24, true), 16000);
  assert.equal(wav.length, 44 + 64 * 505 * 2);
  assert.equal(segundos, 2);
});

test('Bloques: el CRC16 detecta datos alterados', () => {
  const b = armarBloque(7, new Uint8Array([1, 2, 3, 4, 5]));
  assert.deepEqual({ v: leerBloque(b).valido, s: leerBloque(b).seq }, { v: true, s: 7 });
  b.setUint8(4, 99);
  assert.equal(leerBloque(b).valido, false);
});

test('Buscar: encuentra el dije simulado', async () => {
  const dije = nuevoDije();
  const vistos = [];
  await buscarDijes(dije.transporte, { onEncontrado: (d) => vistos.push(d), duracionMs: 300 });
  assert.equal(vistos.length, 1);
  assert.equal(vistos[0].id, dije.control.id);
});

test('Conectar: empareja, lee batería y config', async () => {
  const dije = nuevoDije();
  const c = await conectado(dije);
  assert.equal((await c.leerBateria()).porcentaje, 87);
  assert.equal((await c.leerConfig()).segundosGrabacion, 60);
  await c.escribirSegundosGrabacion(30);
  assert.equal((await c.leerConfig()).segundosGrabacion, 30);
  await c.vibrar(VIBRACION.CONFIRMA_ALERTA);
  assert.deepEqual(dije.control.estado.vibraciones.map((v) => v.patron), [VIBRACION.CONFIRMA_ALERTA]);
});

test('Seguridad: sin emparejar el dije no entrega nada', async () => {
  const dije = nuevoDije({ autoEmparejar: false });
  await dije.transporte.connect(dije.control.id);
  await assert.rejects(() => dije.transporte.read(dije.control.id, UUID.SERVICIO, UUID.BATERIA), /authentication/);
});

test('Alerta: la app recibe la notificación en vivo y luego el clip listo', async () => {
  const dije = nuevoDije();
  const c = await conectado(dije);
  const eventos = [];
  c.alAlerta((a) => eventos.push(a));
  const { alertaId, clipId } = dije.control.simularAlerta({ segundos: 2 });
  await esperar(500);
  assert.deepEqual(eventos.map((e) => e.evento), [EVENTO.ALERTA_INICIADA, EVENTO.CLIP_LISTO]);
  assert.ok(eventos.every((e) => e.alertaId === alertaId && e.clipId === clipId));
});

test('Listar: vacío y con varios clips acumulados sin conexión', async () => {
  const dije = nuevoDije();
  const c = await conectado(dije);
  assert.deepEqual(await c.listarClips(), []);
  await c.desconectar();
  dije.control.simularAlerta({ segundos: 2 });
  dije.control.simularAlerta({ segundos: 3 });
  await esperar(450);
  const c2 = await conectado(dije);
  const clips = await c2.listarClips();
  assert.deepEqual(clips.map((x) => [x.clipId, x.alertaId, x.segundos]), [[1, 1, 2], [2, 2, 3]]);
});

test('Descarga completa, CRC correcto y el dije borra solo tras confirmar', async () => {
  const dije = nuevoDije();
  const c = await conClip(dije, 6);
  const [clip] = await c.listarClips();
  const progreso = [];
  const r = await c.descargarClip(clip.clipId, 0, { onProgreso: (a, t) => progreso.push([a, t]) });
  assert.equal(r.completo, true);
  assert.equal(r.bytes.length, clip.bytes);
  assert.equal(crc32(r.bytes), r.crc32);
  assert.deepEqual(progreso.at(-1), [clip.bytes, clip.bytes]);

  assert.equal(dije.control.estado.clips.length, 1, 'antes de confirmar el clip sigue en el dije');
  await c.confirmarClip(clip.clipId, crc32(r.bytes));
  assert.equal(dije.control.estado.clips.length, 0);
});

test('Confirmar con un CRC incorrecto NO borra el clip', async () => {
  const dije = nuevoDije();
  const c = await conClip(dije, 2);
  const [clip] = await c.listarClips();
  await assert.rejects(() => c.confirmarClip(clip.clipId, 12345), (e) => e.codigo === 5);
  assert.equal(dije.control.estado.clips.length, 1);
});

test('Reanudar: la conexión se corta a mitad y se continúa desde el último byte bueno', async () => {
  const dije = nuevoDije();
  const c = await conClip(dije, 8);
  const [clip] = await c.listarClips();
  const original = dije.control.estado.clips[0].adpcm;

  dije.control.cortarEnBloque(5);
  const parcial = await c.descargarClip(clip.clipId, 0);
  assert.equal(parcial.completo, false);
  assert.equal(parcial.motivo, 'desconectado');
  assert.ok(parcial.bytes.length > 0 && parcial.bytes.length < clip.bytes);

  const c2 = await conectado(dije);
  const resto = await c2.descargarClip(clip.clipId, parcial.bytes.length);
  assert.equal(resto.completo, true);
  const total = new Uint8Array([...parcial.bytes, ...resto.bytes]);
  assert.deepEqual(total, original);
  assert.equal(crc32(total), resto.crc32);
});

test('Bloque corrupto: se detecta, se conservan los bytes buenos y se reanuda', async () => {
  const dije = nuevoDije();
  const c = await conClip(dije, 8);
  const [clip] = await c.listarClips();
  const original = dije.control.estado.clips[0].adpcm;

  dije.control.corromperBloque(3);
  const parcial = await c.descargarClip(clip.clipId, 0);
  assert.equal(parcial.motivo, 'bloque-invalido');
  assert.equal(parcial.bytes.length, 3 * 240);
  await esperar(50);

  const resto = await c.descargarClip(clip.clipId, parcial.bytes.length);
  assert.equal(resto.completo, true);
  assert.deepEqual(new Uint8Array([...parcial.bytes, ...resto.bytes]), original);
});

test('Descargar un clip que ya no existe devuelve el motivo, sin colgarse', async () => {
  const dije = nuevoDije();
  const c = await conectado(dije);
  const r = await c.descargarClip(99, 0);
  assert.equal(r.completo, false);
  assert.equal(r.motivo, 'no-existe');
});

test('Sin respuesta del dije: la descarga termina por inactividad', async () => {
  const dije = nuevoDije();
  const c = await conClip(dije, 2);
  const [clip] = await c.listarClips();
  dije.control.estado.suscripciones.clear(); // el dije "enmudece": la app no recibe nada
  const r = await c.descargarClip(clip.clipId, 0, { inactividadMs: 150 });
  assert.equal(r.completo, false);
  assert.equal(r.motivo, 'timeout');
});
