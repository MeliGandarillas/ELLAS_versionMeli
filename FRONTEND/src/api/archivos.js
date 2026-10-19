import { Capacitor } from '@capacitor/core';

const aBase64 = (blob) =>
  new Promise((resolver, rechazar) => {
    const lector = new FileReader();
    lector.onload = () => resolver(String(lector.result).split(',')[1]);
    lector.onerror = () => rechazar(lector.error);
    lector.readAsDataURL(blob);
  });

/**
 * Entrega un archivo a la usuaria. En la APK abre el menú "Compartir" de Android (guardar en el teléfono,
 * enviar por correo o WhatsApp, etc.) porque el WebView no descarga archivos; en el navegador lo descarga.
 * Devuelve false si la usuaria cerró el menú sin elegir nada.
 */
export async function guardarArchivo(blob, nombre) {
  if (Capacitor.isNativePlatform()) {
    const { Filesystem, Directory } = await import('@capacitor/filesystem');
    const { Share } = await import('@capacitor/share');
    const { uri } = await Filesystem.writeFile({ path: nombre, data: await aBase64(blob), directory: Directory.Cache });
    try {
      await Share.share({ title: nombre, files: [uri], dialogTitle: 'Guardar o enviar la evidencia' });
      return true;
    } catch (err) {
      if (/cancel/i.test(String(err?.message))) return false;
      throw err;
    } finally {
      Filesystem.deleteFile({ path: nombre, directory: Directory.Cache }).catch(() => {});
    }
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = nombre;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
  return true;
}
