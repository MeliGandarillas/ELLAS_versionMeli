# Protocolo BLE del dije ELLAS

Fuente de verdad del contrato entre el firmware (`src/protocolo.h`, `src/ble_servicio.cpp`) y la app
(`FRONTEND/src/ble/protocolo.js`, `dijeBle.js`). Si cambias algo, cámbialo en los tres lugares.
Todos los enteros son **little-endian**.

* Nombre anunciado: `ELLAS-Dije`; el anuncio incluye el UUID del servicio (la app filtra por UUID).
* Versión del protocolo: **1** (último byte de la característica CONFIG).

## Seguridad

* El dije usa **emparejamiento LE Secure Connections ("Just Works") con vinculación**. Todas las lecturas y escrituras
  exigen cifrado, y el firmware **no envía notificaciones** hasta que el enlace esté cifrado. Es el dije quien pide el
  cifrado al conectarse: Android muestra el aviso de emparejar la primera vez.
* **Un solo teléfono por dije.** Si otro teléfono intenta emparejarse, el dije borra su vínculo y lo desconecta.
* Para cambiar de teléfono: **mantener el botón ≥ 8 s al ENCENDER** el dije (reinicio/conexión de batería, no al despertar
  del sueño). Vibra confirmando. Además hay que "olvidar" el dije en Ajustes → Bluetooth del teléfono anterior.
* Just Works protege contra escuchas pasivas, no contra un atacante activo presente en el momento del primer emparejamiento:
  empareja en un lugar privado.

## Servicio y características

UUID base: `e11a00XX-5a3f-4c1d-9b7e-d1e5ec0de000` (cambia solo `XX`).

| UUID | Nombre | Propiedades | Contenido |
|---|---|---|---|
| `e11a0001-…` | **Servicio ELLAS** | | |
| `e11a0002-…` | ALERTA | Read, Notify | `[evento u8][alertaId u32][clipId u32]` (9 bytes) |
| `e11a0003-…` | VIBRAR | Write, Write-no-response | `[patron u8]` |
| `e11a0004-…` | BATERIA | Read, Notify | `[porcentaje u8][milivoltios u16]` (3 bytes) |
| `e11a0005-…` | AUDIO_CTRL | Write, Notify | comandos y respuestas de transferencia (abajo) |
| `e11a0006-…` | AUDIO_DATOS | Notify | bloques de audio `[seq u16][payload][crc16 u16]` |
| `e11a0007-…` | CONFIG | Read, Write | lectura `[segGrabacion u16][clipsPendientes u8][version u8]`; escritura `[segGrabacion u16]` |

### ALERTA
Se notifica cuando cambia el estado de una alerta, y se puede leer para saber la última.

| `evento` | Significado |
|---|---|
| 0 | ninguno |
| 1 | **ALERTA_INICIADA**: se mantuvo el botón; empieza la grabación de `clipId` |
| 2 | **CLIP_LISTO**: terminó la grabación; `clipId` ya se puede descargar |
| 3 | **GRABACION_FALLIDA**: no se pudo grabar (micrófono o memoria) |

`alertaId` es un contador que sobrevive reinicios y sueño; una alerta produce un clip. **Si la app no estaba
conectada** cuando se presionó el botón no recibe el evento: al conectarse debe hacer `LISTAR` y tratar como alertas
pendientes los clips cuyo `alertaId` no conozca.

### VIBRAR
| `patron` | Vibración | Uso |
|---|---|---|
| 0 | tres pulsos (corto, corto, largo) | la app confirma que la alerta se envió |
| 1 | cuatro pulsos largos | encontrar el dije |
| 2 | un pulso corto | prueba / conexión |
| 3 | dos pulsos secos | error |
| 4 | un pulso de 0.7 s | (lo usa el dije al activar la alerta con el botón) |
| 0xFF | | detener |

### BATERIA
Porcentaje estimado desde la curva de descarga de una LiPo 1S. El dije notifica al conectarse y cada 60 s.

### CONFIG
`segGrabacion` (5…300, por defecto 60): duración de cada grabación. Se guarda en memoria no volátil.

## Formato del audio

* 16 kHz, 16 bits, mono, comprimido con **IMA-ADPCM** (4 bits por muestra).
* El clip es una secuencia de **bloques independientes de 256 bytes**. Cada bloque:
  `[predictor i16][indiceTabla u8][0 u8]` + 252 bytes con 504 muestras de 4 bits (**la muestra baja primero**).
  La muestra de la cabecera es la primera del bloque, así que cada bloque tiene **505 muestras**.
* Duración = `bytes / 256 * 505 / 16000` s (60 s ≈ 475 KB). Es el formato estándar de bloque de WAV IMA ADPCM
  (mono), por lo que cualquier decodificador de IMA-ADPCM sirve; la app lo convierte a WAV PCM antes de subirlo.
* Un clip cortado a mitad (batería, reinicio) se conserva hasta el último bloque completo.

## Transferencia de clips (AUDIO_CTRL + AUDIO_DATOS)

La app debe activar notificaciones en **AUDIO_CTRL** y **AUDIO_DATOS**.

### Comandos (la app escribe en AUDIO_CTRL)

| Byte 0 | Comando | Argumentos |
|---|---|---|
| `0x01` | LISTAR | – |
| `0x02` | DESCARGAR | `[clipId u32][offset u32]` |
| `0x03` | CONFIRMAR | `[clipId u32][crc32 u32]` |
| `0x04` | ABORTAR | – |

### Respuestas (notificaciones de AUDIO_CTRL)

| Byte 0 | Respuesta | Contenido |
|---|---|---|
| `0x81` | ENTRADA | `[total u8][indice u8][clipId u32][alertaId u32][bytes u32][seg u16]` (17 bytes). Una por clip; con `total = 0` no hay clips |
| `0x82` | INICIO | `[clipId u32][total u32][crc32 u32][offset u32][payload u16]` (19 bytes) |
| `0x83` | FIN | `[clipId u32][bloques u16]` — se enviaron `bloques` bloques de datos |
| `0x84` | BORRADO | `[clipId u32]` |
| `0x85` | ABORTADO | – |
| `0x8F` | ERROR | `[codigo u8][clipId u32]`: 1 no existe, 2 offset inválido, 3 comando inválido, 4 ocupado, 5 CRC no coincide |

### Bloques de datos (notificaciones de AUDIO_DATOS)

```
┌──────────┬───────────────────────────┬────────────┐
│ seq u16  │ payload (hasta `payload`) │ crc16 u16  │
└──────────┴───────────────────────────┴────────────┘
```

* `seq` empieza en **0 en cada DESCARGAR** y sube de uno en uno (no depende del offset).
* `crc16` = CRC-16/CCITT-FALSE (poly `0x1021`, init `0xFFFF`) calculado sobre `seq` (2 bytes LE) + `payload`.
* El tamaño de `payload` lo fija el dije en INICIO: `MTU - 3 - 4` (máx. 244). **La app debe negociar el MTU** (el dije
  acepta hasta 247) antes de descargar; con el MTU por defecto (23) el payload es de solo 16 bytes y es lento.
* Todos los bloques tienen `payload` bytes salvo el último.
* El `crc32` de INICIO es el CRC-32 estándar (zlib/PNG) del **clip completo** (no solo del tramo pedido).

### Flujo normal

```
app  → LISTAR
dije → ENTRADA × n
app  → DESCARGAR(clipId, 0)
dije → INICIO(clipId, total, crc32, 0, payload)
dije → DATOS seq 0, 1, 2 …          (la app verifica seq y crc16 de cada uno)
dije → FIN(clipId, bloques)
app  → comprueba bytes recibidos == total y crc32 del clip completo
app  → CONFIRMAR(clipId, crc32)
dije → BORRADO(clipId)              (solo si el crc32 coincide; si no, ERROR 5 y el clip se conserva)
```

El dije **solo borra un clip cuando recibe CONFIRMAR con el CRC-32 correcto**. Si la conexión se corta, el clip sigue ahí.

### Reanudar
Si se corta la conexión o un bloque llega con `seq` o `crc16` malos, la app se queda con los bytes buenos recibidos hasta
ese momento (`recibidos`) y pide `DESCARGAR(clipId, recibidos)`. El dije vuelve a empezar desde ese byte con `seq = 0`.
Si no llega ningún bloque durante 15 s, el dije abandona la transferencia.

## Energía y cuándo está disponible

* Sin conexión ni actividad durante 45 s el dije entra en **deep sleep** (BLE apagado). Se despierta con el botón.
* Con la app conectada se queda despierto hasta 10 min sin ningún comando; cada comando o bloque lo mantiene despierto.
* Si hay clips sin entregar, además despierta solo cada 15 min por ~25 s para que la app (con reconexión automática)
  los descargue.
* La alerta (mantener 2 s) funciona **aunque el dije esté dormido**: despierta, graba y los clips se entregan en la
  siguiente conexión.
* Ajustes en `src/config.h`: `SEG_SIN_ACTIVIDAD_SLEEP`, `SEG_CONECTADO_SIN_USO_SLEEP`, `SEG_TIMER_PENDIENTES`,
  `SEG_VENTANA_PENDIENTES`.

## Almacenamiento

Los clips viven en LittleFS (partición de ~4.9 MB, `partitions.csv`): unos 10 clips de 60 s. Si no cabe un clip nuevo se
acorta la grabación; si no caben ni 10 s, se borra el clip más antiguo (una alerta nueva importa más que una vieja sin entregar).

## Pendiente

* **Ubicación del GPS por BLE**: el módulo ATGM336H está preparado en el firmware (`GPS_ENABLED`) pero desactivado y sin
  característica BLE. La alerta usa la ubicación del teléfono.
