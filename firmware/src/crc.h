#pragma once
#include <stddef.h>
#include <stdint.h>

// CRC-16/CCITT-FALSE (poly 0x1021, init 0xFFFF) - verifica cada bloque BLE
uint16_t crc16(const uint8_t* datos, size_t n, uint16_t crc = 0xFFFF);
// CRC-32 estándar (el mismo de zlib/PNG) - verifica el clip completo
uint32_t crc32Actualizar(uint32_t crc, const uint8_t* datos, size_t n);
inline uint32_t crc32Inicio() { return 0xFFFFFFFFu; }
inline uint32_t crc32Fin(uint32_t crc) { return crc ^ 0xFFFFFFFFu; }
