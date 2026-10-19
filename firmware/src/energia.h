#pragma once
#include <Arduino.h>

namespace energia {
enum Despertar { ENCENDIDO, BOTON, TEMPORIZADOR };
Despertar causa();
// Duerme hasta que se presione el botón (o, si `despertarEn` > 0 segundos, hasta que pase ese tiempo)
[[noreturn]] void dormir(uint32_t despertarEnSeg);
}  // namespace energia
