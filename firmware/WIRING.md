# Conexiones del dije (Seeed XIAO ESP32-S3)

Todos los pines se definen en [`src/config.h`](src/config.h): si cambias un cable, cambia ahí el `#define`.
Los nombres **D0…D10** son los impresos en la placa.

## Tabla de pines

| Función | Pin XIAO | GPIO | Conecta a |
|---|---|---|---|
| Botón | **D1** | 2 | un lado del botón; el otro lado a **GND** |
| Motor (control) | **D2** | 3 | resistencia 1 kΩ → base del transistor (ver abajo) |
| Batería (medición) | **D0** | 1 | punto medio del divisor 100 kΩ + 100 kΩ |
| INMP441 `SCK` | **D8** | 7 | `SCK` del micrófono |
| INMP441 `WS` | **D9** | 8 | `WS` del micrófono |
| INMP441 `SD` | **D10** | 9 | `SD` del micrófono |
| INMP441 `VDD` | **3V3** | – | `VDD` del micrófono |
| INMP441 `GND` | **GND** | – | `GND` del micrófono |
| INMP441 `L/R` | **GND** | – | `L/R` a GND (canal izquierdo) |
| *GPS `TX` (futuro)* | **D7** | 44 | `TX` del ATGM336H → RX de la XIAO |
| *GPS `RX` (futuro)* | **D6** | 43 | `RX` del ATGM336H ← TX de la XIAO |
| *GPS enable (futuro)* | **D3** | 4 | opcional: `EN` del regulador/MOSFET que alimenta al GPS |
| LiPo | pads **BAT+ / BAT−** (reverso) | – | batería LiPo 3.7 V con protección |

D0–D5 y D8–D10 son pines RTC: el botón en **D1** puede despertar al dije del deep sleep.

## Diagrama

```
                    ┌──────── Seeed XIAO ESP32-S3 ────────┐
                    │ (USB-C arriba)                      │
  divisor bat ◄──── D0                               5V   │
  botón ──────────  D1                              GND ──┼──┬── GND común
  motor (base) ◄─── D2                              3V3 ──┼──┼── 3V3 común
  (GPS EN) ◄─────── D3                              D10 ──┼──┼──► INMP441 SD
                    D4                              D9  ──┼──┼──► INMP441 WS
                    D5                              D8  ──┼──┼──► INMP441 SCK
  (GPS RX) ◄─────── D6 (TX)                         D7  ◄─┼──┼─── (GPS TX)
                    └────────────[BAT+][BAT−] (reverso)───┘
```

### Micrófono INMP441

```
INMP441          XIAO
-------          ----
VDD   ───────►   3V3
GND   ───────►   GND
L/R   ───────►   GND        (canal izquierdo; el firmware lee el canal izquierdo)
SCK   ───────►   D8
WS    ───────►   D9
SD    ───────►   D10
```

Cables cortos (< 10 cm) y lejos del motor: la vibración y su corriente meten ruido en el audio.
Si el audio sale con zumbido, añade un capacitor de 100 nF + 10 µF entre `VDD` y `GND` del micrófono.

### Botón

```
D1 ───┬──[ botón ]──── GND
```

No lleva resistencia externa: el firmware activa el pull-up interno (y también durante el deep sleep).

### Motor vibrador (con transistor — **no** conectar el motor directo al pin)

Un pin del ESP32 da solo ~20 mA; un motor de vibración pide 60–100 mA.

```
          3V3 ─────────┬─────────────┐
                       │             │
                    ┌──┴──┐       ──►|──  diodo 1N4148
                    │MOTOR│       (cátodo a 3V3, ánodo al colector)
                    └──┬──┘             │
                       ├────────────────┘
                       │ C
 D2 ──[1 kΩ]── B  2N2222 / BC337 (NPN)
                       │ E
                      GND
 (100 kΩ de B a GND: mantiene el motor apagado durante el deep sleep)
```

Un MOSFET de nivel lógico (AO3400, 2N7000) también sirve: D2 → compuerta, 100 kΩ compuerta–GND, sin la resistencia de 1 kΩ.
El diodo es obligatorio: protege el transistor y el ESP32 del pico del motor al apagarse.

### Medición de batería (divisor)

La XIAO ESP32-S3 carga la LiPo por USB pero **no trae** un divisor para leer su voltaje. Hay que agregarlo:

```
BAT+ ──[100 kΩ]──┬──[100 kΩ]── GND
                 │
                 ├──[100 nF]── GND     (filtro)
                 └──────────► D0
```

A 4.2 V el pin ve 2.1 V (dentro del rango del ADC). El divisor consume ~20 µA de la batería de forma permanente;
si quieres evitarlo, alimenta el divisor desde un pin que pongas en alto solo al medir (cambia `PIN_BATERIA_ADC` y
`Bateria::milivoltios()`).

Calibración: compara con un multímetro y ajusta `BAT_DIVISOR` en `config.h`.

### GPS ATGM336H (preparado, desactivado)

No lo sueldes todavía si no lo vas a usar. Para cuando lo agregues:

```
ATGM336H     XIAO
--------     ----
VCC   ────►  3V3   (o a través del interruptor controlado por D3)
GND   ────►  GND
TXD   ────►  D7    (UART1 RX de la XIAO)
RXD   ◄────  D6    (UART1 TX de la XIAO)
```

Activarlo: compilar con `-DGPS_ENABLED=1` (`pio run -e xiao_esp32s3_gps`) o poner `GPS_ENABLED 1` en `config.h`.
Con `GPS_ENABLED 0` no se inicializa ni se toca ningún pin. Por ahora el firmware solo lo lee y lo muestra por el puerto
serie; falta exponerlo por BLE (ver "Pendiente" en `BLE.md`).

## Consumo en reposo

En deep sleep consume el ESP32 (~10 µA), más lo que gasten los componentes alimentados siempre: el micrófono
INMP441 (mA), el divisor de batería (20 µA) y el regulador de la placa. Si necesitas más autonomía, alimenta el
INMP441 desde un GPIO libre (D4 o D5; consume ~1.4 mA, el pin lo soporta) y enciéndelo solo al grabar.
