import React from 'react';

// Vista del calendario menstrual
export default function CalendarioMenstrual({ onVolver }) {
  return (
    <div className="page-panel">
      <h2 className="page-title">Calendario Menstrual</h2>

      {/* Aquí va el contenido del calendario */}
      <div className="page-placeholder">
        <span>[ Calendario ]</span>
      </div>

      {/* Botón para regresar a la vista principal */}
      <button className="back-btn" onClick={onVolver}>
        ← Volver
      </button>
    </div>
  );
}
