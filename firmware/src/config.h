#pragma once
// =====================================================================================
//  Configuración del dije ELLAS  (Seeed XIAO ESP32-S3)
//  TODOS los pines y parámetros ajustables están aquí. Diagrama de soldado: ../WIRING.md
// =====================================================================================
#include <Arduino.h>

// ---------- Pines (nombres Dx impresos en la placa XIAO) ----------
// Los pines D0..D5 y D8..D10 son RTC: pueden despertar del deep sleep.
#define PIN_BATERIA_ADC   D0   // GPIO1  divisor 100k+100k desde BAT+ (ADC1_CH0)
#define PIN_BOTON         D1   // GPIO2  botón a GND (pull-up interno) - despierta del deep sleep
#define PIN_MOTOR         D2   // GPIO3  a la base/compuerta del transistor del motor (activo en alto)
#define PIN_GPS_EN        D3   // GPIO4  (opcional) enciende/apaga el GPS con un MOSFET/LDO con EN
#define PIN_I2S_SCK       D8   // GPIO7  INMP441 SCK (BCLK)
#define PIN_I2S_WS        D9   // GPIO8  INMP441 WS  (LRCL)
#define PIN_I2S_SD        D10  // GPIO9  INMP441 SD  (DOUT del micrófono)
#define PIN_GPS_RX        D7   // GPIO44 recibe del TX del GPS (UART1)
#define PIN_GPS_TX        D6   // GPIO43 envía al RX del GPS   (UART1)

// ---------- GPS ATGM336H (preparado pero DESACTIVADO) ----------
// Para activarlo: compilar con -DGPS_ENABLED=1 (ver env xiao_esp32s3_gps en platformio.ini).
#ifndef GPS_ENABLED
#define GPS_ENABLED 0
#endif
#define GPS_BAUDIOS       9600

// ---------- Botón ----------
#define BOTON_DEBOUNCE_MS       30     // el botón debe mantener su estado este tiempo
#define BOTON_ALERTA_MS         2000   // pulsación larga = alerta
#define BOTON_BORRAR_BONDS_MS   8000   // al ENCENDER (no al despertar): mantener = olvidar el teléfono emparejado

// ---------- Audio (INMP441) ----------
#define AUDIO_RATE_HZ           16000  // 16 kHz, mono, 16 bit -> IMA-ADPCM (4 bits/muestra)
#define AUDIO_BLOQUE_BYTES      256    // tamaño de bloque IMA-ADPCM (505 muestras por bloque)
#define AUDIO_SHIFT_GANANCIA    14     // el INMP441 entrega 24 bits en 32: >>16 = sin ganancia, >>14 = +12 dB
#define AUDIO_SEG_DEFAULT       60     // duración por defecto de cada grabación
#define AUDIO_SEG_MIN           5
#define AUDIO_SEG_MAX           300
#define AUDIO_SEG_MIN_ESPACIO   10     // si no cabe ni esto, se borra el clip más antiguo
#define AUDIO_BUFFER_BYTES      (64 * 1024) // colchón entre captura y escritura en flash (~8 s)

// ---------- Vibración ----------
#define VIB_PWM_CANAL           0
#define VIB_PWM_FREQ            200
#define VIB_PWM_BITS            8
#define VIB_INTENSIDAD          255    // 0..255

// ---------- Batería (LiPo 1S) ----------
#define BAT_DIVISOR             2.0f   // 100k + 100k
#define BAT_MV_VACIA            3300
#define BAT_MV_LLENA            4150
#define BAT_AVISO_MUY_BAJA_PCT  10     // por debajo no se enciende el BLE sin pulsación; ver main.cpp
#define BAT_NOTIFICA_CADA_MS    60000

// ---------- Energía ----------
#define SEG_SIN_ACTIVIDAD_SLEEP 45     // desconectado y sin hacer nada -> deep sleep
#define SEG_CONECTADO_SIN_USO_SLEEP 600 // conectada la app pero sin ningún comando ni botón
#define SEG_VENTANA_PENDIENTES  25     // al despertar por timer, tiempo anunciándose para entregar clips
#define SEG_TIMER_PENDIENTES    900    // con clips sin entregar, despierta cada tanto (0 = nunca)
#define CPU_MHZ                 80

// ---------- BLE ----------
#define BLE_NOMBRE              "ELLAS-Dije"
#define BLE_MTU_PREFERIDO       247
#define BLE_BLOQUES_POR_VUELTA  6      // notificaciones por iteración del loop

// UUIDs propios (ver BLE.md). Se escriben igual en la app: FRONTEND/src/ble/protocolo.js
#define UUID_SERVICIO           "e11a0001-5a3f-4c1d-9b7e-d1e5ec0de000"
#define UUID_ALERTA             "e11a0002-5a3f-4c1d-9b7e-d1e5ec0de000"
#define UUID_VIBRAR             "e11a0003-5a3f-4c1d-9b7e-d1e5ec0de000"
#define UUID_BATERIA            "e11a0004-5a3f-4c1d-9b7e-d1e5ec0de000"
#define UUID_AUDIO_CTRL         "e11a0005-5a3f-4c1d-9b7e-d1e5ec0de000"
#define UUID_AUDIO_DATOS        "e11a0006-5a3f-4c1d-9b7e-d1e5ec0de000"
#define UUID_CONFIG             "e11a0007-5a3f-4c1d-9b7e-d1e5ec0de000"

// ---------- Almacenamiento ----------
#define CLIPS_DIR               "/clips"
