#include "crc.h"

uint16_t crc16(const uint8_t* datos, size_t n, uint16_t crc) {
  for (size_t i = 0; i < n; i++) {
    crc ^= (uint16_t)datos[i] << 8;
    for (int b = 0; b < 8; b++) crc = (crc & 0x8000) ? (uint16_t)((crc << 1) ^ 0x1021) : (uint16_t)(crc << 1);
  }
  return crc;
}

static uint32_t tabla32[256];
static bool tablaLista = false;

uint32_t crc32Actualizar(uint32_t crc, const uint8_t* datos, size_t n) {
  if (!tablaLista) {
    for (uint32_t i = 0; i < 256; i++) {
      uint32_t c = i;
      for (int k = 0; k < 8; k++) c = (c & 1) ? (0xEDB88320u ^ (c >> 1)) : (c >> 1);
      tabla32[i] = c;
    }
    tablaLista = true;
  }
  for (size_t i = 0; i < n; i++) crc = tabla32[(crc ^ datos[i]) & 0xFF] ^ (crc >> 8);
  return crc;
}
