#pragma once
// Servicio GATT del dije (ver ../BLE.md): alerta, vibración, batería, configuración y
// transferencia de audio reanudable.
#include <Arduino.h>
#include <FS.h>
#include "almacen.h"

class ServicioBle {
 public:
  void iniciar();
  void anunciar(bool encendido);
  bool anunciando() const { return _anunciando; }
  bool hayConexion() const { return _conn != 0xFFFF; }
  bool listo() const { return hayConexion() && _cifrado; }  // conexión cifrada: ya se puede hablar
  // Hay una transferencia o respuestas en curso: no conviene dormir
  bool ocupado() const { return _tx.activa || _nResp > 0; }
  uint32_t ultimaActividad() const { return _actividad; }

  void notificarAlerta(uint8_t evento, uint32_t alertaId, uint32_t clipId);
  void notificarBateria(uint8_t porcentaje, uint16_t milivoltios);
  void borrarEmparejamientos();
  int emparejados() const;

  void actualizar();  // llamar siempre desde loop()

  // Uso interno de los callbacks de NimBLE
  void _alConectar(uint16_t conn, bool cifrado);
  void _alDesconectar();
  void _alCifrar(uint16_t conn, bool cifrado, const void* direccion);
  void _alCambiarMtu(uint16_t mtu);
  void _alEscribir(const char* uuid, const uint8_t* datos, size_t n);
  void _alLeer(const char* uuid);

 private:
  struct Resp { uint8_t n; uint8_t d[20]; };
  struct Cmd { uint8_t tipo; uint8_t n; uint8_t d[12]; };
  struct Tx {
    bool activa = false;
    Clip clip{};
    File f;
    uint32_t offset = 0, crc = 0;
    uint16_t seq = 0, payload = 0;
    uint32_t restantes = 0;
    uint32_t ultimoProgreso = 0;
    uint8_t fase = 0;  // 0 = enviar INICIO, 1 = datos, 2 = enviar FIN
  };

  void procesarComando(const Cmd& c);
  void encolar(const uint8_t* datos, size_t n);
  void enviarError(uint8_t codigo, uint32_t clipId);
  void drenarRespuestas();
  void avanzarTransferencia();
  void cortarTransferencia();
  bool notificar(class NimBLECharacteristic* ch, const uint8_t* datos, size_t n);
  void iniciarDescarga(uint32_t clipId, uint32_t offset);
  void refrescarBateria();

  class NimBLEServer* _srv = nullptr;
  class NimBLECharacteristic *_cAlerta = nullptr, *_cVibrar = nullptr, *_cBateria = nullptr, *_cCtrl = nullptr,
                             *_cDatos = nullptr, *_cConfig = nullptr;
  uint16_t _conn = 0xFFFF;
  uint16_t _mtu = 23;
  bool _cifrado = false, _anunciando = false;
  uint32_t _actividad = 0;

  uint8_t _bat[3] = {0, 0, 0};
  uint8_t _alerta[9] = {0};

  Resp _resp[40];
  uint8_t _nResp = 0, _iResp = 0;
  Tx _tx;
  uint32_t _crcCacheId = 0, _crcCache = 0;
  QueueHandle_t _cola = nullptr;
};
extern ServicioBle ble;
