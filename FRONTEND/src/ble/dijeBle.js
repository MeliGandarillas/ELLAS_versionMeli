// Cliente BLE del dije: habla el protocolo de firmware/BLE.md sobre un "transporte" con la interfaz de
// BleClient (@capacitor-community/bluetooth-le: plugin nativo en la APK y Web Bluetooth en el navegador)
// o sobre el dije simulado. No importa Capacitor ni el DOM: se prueba en Node.
import {
  ERR, RSP, UUID, NOMBRE_DIJE,
  comandoAbortar, comandoConfig, comandoConfirmar, comandoDescargar, comandoListar, comandoVibrar,
  leerAlerta, leerBateria, leerBloque, leerConfig, leerRespuesta,
} from './protocolo.js';

/** El Bluetooth del teléfono está apagado y la usuaria no lo encendió. */
export const BLUETOOTH_APAGADO = 'BLUETOOTH_APAGADO';

const esperar = (ms) => new Promise((r) => setTimeout(r, ms));

export class ErrorDije extends Error {
  constructor(mensaje, codigo) {
    super(mensaje);
    this.codigo = codigo;
  }
}

/** Inicializa el Bluetooth (pide permisos en Android) y, si está apagado, pide encenderlo. */
export async function iniciarBluetooth(ble, { android = false } = {}) {
  // No se declara "neverForLocation": la app usa ubicación y así el escaneo ve todos los anuncios
  await ble.initialize({ androidNeverForLocation: false });
  if (android && !(await ble.isEnabled())) {
    try {
      await ble.requestEnable();
    } catch {
      throw new ErrorDije('Enciende el Bluetooth para buscar tu dije', BLUETOOTH_APAGADO);
    }
  }
}

/**
 * Busca dijes cercanos y llama a `onEncontrado({ id, nombre, rssi })` por cada uno.
 * En el navegador (sin escaneo continuo) se usa el selector del propio navegador: debe llamarse desde un toque.
 */
export async function buscarDijes(ble, { onEncontrado, duracionMs = 8000, navegador = false, signal } = {}) {
  if (navegador) {
    const d = await ble.requestDevice({ services: [UUID.SERVICIO], optionalServices: [UUID.SERVICIO] });
    onEncontrado({ id: d.deviceId, nombre: d.name || NOMBRE_DIJE, rssi: null });
    return;
  }
  const vistos = new Set();
  await ble.requestLEScan({ services: [UUID.SERVICIO], allowDuplicates: false }, (r) => {
    if (vistos.has(r.device.deviceId)) return;
    vistos.add(r.device.deviceId);
    onEncontrado({ id: r.device.deviceId, nombre: r.localName || r.device.name || NOMBRE_DIJE, rssi: r.rssi ?? null });
  });
  try {
    await new Promise((resolver) => {
      const t = setTimeout(resolver, duracionMs);
      signal?.addEventListener('abort', () => { clearTimeout(t); resolver(); }, { once: true });
    });
  } finally {
    await ble.stopLEScan().catch(() => {});
  }
}

/**
 * Conecta con el dije, lo empareja (cifrado) y activa las notificaciones.
 * @returns {Promise<ConexionDije>}
 */
export async function conectarDije(ble, id, { android = false, onDesconectado, timeoutMs = 15000 } = {}) {
  let conexion = null;
  let cortada = false;
  await ble.connect(id, () => {
    cortada = true;
    conexion?._alDesconectar();
    onDesconectado?.();
  }, { timeout: timeoutMs });
  conexion = new ConexionDije(ble, id);
  if (cortada) conexion._alDesconectar();

  try {
    // El dije exige cifrado: Android muestra el aviso de emparejar la primera vez
    if (android && !(await ble.isBonded(id))) {
      await ble.createBond(id, { timeout: 40000 }).catch(() => {});
    }
    await conexion._suscribir();
  } catch (err) {
    await ble.disconnect(id).catch(() => {});
    throw err;
  }
  return conexion;
}

export class ConexionDije {
  constructor(ble, id) {
    this.ble = ble;
    this.id = id;
    this.activa = true;
    this._oyentes = new Set();   // esperas de respuestas de AUDIO_CTRL
    this._tx = null;             // descarga en curso
    this._lista = null;          // listado en curso
    this._alAlerta = null;
    this._alBateria = null;
    this._alCortarse = new Set();
  }

  // -------------------------------------------------------------- ciclo de vida
  _alDesconectar() {
    if (!this.activa) return;
    this.activa = false;
    for (const f of [...this._alCortarse]) f();
    for (const o of [...this._oyentes]) o.rechazar(new ErrorDije('Se perdió la conexión con el dije', 'DESCONECTADO'));
    this._tx?.terminar('desconectado');
    this._lista?.rechazar(new ErrorDije('Se perdió la conexión con el dije', 'DESCONECTADO'));
  }

  async desconectar() {
    this.activa = false;
    await this.ble.disconnect(this.id).catch(() => {});
    this._alDesconectar();
  }

  async _suscribir() {
    const S = UUID.SERVICIO;
    const suscribir = async (caracteristica, callback) => {
      // Tras emparejar, Android puede tardar un instante en dejar acceder a lo cifrado: se reintenta
      for (let intento = 0; ; intento++) {
        try {
          return await this.ble.startNotifications(this.id, S, caracteristica, callback);
        } catch (err) {
          if (intento >= 3 || !this.activa) throw err;
          await esperar(1200);
        }
      }
    };
    await suscribir(UUID.AUDIO_CTRL, (dv) => this._alCtrl(dv));
    await suscribir(UUID.AUDIO_DATOS, (dv) => this._tx?.alBloque(leerBloque(dv)));
    await suscribir(UUID.ALERTA, (dv) => {
      const a = leerAlerta(dv);
      if (a) this._alAlerta?.(a);
    });
    await suscribir(UUID.BATERIA, (dv) => {
      const b = leerBateria(dv);
      if (b) this._alBateria?.(b);
    });
  }

  alAlerta(callback) { this._alAlerta = callback; }
  alBateria(callback) { this._alBateria = callback; }
  alCortarse(callback) {
    this._alCortarse.add(callback);
    return () => this._alCortarse.delete(callback);
  }

  // -------------------------------------------------------------- lecturas y comandos simples
  async leerBateria() { return leerBateria(await this.ble.read(this.id, UUID.SERVICIO, UUID.BATERIA)); }
  async leerConfig() { return leerConfig(await this.ble.read(this.id, UUID.SERVICIO, UUID.CONFIG)); }
  async leerAlerta() { return leerAlerta(await this.ble.read(this.id, UUID.SERVICIO, UUID.ALERTA)); }
  async escribirSegundosGrabacion(s) { await this.ble.write(this.id, UUID.SERVICIO, UUID.CONFIG, comandoConfig(s)); }
  /** Hace vibrar el dije (ver VIBRACION en protocolo.js). */
  async vibrar(patron) { await this.ble.write(this.id, UUID.SERVICIO, UUID.VIBRAR, comandoVibrar(patron)); }
  async mtu() { return this.ble.getMtu(this.id).catch(() => null); }

  _comando(dv) { return this.ble.write(this.id, UUID.SERVICIO, UUID.AUDIO_CTRL, dv, { timeout: 8000 }); }

  // -------------------------------------------------------------- respuestas de AUDIO_CTRL
  _alCtrl(dv) {
    const r = leerRespuesta(dv);
    if (r.tipo === RSP.ENTRADA) return this._lista?.entrada(r);
    this._tx?.alRespuesta(r);
    for (const o of [...this._oyentes]) o.revisar(r);
  }

  /** Espera la respuesta que cumpla `acepta`; un ERROR del dije para ese clip la rechaza. */
  _esperar(acepta, clipId, ms = 8000) {
    return new Promise((resolver, rechazar) => {
      const oyente = {
        revisar: (r) => {
          if (r.tipo === RSP.ERROR && r.clipId === clipId) liberar(() => rechazar(new ErrorDije(`El dije respondió error ${r.codigo}`, r.codigo)));
          else if (acepta(r)) liberar(() => resolver(r));
        },
        rechazar: (e) => liberar(() => rechazar(e)),
      };
      const timer = setTimeout(() => liberar(() => rechazar(new ErrorDije('El dije no respondió', 'TIMEOUT'))), ms);
      const liberar = (f) => {
        clearTimeout(timer);
        this._oyentes.delete(oyente);
        f();
      };
      this._oyentes.add(oyente);
    });
  }

  // -------------------------------------------------------------- clips
  /** Clips guardados en el dije: [{ clipId, alertaId, bytes, segundos }]. Los listados se atienden de uno en uno. */
  listarClips(ms = 8000) {
    const turno = (this._turnoListado ?? Promise.resolve()).catch(() => {}).then(() => this._listarClips(ms));
    this._turnoListado = turno;
    return turno;
  }

  _listarClips(ms) {
    return new Promise((resolver, rechazar) => {
      if (!this.activa) return rechazar(new ErrorDije('Se perdió la conexión con el dije', 'DESCONECTADO'));
      const clips = [];
      const terminar = (f) => {
        clearTimeout(timer);
        this._lista = null;
        f();
      };
      const timer = setTimeout(() => terminar(() => rechazar(new ErrorDije('El dije no respondió al listado', 'TIMEOUT'))), ms);
      this._lista = {
        entrada: (r) => {
          if (r.total === 0) return terminar(() => resolver([]));
          clips.push({ clipId: r.clipId, alertaId: r.alertaId, bytes: r.bytes, segundos: r.segundos });
          if (clips.length >= r.total) terminar(() => resolver(clips));
        },
        rechazar: (e) => terminar(() => rechazar(e)),
      };
      this._comando(comandoListar()).catch((e) => terminar(() => rechazar(e)));
    });
  }

  /**
   * Descarga un clip desde `offset` (reanudar = pasar los bytes buenos que ya tienes).
   * Nunca lanza por un corte o un bloque malo: devuelve los bytes buenos recibidos y `completo: false`
   * para que quien llama los guarde y reintente desde ahí.
   * @returns {{ bytes: Uint8Array, completo: boolean, total: number|null, crc32: number|null, motivo: string }}
   */
  descargarClip(clipId, offset, { onProgreso, inactividadMs = 8000 } = {}) {
    return new Promise((resolver) => {
      if (this._tx) return resolver({ bytes: new Uint8Array(0), completo: false, total: null, crc32: null, motivo: 'ocupado' });
      const trozos = [];
      let recibidos = 0;
      let esperado = 0;
      let inicio = null;
      let timer = null;
      let hecho = false;

      const terminar = (motivo) => {
        if (hecho) return;
        hecho = true;
        clearTimeout(timer);
        this._tx = null;
        if (motivo !== 'ok' && this.activa) this._comando(comandoAbortar()).catch(() => {});
        const bytes = new Uint8Array(recibidos);
        let o = 0;
        for (const t of trozos) {
          bytes.set(t, o);
          o += t.length;
        }
        resolver({
          bytes,
          completo: motivo === 'ok',
          total: inicio?.total ?? null,
          crc32: inicio?.crc32 ?? null,
          motivo,
        });
      };
      const reiniciarReloj = () => {
        clearTimeout(timer);
        timer = setTimeout(() => terminar('timeout'), inactividadMs);
      };

      this._tx = {
        terminar,
        alRespuesta: (r) => {
          reiniciarReloj();
          if (r.tipo === RSP.INICIO) {
            if (r.clipId !== clipId || r.offset !== offset) return terminar('inicio-invalido');
            inicio = r;
          } else if (r.tipo === RSP.ERROR && r.clipId === clipId) {
            terminar(r.codigo === ERR.NO_EXISTE ? 'no-existe' : `error-${r.codigo}`);
          } else if (r.tipo === RSP.FIN && inicio && r.clipId === clipId) {
            terminar(recibidos === inicio.total - offset && r.bloques === esperado ? 'ok' : 'incompleto');
          }
        },
        alBloque: (b) => {
          if (!inicio) return; // sobrante de una descarga anterior
          reiniciarReloj();
          if (!b.valido || b.seq !== esperado) return terminar('bloque-invalido');
          if (recibidos + b.payload.length > inicio.total - offset) return terminar('bloque-invalido');
          trozos.push(b.payload.slice()); // copia: el buffer del sistema se reutiliza
          recibidos += b.payload.length;
          esperado++;
          onProgreso?.(offset + recibidos, inicio.total);
        },
      };
      reiniciarReloj();
      this._comando(comandoDescargar(clipId, offset)).catch(() => terminar('error-escritura'));
    });
  }

  /** Avisa al dije que el clip llegó completo (con su CRC-32): solo entonces lo borra. */
  async confirmarClip(clipId, crc32) {
    const espera = this._esperar((r) => r.tipo === RSP.BORRADO && r.clipId === clipId, clipId);
    espera.catch(() => {}); // si falla el envío, el error que importa es el del envío
    await this._comando(comandoConfirmar(clipId, crc32));
    await espera;
  }
}
