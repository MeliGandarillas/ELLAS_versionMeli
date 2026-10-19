// Prueba en PC (sin placa) del codificador ADPCM y los CRC.
//   g++ -O2 -I../src prueba_pc.cpp ../src/adpcm.cpp ../src/crc.cpp -o prueba_pc && ./prueba_pc [salida_dir]
// Genera un tono + ruido, lo codifica por bloques y comprueba la fidelidad al decodificar.
// Con un directorio escribe vectores (clip.adp, clip.pcm, crc.txt) que usa la prueba de la app
// (FRONTEND/scripts/prueba-protocolo.mjs) para verificar que decodifica igual que el firmware.
#include <cmath>
#include <cstdio>
#include <cstdlib>
#include <string>
#include <vector>
#include "adpcm.h"
#include "crc.h"

int main(int argc, char** argv) {
  const int B = 256, M = adpcmMuestrasPorBloque(B);
  const int bloques = 64;
  std::vector<int16_t> pcm(bloques * M);
  srand(1);
  for (size_t i = 0; i < pcm.size(); i++) {
    double t = i / 16000.0;
    double v = 9000 * sin(2 * M_PI * 440 * t) + 3000 * sin(2 * M_PI * 1250 * t) + (rand() % 400 - 200);
    pcm[i] = (int16_t)v;
  }
  std::vector<uint8_t> adp(bloques * B);
  std::vector<int16_t> dec(bloques * M);
  AdpcmEstado st;
  for (int b = 0; b < bloques; b++) {
    adpcmCodificarBloque(&pcm[b * M], &adp[b * B], B, st);
    adpcmDecodificarBloque(&adp[b * B], B, &dec[b * M]);
  }
  double se = 0, ss = 0;
  for (size_t i = 0; i < pcm.size(); i++) {
    double e = pcm[i] - dec[i];
    se += e * e;
    ss += (double)pcm[i] * pcm[i];
  }
  double snr = 10 * log10(ss / se);
  printf("SNR ADPCM: %.1f dB\n", snr);
  if (snr < 25) { printf("FALLA: SNR demasiado bajo\n"); return 1; }

  const uint8_t v[] = {'1', '2', '3', '4', '5', '6', '7', '8', '9'};
  uint32_t c32 = crc32Fin(crc32Actualizar(crc32Inicio(), v, 9));
  uint16_t c16 = crc16(v, 9);
  printf("CRC32('123456789') = %08x (esperado cbf43926)\nCRC16('123456789') = %04x (esperado 29b1)\n", c32, c16);
  if (c32 != 0xcbf43926u || c16 != 0x29b1) { printf("FALLA: CRC\n"); return 1; }

  if (argc > 1) {
    std::string d = argv[1];
    FILE* f = fopen((d + "/clip.adp").c_str(), "wb"); fwrite(adp.data(), 1, adp.size(), f); fclose(f);
    f = fopen((d + "/clip.pcm").c_str(), "wb"); fwrite(dec.data(), 2, dec.size(), f); fclose(f);
    f = fopen((d + "/crc.txt").c_str(), "w");
    fprintf(f, "%u\n", crc32Fin(crc32Actualizar(crc32Inicio(), adp.data(), adp.size()))); fclose(f);
  }
  printf("OK\n");
  return 0;
}
