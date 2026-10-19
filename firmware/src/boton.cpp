#include "boton.h"
#include "config.h"

void Boton::iniciar(bool yaPresionado) {
  pinMode(PIN_BOTON, INPUT_PULLUP);
  _estable = _lectura = yaPresionado && digitalRead(PIN_BOTON) == LOW;
  _inicio = millis();
}

void Boton::actualizar() {
  bool ahora = digitalRead(PIN_BOTON) == LOW;
  uint32_t t = millis();
  if (ahora != _lectura) {
    _lectura = ahora;
    _cambio = t;
  }
  if (_lectura != _estable && t - _cambio >= BOTON_DEBOUNCE_MS) {
    _estable = _lectura;
    if (_estable) {
      _inicio = t;
      _largoEmitido = false;
    } else if (!_largoEmitido) {
      _evCorto = true;
    }
  }
  if (_estable && !_largoEmitido && t - _inicio >= BOTON_ALERTA_MS) {
    _largoEmitido = true;
    _evLargo = true;
  }
}

bool Boton::alLargo() { bool v = _evLargo; _evLargo = false; return v; }
bool Boton::alCorto() { bool v = _evCorto; _evCorto = false; return v; }
