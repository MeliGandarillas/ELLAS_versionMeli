// Protocolo BLE del dije. Espejo de firmware/BLE.md y firmware/src/protocolo.h: si cambias algo, cámbialo en los tres.
// Este archivo no toca Bluetooth ni el DOM: son solo constantes y funciones puras (se prueban en Node).

const base = (xx) => `e11a${xx}-5a3f-4c1d-9b7e-d1e5ec0de000`;

export const NOMBRE_DIJE = 'ELLAS-Dije';
export const UUID = {
  SERVICIO: base('0001'),
  ALERTA: base('0002'),
  VIBRAR: base('0003'),
  BATERIA: base('0004'),
  AUDIO_CTRL: base('0005'),
  AUDIO_DATOS: base('0006'),
  CONFIG: base('0007'),
};

export const EVENTO = { NINGUNO: 0, ALERTA_INICIADA: 1, CLIP_LISTO: 2, GRABACION_FALLIDA: 3 };
export const VIBRACION = { CONFIRMA_ALERTA: 0, ENCONTRAR: 1, CORTO: 2, ERROR: 3, ALERTA_LOCAL: 4, PARAR: 0xff };
export const CMD = { LISTAR: 0x01, DESCARGAR: 0x02, CONFIRMAR: 0x03, ABORTAR: 0x04 };
export const RSP = { ENTRADA: 0x81, INICIO: 0x82, FIN: 0x83, BORRADO: 0x84, ABORTADO: 0x85, ERROR: 0x8f };
export const ERR = { NO_EXISTE: 1, OFFSET: 2, COMANDO: 3, OCUPADO: 4, CRC: 5 };

export const AUDIO = {
  RATE: 16000,
  BLOQUE_BYTES: 256,
  MUESTRAS_POR_BLOQUE: 1 + (256 - 4) * 2, // 505
};

// ------------------------------------------------------------------ CRC
/** CRC-16/CCITT-FALSE (poly 0x1021, init 0xFFFF): verifica cada bloque BLE. */
export function crc16(bytes, crc = 0xffff) {
  for (let i = 0; i < bytes.length; i++) {
    crc ^= bytes[i] << 8;
    for (let b = 0; b < 8; b++) crc = crc & 0x8000 ? ((crc << 1) ^ 0x1021) & 0xffff : (crc << 1) & 0xffff;
  }
  return crc;
}

const TABLA32 = (() => {
  const t = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[i] = c >>> 0;
  }
  return t;
})();

/** CRC-32 estándar (zlib/PNG). Para acumular: `crc32(b, crc32(a))` equivale a `crc32(a ++ b)`. */
export function crc32(bytes, anterior = 0) {
  let crc = (anterior ^ 0xffffffff) >>> 0;
  for (let i = 0; i < bytes.length; i++) crc = TABLA32[(crc ^ bytes[i]) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

// ------------------------------------------------------------------ comandos (app → dije)
const dv = (n) => new DataView(new ArrayBuffer(n));

export const comandoListar = () => {
  const d = dv(1);
  d.setUint8(0, CMD.LISTAR);
  return d;
};
export const comandoDescargar = (clipId, offset) => {
  const d = dv(9);
  d.setUint8(0, CMD.DESCARGAR);
  d.setUint32(1, clipId, true);
  d.setUint32(5, offset, true);
  return d;
};
export const comandoConfirmar = (clipId, crc) => {
  const d = dv(9);
  d.setUint8(0, CMD.CONFIRMAR);
  d.setUint32(1, clipId, true);
  d.setUint32(5, crc >>> 0, true);
  return d;
};
export const comandoAbortar = () => {
  const d = dv(1);
  d.setUint8(0, CMD.ABORTAR);
  return d;
};
export const comandoVibrar = (patron) => {
  const d = dv(1);
  d.setUint8(0, patron);
  return d;
};
export const comandoConfig = (segundos) => {
  const d = dv(2);
  d.setUint16(0, segundos, true);
  return d;
};

// ------------------------------------------------------------------ lecturas / notificaciones (dije → app)
export function leerAlerta(d) {
  if (d.byteLength < 9) return null;
  return { evento: d.getUint8(0), alertaId: d.getUint32(1, true), clipId: d.getUint32(5, true) };
}

export function leerBateria(d) {
  if (d.byteLength < 3) return null;
  return { porcentaje: d.getUint8(0), milivoltios: d.getUint16(1, true) };
}

export function leerConfig(d) {
  if (d.byteLength < 4) return null;
  return { segundosGrabacion: d.getUint16(0, true), clipsPendientes: d.getUint8(2), version: d.getUint8(3) };
}

/** Interpreta una notificación de AUDIO_CTRL. */
export function leerRespuesta(d) {
  const tipo = d.getUint8(0);
  switch (tipo) {
    case RSP.ENTRADA:
      return {
        tipo,
        total: d.getUint8(1),
        indice: d.getUint8(2),
        clipId: d.getUint32(3, true),
        alertaId: d.getUint32(7, true),
        bytes: d.getUint32(11, true),
        segundos: d.getUint16(15, true),
      };
    case RSP.INICIO:
      return {
        tipo,
        clipId: d.getUint32(1, true),
        total: d.getUint32(5, true),
        crc32: d.getUint32(9, true),
        offset: d.getUint32(13, true),
        payload: d.getUint16(17, true),
      };
    case RSP.FIN:
      return { tipo, clipId: d.getUint32(1, true), bloques: d.getUint16(5, true) };
    case RSP.BORRADO:
      return { tipo, clipId: d.getUint32(1, true) };
    case RSP.ABORTADO:
      return { tipo };
    case RSP.ERROR:
      return { tipo, codigo: d.getUint8(1), clipId: d.getUint32(2, true) };
    default:
      return { tipo: -1 };
  }
}

/** Bloque de AUDIO_DATOS: [seq u16][payload][crc16 u16]. `valido` es false si el CRC no cuadra. */
export function leerBloque(d) {
  const bytes = new Uint8Array(d.buffer, d.byteOffset, d.byteLength);
  if (bytes.length < 5) return { valido: false, seq: -1, payload: new Uint8Array(0) };
  const cuerpo = bytes.subarray(0, bytes.length - 2);
  const crc = bytes[bytes.length - 2] | (bytes[bytes.length - 1] << 8);
  return {
    valido: crc16(cuerpo) === crc,
    seq: bytes[0] | (bytes[1] << 8),
    payload: bytes.subarray(2, bytes.length - 2),
  };
}

/** Arma un bloque de AUDIO_DATOS (lo usa el dije simulado). */
export function armarBloque(seq, payload) {
  const out = new Uint8Array(payload.length + 4);
  out[0] = seq & 0xff;
  out[1] = (seq >> 8) & 0xff;
  out.set(payload, 2);
  const crc = crc16(out.subarray(0, out.length - 2));
  out[out.length - 2] = crc & 0xff;
  out[out.length - 1] = crc >> 8;
  return new DataView(out.buffer);
}

// ------------------------------------------------------------------ IMA-ADPCM (mismo algoritmo que firmware/src/adpcm.cpp)
const TABLA_INDICE = [-1, -1, -1, -1, 2, 4, 6, 8, -1, -1, -1, -1, 2, 4, 6, 8];
const TABLA_PASO = [
  7, 8, 9, 10, 11, 12, 13, 14, 16, 17, 19, 21, 23, 25, 28, 31, 34, 37, 41, 45, 50, 55, 60, 66, 73, 80, 88, 97, 107, 118,
  130, 143, 157, 173, 190, 209, 230, 253, 279, 307, 337, 371, 408, 449, 494, 544, 598, 658, 724, 796, 876, 963, 1060,
  1166, 1282, 1411, 1552, 1707, 1878, 2066, 2272, 2499, 2749, 3024, 3327, 3660, 4026, 4428, 4871, 5358, 5894, 6484,
  7132, 7845, 8630, 9493, 10442, 11487, 12635, 13899, 15289, 16818, 18500, 20350, 22385, 24623, 27086, 29794, 32767,
];
const limitar = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);

function aplicarNibble(nibble, predictor, paso) {
  let diff = paso >> 3;
  if (nibble & 4) diff += paso;
  if (nibble & 2) diff += paso >> 1;
  if (nibble & 1) diff += paso >> 2;
  if (nibble & 8) diff = -diff;
  return limitar(predictor + diff, -32768, 32767);
}

/** Decodifica el clip del dije (bloques de 256 bytes) a PCM de 16 bits. Ignora un bloque final incompleto. */
export function adpcmDecodificar(bytes) {
  const bloques = Math.floor(bytes.length / AUDIO.BLOQUE_BYTES);
  const pcm = new Int16Array(bloques * AUDIO.MUESTRAS_POR_BLOQUE);
  for (let b = 0; b < bloques; b++) {
    const ini = b * AUDIO.BLOQUE_BYTES;
    let predictor = (bytes[ini] | (bytes[ini + 1] << 8)) << 16 >> 16;
    let indice = limitar(bytes[ini + 2], 0, 88);
    let o = b * AUDIO.MUESTRAS_POR_BLOQUE;
    pcm[o++] = predictor;
    for (let i = 0; i < (AUDIO.BLOQUE_BYTES - 4) * 2; i++) {
      const byte = bytes[ini + 4 + (i >> 1)];
      const nibble = i & 1 ? byte >> 4 : byte & 0x0f;
      predictor = aplicarNibble(nibble, predictor, TABLA_PASO[indice]);
      indice = limitar(indice + TABLA_INDICE[nibble], 0, 88);
      pcm[o++] = predictor;
    }
  }
  return pcm;
}

/** Codifica PCM a bloques ADPCM (lo usa el dije simulado; el firmware real tiene su propio codificador en C++). */
export function adpcmCodificar(pcm) {
  const M = AUDIO.MUESTRAS_POR_BLOQUE;
  const bloques = Math.ceil(pcm.length / M);
  const salida = new Uint8Array(bloques * AUDIO.BLOQUE_BYTES);
  let indice = 0;
  for (let b = 0; b < bloques; b++) {
    const muestras = new Int16Array(M);
    muestras.set(pcm.subarray(b * M, b * M + M));
    const ini = b * AUDIO.BLOQUE_BYTES;
    let predictor = muestras[0];
    salida[ini] = predictor & 0xff;
    salida[ini + 1] = (predictor >> 8) & 0xff;
    salida[ini + 2] = indice;
    for (let i = 0; i < (AUDIO.BLOQUE_BYTES - 4) * 2; i++) {
      const paso = TABLA_PASO[indice];
      let diff = muestras[1 + i] - predictor;
      let nibble = 0;
      if (diff < 0) {
        nibble = 8;
        diff = -diff;
      }
      let t = paso;
      if (diff >= t) { nibble |= 4; diff -= t; }
      t >>= 1;
      if (diff >= t) { nibble |= 2; diff -= t; }
      t >>= 1;
      if (diff >= t) nibble |= 1;
      predictor = aplicarNibble(nibble, predictor, paso);
      indice = limitar(indice + TABLA_INDICE[nibble], 0, 88);
      const pos = ini + 4 + (i >> 1);
      salida[pos] = i & 1 ? salida[pos] | (nibble << 4) : nibble;
    }
  }
  return salida;
}

// ------------------------------------------------------------------ WAV
/** WAV PCM de 16 bits mono: reproducible en cualquier navegador/reproductor y entregable como evidencia. */
export function pcmAWav(pcm, rate = AUDIO.RATE) {
  const datos = pcm.length * 2;
  const wav = new DataView(new ArrayBuffer(44 + datos));
  const texto = (o, s) => [...s].forEach((c, i) => wav.setUint8(o + i, c.charCodeAt(0)));
  texto(0, 'RIFF');
  wav.setUint32(4, 36 + datos, true);
  texto(8, 'WAVE');
  texto(12, 'fmt ');
  wav.setUint32(16, 16, true);
  wav.setUint16(20, 1, true); // PCM
  wav.setUint16(22, 1, true); // mono
  wav.setUint32(24, rate, true);
  wav.setUint32(28, rate * 2, true);
  wav.setUint16(32, 2, true);
  wav.setUint16(34, 16, true);
  texto(36, 'data');
  wav.setUint32(40, datos, true);
  for (let i = 0; i < pcm.length; i++) wav.setInt16(44 + i * 2, pcm[i], true);
  return new Uint8Array(wav.buffer);
}

/** Clip ADPCM del dije → WAV PCM + duración en segundos. */
export function clipAWav(bytesAdpcm) {
  const pcm = adpcmDecodificar(bytesAdpcm);
  return { wav: pcmAWav(pcm), segundos: Math.round(pcm.length / AUDIO.RATE) };
}
