#pragma once
// Codificador IMA-ADPCM por bloques independientes (formato de bloque de WAV IMA ADPCM, mono).
// Cada bloque lleva su predictor e índice: si se corta la corriente solo se pierde el bloque a medias.
#include <stddef.h>
#include <stdint.h>

struct AdpcmEstado {
  int indice = 0;  // índice en la tabla de pasos, se arrastra entre bloques
};

// Muestras PCM por bloque de `bytesBloque` bytes: 1 en la cabecera + 2 por cada byte restante
inline int adpcmMuestrasPorBloque(int bytesBloque) { return 1 + (bytesBloque - 4) * 2; }

// Codifica adpcmMuestrasPorBloque(bytesBloque) muestras en `salida` (bytesBloque bytes)
void adpcmCodificarBloque(const int16_t* pcm, uint8_t* salida, int bytesBloque, AdpcmEstado& estado);

// Decodifica un bloque a PCM (se usa en las pruebas de PC y es la misma lógica que la app)
void adpcmDecodificarBloque(const uint8_t* bloque, int bytesBloque, int16_t* pcm);
