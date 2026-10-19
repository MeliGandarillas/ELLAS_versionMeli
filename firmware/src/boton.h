#pragma once
#include <Arduino.h>

// Botón a GND con pull-up interno, antirrebote y pulsación larga.
// Eventos: alLargo() se dispara UNA vez cuando se mantiene BOTON_ALERTA_MS (sin esperar a soltar);
//          alCorto() al soltar antes de ese tiempo.
class Boton {
 public:
  // `yaPresionado`: venimos de despertar por este botón y sigue apretado
  void iniciar(bool yaPresionado);
  void actualizar();
  bool presionado() const { return _estable; }
  uint32_t msPresionado() const { return _estable ? millis() - _inicio : 0; }
  bool alLargo();   // consume el evento
  bool alCorto();   // consume el evento

 private:
  bool _estable = false, _lectura = false, _largoEmitido = false;
  bool _evLargo = false, _evCorto = false;
  uint32_t _cambio = 0, _inicio = 0;
};
