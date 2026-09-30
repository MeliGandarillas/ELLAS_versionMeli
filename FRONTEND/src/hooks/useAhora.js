import { useEffect, useState } from 'react';

/** Hora actual (ms) que se actualiza sola, para que los "hace X min" no se queden congelados. */
export default function useAhora(cadaMs = 30000) {
  const [ahora, setAhora] = useState(Date.now);

  useEffect(() => {
    const id = setInterval(() => setAhora(Date.now()), cadaMs);
    return () => clearInterval(id);
  }, [cadaMs]);

  return ahora;
}

/** "ahora", "hace 5 min", "hace 2 h" o "hace 3 d" a partir de una fecha ISO. */
export function haceCuanto(fechaIso, ahora) {
  const t = Date.parse(fechaIso);
  if (Number.isNaN(t)) return '';
  const min = Math.floor((ahora - t) / 60000);
  if (min < 1) return 'ahora';
  if (min < 60) return `hace ${min} min`;
  const horas = Math.floor(min / 60);
  if (horas < 24) return `hace ${horas} h`;
  return `hace ${Math.floor(horas / 24)} d`;
}
