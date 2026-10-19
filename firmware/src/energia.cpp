#include "energia.h"
#include <driver/rtc_io.h>
#include <esp_sleep.h>
#include "config.h"
#include "gps.h"

namespace energia {

Despertar causa() {
  switch (esp_sleep_get_wakeup_cause()) {
    case ESP_SLEEP_WAKEUP_EXT0: return BOTON;
    case ESP_SLEEP_WAKEUP_TIMER: return TEMPORIZADOR;
    default: return ENCENDIDO;
  }
}

void dormir(uint32_t despertarEnSeg) {
  // El motor debe quedar apagado y el GPS sin corriente
  ledcWrite(0, 0);
  gps::apagar();

  // Con el botón apretado el despertar sería inmediato: se espera a que lo suelten
  while (digitalRead(PIN_BOTON) == LOW) delay(10);
  delay(50);

  const gpio_num_t boton = (gpio_num_t)PIN_BOTON;
  rtc_gpio_init(boton);
  rtc_gpio_set_direction(boton, RTC_GPIO_MODE_INPUT_ONLY);
  rtc_gpio_pullup_en(boton);  // el pull-up debe seguir activo durante el deep sleep
  rtc_gpio_pulldown_dis(boton);
  esp_sleep_enable_ext0_wakeup(boton, 0);  // despierta cuando el botón lleva el pin a GND
  if (despertarEnSeg > 0) esp_sleep_enable_timer_wakeup((uint64_t)despertarEnSeg * 1000000ULL);

  Serial.println("[dije] deep sleep");
  Serial.flush();
  esp_deep_sleep_start();
  for (;;) {}  // no se llega aquí
}

}  // namespace energia
