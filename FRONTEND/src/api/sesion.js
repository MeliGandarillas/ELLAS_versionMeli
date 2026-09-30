// Guarda en el navegador la sesión de la usuaria actual: sus datos y su token (JWT).
const CLAVE = 'ellas.usuario';

export function leerUsuario() {
  try {
    const usuario = JSON.parse(localStorage.getItem(CLAVE));
    // Las sesiones antiguas (sin token) ya no sirven: se pide iniciar sesión otra vez
    return usuario?.id && usuario?.nombre && usuario?.token ? usuario : null;
  } catch {
    return null;
  }
}

export function guardarUsuario(usuario) {
  localStorage.setItem(CLAVE, JSON.stringify(usuario));
}

export function borrarUsuario() {
  localStorage.removeItem(CLAVE);
}
