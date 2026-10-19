#include "bateria.h"
#include <Arduino.h>
#include "config.h"

void Bateria::iniciar() {
  analogSetPinAttenuation(PIN_BATERIA_ADC, ADC_11db);
}

uint16_t Bateria::milivoltios() {
  uint32_t suma = 0;
  for (int i = 0; i < 16; i++) suma += analogReadMilliVolts(PIN_BATERIA_ADC);
  return (uint16_t)((suma / 16.0f) * BAT_DIVISOR);
}

uint8_t Bateria::porcentaje(uint16_t mv) {
  // Curva descarga LiPo 1S (mV -> %), interpolada. Con USB conectado marca más de lo real.
  static const uint16_t T_MV[] = {3300, 3500, 3600, 3700, 3750, 3800, 3900, 4000, 4100, 4150};
  static const uint8_t T_PCT[] = {0, 5, 12, 25, 40, 55, 72, 84, 95, 100};
  const int n = sizeof(T_MV) / sizeof(T_MV[0]);
  if (mv <= T_MV[0]) return 0;
  if (mv >= T_MV[n - 1]) return 100;
  for (int i = 1; i < n; i++) {
    if (mv <= T_MV[i]) {
      return (uint8_t)(T_PCT[i - 1] + (uint32_t)(mv - T_MV[i - 1]) * (T_PCT[i] - T_PCT[i - 1]) / (T_MV[i] - T_MV[i - 1]));
    }
  }
  return 100;
}
