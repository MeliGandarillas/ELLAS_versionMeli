#pragma once
#include <Arduino.h>
#include <freertos/FreeRTOS.h>
#include <freertos/task.h>
#include <freertos/stream_buffer.h>

// Graba el INMP441 (I2S) -> IMA-ADPCM -> LittleFS.
// Dos tareas: una captura y codifica sin parar, otra escribe en flash. Entre ambas hay ~8 s de
// colchón, así que una pausa de la flash (borrado de sectores) no pierde audio.
class Grabador {
 public:
  enum Estado : uint8_t { LIBRE, GRABANDO, LISTO, FALLO };

  // Empieza a grabar `segundos` (se recorta si no hay espacio). false si ya estaba grabando.
  bool iniciar(uint32_t clipId, uint32_t alertaId, uint16_t segundos);
  Estado estado() const { return _estado; }
  bool grabando() const { return _estado == GRABANDO; }
  // Si terminó, devuelve true UNA vez y entrega los ids del clip (o del intento fallido)
  bool terminado(uint32_t& clipId, uint32_t& alertaId, bool& ok);
  uint32_t clipActual() const { return _clipId; }
  uint32_t alertaActual() const { return _alertaId; }

 private:
  static void tareaCaptura(void* arg);
  static void tareaEscritura(void* arg);
  bool abrirI2S();
  void cerrarI2S();

  volatile Estado _estado = LIBRE;
  volatile bool _capturaViva = false, _escrituraViva = false, _errorCaptura = false, _errorEscritura = false;
  bool _pendienteAviso = false;
  uint32_t _clipId = 0, _alertaId = 0;
  uint32_t _bloquesTotales = 0;
  StreamBufferHandle_t _cola = nullptr;
};
extern Grabador grabador;
