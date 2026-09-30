import { useEffect, useState } from 'react';
import './SaludReproductiva.css';

// Base de datos simulada (agregué algunos para que veas cómo se ven en el calendario)
const REGISTROS_EJEMPLO = [
  { id: 1, fecha: '2026-09-15', sintomas: ['Dolor de cabeza'], flujo: 'Transparente / Blanco' },
  { id: 2, fecha: '2026-09-25', sintomas: ['Dolor abdominal / Cólicos', 'Náuseas / Mareos'], flujo: 'Sanguinolento (Rosa/Rojo)' },
  { id: 3, fecha: '2026-09-26', sintomas: [], flujo: 'Amarillento / Verdoso' }
];

// Fecha de hoy en formato YYYY-MM-DD (hora local)
const hoy = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

// Los registros se guardan en el navegador (por usuaria) para que no se pierdan al salir de la página
function leerRegistros(clave) {
  try {
    const guardados = JSON.parse(localStorage.getItem(clave));
    if (Array.isArray(guardados)) return guardados;
  } catch {
    // Si no se puede leer, se usan los de ejemplo
  }
  return REGISTROS_EJEMPLO;
}

function SaludReproductiva({ usuarioId, onVolver }) {
  const claveRegistros = `ellas.registros.${usuarioId ?? 'anonima'}`;
  const [vista, setVista] = useState('formulario');

  const [registros, setRegistros] = useState(() => leerRegistros(claveRegistros));

  useEffect(() => {
    try {
      localStorage.setItem(claveRegistros, JSON.stringify(registros));
    } catch {
      // Sin almacenamiento disponible: los registros solo duran mientras la página está abierta
    }
  }, [claveRegistros, registros]);

  const [fecha, setFecha] = useState('');
  const [sintomasSeleccionados, setSintomasSeleccionados] = useState([]);
  const [flujo, setFlujo] = useState('');
  const [resultadoAnalisis, setResultadoAnalisis] = useState(null);

  // Estados nuevos para el calendario interactivo
  const [fechaCalendario, setFechaCalendario] = useState(new Date());
  const [registroDetalle, setRegistroDetalle] = useState(null);

  const listaSintomas = [
    "Dolor abdominal / Cólicos",
    "Dolor de cabeza",
    "Náuseas / Mareos",
    "Anomalía / Bolita detectada en senos",
    "Sangrado anormal fuera del ciclo"
  ];

  const toggleSintoma = (sintoma) => {
    if (sintomasSeleccionados.includes(sintoma)) {
      setSintomasSeleccionados(sintomasSeleccionados.filter(s => s !== sintoma));
    } else {
      setSintomasSeleccionados([...sintomasSeleccionados, sintoma]);
    }
  };

  const analizarDatos = (e) => {
    e.preventDefault();
    let alertas = [];

    if (sintomasSeleccionados.includes("Anomalía / Bolita detectada en senos")) {
      alertas.push("🎗️ Prevención de Cáncer de Mama: Has registrado una anomalía. La autoexploración y mastografía son vitales. Te sugerimos agendar revisión.");
    }
    if (flujo === "Amarillento / Verdoso" || flujo === "Grisáceo") {
      alertas.push("🦠 Alerta de Flujo: Puede ser indicador de infección. Mantén buena higiene y considera una revisión.");
    }
    if (sintomasSeleccionados.includes("Sangrado anormal fuera del ciclo")) {
      alertas.push("🩸 Sangrado Inusual: Un sangrado fuera de tu periodo habitual debe ser monitoreado de cerca.");
    }
    if (alertas.length === 0) {
      alertas.push("✨ Monitoreo Normal: No hay alertas graves registradas hoy. ¡Sigue cuidándote!");
    }

    setResultadoAnalisis(alertas);
  };

  const cerrarModalYGuardar = () => {
    const nuevoRegistro = {
      id: Date.now(),
      fecha: fecha,
      sintomas: [...sintomasSeleccionados],
      flujo: flujo
    };
    
    // Si ya había un registro ese día, se reemplaza (el calendario muestra uno por día)
    setRegistros([...registros.filter(r => r.fecha !== fecha), nuevoRegistro]);
    
    setFecha('');
    setSintomasSeleccionados([]);
    setFlujo('');
    setResultadoAnalisis(null);
    setVista('calendario');
  };

  // ==========================================
  // FUNCIONES DEL CALENDARIO
  // ==========================================
  const diasDelMes = new Date(fechaCalendario.getFullYear(), fechaCalendario.getMonth() + 1, 0).getDate();
  const primerDiaMes = new Date(fechaCalendario.getFullYear(), fechaCalendario.getMonth(), 1).getDay();
  
  const nombresMeses = ["Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"];
  const diasSemana = ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"];

  const generarDias = () => {
    let dias = [];
    // Espacios en blanco para alinear el primer día
    for (let i = 0; i < primerDiaMes; i++) {
      dias.push(<div key={`empty-${i}`} className="cal-day empty"></div>);
    }
    
    // Días reales del mes
    for (let d = 1; d <= diasDelMes; d++) {
      // Formateamos la fecha para compararla con la base de datos (YYYY-MM-DD)
      const mesFormat = String(fechaCalendario.getMonth() + 1).padStart(2, '0');
      const diaFormat = String(d).padStart(2, '0');
      const fechaCompleta = `${fechaCalendario.getFullYear()}-${mesFormat}-${diaFormat}`;
      
      // Buscamos si hay un registro este día
      const registroDelDia = registros.find(r => r.fecha === fechaCompleta);
      const tieneRegistro = !!registroDelDia;
      const esSeleccionado = registroDetalle && registroDetalle.fecha === fechaCompleta;

      dias.push(
        <div 
          key={d} 
          className={`cal-day ${tieneRegistro ? 'has-record' : ''} ${esSeleccionado ? 'selected' : ''}`}
          onClick={() => {
            if(tieneRegistro) setRegistroDetalle(registroDelDia);
            else setRegistroDetalle(null);
          }}
        >
          {d}
          {tieneRegistro && <div className="record-dot"></div>}
        </div>
      );
    }
    return dias;
  };

  const cambiarMes = (direccion) => {
    setFechaCalendario(new Date(fechaCalendario.getFullYear(), fechaCalendario.getMonth() + direccion, 1));
    setRegistroDetalle(null); // Limpiar detalle al cambiar de mes
  };

  return (
    <div className="page pagina-salud-reproductiva fade-in">
      <button className="back-button" onClick={onVolver}>← Volver al inicio</button>
      
      <h2>{vista === 'formulario' ? 'Monitoreo de Ciclo' : 'Mi Historial Médico'}</h2>
      <p className="subtitle">
        {vista === 'formulario' 
          ? 'Lleva un registro diario y prevén complicaciones.' 
          : 'Selecciona un día marcado para ver tus síntomas.'}
      </p>

      {/* VISTA 1: FORMULARIO */}
      {vista === 'formulario' && (
        <form onSubmit={analizarDatos} className="fertility-form-page fade-in">
          <div className="form-group">
            <label>Fecha del registro:</label>
            <input type="date" required value={fecha} onChange={(e) => setFecha(e.target.value)} />
          </div>

          <div className="form-group">
            <label>Síntomas actuales:</label>
            <div className="sintomas-grid">
              {listaSintomas.map((sintoma, index) => (
                <button
                  key={index} type="button"
                  className={`sintoma-btn ${sintomasSeleccionados.includes(sintoma) ? 'seleccionado' : ''}`}
                  onClick={() => toggleSintoma(sintoma)}
                >
                  {sintoma}
                </button>
              ))}
            </div>
          </div>

          <div className="form-group">
            <label>Color de flujo:</label>
            <select required value={flujo} onChange={(e) => setFlujo(e.target.value)}>
              <option value="" disabled>Selecciona un color...</option>
              <option value="Transparente / Blanco">Transparente / Blanco (Normal)</option>
              <option value="Amarillento / Verdoso">Amarillento / Verdoso</option>
              <option value="Grisáceo">Grisáceo</option>
              <option value="Sanguinolento (Rosa/Rojo)">Sanguinolento (Rosa/Rojo)</option>
            </select>
          </div>

          <div className="acciones-form">
            <button type="button" className="cancel-form-btn" onClick={() => setVista('calendario')}>Ver Calendario</button>
            <button type="submit" className="save-btn">Guardar y Analizar</button>
          </div>
        </form>
      )}

      {/* VISTA 2: CALENDARIO INTERACTIVO */}
      {vista === 'calendario' && (
        <div className="calendario-view fade-in">
          <button className="add-record-btn" onClick={() => { setRegistroDetalle(null); setFecha(hoy()); setVista('formulario'); }}>
            ➕ Agregar registro de hoy
          </button>
          
          <div className="calendar-container">
            <div className="calendar-header">
              <button onClick={() => cambiarMes(-1)}>◀</button>
              <h3>{nombresMeses[fechaCalendario.getMonth()]} {fechaCalendario.getFullYear()}</h3>
              <button onClick={() => cambiarMes(1)}>▶</button>
            </div>
            
            <div className="calendar-weekdays">
              {diasSemana.map(dia => <div key={dia}>{dia}</div>)}
            </div>
            
            <div className="calendar-grid">
              {generarDias()}
            </div>
          </div>

          {/* DETALLE DEL DÍA SELECCIONADO */}
          {registroDetalle && (
            <div className="registro-card fade-in">
              <div className="registro-fecha">Registro del: {registroDetalle.fecha}</div>
              <div className="registro-detalle">
                <strong>Flujo:</strong> <span className="flujo-badge">{registroDetalle.flujo}</span>
              </div>
              <div className="registro-detalle">
                <strong>Síntomas:</strong>
                {registroDetalle.sintomas.length > 0 ? (
                  <ul className="sintomas-lista-mini">
                    {registroDetalle.sintomas.map((s, i) => <li key={i}>• {s}</li>)}
                  </ul>
                ) : (
                  <span> Ninguno registrado</span>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {/* MODAL DE RESULTADOS (Se mantiene igual) */}
      {resultadoAnalisis && (
        <div className="modal-overlay">
          <div className="modal-content informativo">
            <h3>Resultado del Monitoreo</h3>
            <div className="alertas-container">
              {resultadoAnalisis.map((alerta, index) => <p key={index} className="alerta-item">{alerta}</p>)}
            </div>
            <div className="escalamiento-info">
              <p><strong>🩺 Aviso Importante:</strong> Esta información es preventiva. Muy pronto conectaremos estos reportes con doctores especialistas de <b>ELLA</b>.</p>
            </div>
            <button className="close-modal-btn" onClick={cerrarModalYGuardar}>
              Guardar en Calendario
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export default SaludReproductiva;