// Dije simulado: imita el firmware (firmware/BLE.md) a nivel de GATT, con la misma interfaz que
// BleClient (@capacitor-community/bluetooth-le). Así TODA la app (emparejar, reconectar, alerta,
// descarga con CRC y reanudación, subida) se prueba sin el dije. No comparte código con dijeBle.js:
// está escrito a partir de la especificación para que ambos lados se verifiquen entre sí.
import {
  AUDIO, CMD, ERR, EVENTO, RSP, UUID, NOMBRE_DIJE,
  adpcmCodificar, armarBloque, crc32,
} from './protocolo.js';

/** Audio falso (~voz): un tono modulado con pausas y ruido, para que se note al reproducirlo. */
export function generarAudioPrueba(segundos) {
  const n = Math.round(segundos * AUDIO.RATE);
  const pcm = new Int16Array(n);
  let semilla = 12345;
  const azar = () => ((semilla = (semilla * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff - 0.5);
  for (let i = 0; i < n; i++) {
    const t = i / AUDIO.RATE;
    const habla = Math.sin(2 * Math.PI * 0.8 * t) > -0.2 ? 1 : 0.05; // sílabas y pausas
    const f0 = 140 + 40 * Math.sin(2 * Math.PI * 0.5 * t);
    const voz = Math.sin(2 * Math.PI * f0 * t) + 0.5 * Math.sin(2 * Math.PI * 2 * f0 * t);
    pcm[i] = Math.round(habla * 6000 * voz + 600 * azar());
  }
  return pcm;
}

const u32 = (v) => [v & 255, (v >> 8) & 255, (v >> 16) & 255, (v >>> 24) & 255];
const u16 = (v) => [v & 255, (v >> 8) & 255];
const dvDe = (arr) => new DataView(new Uint8Array(arr).buffer);

export function crearDijeSimulado({
  id = 'SIM-DIJE-0001',
  nombre = NOMBRE_DIJE,
  mtu = 247,
  retardoMs = 6,          // pausa entre ráfagas de bloques (0 en las pruebas automáticas)
  bloquesPorRafaga = 6,
  segundosClip = 10,      // duración del audio falso de cada alerta
  bateria = 87,
  autoEmparejar = true,   // como el sistema operativo: empareja solo al tocar algo cifrado (false = exige createBond)
} = {}) {
  const estado = {
    anunciando: true,
    conectado: false,
    emparejado: false,
    alDesconectar: null,
    suscripciones: new Map(), // uuid característica → callback
    clips: [],                // { clipId, alertaId, adpcm, crc }
    contAlerta: 0,
    contClip: 0,
    bateria,
    segundosGrabacion: 60,
    vibraciones: [],          // registro de lo que "vibró" (para las pruebas y la pantalla)
    tx: null,
    fallos: { cortarEnBloque: null, corromperBloque: null },
  };

  const esperar = (ms) => new Promise((r) => setTimeout(r, ms));
  const notificar = (uuid, dv) => {
    const cb = estado.suscripciones.get(uuid.toLowerCase());
    // Lo ya enviado antes de un corte sí llega (como en BLE real); el aviso de desconexión va después
    if (cb && estado.conectado && estado.emparejado) setTimeout(() => cb(dv), 0);
  };
  const exigirConexion = () => {
    if (!estado.conectado) throw new Error('Dije simulado: no conectado');
  };
  const exigirCifrado = () => {
    exigirConexion();
    if (!estado.emparejado) {
      if (!autoEmparejar) throw new Error('Dije simulado: insufficient authentication (falta emparejar)');
      estado.emparejado = true;
    }
  };
  const ctrl = (arr) => notificar(UUID.AUDIO_CTRL, dvDe(arr));

  function desconectar(motivo) {
    if (!estado.conectado) return;
    estado.conectado = false;
    estado.anunciando = motivo !== 'sleep'; // vuelve a anunciarse, salvo que se haya dormido
    estado.tx = null;
    estado.suscripciones.clear();
    const cb = estado.alDesconectar;
    estado.alDesconectar = null;
    if (cb) setTimeout(() => cb(id), 0);
    estado.ultimoMotivo = motivo;
  }

  // ---------------------------------------------------------- comandos de AUDIO_CTRL
  function listar() {
    const lista = estado.clips;
    if (lista.length === 0) return ctrl([RSP.ENTRADA, 0, 0, ...new Array(14).fill(0)]);
    lista.forEach((c, i) => {
      const seg = Math.round(((c.adpcm.length / AUDIO.BLOQUE_BYTES) * AUDIO.MUESTRAS_POR_BLOQUE) / AUDIO.RATE);
      ctrl([RSP.ENTRADA, lista.length, i, ...u32(c.clipId), ...u32(c.alertaId), ...u32(c.adpcm.length), ...u16(seg)]);
    });
  }

  function descargar(clipId, offset) {
    estado.tx = null;
    const clip = estado.clips.find((c) => c.clipId === clipId);
    if (!clip) return ctrl([RSP.ERROR, ERR.NO_EXISTE, ...u32(clipId)]);
    if (offset > clip.adpcm.length) return ctrl([RSP.ERROR, ERR.OFFSET, ...u32(clipId)]);
    const payload = Math.min(244, Math.max(16, mtu - 3 - 4));
    ctrl([RSP.INICIO, ...u32(clipId), ...u32(clip.adpcm.length), ...u32(clip.crc), ...u32(offset), ...u16(payload)]);
    const tx = { clip, pos: offset, seq: 0, payload };
    estado.tx = tx;
    const rafaga = async () => {
      while (estado.tx === tx && estado.conectado) {
        for (let i = 0; i < bloquesPorRafaga && tx.pos < clip.adpcm.length; i++) {
          if (estado.fallos.cortarEnBloque !== null && tx.seq === estado.fallos.cortarEnBloque) {
            estado.fallos.cortarEnBloque = null;
            return desconectar('corte simulado');
          }
          const trozo = clip.adpcm.slice(tx.pos, tx.pos + payload);
          const bloque = armarBloque(tx.seq, trozo);
          if (estado.fallos.corromperBloque !== null && tx.seq === estado.fallos.corromperBloque) {
            estado.fallos.corromperBloque = null;
            bloque.setUint8(3, bloque.getUint8(3) ^ 0xff); // payload alterado: el CRC16 ya no cuadra
          }
          notificar(UUID.AUDIO_DATOS, bloque);
          tx.pos += trozo.length;
          tx.seq++;
        }
        if (tx.pos >= clip.adpcm.length) {
          ctrl([RSP.FIN, ...u32(clipId), ...u16(tx.seq)]);
          estado.tx = null;
          return;
        }
        await esperar(retardoMs);
      }
    };
    setTimeout(rafaga, 0);
  }

  function confirmar(clipId, crc) {
    const i = estado.clips.findIndex((c) => c.clipId === clipId);
    if (i < 0) return ctrl([RSP.ERROR, ERR.NO_EXISTE, ...u32(clipId)]);
    if (estado.clips[i].crc !== crc >>> 0) return ctrl([RSP.ERROR, ERR.CRC, ...u32(clipId)]);
    estado.clips.splice(i, 1);
    ctrl([RSP.BORRADO, ...u32(clipId)]);
  }

  function comando(dv) {
    switch (dv.getUint8(0)) {
      case CMD.LISTAR: return listar();
      case CMD.DESCARGAR: return descargar(dv.getUint32(1, true), dv.getUint32(5, true));
      case CMD.CONFIRMAR: return confirmar(dv.getUint32(1, true), dv.getUint32(5, true));
      case CMD.ABORTAR:
        estado.tx = null;
        return ctrl([RSP.ABORTADO]);
      default: return ctrl([RSP.ERROR, ERR.COMANDO, 0, 0, 0, 0]);
    }
  }

  // ---------------------------------------------------------- interfaz tipo BleClient
  const transporte = {
    esSimulado: true,
    async initialize() {},
    async isEnabled() { return true; },
    async requestEnable() {},
    async requestLEScan(_opciones, callback) {
      if (!estado.anunciando || estado.fueraDeAlcance) return;
      setTimeout(() => callback({ device: { deviceId: id, name: nombre }, localName: nombre, rssi: -58 }), 150);
    },
    async stopLEScan() {},
    async requestDevice() {
      if (!estado.anunciando) throw new Error('No se encontró el dije simulado (está dormido)');
      return { deviceId: id, name: nombre };
    },
    async getDevices(ids) { return ids.includes(id) ? [{ deviceId: id, name: nombre }] : []; },
    async connect(deviceId, alDesconectar) {
      if (deviceId !== id) throw new Error('Dije simulado: dispositivo desconocido');
      if (!estado.anunciando || estado.fueraDeAlcance) throw new Error('Dije simulado: no responde (dormido o fuera de alcance)');
      await esperar(120);
      estado.conectado = true;
      estado.anunciando = false;
      estado.alDesconectar = alDesconectar ?? null;
    },
    async disconnect() { desconectar('app'); },
    async isBonded() { return estado.emparejado; },
    async createBond() { exigirConexion(); await esperar(80); estado.emparejado = true; },
    async getMtu() { return mtu; },
    async startNotifications(_id, servicio, caracteristica, callback) {
      exigirCifrado();
      estado.suscripciones.set(caracteristica.toLowerCase(), callback);
    },
    async stopNotifications(_id, _servicio, caracteristica) { estado.suscripciones.delete(caracteristica.toLowerCase()); },
    async read(_id, _servicio, caracteristica) {
      exigirCifrado();
      switch (caracteristica.toLowerCase()) {
        case UUID.BATERIA: return dvDe([estado.bateria, ...u16(3000 + estado.bateria * 12)]);
        case UUID.CONFIG: return dvDe([...u16(estado.segundosGrabacion), estado.clips.length, 1]);
        case UUID.ALERTA: {
          const ultimo = estado.clips[estado.clips.length - 1];
          return dvDe([ultimo ? EVENTO.CLIP_LISTO : EVENTO.NINGUNO, ...u32(ultimo?.alertaId ?? 0), ...u32(ultimo?.clipId ?? 0)]);
        }
        default: throw new Error('Característica no legible');
      }
    },
    async write(_id, _servicio, caracteristica, dv) {
      exigirCifrado();
      await esperar(2);
      switch (caracteristica.toLowerCase()) {
        case UUID.VIBRAR: estado.vibraciones.push({ patron: dv.getUint8(0), en: Date.now() }); return;
        case UUID.AUDIO_CTRL: return comando(dv);
        case UUID.CONFIG: estado.segundosGrabacion = dv.getUint16(0, true); return;
        default: throw new Error('Característica no escribible');
      }
    },
    async writeWithoutResponse(...args) { return transporte.write(...args); },
  };

  // ---------------------------------------------------------- controles para pruebas y para la pantalla
  const control = {
    id,
    estado,
    /** Presionar el botón 2 s: notifica a la app (si está conectada) y deja un clip listo. */
    simularAlerta({ segundos = segundosClip } = {}) {
      const alertaId = ++estado.contAlerta;
      const clipId = ++estado.contClip;
      const adpcm = adpcmCodificar(generarAudioPrueba(segundos));
      if (estado.conectado && estado.emparejado) {
        notificar(UUID.ALERTA, dvDe([EVENTO.ALERTA_INICIADA, ...u32(alertaId), ...u32(clipId)]));
      }
      estado.anunciando = !estado.conectado; // se despierta y se anuncia
      // La "grabación" dura lo que dura el audio; en simulación se acorta para no esperar
      setTimeout(() => {
        estado.clips.push({ clipId, alertaId, adpcm, crc: crc32(adpcm) });
        notificar(UUID.ALERTA, dvDe([EVENTO.CLIP_LISTO, ...u32(alertaId), ...u32(clipId)]));
      }, 400);
      return { alertaId, clipId };
    },
    /** Se aleja o se queda sin batería: la conexión se corta. */
    cortarConexion() { desconectar('corte'); },
    /** Se aleja del teléfono: la conexión se corta y no se le ve ni se le puede conectar hasta volver. */
    fueraDeAlcance(fuera) {
      estado.fueraDeAlcance = fuera;
      if (fuera) desconectar('fuera de alcance');
    },
    /** Entra en deep sleep: no se anuncia ni acepta conexiones hasta `despertar()`. */
    dormir() { desconectar('sleep'); estado.anunciando = false; },
    despertar() { estado.anunciando = !estado.conectado; },
    cortarEnBloque(n) { estado.fallos.cortarEnBloque = n; },
    corromperBloque(n) { estado.fallos.corromperBloque = n; },
    ponerBateria(p) { estado.bateria = p; notificar(UUID.BATERIA, dvDe([p, ...u16(3000 + p * 12)])); },
    olvidarEmparejamiento() { estado.emparejado = false; },
  };

  return { transporte, control };
}
