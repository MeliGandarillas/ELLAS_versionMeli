import React from 'react';
import { Bluetooth, BatteryMedium, Mic } from 'lucide-react';

const DURACIONES = [30, 60, 120, 180, 300];

const ETIQUETA_FASE = {
  conectado: 'Conectado',
  conectando: 'Conectando…',
  reconectando: 'Buscando tu dije…',
  inactivo: 'Desconectado',
};

// Pantalla "Mi dije": buscar, emparejar, recordar y administrar el dije
export default function Dije({ dije, onVolver, onVerEvidencias }) {
  const simulado = dije.modo === 'simulado';
  const ocupado = dije.buscando || dije.conectando;

  return (
    <div className="friends-panel">
      <h2 className="friends-title">Mi dije</h2>

      {!dije.hayBluetooth && !simulado && (
        <p className="aviso aviso-error">
          Este navegador no permite Bluetooth. Usa la app de Android, o Chrome/Edge con https, o activa el modo de prueba.
        </p>
      )}

      {/* Estado del dije recordado */}
      {dije.recordado ? (
        <div className="dije-card">
          <div className="dije-card-fila">
            <Bluetooth className={`dije-icono ${dije.conectado ? 'on' : ''}`} />
            <div className="dije-card-info">
              <strong>{dije.dispositivo.nombre}</strong>
              <span>{ETIQUETA_FASE[dije.fase]}</span>
            </div>
            {dije.conectado && dije.bateria && (
              <span className="dije-bateria" title="Batería del dije">
                <BatteryMedium size={18} /> {dije.bateria.porcentaje}%
              </span>
            )}
          </div>
          {dije.conectado && dije.bateria && (
            <div className="dije-barra" aria-hidden="true">
              <div className={`dije-barra-nivel ${dije.bateria.porcentaje <= 20 ? 'baja' : ''}`} style={{ width: `${dije.bateria.porcentaje}%` }} />
            </div>
          )}
          {dije.descarga && (
            <p className="aviso aviso-ok">
              <Mic size={14} /> Descargando el audio de tu alerta… {Math.round(dije.descarga.avance * 100)}%
            </p>
          )}
          {dije.pendientesSubida > 0 && !dije.descarga && (
            <p className="aviso aviso-ok">
              {dije.pendientesSubida} audio(s) esperando para subirse (se suben solos cuando hay internet)
            </p>
          )}
          {dije.reconectando && (
            <p className="aviso">Se reconecta solo. Si no aparece, presiona su botón para despertarlo.</p>
          )}

          <div className="dije-botones">
            {dije.conectado ? (
              <>
                <button className="primary-btn" onClick={dije.vibrar}>Hacer vibrar</button>
                <button className="primary-btn" onClick={dije.desconectar}>Desconectar</button>
              </>
            ) : (
              <button className="primary-btn" onClick={dije.conectar} disabled={dije.conectando}>
                {dije.conectando ? 'Conectando…' : 'Conectar ahora'}
              </button>
            )}
            <button className="link-btn" onClick={dije.olvidar}>Olvidar dije</button>
          </div>

          {dije.conectado && (
            <label className="dije-campo">
              Duración de cada grabación
              <select
                value={dije.segundosGrabacion ?? 60}
                onChange={(e) => dije.configurarGrabacion(Number(e.target.value))}
              >
                {[...new Set([...DURACIONES, dije.segundosGrabacion ?? 60])].sort((a, b) => a - b).map((s) => (
                  <option key={s} value={s}>{s % 60 === 0 ? `${s / 60} min` : `${s} s`}</option>
                ))}
              </select>
            </label>
          )}
        </div>
      ) : (
        <p className="friends-empty">Todavía no tienes un dije emparejado.</p>
      )}

      {/* Buscar y emparejar */}
      <h3 className="friends-subtitle">{dije.recordado ? 'Emparejar otro dije' : 'Buscar mi dije'}</h3>
      <button className="primary-btn" onClick={dije.buscar} disabled={ocupado || (!dije.hayBluetooth && !simulado)}>
        {dije.buscando ? 'Buscando…' : 'Buscar dije cercano'}
      </button>
      <p className="friends-empty">Presiona el botón del dije para despertarlo y acércalo al teléfono.</p>
      {dije.encontrados.map((d) => (
        <div key={d.id} className="friend-item">
          <div className="friend-info">
            <span className="friend-name">{d.nombre}</span>
            {d.rssi != null && <span className="friend-tag">Señal {d.rssi} dBm</span>}
          </div>
          <button className="friend-action" onClick={() => dije.emparejar(d)} disabled={ocupado} title="Emparejar">
            Emparejar
          </button>
        </div>
      ))}
      {dije.error && <p className="aviso aviso-error">{dije.error}</p>}

      <p className="friends-empty">
        Para enviar una alerta, mantén presionado el botón del dije unos 2 segundos. Vibrará, avisará a tus contactos de
        emergencia y grabará audio. Si cambias de teléfono, mantén el botón del dije presionado 8 segundos al encenderlo.
      </p>

      <button className="primary-btn" onClick={onVerEvidencias}>Mis evidencias</button>

      {/* Pruebas sin el dije */}
      <details className="dije-avanzado">
        <summary>Modo de prueba (sin dije)</summary>
        <label className="dije-campo dije-check">
          <input type="checkbox" checked={simulado} onChange={(e) => dije.cambiarModo(e.target.checked ? 'simulado' : 'real')} />
          Usar un dije simulado
        </label>
        {simulado && (
          <>
            <p className="friends-empty">
              Busca y empareja el “ELLAS-Dije” simulado. Con “Presionar el botón” se dispara una alerta real a tus
              contactos con un audio de prueba.
            </p>
            <button className="primary-btn" onClick={dije.simularAlerta} disabled={!dije.conectado}>
              Presionar el botón del dije simulado
            </button>
          </>
        )}
      </details>

      <button className="back-btn" onClick={onVolver}>← Volver</button>
    </div>
  );
}
