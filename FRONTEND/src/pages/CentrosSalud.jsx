import { useState } from 'react';
import './CentrosSalud.css';
import iconDocss from '../assets/docss.png';

function CentrosSalud({ onVolver }) {
  const [medicoSeleccionado, setMedicoSeleccionado] = useState(null);

  const medicos = [
    { id: 1, nombre: "Dra. Ana García", especialidad: "Ginecología & Obstetricia", ubicación: "Centro Médico ABC, Santa Fe" },
    { id: 2, nombre: "Dr. Carlos López", especialidad: "Psicología & Salud Mental Femenina", ubicación: "Edificio Médica Sur, Nivel 3" },
    { id: 3, nombre: "Dra. Sofía Rodríguez", especialidad: "Nutrición & Bienestar Integral", ubicación: "Clínica Vida, Lomas de Chapultepec" },
    { id: 4, nombre: "Dra. Laura Morales", especialidad: "Dermatología Estética & Funcional", ubicación: "Polanco, CDMX" }
  ];

  const handleAgendar = (e) => {
    e.preventDefault();
    alert(`¡Cita agendada con éxito con ${medicoSeleccionado.nombre}!`);
    setMedicoSeleccionado(null);
  };

  return (
    <div className="page pagina-salud fade-in">
      <button className="back-button" onClick={onVolver}>← Volver al inicio</button>
      <h2>Centros de Salud</h2>
      <p className="subtitle">Encuentra médicos especialistas privados.</p>
      
      <div className="list-container">
        {medicos.map(medico => (
          <div key={medico.id} className="doctor-card">
            
            <div className="doctor-icon">
              {/* 2. Reemplazamos el emoji por la etiqueta de tu imagen */}
              <img src={iconDocss} alt="Icono Doctor" className="custom-icon-img" />
            </div>

            <div className="doctor-info">
              <h3>{medico.nombre}</h3>
              <p className="especialidad">{medico.especialidad}</p>
              <p className="ubicacion">{medico.ubicación}</p>
              <button 
                className="contact-btn"
                onClick={() => setMedicoSeleccionado(medico)}
              >
                Agendar Cita
              </button>
            </div>
          </div>
        ))}
      </div>

      {medicoSeleccionado && (
        <div className="modal-overlay" onClick={() => setMedicoSeleccionado(null)}>
          <div className="modal-content" onClick={e => e.stopPropagation()}>
            <h3>Agendar Cita</h3>
            <p className="modal-subtitle">
              Consultorio de <strong>{medicoSeleccionado.nombre}</strong>
            </p>
            
            <form onSubmit={handleAgendar} className="fertility-form">
              <label>
                Fecha preferida:
                <input type="date" required />
              </label>
              
              <label>
                Horario:
                <select required defaultValue="">
                  <option value="" disabled>Selecciona un horario</option>
                  <option value="manana">Mañana (9:00 AM - 12:00 PM)</option>
                  <option value="tarde">Tarde (1:00 PM - 5:00 PM)</option>
                </select>
              </label>
              
              <div className="modal-actions">
                <button type="button" className="cancel-btn" onClick={() => setMedicoSeleccionado(null)}>
                  Cancelar
                </button>
                <button type="submit" className="submit-btn">
                  Confirmar
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

export default CentrosSalud;