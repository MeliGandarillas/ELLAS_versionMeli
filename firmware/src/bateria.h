#pragma once
#include <stdint.h>

// Nivel de la LiPo leído por un divisor 100k+100k en PIN_BATERIA_ADC
struct Bateria {
  static void iniciar();
  static uint16_t milivoltios();
  static uint8_t porcentaje(uint16_t mv);
};
