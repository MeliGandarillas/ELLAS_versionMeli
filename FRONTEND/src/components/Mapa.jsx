import React, { useEffect, useRef } from 'react';
import { MapContainer, TileLayer, CircleMarker, Tooltip, useMap } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';

// Si todavía no hay ninguna ubicación, el mapa se centra en la Ciudad de México
const CENTRO_POR_DEFECTO = [19.4326, -99.1332];

// Centra el mapa en tu ubicación la primera vez que se obtiene (sin animación: si la usuaria
// cambia de pantalla a media animación, Leaflet falla con "_leaflet_pos").
// Si no compartes la tuya, lo ajusta para que se vean las amigas cuando aparecen.
function AjustarVista({ miPosicion, amigas }) {
  const map = useMap();
  const centradoEnMi = useRef(false);
  const amigasVistas = useRef(0);

  useEffect(() => {
    if (miPosicion && !centradoEnMi.current) {
      map.setView([miPosicion.lat, miPosicion.lng], 15, { animate: false });
      centradoEnMi.current = true;
    }
  }, [map, miPosicion]);

  useEffect(() => {
    if (!centradoEnMi.current && amigas.length > amigasVistas.current) {
      map.fitBounds(amigas.map((a) => [a.lat, a.lng]), { padding: [30, 30], maxZoom: 15, animate: false });
    }
    amigasVistas.current = amigas.length;
  }, [map, amigas]);

  return null;
}

export default function Mapa({ amigas, miPosicion }) {
  const centro = miPosicion
    ? [miPosicion.lat, miPosicion.lng]
    : amigas[0] ? [amigas[0].lat, amigas[0].lng] : CENTRO_POR_DEFECTO;

  return (
    <MapContainer center={centro} zoom={13} className="mapa" attributionControl={false}>
      <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
      <AjustarVista miPosicion={miPosicion} amigas={amigas} />

      {/* Ubicación propia */}
      {miPosicion && (
        <CircleMarker
          center={[miPosicion.lat, miPosicion.lng]}
          radius={9}
          pathOptions={{ color: '#58213e', fillColor: '#8a3a62', fillOpacity: 1 }}
        >
          <Tooltip>Tú</Tooltip>
        </CircleMarker>
      )}

      {/* Amigas que comparten su ubicación */}
      {amigas.map((a) => (
        <CircleMarker
          key={a.usuarioId}
          center={[a.lat, a.lng]}
          radius={8}
          pathOptions={{ color: '#58213e', fillColor: '#c8a3b5', fillOpacity: 1 }}
        >
          <Tooltip permanent direction="top" offset={[0, -8]}>{a.nombre}</Tooltip>
        </CircleMarker>
      ))}
    </MapContainer>
  );
}
