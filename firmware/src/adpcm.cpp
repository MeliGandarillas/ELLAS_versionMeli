#include "adpcm.h"

static const int8_t TABLA_INDICE[16] = {-1, -1, -1, -1, 2, 4, 6, 8, -1, -1, -1, -1, 2, 4, 6, 8};
static const int16_t TABLA_PASO[89] = {
    7,     8,     9,     10,    11,    12,    13,    14,    16,    17,    19,    21,    23,    25,
    28,    31,    34,    37,    41,    45,    50,    55,    60,    66,    73,    80,    88,    97,
    107,   118,   130,   143,   157,   173,   190,   209,   230,   253,   279,   307,   337,   371,
    408,   449,   494,   544,   598,   658,   724,   796,   876,   963,   1060,  1166,  1282,  1411,
    1552,  1707,  1878,  2066,  2272,  2499,  2749,  3024,  3327,  3660,  4026,  4428,  4871,  5358,
    5894,  6484,  7132,  7845,  8630,  9493,  10442, 11487, 12635, 13899, 15289, 16818, 18500, 20350,
    22385, 24623, 27086, 29794, 32767};

static inline int limitar(int v, int lo, int hi) { return v < lo ? lo : (v > hi ? hi : v); }

// Un paso del decodificador/codificador: aplica el nibble al predictor
static inline int aplicarNibble(int nibble, int predictor, int paso) {
  int diff = paso >> 3;
  if (nibble & 4) diff += paso;
  if (nibble & 2) diff += paso >> 1;
  if (nibble & 1) diff += paso >> 2;
  if (nibble & 8) diff = -diff;
  return limitar(predictor + diff, -32768, 32767);
}

void adpcmCodificarBloque(const int16_t* pcm, uint8_t* salida, int bytesBloque, AdpcmEstado& estado) {
  int predictor = pcm[0];
  int indice = estado.indice;
  salida[0] = predictor & 0xFF;
  salida[1] = (predictor >> 8) & 0xFF;
  salida[2] = (uint8_t)indice;
  salida[3] = 0;

  const int n = (bytesBloque - 4) * 2;
  for (int i = 0; i < n; i++) {
    int paso = TABLA_PASO[indice];
    int diff = pcm[1 + i] - predictor;
    int nibble = 0;
    if (diff < 0) {
      nibble = 8;
      diff = -diff;
    }
    int temp = paso;
    if (diff >= temp) { nibble |= 4; diff -= temp; }
    temp >>= 1;
    if (diff >= temp) { nibble |= 2; diff -= temp; }
    temp >>= 1;
    if (diff >= temp) { nibble |= 1; }

    predictor = aplicarNibble(nibble, predictor, paso);
    indice = limitar(indice + TABLA_INDICE[nibble], 0, 88);

    uint8_t* b = &salida[4 + (i >> 1)];
    if (i & 1) *b |= (uint8_t)(nibble << 4);
    else *b = (uint8_t)nibble;
  }
  estado.indice = indice;
}

void adpcmDecodificarBloque(const uint8_t* bloque, int bytesBloque, int16_t* pcm) {
  int predictor = (int16_t)(bloque[0] | (bloque[1] << 8));
  int indice = limitar(bloque[2], 0, 88);
  pcm[0] = (int16_t)predictor;
  const int n = (bytesBloque - 4) * 2;
  for (int i = 0; i < n; i++) {
    uint8_t b = bloque[4 + (i >> 1)];
    int nibble = (i & 1) ? (b >> 4) : (b & 0x0F);
    predictor = aplicarNibble(nibble, predictor, TABLA_PASO[indice]);
    indice = limitar(indice + TABLA_INDICE[nibble], 0, 88);
    pcm[1 + i] = (int16_t)predictor;
  }
}
