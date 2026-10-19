#include "vibrador.h"
#include "config.h"
#include "protocolo.h"

Vibrador vibrador;

void Vibrador::iniciar() {
  ledcSetup(VIB_PWM_CANAL, VIB_PWM_FREQ, VIB_PWM_BITS);
  ledcAttachPin(PIN_MOTOR, VIB_PWM_CANAL);
  ledcWrite(VIB_PWM_CANAL, 0);
}

void Vibrador::parar() {
  _largo = _paso = 0;
  _encendido = false;
  ledcWrite(VIB_PWM_CANAL, 0);
}

void Vibrador::patron(uint8_t p) {
  parar();
  auto agregar = [&](uint16_t on, uint16_t off) { if (_largo < 8) _pasos[_largo++] = {on, off}; };
  switch (p) {
    case VIB_CONFIRMA_ALERTA: agregar(150, 120); agregar(150, 120); agregar(400, 0); break;
    case VIB_ENCONTRAR: for (int i = 0; i < 4; i++) agregar(500, 300); break;
    case VIB_CORTO: agregar(120, 0); break;
    case VIB_ERROR: agregar(80, 80); agregar(80, 0); break;
    case VIB_ALERTA_LOCAL: agregar(700, 0); break;
    default: return;  // VIB_PARAR u otro valor
  }
  arrancarPaso();
}

void Vibrador::arrancarPaso() {
  _encendido = true;
  _desde = millis();
  ledcWrite(VIB_PWM_CANAL, VIB_INTENSIDAD);
}

void Vibrador::actualizar() {
  if (!activo()) return;
  uint32_t t = millis() - _desde;
  const Paso& p = _pasos[_paso];
  if (_encendido && t >= p.encendidoMs) {
    ledcWrite(VIB_PWM_CANAL, 0);
    _encendido = false;
    _desde = millis();
    if (p.apagadoMs == 0) _paso++;
  } else if (!_encendido && t >= p.apagadoMs) {
    if (++_paso < _largo) arrancarPaso();
  }
}
