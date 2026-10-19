// Servicio del dije: ÚNICO lugar de la app que sabe de Bluetooth. Maneja
//   - buscar, emparejar y recordar el dije, y reconectar solo;
//   - la alerta: al presionar el botón dispara el flujo de alerta a contactos favoritos (con la ubicación
//     del teléfono) y hace vibrar el dije para confirmar;
//   - el audio: descarga los clips con CRC y reanudación, los guarda localmente, confirma al dije
//     (que solo entonces los borra) y los sube al servidor, reintentando hasta lograrlo.
// Todo entra por `deps` (transporte BLE, almacén, API, ubicación), así se prueba en Node con el dije simulado.
import { EVENTO, VIBRACION, clipAWav, crc32 } from './protocolo.js';
import { BLUETOOTH_APAGADO, buscarDijes, conectarDije, iniciarBluetooth } from './dijeBle.js';

export const TIEMPOS = {
  reconexionMs: [3000, 5000, 8000, 13000, 20000, 30000], // espera entre intentos (el último se repite)
  reintentoAlertaMs: [0, 2000, 5000, 15000, 30000, 60000, 120000],
  intentosDescarga: 4,
  pausaDescargaMs: 800,
  subidaCadaMs: 60000,
  duracionBusquedaMs: 8000,
};

const MENSAJE_SIN_CONTACTOS = 'No tienes contactos de emergencia. Márcalos con la ★ en tu lista de amigos';
const MENSAJE_ALERTA_ENVIADA = 'Alerta enviada a tus contactos de emergencia';

const unir = (a, b) => {
  const out = new Uint8Array(a.length + b.length);
  out.set(a, 0);
  out.set(b, a.length);
  return out;
};
const pausa = (ms) => new Promise((r) => setTimeout(r, ms));

export function crearServicioDije(deps) {
  const T = { ...TIEMPOS, ...deps.tiempos };
  const { almacen, api } = deps;

  let estado = {
    modo: deps.prefs.leer('modo') === 'simulado' ? 'simulado' : 'real',
    disponible: deps.hayBluetooth !== false,
    fase: 'inactivo', // inactivo | conectando | conectado | reconectando
    dispositivo: null, // { id, nombre } recordado
    bateria: null,
    buscando: false,
    encontrados: [],
    error: null,
    descarga: null, // { clipId, avance 0..1 }
    pendientesDescarga: 0,
    pendientesSubida: 0,
    segundosGrabacion: null,
    ultimaAlerta: null,
  };
  const oyentes = new Set();
  const emitir = (cambio) => {
    estado = { ...estado, ...cambio };
    oyentes.forEach((f) => f());
  };

  let activo = false;           // hay una usuaria con sesión
  let quiereConexion = false;   // se reconecta sola mientras sea true
  let conexion = null;
  let intentos = 0;
  let timerReconexion = null;
  let timerSubida = null;
  let conectandoAhora = null;
  let abortarBusqueda = null;
  let sincronizando = null;
  let repetirSincronizacion = false;
  let subiendo = false;
  let repetirSubida = false;
  const alertasEnCurso = new Map();

  const claveRecordado = () => `dispositivo.${estado.modo}`;
  const blePlugin = () => deps.transporte(estado.modo);
  const avisar = (t) => deps.avisar?.(t);

  // ---------------------------------------------------------------- metadatos por dije
  const claveAlertas = (id) => `alertas:${id}`;
  const leerAlertas = (id) => almacen.leerMeta(claveAlertas(id), {});
  async function guardarAlerta(id, alertaDije, alertaServidor) {
    const m = await leerAlertas(id);
    m[alertaDije] = alertaServidor;
    await almacen.guardarMeta(claveAlertas(id), m);
  }
  const leerBase = (id) => almacen.leerMeta(`base:${id}`, null);

  // ---------------------------------------------------------------- conexión
  function mensajeDeError(err) {
    if (err?.codigo === BLUETOOTH_APAGADO) return 'Enciende el Bluetooth para conectar tu dije';
    return 'No se encontró tu dije. Acércalo, presiona su botón para despertarlo e inténtalo de nuevo';
  }

  async function abrirConexion(dispositivo, { sincronizarAlConectar = true } = {}) {
    const ble = blePlugin();
    await iniciarBluetooth(ble, { android: deps.android });
    let c = null;
    c = await conectarDije(ble, dispositivo.id, {
      android: deps.android,
      onDesconectado: () => alCortarse(c),
    });
    conexion = c;
    c.alAlerta(alAlertaDije);
    c.alBateria((bateria) => emitir({ bateria }));
    const [bateria, config] = await Promise.all([c.leerBateria().catch(() => null), c.leerConfig().catch(() => null)]);
    intentos = 0;
    emitir({ fase: 'conectado', dispositivo, bateria, segundosGrabacion: config?.segundosGrabacion ?? null, error: null });
    if (sincronizarAlConectar) sincronizar();
    return c;
  }

  function alCortarse(c) {
    if (!c || c._manual || conexion !== c) return; // la soltamos nosotros (o ya hay otra conexión): no es un corte
    conexion = null;
    emitir({ descarga: null, bateria: estado.bateria });
    if (activo && quiereConexion && estado.dispositivo) {
      emitir({ fase: 'reconectando' });
      programarReintento();
    } else {
      emitir({ fase: 'inactivo' });
    }
  }

  function programarReintento() {
    clearTimeout(timerReconexion);
    const espera = T.reconexionMs[Math.min(intentos, T.reconexionMs.length - 1)];
    timerReconexion = setTimeout(reconectar, espera);
  }

  async function reconectar() {
    clearTimeout(timerReconexion);
    if (!activo || !quiereConexion || !estado.dispositivo) return false;
    if (conexion) return true;
    if (conectandoAhora) return conectandoAhora;
    if (estado.fase !== 'reconectando') emitir({ fase: 'conectando' });
    conectandoAhora = (async () => {
      try {
        await abrirConexion(estado.dispositivo);
        return true;
      } catch (err) {
        intentos++;
        if (err?.codigo === BLUETOOTH_APAGADO) emitir({ error: mensajeDeError(err) });
        emitir({ fase: 'reconectando' });
        if (activo && quiereConexion) programarReintento();
        return false;
      } finally {
        conectandoAhora = null;
      }
    })();
    return conectandoAhora;
  }

  /** Suelta una conexión a propósito (no cuenta como corte: no se reconecta por ella). */
  async function soltar(c) {
    if (!c) return;
    c._manual = true;
    await c.desconectar().catch(() => {});
  }

  // ---------------------------------------------------------------- alerta
  function alAlertaDije(a) {
    if (a.evento === EVENTO.ALERTA_INICIADA) {
      atenderAlerta(a.alertaId);
    } else if (a.evento === EVENTO.CLIP_LISTO) {
      atenderAlerta(a.alertaId); // por si no llegó el aviso de inicio
      sincronizar();
    } else if (a.evento === EVENTO.GRABACION_FALLIDA) {
      avisar('El dije no pudo grabar el audio de la alerta');
    }
  }

  /**
   * Flujo de alerta (uno por alerta del dije): avisa a los contactos favoritos con la ubicación del teléfono,
   * hace vibrar el dije para confirmar y devuelve el id de la alerta en el servidor (al que se ligan los audios).
   * Si no hay internet reintenta con esperas crecientes mientras la app siga abierta.
   */
  function atenderAlerta(alertaDije) {
    const dispositivo = estado.dispositivo;
    if (!dispositivo || !activo) return Promise.resolve(null);
    const clave = `${dispositivo.id}:${alertaDije}`;
    if (alertasEnCurso.has(clave)) return alertasEnCurso.get(clave);

    const trabajo = (async () => {
      const ya = (await leerAlertas(dispositivo.id))[alertaDije];
      if (ya) return ya;
      const base = await leerBase(dispositivo.id);
      if (base !== null && alertaDije <= base) return null; // grabación anterior al emparejamiento: no es una alerta nueva

      let avisoFallo = false;
      for (let intento = 0; activo; intento++) {
        const espera = T.reintentoAlertaMs[Math.min(intento, T.reintentoAlertaMs.length - 1)];
        if (espera) await pausa(espera);
        if (!activo) break;
        try {
          const ubicacion = await deps.obtenerPosicion();
          const { enviadas, alertaId } = await api.enviarAlerta(ubicacion);
          await guardarAlerta(dispositivo.id, alertaDije, alertaId);
          emitir({ ultimaAlerta: Date.now() });
          if (enviadas === 0) {
            avisar(MENSAJE_SIN_CONTACTOS);
          } else {
            avisar(MENSAJE_ALERTA_ENVIADA);
            conexion?.vibrar(VIBRACION.CONFIRMA_ALERTA).catch(() => {}); // el dije vibra: la alerta sí salió
          }
          subirPendientes();
          return alertaId;
        } catch (err) {
          if (err?.response?.status === 401) return null; // la sesión venció: se pedirá iniciar sesión
          if (!avisoFallo) {
            avisoFallo = true;
            avisar(`No se pudo enviar la alerta: ${deps.mensajeDeError?.(err) ?? 'sin conexión'}. Se reintentará`);
          }
        }
      }
      return null;
    })();
    alertasEnCurso.set(clave, trabajo);
    trabajo.finally(() => alertasEnCurso.delete(clave));
    return trabajo;
  }

  // ---------------------------------------------------------------- audio: descarga
  function sincronizar() {
    if (sincronizando) {
      repetirSincronizacion = true;
      return sincronizando;
    }
    sincronizando = (async () => {
      try {
        do {
          repetirSincronizacion = false;
          await sincronizarUnaVez();
        } while (repetirSincronizacion && conexion);
      } catch {
        // Conexión perdida a mitad: lo descargado quedó guardado y se reanuda al reconectar
      } finally {
        sincronizando = null;
        emitir({ descarga: null, pendientesDescarga: 0 });
      }
    })();
    return sincronizando;
  }

  async function sincronizarUnaVez() {
    const c = conexion;
    const dispositivo = estado.dispositivo;
    if (!c || !dispositivo) return;
    const base = (await leerBase(dispositivo.id)) ?? 0;
    const clips = (await c.listarClips()).filter((x) => x.alertaId > base).sort((a, b) => a.clipId - b.clipId);
    emitir({ pendientesDescarga: clips.length });
    for (const clip of clips) {
      if (!c.activa) return;
      atenderAlerta(clip.alertaId); // alertas guardadas mientras no había conexión: se avisan ahora
      const ok = await descargarYGuardar(c, dispositivo, clip);
      if (!ok) return;
      emitir({ pendientesDescarga: Math.max(0, estado.pendientesDescarga - 1) });
    }
  }

  async function descargarYGuardar(c, dispositivo, clip) {
    const claveParcial = `${dispositivo.id}:${clip.clipId}:${clip.alertaId}`;
    let parcial = await almacen.leerParcial(claveParcial);
    if (!parcial || parcial.total !== clip.bytes) parcial = { total: clip.bytes, bytes: new Uint8Array(0) };

    let datos = null;
    let crc = null;
    for (let intento = 0; intento < T.intentosDescarga; intento++) {
      if (!c.activa) return false;
      const r = await c.descargarClip(clip.clipId, parcial.bytes.length, {
        onProgreso: (recibidos, total) => emitir({ descarga: { clipId: clip.clipId, avance: recibidos / total } }),
      });
      if (r.bytes.length) {
        parcial = { total: clip.bytes, bytes: unir(parcial.bytes, r.bytes) };
        await almacen.guardarParcial(claveParcial, parcial); // si se corta, se reanuda desde aquí
      }
      if (r.motivo === 'no-existe') {
        await almacen.borrarParcial(claveParcial);
        return true; // ya no está en el dije
      }
      if (r.completo) {
        if (parcial.bytes.length === r.total && crc32(parcial.bytes) === r.crc32) {
          datos = parcial.bytes;
          crc = r.crc32;
          break;
        }
        // Llegó entero pero el CRC del clip no cuadra: se descarta y se empieza de cero
        parcial = { total: clip.bytes, bytes: new Uint8Array(0) };
        await almacen.borrarParcial(claveParcial);
        continue;
      }
      if (r.motivo === 'desconectado' || !c.activa) return false;
      await pausa(T.pausaDescargaMs); // bloque dañado o sin respuesta: se reintenta desde los bytes buenos
    }
    if (!datos) return false;

    // Primero se guarda en el teléfono; SOLO entonces se le confirma al dije (que borra su copia)
    const { wav, segundos } = clipAWav(datos);
    await almacen.encolarSubida({
      clave: `${dispositivo.id}:${clip.clipId}:${clip.alertaId}:${crc.toString(16)}`,
      usuarioId: deps.usuarioId(),
      dispositivoId: dispositivo.id,
      alertaDije: clip.alertaId,
      wav,
      duracionSeg: segundos,
      creadaEn: Date.now(),
    });
    await almacen.borrarParcial(claveParcial);
    emitir({ descarga: null });
    try {
      await c.confirmarClip(clip.clipId, crc);
    } catch {
      // Si no llegó la confirmación el dije conserva el clip; la clave de subida evita duplicarlo en el servidor
    }
    subirPendientes();
    return true;
  }

  // ---------------------------------------------------------------- audio: subida
  function subirPendientes() {
    if (subiendo) {
      repetirSubida = true;
      return;
    }
    subiendo = true;
    (async () => {
      do {
        repetirSubida = false;
        await subirUnaVez().catch(() => {});
      } while (repetirSubida);
    })().finally(() => {
      subiendo = false;
    });
  }

  async function subirUnaVez() {
    const usuarioId = deps.usuarioId();
    if (!usuarioId) return;
    const items = (await almacen.listarSubidas()).filter((i) => i.usuarioId === usuarioId).sort((a, b) => a.creadaEn - b.creadaEn);
    emitir({ pendientesSubida: items.length });
    for (const item of items) {
      const alertaServidor = (await leerAlertas(item.dispositivoId))[item.alertaDije];
      if (!alertaServidor) continue; // la alerta aún no se registró en el servidor (sin internet): se reintenta
      try {
        await api.subirEvidencia({ wav: item.wav, alertaId: alertaServidor, duracionSeg: item.duracionSeg, clave: item.clave });
      } catch (err) {
        const status = err?.response?.status;
        if (status === 413) avisar(deps.mensajeDeError?.(err) ?? 'No hay espacio para más evidencias');
        if (status === 401 || status === 413) return;
        continue; // sin red u otro error: queda en la cola
      }
      await almacen.borrarSubida(item.clave);
      emitir({ pendientesSubida: Math.max(0, estado.pendientesSubida - 1) });
      avisar('El audio de tu alerta se guardó en "Mis evidencias"');
    }
  }

  // ---------------------------------------------------------------- API pública
  const servicio = {
    suscribir(f) {
      oyentes.add(f);
      return () => oyentes.delete(f);
    },
    obtenerEstado: () => estado,

    /** Hay sesión: carga el dije recordado, se reconecta solo y vacía la cola de subida. */
    async activar() {
      if (activo) return;
      activo = true;
      const recordado = deps.prefs.leer(claveRecordado());
      if (recordado) {
        emitir({ dispositivo: recordado });
        quiereConexion = true;
        intentos = 0;
        reconectar();
      }
      clearInterval(timerSubida);
      timerSubida = setInterval(subirPendientes, T.subidaCadaMs);
      subirPendientes();
    },

    /** Se cerró la sesión: se suelta el dije pero se sigue recordando. */
    async desactivar() {
      activo = false;
      quiereConexion = false;
      clearTimeout(timerReconexion);
      clearInterval(timerSubida);
      abortarBusqueda?.abort();
      const c = conexion;
      conexion = null;
      emitir({ fase: 'inactivo', bateria: null, descarga: null, dispositivo: null, encontrados: [] });
      await soltar(c);
    },

    async buscar() {
      if (estado.buscando) return;
      emitir({ buscando: true, encontrados: [], error: null });
      abortarBusqueda = new AbortController();
      try {
        const ble = blePlugin();
        await iniciarBluetooth(ble, { android: deps.android });
        await buscarDijes(ble, {
          navegador: deps.navegador && estado.modo === 'real',
          duracionMs: T.duracionBusquedaMs,
          signal: abortarBusqueda.signal,
          onEncontrado: (d) => emitir({ encontrados: [...estado.encontrados.filter((x) => x.id !== d.id), d] }),
        });
        if (estado.encontrados.length === 0) {
          emitir({ error: 'No encontramos ningún dije. Presiona su botón para despertarlo y acércalo al teléfono' });
        }
      } catch (err) {
        if (err?.name !== 'NotFoundError') emitir({ error: err?.codigo === BLUETOOTH_APAGADO ? mensajeDeError(err) : 'No se pudo buscar el dije. Revisa que el Bluetooth y la ubicación estén encendidos y que la app tenga permiso' });
      } finally {
        emitir({ buscando: false });
        abortarBusqueda = null;
      }
    },

    detenerBusqueda() {
      abortarBusqueda?.abort();
    },

    /** Conecta con el dije elegido, lo empareja y lo recuerda. Devuelve true si quedó conectado. */
    async emparejar(dispositivo) {
      servicio.detenerBusqueda();
      quiereConexion = false;
      clearTimeout(timerReconexion);
      const previa = conexion;
      conexion = null;
      await soltar(previa);
      emitir({ fase: 'conectando', error: null, dispositivo });
      try {
        const c = await abrirConexion(dispositivo, { sincronizarAlConectar: false });
        // Lo que el dije ya tenía grabado antes de emparejar no cuenta como alerta nueva
        if ((await leerBase(dispositivo.id)) === null) {
          const clips = await c.listarClips().catch(() => []);
          await almacen.guardarMeta(`base:${dispositivo.id}`, Math.max(0, ...clips.map((x) => x.alertaId)));
        }
        deps.prefs.escribir(claveRecordado(), dispositivo);
        quiereConexion = true;
        sincronizar();
        c.vibrar(VIBRACION.CORTO).catch(() => {});
        emitir({ encontrados: [] });
        return true;
      } catch (err) {
        emitir({ fase: 'inactivo', dispositivo: deps.prefs.leer(claveRecordado()), error: mensajeDeError(err) });
        return false;
      }
    },

    /** Conecta con el dije recordado (botón del corazón). */
    async conectar() {
      if (!estado.dispositivo) return false;
      quiereConexion = true;
      intentos = 0;
      emitir({ error: null });
      return reconectar();
    },

    /** Reintenta ya (p. ej. al volver a abrir la app) en vez de esperar al siguiente intento. */
    reintentarYa() {
      if (activo && quiereConexion && !conexion) {
        intentos = 0;
        reconectar();
      }
      subirPendientes();
    },

    async desconectar() {
      quiereConexion = false;
      clearTimeout(timerReconexion);
      const c = conexion;
      conexion = null;
      emitir({ fase: 'inactivo', bateria: null, descarga: null });
      await soltar(c);
    },

    /** Olvida el dije (otra vez habrá que buscarlo y emparejarlo). */
    async olvidar() {
      await servicio.desconectar();
      deps.prefs.borrar(claveRecordado());
      emitir({ dispositivo: null, error: null });
    },

    async vibrar(patron = VIBRACION.ENCONTRAR) {
      if (!conexion) return false;
      try {
        await conexion.vibrar(patron);
        return true;
      } catch {
        return false;
      }
    },

    async configurarGrabacion(segundos) {
      if (!conexion) return false;
      try {
        await conexion.escribirSegundosGrabacion(segundos);
        emitir({ segundosGrabacion: segundos });
        return true;
      } catch {
        return false;
      }
    },

    /** Cambia entre dije real y simulado (para probar sin el dije). */
    async cambiarModo(modo) {
      if (modo === estado.modo) return;
      const estabaActivo = activo;
      await servicio.desactivar();
      deps.prefs.escribir('modo', modo);
      emitir({ modo, error: null, encontrados: [] });
      if (estabaActivo) await servicio.activar();
    },

    /** Solo en modo simulado: presiona el "botón" del dije simulado. */
    simularAlerta() {
      return deps.simulador?.()?.control.simularAlerta();
    },
    simulador: () => deps.simulador?.() ?? null,

    // Para las pruebas
    _sincronizar: sincronizar,
    _subirPendientes: async () => {
      await subirUnaVez();
    },
  };
  return servicio;
}
