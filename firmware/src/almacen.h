#pragma once
// Clips de audio en LittleFS: /clips/<clipId hex8>_<alertaId hex8>.adp  (y .rec mientras se graba)
#include <Arduino.h>
#include <FS.h>

struct Clip {
  uint32_t id;
  uint32_t alerta;
  uint32_t bytes;
};

class Almacen {
 public:
  bool iniciar();
  size_t contar();
  // Llena `salida` (máx. `max`) ordenado por id; devuelve cuántos
  size_t listar(Clip* salida, size_t max);
  bool buscar(uint32_t clipId, Clip& clip);
  bool borrar(uint32_t clipId);
  bool borrarMasAntiguo();
  uint32_t crc32(const Clip& clip);
  uint32_t libre();  // bytes libres
  String ruta(uint32_t clipId, uint32_t alerta, bool grabando) const;
  String ruta(const Clip& c) const { return ruta(c.id, c.alerta, false); }
  uint32_t siguienteClipId();
  uint32_t siguienteAlertaId();
  uint16_t segundosGrabacion();
  void guardarSegundos(uint16_t s);
  static uint16_t segundosDeBytes(uint32_t bytes);
};
extern Almacen almacen;
