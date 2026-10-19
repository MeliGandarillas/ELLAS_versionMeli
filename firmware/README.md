# Firmware del dije ELLAS

Seeed XIAO ESP32-S3 (8 MB flash, 8 MB PSRAM) · PlatformIO + Arduino · BLE con NimBLE.

| Archivo | Para qué |
|---|---|
| [`WIRING.md`](WIRING.md) | diagrama de soldado y lista de pines |
| [`BLE.md`](BLE.md) | protocolo GATT y de transferencia de audio (contrato con la app) |
| `src/config.h` | **todos** los pines y parámetros ajustables |

## Compilar y grabar

```bash
pip install platformio
cd firmware
pio run                  # compila (xiao_esp32s3)
pio run -t upload        # graba por USB-C
pio device monitor       # consola serie (115200)
pio run -e xiao_esp32s3_gps   # compila con el GPS activado (aún no soldado; solo para comprobar que compila)
```

Primer arranque: la partición LittleFS se formatea sola. Para probar sin la app, el monitor serie muestra
`[dije] ALERTA n` cuando mantienes el botón 2 s.

## Comportamiento

1. **Mantener el botón ~2 s** = alerta (un toque corto solo hace vibrar y deja visible al dije para la app).
2. La alerta: notifica a la app por BLE → empieza a grabar (16 kHz / 16 bit mono / IMA-ADPCM, 60 s por defecto,
   configurable desde la app) → vibra para confirmar.
3. Cada alerta genera un clip en LittleFS. Si no hay conexión se acumulan varios; la app los descarga en bloques
   con CRC y reanudación, y **el dije los borra solo cuando la app confirma la recepción completa**.
4. Sin actividad entra en deep sleep; el botón lo despierta (la alerta funciona también desde el sueño).

## Pruebas en PC (sin placa)

```bash
g++ -O2 -Wall -Isrc test/prueba_pc.cpp src/adpcm.cpp src/crc.cpp -o /tmp/prueba_pc && /tmp/prueba_pc
```

Verifica el codificador ADPCM (relación señal/ruido) y los CRC. La app tiene una prueba equivalente que decodifica
vectores generados por este mismo código (`FRONTEND/scripts/`).

## Qué NO está verificado

Compila para la XIAO ESP32-S3, pero no se ha probado en hardware real: el ajuste de ganancia del micrófono
(`AUDIO_SHIFT_GANANCIA`), la curva/divisor de batería (`BAT_DIVISOR`), el consumo en deep sleep y el
emparejamiento con Android deben comprobarse con la placa.
