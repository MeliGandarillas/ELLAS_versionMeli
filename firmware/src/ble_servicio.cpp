#include "ble_servicio.h"
#include <NimBLEDevice.h>
#include <LittleFS.h>
#include "config.h"
#include "protocolo.h"
#include "crc.h"
#include "bateria.h"
#include "vibrador.h"

ServicioBle ble;

enum TipoCmd : uint8_t { C_VIBRAR = 1, C_AUDIO = 2, C_CONFIG = 3 };

static inline void u16(uint8_t* p, uint16_t v) { p[0] = v & 0xFF; p[1] = v >> 8; }
static inline void u32(uint8_t* p, uint32_t v) { for (int i = 0; i < 4; i++) p[i] = (v >> (8 * i)) & 0xFF; }
static inline uint32_t leer32(const uint8_t* p) { return p[0] | (p[1] << 8) | (p[2] << 16) | ((uint32_t)p[3] << 24); }

// ---------------------------------------------------------------- callbacks de NimBLE
class CbServidor : public NimBLEServerCallbacks {
  void onConnect(NimBLEServer*, ble_gap_conn_desc* d) override { ble._alConectar(d->conn_handle, d->sec_state.encrypted); }
  void onDisconnect(NimBLEServer*) override { ble._alDesconectar(); }
  void onMTUChange(uint16_t mtu, ble_gap_conn_desc*) override { ble._alCambiarMtu(mtu); }
  void onAuthenticationComplete(ble_gap_conn_desc* d) override {
    ble._alCifrar(d->conn_handle, d->sec_state.encrypted, &d->peer_id_addr);
  }
};

class CbCaracteristica : public NimBLECharacteristicCallbacks {
  void onWrite(NimBLECharacteristic* c) override {
    NimBLEAttValue v = c->getValue();
    ble._alEscribir(c->getUUID().toString().c_str(), v.data(), v.size());
  }
  void onRead(NimBLECharacteristic* c) override { ble._alLeer(c->getUUID().toString().c_str()); }
};
static CbServidor cbServidor;
static CbCaracteristica cbCaracteristica;

// ---------------------------------------------------------------- inicio
void ServicioBle::iniciar() {
  _cola = xQueueCreate(8, sizeof(Cmd));
  NimBLEDevice::init(BLE_NOMBRE);
  NimBLEDevice::setPower(ESP_PWR_LVL_P3);
  NimBLEDevice::setMTU(BLE_MTU_PREFERIDO);
  // Emparejamiento con cifrado (LE Secure Connections, "Just Works"). Los datos del dije (audio de
  // una situación de riesgo) nunca viajan sin cifrar: ver _cifrado.
  NimBLEDevice::setSecurityAuth(true, false, true);
  NimBLEDevice::setSecurityIOCap(BLE_HS_IO_NO_INPUT_OUTPUT);

  _srv = NimBLEDevice::createServer();
  _srv->setCallbacks(&cbServidor, false);
  _srv->advertiseOnDisconnect(false);
  NimBLEService* s = _srv->createService(UUID_SERVICIO);

  const uint32_t LEE = NIMBLE_PROPERTY::READ | NIMBLE_PROPERTY::READ_ENC;
  const uint32_t ESC = NIMBLE_PROPERTY::WRITE | NIMBLE_PROPERTY::WRITE_NR | NIMBLE_PROPERTY::WRITE_ENC;
  _cAlerta = s->createCharacteristic(UUID_ALERTA, LEE | NIMBLE_PROPERTY::NOTIFY);
  _cVibrar = s->createCharacteristic(UUID_VIBRAR, ESC);
  _cBateria = s->createCharacteristic(UUID_BATERIA, LEE | NIMBLE_PROPERTY::NOTIFY);
  _cCtrl = s->createCharacteristic(UUID_AUDIO_CTRL, ESC | NIMBLE_PROPERTY::NOTIFY);
  _cDatos = s->createCharacteristic(UUID_AUDIO_DATOS, NIMBLE_PROPERTY::NOTIFY);
  _cConfig = s->createCharacteristic(UUID_CONFIG, LEE | ESC);
  for (NimBLECharacteristic* c : {_cAlerta, _cVibrar, _cBateria, _cCtrl, _cConfig}) c->setCallbacks(&cbCaracteristica);

  uint8_t cero[9] = {0};
  _cAlerta->setValue(cero, sizeof(_alerta));
  refrescarBateria();
  s->start();

  NimBLEAdvertising* adv = NimBLEDevice::getAdvertising();
  adv->addServiceUUID(UUID_SERVICIO);
  adv->setScanResponse(true);
  adv->setMinInterval(160);  // 100 ms: buen compromiso entre encontrarlo rápido y gastar poco
  adv->setMaxInterval(320);
}

void ServicioBle::anunciar(bool encendido) {
  if (encendido == _anunciando) return;
  _anunciando = encendido;
  if (encendido) NimBLEDevice::getAdvertising()->start();
  else NimBLEDevice::getAdvertising()->stop();
}

int ServicioBle::emparejados() const { return NimBLEDevice::getNumBonds(); }
void ServicioBle::borrarEmparejamientos() { NimBLEDevice::deleteAllBonds(); }

// ---------------------------------------------------------------- eventos de conexión (hilo de NimBLE)
void ServicioBle::_alConectar(uint16_t conn, bool cifrado) {
  _conn = conn;
  _mtu = 23;
  _cifrado = cifrado;
  _anunciando = false;
  _actividad = millis();
  // Es el dije quien pide el cifrado: el teléfono recibe el aviso de emparejar de una vez
  if (!cifrado) NimBLEDevice::startSecurity(conn);
  // Intervalos de 15-30 ms: transferencia ágil sin gastar demasiado
  _srv->updateConnParams(conn, 12, 24, 0, 400);
}

void ServicioBle::_alDesconectar() {
  _conn = 0xFFFF;
  _cifrado = false;
  _actividad = millis();
  xQueueReset(_cola);
}

void ServicioBle::_alCambiarMtu(uint16_t mtu) { _mtu = mtu; }

void ServicioBle::_alCifrar(uint16_t conn, bool cifrado, const void* direccion) {
  if (!cifrado) return;
  // Un solo teléfono por dije. Si se empareja un segundo, se borra su vínculo y se desconecta.
  // Para cambiar de teléfono: borrar emparejamientos (mantener el botón al encender).
  if (NimBLEDevice::getNumBonds() > 1) {
    NimBLEDevice::deleteBond(NimBLEAddress(*(const ble_addr_t*)direccion));
    _srv->disconnect(conn);
    return;
  }
  _cifrado = true;
  _actividad = millis();
}

void ServicioBle::_alEscribir(const char* uuid, const uint8_t* datos, size_t n) {
  if (!_cifrado || n == 0) return;
  _actividad = millis();
  Cmd c{};
  if (!strcasecmp(uuid, UUID_VIBRAR)) c.tipo = C_VIBRAR;
  else if (!strcasecmp(uuid, UUID_AUDIO_CTRL)) c.tipo = C_AUDIO;
  else if (!strcasecmp(uuid, UUID_CONFIG)) c.tipo = C_CONFIG;
  else return;
  c.n = n > sizeof(c.d) ? sizeof(c.d) : n;
  memcpy(c.d, datos, c.n);
  xQueueSend(_cola, &c, 0);  // se atiende en loop(): aquí no se toca el motor ni la flash
}

void ServicioBle::_alLeer(const char* uuid) {
  _actividad = millis();
  if (!strcasecmp(uuid, UUID_BATERIA)) {
    refrescarBateria();
  } else if (!strcasecmp(uuid, UUID_CONFIG)) {
    uint8_t v[4];
    u16(v, almacen.segundosGrabacion());
    v[2] = (uint8_t)almacen.contar();
    v[3] = 1;  // versión del protocolo
    _cConfig->setValue(v, sizeof(v));
  }
}

// ---------------------------------------------------------------- envío
bool ServicioBle::notificar(NimBLECharacteristic* ch, const uint8_t* datos, size_t n) {
  if (!listo() || ch->getSubscribedCount() == 0) return false;
  os_mbuf* om = ble_hs_mbuf_from_flat(datos, n);
  if (!om) return false;  // sin memoria en la pila: se reintenta en la próxima vuelta
  return ble_gattc_notify_custom(_conn, ch->getHandle(), om) == 0;
}

void ServicioBle::refrescarBateria() {
  _cBateria->setValue(_bat, sizeof(_bat));
}

void ServicioBle::notificarBateria(uint8_t pct, uint16_t mv) {
  _bat[0] = pct;
  u16(&_bat[1], mv);
  refrescarBateria();
  notificar(_cBateria, _bat, sizeof(_bat));
}

void ServicioBle::notificarAlerta(uint8_t evento, uint32_t alertaId, uint32_t clipId) {
  _alerta[0] = evento;
  u32(&_alerta[1], alertaId);
  u32(&_alerta[5], clipId);
  _cAlerta->setValue(_alerta, sizeof(_alerta));
  notificar(_cAlerta, _alerta, sizeof(_alerta));
}

void ServicioBle::encolar(const uint8_t* datos, size_t n) {
  if (_nResp >= sizeof(_resp) / sizeof(_resp[0])) return;
  Resp& r = _resp[(_iResp + _nResp) % (sizeof(_resp) / sizeof(_resp[0]))];
  r.n = n;
  memcpy(r.d, datos, n);
  _nResp++;
}

void ServicioBle::enviarError(uint8_t codigo, uint32_t clipId) {
  uint8_t m[6] = {RSP_ERROR, codigo};
  u32(&m[2], clipId);
  encolar(m, sizeof(m));
}

void ServicioBle::drenarRespuestas() {
  while (_nResp > 0) {
    Resp& r = _resp[_iResp];
    if (!notificar(_cCtrl, r.d, r.n)) return;
    _iResp = (_iResp + 1) % (sizeof(_resp) / sizeof(_resp[0]));
    _nResp--;
  }
}

// ---------------------------------------------------------------- comandos (en loop)
void ServicioBle::iniciarDescarga(uint32_t clipId, uint32_t offset) {
  cortarTransferencia();
  Clip clip;
  if (!almacen.buscar(clipId, clip)) return enviarError(ERR_NO_EXISTE, clipId);
  if (offset > clip.bytes) return enviarError(ERR_OFFSET, clipId);

  if (_crcCacheId != clipId) {
    _crcCache = almacen.crc32(clip);
    _crcCacheId = clipId;
  }
  File f = LittleFS.open(almacen.ruta(clip), "r");
  if (!f || !f.seek(offset)) return enviarError(ERR_NO_EXISTE, clipId);

  int payload = (int)_mtu - ATT_OVERHEAD - BLOQUE_CABECERA - BLOQUE_PIE;
  if (payload > PAYLOAD_MAX) payload = PAYLOAD_MAX;
  if (payload < 16) payload = 16;

  _tx.activa = true;
  _tx.clip = clip;
  _tx.f = f;
  _tx.offset = offset;
  _tx.crc = _crcCache;
  _tx.seq = 0;
  _tx.payload = payload;
  _tx.restantes = clip.bytes - offset;
  _tx.ultimoProgreso = millis();
  _tx.fase = 0;
}

void ServicioBle::cortarTransferencia() {
  if (_tx.activa) _tx.f.close();
  _tx.activa = false;
}

void ServicioBle::procesarComando(const Cmd& c) {
  switch (c.tipo) {
    case C_VIBRAR:
      vibrador.patron(c.d[0]);
      break;

    case C_CONFIG:
      if (c.n >= 2) almacen.guardarSegundos(c.d[0] | (c.d[1] << 8));
      break;

    case C_AUDIO:
      switch (c.d[0]) {
        case CMD_LISTAR: {
          Clip lista[24];
          size_t n = almacen.listar(lista, 24);
          if (n == 0) {
            uint8_t m[17] = {RSP_ENTRADA, 0, 0};
            encolar(m, sizeof(m));
          }
          for (size_t i = 0; i < n; i++) {
            uint8_t m[17] = {RSP_ENTRADA, (uint8_t)n, (uint8_t)i};
            u32(&m[3], lista[i].id);
            u32(&m[7], lista[i].alerta);
            u32(&m[11], lista[i].bytes);
            u16(&m[15], Almacen::segundosDeBytes(lista[i].bytes));
            encolar(m, sizeof(m));
          }
          break;
        }
        case CMD_DESCARGAR:
          if (c.n < 9) return enviarError(ERR_COMANDO, 0);
          iniciarDescarga(leer32(&c.d[1]), leer32(&c.d[5]));
          break;
        case CMD_CONFIRMAR: {
          if (c.n < 9) return enviarError(ERR_COMANDO, 0);
          uint32_t id = leer32(&c.d[1]), crcApp = leer32(&c.d[5]);
          Clip clip;
          if (!almacen.buscar(id, clip)) return enviarError(ERR_NO_EXISTE, id);
          if (_tx.activa && _tx.clip.id == id) cortarTransferencia();
          if (almacen.crc32(clip) != crcApp) return enviarError(ERR_CRC, id);
          almacen.borrar(id);
          if (_crcCacheId == id) _crcCacheId = 0;
          uint8_t m[5] = {RSP_BORRADO};
          u32(&m[1], id);
          encolar(m, sizeof(m));
          break;
        }
        case CMD_ABORTAR: {
          cortarTransferencia();
          uint8_t m[1] = {RSP_ABORTADO};
          encolar(m, 1);
          break;
        }
        default:
          enviarError(ERR_COMANDO, 0);
      }
      break;
  }
}

// ---------------------------------------------------------------- transferencia
void ServicioBle::avanzarTransferencia() {
  if (!_tx.activa) return;
  if (millis() - _tx.ultimoProgreso > 15000) {  // la app dejó de escuchar
    cortarTransferencia();
    return;
  }

  if (_tx.fase == 0) {
    uint8_t m[19] = {RSP_INICIO};
    u32(&m[1], _tx.clip.id);
    u32(&m[5], _tx.clip.bytes);
    u32(&m[9], _tx.crc);
    u32(&m[13], _tx.offset);
    u16(&m[17], _tx.payload);
    encolar(m, sizeof(m));
    _tx.fase = 1;
    return;
  }
  if (_nResp > 0) return;  // las respuestas siempre van antes que los bloques

  if (_tx.fase == 1) {
    uint8_t marco[BLOQUE_CABECERA + PAYLOAD_MAX + BLOQUE_PIE];
    for (int i = 0; i < BLE_BLOQUES_POR_VUELTA && _tx.restantes > 0; i++) {
      uint32_t n = _tx.restantes < _tx.payload ? _tx.restantes : _tx.payload;
      uint32_t pos = _tx.f.position();
      if (_tx.f.read(marco + BLOQUE_CABECERA, n) != n) {
        cortarTransferencia();
        return;
      }
      u16(marco, _tx.seq);
      u16(marco + BLOQUE_CABECERA + n, crc16(marco, BLOQUE_CABECERA + n));
      if (!notificar(_cDatos, marco, BLOQUE_CABECERA + n + BLOQUE_PIE)) {
        _tx.f.seek(pos);  // la pila está llena: se reintenta el mismo bloque
        delay(3);
        return;
      }
      _tx.seq++;
      _tx.restantes -= n;
      _tx.ultimoProgreso = millis();
      _actividad = millis();
    }
    if (_tx.restantes == 0) _tx.fase = 2;
    return;
  }

  uint8_t m[7] = {RSP_FIN};
  u32(&m[1], _tx.clip.id);
  u16(&m[5], _tx.seq);
  encolar(m, sizeof(m));
  cortarTransferencia();
}

void ServicioBle::actualizar() {
  Cmd c;
  while (xQueueReceive(_cola, &c, 0) == pdTRUE) procesarComando(c);
  if (!listo()) {
    if (_tx.activa) cortarTransferencia();
    _nResp = _iResp = 0;
    return;
  }
  drenarRespuestas();
  avanzarTransferencia();
  drenarRespuestas();
}
