#pragma once
// Constantes del protocolo BLE. La especificación completa está en ../BLE.md y
// el espejo en la app es FRONTEND/src/ble/protocolo.js: si cambias algo, cámbialo en los tres.
#include <stdint.h>

// ---- Característica ALERTA (lectura + notificación): [evento u8][alertaId u32][clipId u32] ----
enum EventoAlerta : uint8_t {
  EVT_NINGUNO = 0,
  EVT_ALERTA_INICIADA = 1,   // se mantuvo el botón: empieza la grabación
  EVT_CLIP_LISTO = 2,        // la grabación terminó y el clip ya se puede descargar
  EVT_GRABACION_FALLIDA = 3, // no se pudo grabar (micrófono o memoria)
};

// ---- Característica VIBRAR (escritura): [patron u8] ----
enum PatronVibracion : uint8_t {
  VIB_CONFIRMA_ALERTA = 0,  // la alerta se envió a los contactos (app) / alerta activada (dije)
  VIB_ENCONTRAR = 1,        // largo, para encontrar el dije
  VIB_CORTO = 2,            // prueba / conexión
  VIB_ERROR = 3,            // dos pulsos secos
  VIB_ALERTA_LOCAL = 4,     // confirmación al activar la alerta con el botón
  VIB_PARAR = 0xFF,
};

// ---- Característica AUDIO_CTRL: comandos (escritura) ----
enum ComandoAudio : uint8_t {
  CMD_LISTAR = 0x01,     // sin argumentos
  CMD_DESCARGAR = 0x02,  // [clipId u32][offset u32]
  CMD_CONFIRMAR = 0x03,  // [clipId u32][crc32 u32]  -> borra el clip si el CRC coincide
  CMD_ABORTAR = 0x04,    // sin argumentos
};

// ---- Característica AUDIO_CTRL: respuestas (notificación) ----
enum RespuestaAudio : uint8_t {
  RSP_ENTRADA = 0x81,    // [total u8][indice u8][clipId u32][alertaId u32][bytes u32][seg u16]
  RSP_INICIO = 0x82,     // [clipId u32][total u32][crc32 u32][offset u32][payload u16]
  RSP_FIN = 0x83,        // [clipId u32][bloques u16]
  RSP_BORRADO = 0x84,    // [clipId u32]
  RSP_ABORTADO = 0x85,   // sin datos
  RSP_ERROR = 0x8F,      // [codigo u8][clipId u32]
};

enum CodigoError : uint8_t {
  ERR_NO_EXISTE = 1,
  ERR_OFFSET = 2,
  ERR_COMANDO = 3,
  ERR_OCUPADO = 4,
  ERR_CRC = 5,
};

// Bloque de datos (AUDIO_DATOS): [seq u16][payload N bytes][crc16 u16], crc16 CCITT-FALSE sobre seq+payload.
static const int BLOQUE_CABECERA = 2;
static const int BLOQUE_PIE = 2;
static const int ATT_OVERHEAD = 3;
static const int PAYLOAD_MAX = 244;

// Formato del audio: IMA-ADPCM en bloques de AUDIO_BLOQUE_BYTES. Cabecera de bloque (4 bytes):
// predictor i16 LE, índice u8, 0. Después 4 bits por muestra, la muestra baja primero.
