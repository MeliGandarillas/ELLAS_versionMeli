// Dije ELLAS - Seeed XIAO ESP32-S3
//  * Pulsación larga (BOTON_ALERTA_MS) = alerta: avisa a la app por BLE, vibra y graba audio.
//  * Los clips quedan en LittleFS hasta que la app confirme que los recibió completos.
//  * Sin actividad se duerme (deep sleep) y despierta con el botón.
#include <Arduino.h>
#include "config.h"
#include "protocolo.h"
#include "almacen.h"
#include "bateria.h"
#include "ble_servicio.h"
#include "boton.h"
#include "energia.h"
#include "gps.h"
#include "grabador.h"
#include "vibrador.h"

static Boton boton;
static energia::Despertar despertar;
static uint32_t ultimaActividad;      // última vez que pasó algo que justifica seguir despierto
static uint32_t ultimaBateria;
static bool listoPrevio = false;
static bool conexionPrevia = false;

static void actividad() { ultimaActividad = millis(); }

static void iniciarAlerta() {
  if (grabador.grabando()) {  // ya hay una alerta grabando: solo se confirma que el botón se sintió
    vibrador.patron(VIB_CORTO);
    return;
  }
  const uint32_t alerta = almacen.siguienteAlertaId();
  const uint32_t clip = almacen.siguienteClipId();
  Serial.printf("[dije] ALERTA %u (clip %u)\n", (unsigned)alerta, (unsigned)clip);

  ble.anunciar(!ble.hayConexion());               // si la app no está conectada, queda visible para reconectar
  ble.notificarAlerta(EVT_ALERTA_INICIADA, alerta, clip);
  grabador.iniciar(clip, alerta, almacen.segundosGrabacion());  // primero el audio: no perder ni un segundo
  vibrador.patron(VIB_ALERTA_LOCAL);
  gps::actualizar();
  FixGps f = gps::ultimo();
  if (f.valido) Serial.printf("[dije] GPS %.6f,%.6f\n", f.lat, f.lng);
  actividad();
}

void setup() {
  setCpuFrequencyMhz(CPU_MHZ);
  Serial.begin(115200);
  despertar = energia::causa();

  vibrador.iniciar();
  Bateria::iniciar();
  const bool botonYaApretado = (despertar == energia::BOTON);
  boton.iniciar(botonYaApretado);
  if (!almacen.iniciar()) Serial.println("[dije] LittleFS no inició");
  gps::iniciar();
  ble.iniciar();

  // Al ENCENDER (no al despertar) mantener el botón borra el teléfono emparejado
  if (despertar == energia::ENCENDIDO && digitalRead(PIN_BOTON) == LOW) {
    const uint32_t t0 = millis();
    while (digitalRead(PIN_BOTON) == LOW && millis() - t0 < BOTON_BORRAR_BONDS_MS) delay(20);
    if (millis() - t0 >= BOTON_BORRAR_BONDS_MS) {
      ble.borrarEmparejamientos();
      vibrador.patron(VIB_CONFIRMA_ALERTA);
      Serial.println("[dije] emparejamientos borrados");
      boton.iniciar(false);
    }
  }

  ble.anunciar(true);
  ultimaActividad = millis();
  Serial.printf("[dije] despierta (causa %d), clips pendientes: %u\n", (int)despertar, (unsigned)almacen.contar());

  if (despertar == energia::ENCENDIDO) vibrador.patron(VIB_CORTO);
}

void loop() {
  boton.actualizar();
  vibrador.actualizar();
  gps::actualizar();
  ble.actualizar();

  if (boton.alLargo()) iniciarAlerta();
  if (boton.alCorto()) {  // toque corto: confirma que está vivo y se deja visible para la app
    vibrador.patron(VIB_CORTO);
    ble.anunciar(!ble.hayConexion());
    actividad();
  }

  uint32_t clipId, alertaId;
  bool ok;
  if (grabador.terminado(clipId, alertaId, ok)) {
    Serial.printf("[dije] grabación %s (clip %u)\n", ok ? "lista" : "FALLÓ", (unsigned)clipId);
    ble.notificarAlerta(ok ? EVT_CLIP_LISTO : EVT_GRABACION_FALLIDA, alertaId, clipId);
    if (!ok) vibrador.patron(VIB_ERROR);
    ble.anunciar(!ble.hayConexion());
    actividad();
  }

  // Conexión nueva o perdida
  bool conectado = ble.hayConexion();
  if (conectado != conexionPrevia) {
    conexionPrevia = conectado;
    if (!conectado) ble.anunciar(true);  // vuelve a ser visible para la reconexión automática de la app
    actividad();
  }
  // La actividad de la app (comandos, transferencias) también cuenta para no dormirse
  if (conectado && (ble.ocupado() || ble.ultimaActividad() > ultimaActividad)) ultimaActividad = max(ultimaActividad, ble.ultimaActividad());

  // Batería: una vez al quedar lista la conexión cifrada y luego cada minuto
  const bool listoAhora = ble.listo();
  if (listoAhora && (!listoPrevio || millis() - ultimaBateria > BAT_NOTIFICA_CADA_MS)) {
    ultimaBateria = millis();
    const uint16_t mv = Bateria::milivoltios();
    ble.notificarBateria(Bateria::porcentaje(mv), mv);
  }
  listoPrevio = listoAhora;

  // Deep sleep: nada grabándose, sin transferencias ni vibración, y sin actividad un buen rato
  const uint32_t limiteMs = (despertar == energia::TEMPORIZADOR && !conectado)
                                ? (uint32_t)SEG_VENTANA_PENDIENTES * 1000
                                : (uint32_t)(conectado ? SEG_CONECTADO_SIN_USO_SLEEP : SEG_SIN_ACTIVIDAD_SLEEP) * 1000;
  const bool libre = !grabador.grabando() && !ble.ocupado() && !vibrador.activo() && !boton.presionado();
  if (libre && millis() - ultimaActividad > limiteMs) {
    energia::dormir(almacen.contar() > 0 ? SEG_TIMER_PENDIENTES : 0);
  }
  delay(2);
}
