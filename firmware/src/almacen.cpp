#include "almacen.h"
#include <LittleFS.h>
#include <Preferences.h>
#include "config.h"
#include "adpcm.h"
#include "crc.h"

Almacen almacen;
static Preferences prefs;

bool Almacen::iniciar() {
  if (!LittleFS.begin(true)) return false;  // true = formatear si está sin formato (primer arranque)
  if (!LittleFS.exists(CLIPS_DIR)) LittleFS.mkdir(CLIPS_DIR);
  // Una grabación interrumpida (batería, reinicio) deja un .rec: se recupera como clip si tiene audio
  File dir = LittleFS.open(CLIPS_DIR);
  String huerfanos[8];
  int nh = 0;
  for (File f = dir.openNextFile(); f && nh < 8; f = dir.openNextFile()) {
    String n = f.name();
    if (n.endsWith(".rec")) huerfanos[nh++] = String(CLIPS_DIR) + "/" + n;
  }
  dir.close();
  for (int i = 0; i < nh; i++) {
    File f = LittleFS.open(huerfanos[i], "r");
    size_t b = f ? f.size() : 0;
    if (f) f.close();
    b -= b % AUDIO_BLOQUE_BYTES;
    if (b == 0) {
      LittleFS.remove(huerfanos[i]);
      continue;
    }
    String destino = huerfanos[i].substring(0, huerfanos[i].length() - 4) + ".adp";
    LittleFS.rename(huerfanos[i], destino);
  }
  return true;
}

String Almacen::ruta(uint32_t clipId, uint32_t alerta, bool grabando) const {
  char buf[48];
  snprintf(buf, sizeof(buf), "%s/%08x_%08x.%s", CLIPS_DIR, (unsigned)clipId, (unsigned)alerta, grabando ? "rec" : "adp");
  return String(buf);
}

static bool analizar(const String& nombre, Clip& c) {
  unsigned id, al;
  if (sscanf(nombre.c_str(), "%8x_%8x.adp", &id, &al) != 2 || !nombre.endsWith(".adp")) return false;
  c.id = id;
  c.alerta = al;
  return true;
}

size_t Almacen::listar(Clip* salida, size_t max) {
  size_t n = 0;
  File dir = LittleFS.open(CLIPS_DIR);
  for (File f = dir.openNextFile(); f && n < max; f = dir.openNextFile()) {
    Clip c;
    if (!analizar(f.name(), c)) continue;
    c.bytes = f.size() - (f.size() % AUDIO_BLOQUE_BYTES);
    if (c.bytes == 0) continue;
    salida[n++] = c;
  }
  dir.close();
  for (size_t i = 1; i < n; i++) {  // ordenar por id (inserción: son pocos)
    Clip k = salida[i];
    size_t j = i;
    while (j > 0 && salida[j - 1].id > k.id) { salida[j] = salida[j - 1]; j--; }
    salida[j] = k;
  }
  return n;
}

size_t Almacen::contar() {
  Clip tmp[24];
  return listar(tmp, 24);
}

bool Almacen::buscar(uint32_t clipId, Clip& clip) {
  Clip lista[24];
  size_t n = listar(lista, 24);
  for (size_t i = 0; i < n; i++) {
    if (lista[i].id == clipId) { clip = lista[i]; return true; }
  }
  return false;
}

bool Almacen::borrar(uint32_t clipId) {
  Clip c;
  return buscar(clipId, c) && LittleFS.remove(ruta(c));
}

bool Almacen::borrarMasAntiguo() {
  Clip lista[24];
  size_t n = listar(lista, 24);
  return n > 0 && LittleFS.remove(ruta(lista[0]));
}

uint32_t Almacen::crc32(const Clip& clip) {
  File f = LittleFS.open(ruta(clip), "r");
  if (!f) return 0;
  uint8_t buf[512];
  uint32_t crc = crc32Inicio(), restante = clip.bytes;
  while (restante > 0) {
    size_t n = f.read(buf, restante < sizeof(buf) ? restante : sizeof(buf));
    if (n == 0) break;
    crc = crc32Actualizar(crc, buf, n);
    restante -= n;
  }
  return crc32Fin(crc);
}

uint32_t Almacen::libre() {
  size_t total = LittleFS.totalBytes(), usado = LittleFS.usedBytes();
  return total > usado ? total - usado : 0;
}

uint16_t Almacen::segundosDeBytes(uint32_t bytes) {
  uint32_t muestras = (bytes / AUDIO_BLOQUE_BYTES) * adpcmMuestrasPorBloque(AUDIO_BLOQUE_BYTES);
  return (uint16_t)((muestras + AUDIO_RATE_HZ / 2) / AUDIO_RATE_HZ);
}

static uint32_t incrementar(const char* clave) {
  prefs.begin("dije", false);
  uint32_t v = prefs.getUInt(clave, 0) + 1;
  prefs.putUInt(clave, v);
  prefs.end();
  return v;
}
uint32_t Almacen::siguienteClipId() { return incrementar("clip"); }
uint32_t Almacen::siguienteAlertaId() { return incrementar("alerta"); }

uint16_t Almacen::segundosGrabacion() {
  prefs.begin("dije", true);
  uint16_t s = prefs.getUShort("seg", AUDIO_SEG_DEFAULT);
  prefs.end();
  if (s < AUDIO_SEG_MIN || s > AUDIO_SEG_MAX) s = AUDIO_SEG_DEFAULT;
  return s;
}

void Almacen::guardarSegundos(uint16_t s) {
  if (s < AUDIO_SEG_MIN) s = AUDIO_SEG_MIN;
  if (s > AUDIO_SEG_MAX) s = AUDIO_SEG_MAX;
  prefs.begin("dije", false);
  prefs.putUShort("seg", s);
  prefs.end();
}
