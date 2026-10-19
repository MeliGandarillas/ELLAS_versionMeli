#include "grabador.h"
#include <LittleFS.h>
#include <driver/i2s.h>
#include "config.h"
#include "adpcm.h"
#include "almacen.h"

Grabador grabador;

static const i2s_port_t PUERTO_I2S = I2S_NUM_0;
static const int MUESTRAS_BLOQUE = 1 + (AUDIO_BLOQUE_BYTES - 4) * 2;  // 505

bool Grabador::abrirI2S() {
  i2s_config_t cfg;
  memset(&cfg, 0, sizeof(cfg));
  cfg.mode = (i2s_mode_t)(I2S_MODE_MASTER | I2S_MODE_RX);
  cfg.sample_rate = AUDIO_RATE_HZ;
  cfg.bits_per_sample = I2S_BITS_PER_SAMPLE_32BIT;  // el INMP441 manda 24 bits dentro de 32
  cfg.channel_format = I2S_CHANNEL_FMT_ONLY_LEFT;   // L/R a GND = canal izquierdo
  cfg.communication_format = I2S_COMM_FORMAT_STAND_I2S;
  cfg.intr_alloc_flags = ESP_INTR_FLAG_LEVEL1;
  cfg.dma_buf_count = 8;
  cfg.dma_buf_len = 512;

  i2s_pin_config_t pines;
  memset(&pines, 0, sizeof(pines));
  pines.mck_io_num = I2S_PIN_NO_CHANGE;
  pines.bck_io_num = PIN_I2S_SCK;
  pines.ws_io_num = PIN_I2S_WS;
  pines.data_out_num = I2S_PIN_NO_CHANGE;
  pines.data_in_num = PIN_I2S_SD;

  if (i2s_driver_install(PUERTO_I2S, &cfg, 0, nullptr) != ESP_OK) return false;
  if (i2s_set_pin(PUERTO_I2S, &pines) != ESP_OK) {
    i2s_driver_uninstall(PUERTO_I2S);
    return false;
  }
  return true;
}

void Grabador::cerrarI2S() { i2s_driver_uninstall(PUERTO_I2S); }

bool Grabador::iniciar(uint32_t clipId, uint32_t alertaId, uint16_t segundos) {
  if (_estado == GRABANDO) return false;
  _clipId = clipId;
  _alertaId = alertaId;

  // Espacio: cada bloque de 256 B guarda 505 muestras. Si no cabe, se acorta; si no cabe ni lo
  // mínimo, se borra el clip más antiguo (una alerta nueva importa más que una vieja sin entregar).
  auto bloquesPara = [](uint32_t seg) { return (seg * AUDIO_RATE_HZ + MUESTRAS_BLOQUE - 1) / MUESTRAS_BLOQUE; };
  const uint32_t margen = 48 * 1024;
  uint32_t seg = segundos;
  for (;;) {
    uint32_t libre = almacen.libre();
    uint32_t disponible = libre > margen ? libre - margen : 0;
    uint32_t cabe = (uint32_t)((uint64_t)(disponible / AUDIO_BLOQUE_BYTES) * MUESTRAS_BLOQUE / AUDIO_RATE_HZ);
    if (cabe >= AUDIO_SEG_MIN_ESPACIO || !almacen.borrarMasAntiguo()) {
      if (cabe < seg) seg = cabe;
      break;
    }
  }
  if (seg == 0) {
    _estado = FALLO;
    _pendienteAviso = true;
    return true;
  }
  _bloquesTotales = bloquesPara(seg);

  if (!abrirI2S()) {
    _estado = FALLO;
    _pendienteAviso = true;
    return true;
  }
  _cola = xStreamBufferCreate(AUDIO_BUFFER_BYTES, AUDIO_BLOQUE_BYTES);
  if (!_cola) {
    cerrarI2S();
    _estado = FALLO;
    _pendienteAviso = true;
    return true;
  }
  _errorCaptura = _errorEscritura = false;
  _capturaViva = _escrituraViva = true;
  _estado = GRABANDO;
  xTaskCreatePinnedToCore(tareaEscritura, "audio_wr", 4096, this, 3, nullptr, 1);
  xTaskCreatePinnedToCore(tareaCaptura, "audio_cap", 6144, this, 6, nullptr, 1);
  return true;
}

void Grabador::tareaCaptura(void* arg) {
  Grabador* g = (Grabador*)arg;
  static int32_t crudo[MUESTRAS_BLOQUE];
  static int16_t pcm[MUESTRAS_BLOQUE];
  static uint8_t bloque[AUDIO_BLOQUE_BYTES];
  AdpcmEstado enc;
  int32_t xAnt = 0, yAnt = 0;  // filtro quita-continua: y[n] = x[n] - x[n-1] + 0.995 y[n-1]

  // Los primeros ~100 ms del INMP441 son ruido de arranque: se descartan
  size_t leidos;
  for (int i = 0; i < 4; i++) i2s_read(PUERTO_I2S, crudo, sizeof(crudo), &leidos, 200 / portTICK_PERIOD_MS);

  for (uint32_t b = 0; b < g->_bloquesTotales && !g->_errorEscritura; b++) {
    size_t quedan = sizeof(crudo), off = 0;
    while (quedan > 0) {
      leidos = 0;
      if (i2s_read(PUERTO_I2S, (uint8_t*)crudo + off, quedan, &leidos, 500 / portTICK_PERIOD_MS) != ESP_OK || leidos == 0) {
        g->_errorCaptura = true;
        goto fin;
      }
      off += leidos;
      quedan -= leidos;
    }
    for (int i = 0; i < MUESTRAS_BLOQUE; i++) {
      int32_t x = crudo[i] >> AUDIO_SHIFT_GANANCIA;
      int32_t y = x - xAnt + ((yAnt * 254) >> 8);  // 0.992
      xAnt = x;
      yAnt = y;
      pcm[i] = (int16_t)(y > 32767 ? 32767 : (y < -32768 ? -32768 : y));
    }
    adpcmCodificarBloque(pcm, bloque, AUDIO_BLOQUE_BYTES, enc);
    // Si el colchón se llenó (flash muy lenta) espera; si no se libera en 3 s, la escritura murió
    if (xStreamBufferSend(g->_cola, bloque, AUDIO_BLOQUE_BYTES, 3000 / portTICK_PERIOD_MS) != AUDIO_BLOQUE_BYTES) {
      g->_errorEscritura = true;
      break;
    }
  }
fin:
  g->cerrarI2S();
  g->_capturaViva = false;
  vTaskDelete(nullptr);
}

void Grabador::tareaEscritura(void* arg) {
  Grabador* g = (Grabador*)arg;
  const String grabando = almacen.ruta(g->_clipId, g->_alertaId, true);
  File f = LittleFS.open(grabando, "w");
  static uint8_t tramo[AUDIO_BLOQUE_BYTES * 8];
  size_t enTramo = 0;
  uint32_t escritos = 0;

  if (!f) g->_errorEscritura = true;
  while (!g->_errorEscritura && (g->_capturaViva || xStreamBufferBytesAvailable(g->_cola) > 0)) {
    size_t n = xStreamBufferReceive(g->_cola, tramo + enTramo, sizeof(tramo) - enTramo, 100 / portTICK_PERIOD_MS);
    enTramo += n;
    // Escribir de a tramos grandes cuida la flash; al final se vacía lo que quede
    if (enTramo == sizeof(tramo) || (!g->_capturaViva && enTramo > 0)) {
      if (f.write(tramo, enTramo) != enTramo) g->_errorEscritura = true;
      escritos += enTramo;
      enTramo = 0;
    }
  }
  if (f) f.close();

  const bool hayAudio = escritos >= AUDIO_BLOQUE_BYTES;
  if (hayAudio) {
    // Aunque haya fallado a la mitad, lo grabado se conserva (es evidencia)
    LittleFS.rename(grabando, almacen.ruta(g->_clipId, g->_alertaId, false));
  } else {
    LittleFS.remove(grabando);
  }
  while (g->_capturaViva) vTaskDelay(10);  // la captura debe haber soltado el I2S
  vStreamBufferDelete(g->_cola);
  g->_cola = nullptr;
  g->_pendienteAviso = true;
  g->_estado = hayAudio ? LISTO : FALLO;
  g->_escrituraViva = false;
  vTaskDelete(nullptr);
}

bool Grabador::terminado(uint32_t& clipId, uint32_t& alertaId, bool& ok) {
  if ((_estado != LISTO && _estado != FALLO) || !_pendienteAviso) return false;
  _pendienteAviso = false;
  clipId = _clipId;
  alertaId = _alertaId;
  ok = (_estado == LISTO);
  _estado = LIBRE;
  return true;
}
