import React, { useState } from 'react';
import { registrar, iniciarSesion, mensajeDeError } from '../api/cliente.js';
import logo from '../assets/Logo.png';

// Pantalla de entrada: iniciar sesión (nombre + contraseña) o crear cuenta.
// Se muestra mientras no haya una usuaria guardada.
export default function Registro({ onEntrar }) {
  const [modo, setModo] = useState('login'); // 'login' | 'registro'
  const [nombre, setNombre] = useState('');
  const [correo, setCorreo] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState(null);
  const [enviando, setEnviando] = useState(false);

  const esLogin = modo === 'login';

  const cambiarModo = () => {
    setModo(esLogin ? 'registro' : 'login');
    setError(null);
  };

  const enviar = async (e) => {
    e.preventDefault();
    setError(null);
    setEnviando(true);
    try {
      const usuario = esLogin
        ? await iniciarSesion(nombre, password)
        : await registrar(nombre, correo, password);
      onEntrar(usuario);
    } catch (err) {
      setError(mensajeDeError(err));
    } finally {
      setEnviando(false);
    }
  };

  return (
    <div className="page-panel">
      <div className="header-logo registro-logo">
        <img src={logo} alt="Ellas" />
      </div>

      <form className="form" onSubmit={enviar}>
        <h2 className="page-title">{esLogin ? 'Iniciar sesión' : 'Crear cuenta'}</h2>
        <input className="input" placeholder="Nombre" value={nombre} autoComplete="username"
               onChange={(e) => setNombre(e.target.value)} required />
        {!esLogin && (
          <input className="input" type="email" placeholder="Correo" value={correo} autoComplete="email"
                 onChange={(e) => setCorreo(e.target.value)} required />
        )}
        <input className="input" type="password" value={password}
               placeholder={esLogin ? 'Contraseña' : 'Contraseña (mínimo 8)'}
               autoComplete={esLogin ? 'current-password' : 'new-password'}
               onChange={(e) => setPassword(e.target.value)} minLength={esLogin ? undefined : 8} required />
        {error && <p className="form-error">{error}</p>}
        <button className="primary-btn" disabled={enviando}>
          {enviando
            ? (esLogin ? 'Entrando…' : 'Creando…')
            : (esLogin ? 'Entrar' : 'Crear cuenta')}
        </button>
      </form>

      <div className="form-secundario">
        <span>{esLogin ? '¿Todavía no tienes cuenta?' : '¿Ya tienes cuenta?'}</span>
        <button type="button" className="small-btn" onClick={cambiarModo}>
          {esLogin ? 'Crear cuenta' : 'Iniciar sesión'}
        </button>
      </div>
    </div>
  );
}
