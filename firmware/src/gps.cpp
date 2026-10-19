#include "gps.h"

#if GPS_ENABLED

namespace {
HardwareSerial& puerto = Serial1;
String linea;
FixGps fix;
uint32_t instanteFix = 0;

// "4807.038" + 'N' -> grados decimales
double aGrados(const String& campo, const String& hemisferio) {
  if (campo.length() < 4) return 0;
  int punto = campo.indexOf('.');
  int gradosDigitos = punto - 2;
  double g = campo.substring(0, gradosDigitos).toDouble();
  double m = campo.substring(gradosDigitos).toDouble();
  double v = g + m / 60.0;
  return (hemisferio == "S" || hemisferio == "W") ? -v : v;
}

bool checksumOk(const String& s) {
  int a = s.indexOf('$'), b = s.indexOf('*');
  if (a < 0 || b < 0 || b + 3 > (int)s.length()) return false;
  uint8_t x = 0;
  for (int i = a + 1; i < b; i++) x ^= (uint8_t)s[i];
  return x == (uint8_t)strtol(s.substring(b + 1, b + 3).c_str(), nullptr, 16);
}

String campo(const String& s, int n) {
  int ini = 0;
  for (int i = 0; i < n; i++) {
    ini = s.indexOf(',', ini);
    if (ini < 0) return "";
    ini++;
  }
  int fin = s.indexOf(',', ini);
  if (fin < 0) fin = s.indexOf('*', ini);
  return fin < 0 ? s.substring(ini) : s.substring(ini, fin);
}

void procesar(const String& s) {
  if (!checksumOk(s)) return;
  // $GNRMC,hhmmss,A,lat,N,lng,E,...   (A = fix válido)   $GPRMC / $BDRMC / $GNRMC
  if (s.indexOf("RMC,") == 3) {
    if (campo(s, 2) != "A") return;
    fix.lat = aGrados(campo(s, 3), campo(s, 4));
    fix.lng = aGrados(campo(s, 5), campo(s, 6));
    fix.valido = true;
    instanteFix = millis();
  }
}
}  // namespace

void gps::iniciar() {
  pinMode(PIN_GPS_EN, OUTPUT);
  digitalWrite(PIN_GPS_EN, HIGH);
  puerto.begin(GPS_BAUDIOS, SERIAL_8N1, PIN_GPS_RX, PIN_GPS_TX);
}

void gps::actualizar() {
  while (puerto.available()) {
    char c = puerto.read();
    if (c == '\n') {
      procesar(linea);
      linea = "";
    } else if (c != '\r' && linea.length() < 120) {
      linea += c;
    }
  }
}

void gps::apagar() {
  puerto.end();
  digitalWrite(PIN_GPS_EN, LOW);
}

FixGps gps::ultimo() {
  FixGps r = fix;
  r.edadMs = fix.valido ? millis() - instanteFix : 0;
  return r;
}

#else  // GPS desactivado: no hace nada y no toca ningún pin

void gps::iniciar() {}
void gps::actualizar() {}
void gps::apagar() {}
FixGps gps::ultimo() { return FixGps(); }

#endif
