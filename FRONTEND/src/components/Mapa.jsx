import React, { useEffect, useRef } from 'react';
import { MapContainer, TileLayer, CircleMarker, Tooltip, useMap } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';

// Si todavía no hay ninguna ubicación, el mapa se centra en la Ciudad de México
const CENTRO_POR_DEFECTO = [19.4326, -99.1332];

// Centra el mapa en tu ubicación la primera vez que se obtiene (sin animación: si la usuaria
// cambia de pantalla a media animación, Leaflet falla con "_leaflet_pos").
// Si no compartes la tuya, lo ajusta para que se vean las amigas cuando aparecen.
// Cuando se conecta el dije o llega la alerta de una amiga, el mapa se centra ahí.
function AjustarVista({ miPosicion, amigas, dije, alerta }) {
  const map = useMap();
  const centradoEnMi = useRef(false);
  const amigasVistas = useRef(0);
  const centradoEnDije = useRef(false);

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

  useEffect(() => {
    if (dije && !centradoEnDije.current) map.setView([dije.lat, dije.lng], 16, { animate: false });
    centradoEnDije.current = Boolean(dije);
  }, [map, dije]);

  useEffect(() => {
    if (alerta?.lat != null) map.setView([alerta.lat, alerta.lng], 16, { animate: false });
  }, [map, alerta]);

  return null;
}

export default function Mapa({ amigas, miPosicion, dije, alerta }) {
  // Si la amiga en alerta no comparte su ubicación, se marca donde estaba al enviar la alerta
  const alertaSinAmiga = alerta?.lat != null && !amigas.some((a) => a.usuarioId === alerta.usuarioId);

  const centro = miPosicion
    ? [miPosicion.lat, miPosicion.lng]
    : amigas[0] ? [amigas[0].lat, amigas[0].lng] : CENTRO_POR_DEFECTO;

  return (
    <MapContainer center={centro} zoom={13} className="mapa">
      <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>' />
      <AjustarVista miPosicion={miPosicion} amigas={amigas} dije={dije} alerta={alerta} />

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

      {/* Dije conectado por Bluetooth: punto negro más grande */}
      {dije && (
        <CircleMarker
          center={[dije.lat, dije.lng]}
          radius={14}
          pathOptions={{ color: '#000000', fillColor: '#000000', fillOpacity: 1 }}
        >
          <Tooltip permanent direction="bottom" offset={[0, 14]}>Tu dije</Tooltip>
        </CircleMarker>
      )}

      {/* Amigas que comparten su ubicación (en rojo la que envió una alerta) */}
      {amigas.map((a) => {
        const enAlerta = a.usuarioId === alerta?.usuarioId;
        return (
          <CircleMarker
            key={a.usuarioId}
            center={[a.lat, a.lng]}
            radius={enAlerta ? 11 : 8}
            pathOptions={{ color: '#58213e', fillColor: enAlerta ? '#d32f2f' : '#c8a3b5', fillOpacity: 1 }}
          >
            <Tooltip permanent direction="top" offset={[0, -8]}>{a.nombre}</Tooltip>
          </CircleMarker>
        );
      })}

      {alertaSinAmiga && (
        <CircleMarker
          center={[alerta.lat, alerta.lng]}
          radius={11}
          pathOptions={{ color: '#58213e', fillColor: '#d32f2f', fillOpacity: 1 }}
        >
          <Tooltip permanent direction="top" offset={[0, -8]}>{alerta.nombre}</Tooltip>
        </CircleMarker>
      )}
    </MapContainer>
  );
}
