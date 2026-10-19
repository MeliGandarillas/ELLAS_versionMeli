#pragma once
#include <Arduino.h>

// Motor vibrador con PWM (LEDC). Los patrones corren sin bloquear: llamar a actualizar() en el loop.
class Vibrador {
 public:
  void iniciar();
  void patron(uint8_t patron);  // ver PatronVibracion en protocolo.h
  void parar();
  void actualizar();
  bool activo() const { return _paso < _largo; }

 private:
  struct Paso { uint16_t encendidoMs; uint16_t apagadoMs; };
  void arrancarPaso();
  Paso _pasos[8];
  uint8_t _largo = 0, _paso = 0;
  bool _encendido = false;
  uint32_t _desde = 0;
};

extern Vibrador vibrador;
