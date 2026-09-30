import { useState } from 'react';
import { MapContainer, TileLayer, Marker, Popup } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';
import markerIcon from 'leaflet/dist/images/marker-icon.png';
import markerIcon2x from 'leaflet/dist/images/marker-icon-2x.png';
import markerShadow from 'leaflet/dist/images/marker-shadow.png';
import './CentrosApoyo.css';
import iconoRefugio from '../assets/refugio.png';
import iconoGuarderia from '../assets/guarderia.png';
import iconoCasa from '../assets/casa.emer.png';
import iconDocss from '../assets/docss.png';

// Solución para iconos del mapa (se usan las imágenes que trae Leaflet, sin depender de otro CDN)
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: markerIcon2x,
  iconUrl: markerIcon,
  shadowUrl: markerShadow,
});

/* =========================================
   DATOS REALES CDMX
   ========================================= */
const refugiosData = [
  {
    id: 'r1',
    titulo: 'Centro de Justicia para las Mujeres – Azcapotzalco',
    texto: 'Espacio de la Fiscalía CDMX que atiende a mujeres, niñas y niños (hasta 12 años) víctimas de violencia familiar y de género. Servicio gratuito.',
    direccion: 'Av. San Pablo Xalpa 396, Col. San Martín Xochinahuac, Azcapotzalco',
    telefono: '55 5346 8394',
    horario: 'Atención 24/7',
    servicios: ['Asesoría jurídica', 'Atención psicológica', 'Trabajo social', 'Asesoría médica', 'Medidas de protección'],
    lat: 19.4965,
    lng: -99.1905,
  },
  {
    id: 'r2',
    titulo: 'Centro de Justicia para las Mujeres – Tlalpan',
    texto: 'Atención integral y gratuita a mujeres en situación de violencia. Cuenta con Ministerio Público y área lúdica para hijas e hijos.',
    direccion: 'Calle San Luis de la Paz 43, Tlalpan',
    telefono: '55 5658 1111',
    telefonoLabel: 'Línea Mujeres',
    horario: 'Atención 24/7',
    servicios: ['Ministerio Público', 'Asesoría jurídica', 'Atención psicológica', 'Área lúdica infantil', 'Empoderamiento'],
    lat: 19.2905,
    lng: -99.1685,
  },
  {
    id: 'r3',
    titulo: 'Red Nacional de Refugios A.C.',
    texto: 'Rescate y protección a mujeres, sus hijas e hijos en situación de violencia. Por seguridad, la ubicación de los refugios no es pública: te canalizan por teléfono.',
    direccion: 'Ubicación confidencial (atención telefónica)',
    telefono: '800 822 4460',
    horario: 'Atención 24/7, los 365 días',
    servicios: ['Línea de rescate', 'Refugio de alta seguridad', 'Trabajo social', 'Asesoría legal'],
  },
  {
    id: 'r4',
    titulo: 'Línea Mujeres (Locatel CDMX)',
    texto: 'Orientación jurídica y psicológica inmediata. Canaliza a Centros de Justicia, LUNAS y casas de emergencia de la Ciudad.',
    direccion: 'Atención telefónica',
    telefono: '55 5658 1111',
    horario: 'Atención 24/7',
    servicios: ['Orientación jurídica', 'Apoyo psicológico', 'Canalización a refugios'],
  },
];

const guarderiasData = [
  {
    id: 'g1',
    titulo: 'Guardería No. 24 IMSS Santa Úrsula Coapa',
    texto: 'Guardería del IMSS para hijas e hijos de madres trabajadoras aseguradas. Servicio gratuito.',
    direccion: 'Calzada de Tlalpan 3329, Santa Úrsula Coapa, Coyoacán',
    telefono: '55 5617 7157',
    horario: 'Abre a las 7:00 a.m.',
    servicios: ['Cuidado infantil', 'Alimentación', 'Control de accesos', 'Personal capacitado'],
  },
  {
    id: 'g2',
    titulo: 'Guardería No. V IMSS Cristo Rey',
    texto: 'Guardería del IMSS para hijas e hijos de madres trabajadoras aseguradas. Servicio gratuito.',
    direccion: 'Calle Vasco de Quiroga 3, Álvaro Obregón',
    telefono: '55 5515 2296',
    horario: 'Abre a las 6:45 a.m.',
    servicios: ['Cuidado infantil', 'Alimentación', 'Control de accesos', 'Personal capacitado'],
  },
];

const casasData = [
  {
    id: 'c1',
    titulo: 'Casa Hogar para Madres Solteras A.C.',
    texto: 'Organización sin fines de lucro que brinda apoyo y hospedaje a madres solteras y sus hijas e hijos.',
    direccion: 'Av. Renato Leduc 82, Tlalpan',
    telefono: '55 5606 1376',
    horario: 'Abre a las 9:00 a.m.',
    servicios: ['Hospedaje temporal', 'Apoyo a madres', 'Acompañamiento'],
  },
  {
    id: 'c2',
    titulo: 'Comunidad MUSAS',
    texto: 'Organización comunitaria sin fines de lucro de apoyo a mujeres.',
    direccion: 'Av. Forestal 54, Tlalpan',
    telefono: '55 1803 4244',
    horario: 'Abre a las 8:00 a.m.',
    servicios: ['Servicios comunitarios', 'Apoyo a mujeres', 'Acompañamiento'],
  },
  {
    id: 'c3',
    titulo: 'AMANC (Asociación Mexicana de Ayuda a Niños con Cáncer)',
    texto: 'Asociación que apoya a niñas y niños con cáncer y a sus familias durante el tratamiento.',
    direccion: 'Calle Magisterio Nacional 100, Tlalpan',
    telefono: '55 5513 7111',
    horario: 'Abre a las 9:00 a.m.',
    servicios: ['Albergue para familias', 'Apoyo en tratamiento', 'Acompañamiento'],
  },
  {
    id: 'c4',
    titulo: 'Casa de la Amistad para Niños con Cáncer I.A.P.',
    texto: 'Institución que brinda tratamiento y apoyo integral a niñas y niños con cáncer y sus familias.',
    direccion: 'Calle Ignacio Aldama 259, Xochimilco',
    telefono: '55 3000 6900',
    horario: 'Abre a las 8:00 a.m.',
    servicios: ['Albergue', 'Apoyo médico', 'Apoyo a familias'],
  },
  {
    id: 'c5',
    titulo: 'SOS Mujeres *765',
    texto: 'Línea de emergencia para mujeres en CDMX. Te canaliza a una casa de emergencia o refugio de forma inmediata.',
    direccion: 'Atención telefónica',
    telefono: '*765',
    horario: 'Atención 24/7',
    servicios: ['Atención inmediata', 'Canalización a casas de emergencia', 'Apoyo en crisis'],
  },
];

const categorias = [
  { id: 'refugios', titulo: 'Refugios Cercanos (CDMX)', descripcion: 'Encuentra refugios seguros y cercanos a tu ubicación.', icono: iconoRefugio, datos: refugiosData },
  { id: 'guarderias', titulo: 'Guarderías Seguras (CDMX)', descripcion: 'Directorio de CENDIs y guarderías certificadas.', icono: iconoGuarderia, datos: guarderiasData },
  { id: 'casas', titulo: 'Casas de Emergencia (CDMX)', descripcion: 'Espacios de protección y hospedaje para mujeres y familias.', icono: iconoCasa, datos: casasData },
];

function CentrosApoyo({ onVolver }) {
  const [categoriaActiva, setCategoriaActiva] = useState(null);
  const [lugarDetalle, setLugarDetalle] = useState(null);

  const cerrarModal = () => {
    setCategoriaActiva(null);
    setLugarDetalle(null);
  };

  const conUbicacion = categoriaActiva ? categoriaActiva.datos.filter(d => d.lat && d.lng) : [];

  return (
    <div className="page pagina-apoyo fade-in">
      <button className="back-button" onClick={onVolver}>← Volver al inicio</button>
      <h2>Centros de Apoyo</h2>
      <p className="subtitle">Selecciona una opción para acceder a la red de ayuda.</p>

      <div className="list-container">
        {categorias.map((cat) => (
          <div key={cat.id} className="support-card" onClick={() => setCategoriaActiva(cat)}>
            <div className="support-icon">
              <img src={cat.icono} alt={cat.titulo} className="support-icon-img" />
            </div>
            <div className="support-info">
              <h3>{cat.titulo}</h3>
              <p>{cat.descripcion}</p>
            </div>
            <div className="arrow-icon">→</div>
          </div>
        ))}
      </div>

      {categoriaActiva && (
        <div className="modal-overlay" onClick={cerrarModal}>
          <div className="modal-content forum-modal" onClick={e => e.stopPropagation()}>

            {!lugarDetalle ? (
              <>
                <div className="modal-header">
                  <span className="modal-header-icon">
                    <img src={categoriaActiva.icono} alt="" className="modal-icon-img" />
                  </span>
                  <h3>{categoriaActiva.titulo}</h3>
                </div>

                <div className="modal-body scrollable">

                  {conUbicacion.length > 0 && (
                    <div className="map-container">
                      <MapContainer center={[19.40, -99.17]} zoom={10} scrollWheelZoom={false} style={{ height: '100%', width: '100%' }}>
                        <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
                        {conUbicacion.map(lugar => (
                          <Marker key={lugar.id} position={[lugar.lat, lugar.lng]}>
                            <Popup>
                              <strong>{lugar.titulo}</strong><br />
                              <button className="popup-btn" onClick={() => setLugarDetalle(lugar)}>Ver detalles</button>
                            </Popup>
                          </Marker>
                        ))}
                      </MapContainer>
                    </div>
                  )}

                  {/* Solo nombres en la lista */}
                  <div className="list-data-container">
                    {categoriaActiva.datos.map((lugar) => (
                      <div key={lugar.id} className="data-item">
                        <h4>{lugar.titulo}</h4>
                        <button className="action-link" onClick={() => setLugarDetalle(lugar)}>📍 Ver más detalles</button>
                      </div>
                    ))}
                  </div>

                </div>
                <button className="close-modal-btn" onClick={cerrarModal}>Cerrar</button>
              </>
            ) : (
              <div className="detalle-view fade-in">
                <button className="back-btn-text" onClick={() => setLugarDetalle(null)}>← Volver a la lista</button>

                <div className="detalle-header">
                  <h3>{lugarDetalle.titulo}</h3>
                  <span className="status-badge">{lugarDetalle.horario}</span>
                </div>

                <div className="detalle-seccion">
                  <h4>Información General</h4>
                  <p>{lugarDetalle.texto}</p>
                </div>

                <div className="detalle-seccion">
                  <h4>Ubicación</h4>
                  <div className="texto-resaltado ubicacion-row">
                    <img src={iconDocss} alt="Ubicación" className="custom-icon-img" />
                    <p>{lugarDetalle.direccion}</p>
                  </div>
                </div>

                <div className="detalle-seccion">
                  <h4>Servicios Ofrecidos</h4>
                  <ul className="servicios-lista">
                    {lugarDetalle.servicios.map((srv, idx) => (
                      <li key={idx}>✓ {srv}</li>
                    ))}
                  </ul>
                </div>

                <div className="detalle-actions">
                  <a className="call-btn" href={`tel:${lugarDetalle.telefono.replace(/\s/g, '')}`}>
                    📞 {lugarDetalle.telefonoLabel ? `${lugarDetalle.telefonoLabel}: ` : 'Llamar: '}{lugarDetalle.telefono}
                  </a>
                </div>
              </div>
            )}

          </div>
        </div>
      )}
    </div>
  );
}

export default CentrosApoyo;