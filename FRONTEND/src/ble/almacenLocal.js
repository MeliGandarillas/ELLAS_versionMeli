// Almacenamiento local de la app para el dije (IndexedDB; en memoria si el navegador no lo permite):
//  - parciales: bytes ya descargados de un clip, para reanudar si se corta (aun si se cierra la app)
//  - subidas:   WAV listos que faltan por subir al servidor (el clip ya se borró del dije)
//  - meta:      alertas del dije ya atendidas, dije recordado, etc.
const BD = 'ellas-dije';
const TIENDAS = ['parciales', 'subidas', 'meta'];

function abrirIdb() {
  return new Promise((resolver, rechazar) => {
    if (typeof indexedDB === 'undefined') return rechazar(new Error('sin IndexedDB'));
    const req = indexedDB.open(BD, 1);
    req.onupgradeneeded = () => TIENDAS.forEach((t) => req.result.createObjectStore(t));
    req.onsuccess = () => resolver(req.result);
    req.onerror = () => rechazar(req.error);
  });
}

function crearTiendaIdb(db, nombre) {
  const pedir = (modo, f) =>
    new Promise((resolver, rechazar) => {
      const tx = db.transaction(nombre, modo);
      const req = f(tx.objectStore(nombre));
      tx.oncomplete = () => resolver(req?.result);
      tx.onerror = () => rechazar(tx.error);
      tx.onabort = () => rechazar(tx.error);
    });
  return {
    leer: (k) => pedir('readonly', (s) => s.get(k)),
    guardar: (k, v) => pedir('readwrite', (s) => s.put(v, k)),
    borrar: (k) => pedir('readwrite', (s) => s.delete(k)),
    todo: () =>
      pedir('readonly', (s) => s.getAllKeys()).then(async (claves) => {
        const out = [];
        for (const k of claves) out.push([k, await pedir('readonly', (s) => s.get(k))]);
        return out;
      }),
  };
}

function crearTiendaMemoria() {
  const m = new Map();
  return {
    leer: async (k) => m.get(k),
    guardar: async (k, v) => void m.set(k, v),
    borrar: async (k) => void m.delete(k),
    todo: async () => [...m.entries()],
  };
}

/** Crea el almacén. `memoria: true` fuerza el modo en memoria (pruebas). */
export function crearAlmacenLocal({ memoria = false } = {}) {
  let listo = null;
  const tiendas = {};
  const iniciar = () =>
    (listo ??= (async () => {
      let db = null;
      if (!memoria) db = await abrirIdb().catch(() => null);
      for (const t of TIENDAS) tiendas[t] = db ? crearTiendaIdb(db, t) : crearTiendaMemoria();
    })());
  const t = async (nombre) => (await iniciar(), tiendas[nombre]);

  return {
    // -- descargas parciales
    async leerParcial(clave) { return (await t('parciales')).leer(clave); },
    async guardarParcial(clave, parcial) { return (await t('parciales')).guardar(clave, parcial); },
    async borrarParcial(clave) { return (await t('parciales')).borrar(clave); },

    // -- cola de subida
    async encolarSubida(item) { return (await t('subidas')).guardar(item.clave, item); },
    async listarSubidas() { return (await (await t('subidas')).todo()).map(([, v]) => v); },
    async borrarSubida(clave) { return (await t('subidas')).borrar(clave); },
    async actualizarSubida(item) { return (await t('subidas')).guardar(item.clave, item); },

    // -- metadatos
    async leerMeta(clave, porDefecto = null) { return (await (await t('meta')).leer(clave)) ?? porDefecto; },
    async guardarMeta(clave, valor) { return (await t('meta')).guardar(clave, valor); },
    async borrarMeta(clave) { return (await t('meta')).borrar(clave); },
  };
}
