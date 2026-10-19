#pragma once
// GPS ATGM336H (NMEA por UART1). PREPARADO PERO DESACTIVADO: con GPS_ENABLED=0 (por defecto)
// no se usa ningún pin ni se compila el lector. Ver WIRING.md para conectarlo después.
#include <Arduino.h>
#include "config.h"

struct FixGps {
  bool valido = false;
  double lat = 0, lng = 0;
  uint32_t edadMs = 0;  // hace cuánto se obtuvo el último fix
};

namespace gps {
void iniciar();                 // enciende el módulo y abre la UART
void actualizar();              // llamar en loop(): lee y procesa NMEA
void apagar();                  // corta la alimentación (antes del deep sleep)
FixGps ultimo();
}  // namespace gps
