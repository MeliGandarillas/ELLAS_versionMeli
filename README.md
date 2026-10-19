# ELLAS_versionMeli
Proyecto ELLAS desde el avance del Hackatec 2026 etapa regional. Continuación dirigida por Meli

## Dije (hardware) · integración app + firmware + backend

| Parte | Dónde | Documentación |
|---|---|---|
| Firmware (XIAO ESP32-S3, PlatformIO) | [`firmware/`](firmware/README.md) | [`WIRING.md`](firmware/WIRING.md) (soldado), [`BLE.md`](firmware/BLE.md) (protocolo) |
| App: capa BLE, pantallas "Mi dije" y "Mis evidencias" | `FRONTEND/src/ble/`, `src/pages/Dije.jsx`, `src/pages/Evidencias.jsx` | abajo |
| Backend: alertas y evidencias de audio cifradas | `BACKEND/ELLAS/.../EvidenciaController.java` | abajo |

**Flujo:** el botón del dije (2 s) → BLE avisa a la app → la app dispara la alerta a los contactos favoritos con la ubicación del
teléfono y hace vibrar el dije → el dije graba 60 s (configurable) → la app descarga el audio por BLE (con CRC, reanudable),
lo guarda en el teléfono, **le confirma al dije (que solo entonces borra su copia)** y lo sube al backend → "Mis evidencias".

### App
* `FRONTEND/src/ble/protocolo.js` (UUIDs, CRC, ADPCM→WAV), `dijeBle.js` (cliente BLE), `servicioDije.js` (buscar/emparejar/recordar,
  reconexión automática, flujo de alerta, descarga y subida), `dijeSimulado.js` (dije falso con clip de audio de prueba).
* Usa `@capacitor-community/bluetooth-le` (plugin nativo en la APK; en el navegador usa Web Bluetooth). Permisos de Android
  (BLUETOOTH_SCAN/CONNECT y ubicación) ya están en `AndroidManifest.xml`.
* **Probar sin el dije:** menú de usuaria → *Mi dije* → *Modo de prueba (sin dije)* → "Usar un dije simulado".
* Pruebas: `npm test` (protocolo, cliente BLE y servicio contra el dije simulado; incluye cortes de conexión, bloques dañados y
  falta de internet). Descargar/compartir evidencias en la APK usa `@capacitor/filesystem` + `@capacitor/share`
  (tras `npm install` corre `npm run build:apk` para sincronizar).

### Backend
* `POST /api/alertas` ahora registra la alerta y devuelve `alertaId`.
* `POST /api/evidencias` (multipart: `archivo` WAV, `alertaId`, `duracionSeg`, `clave` opcional para reintentos),
  `GET /api/evidencias`, `GET /api/evidencias/{id}/audio?descargar=true`, `DELETE /api/evidencias/{id}`. Solo la dueña ve las suyas
  (las ajenas responden 404, tampoco las ven sus contactos de emergencia).
* Se guardan **cifradas** (AES-256-GCM, ligadas a usuaria+id) en `EVIDENCIAS_DIR`. **Hay que definir `EVIDENCIAS_CLAVE`** en el `.env`
  (`openssl rand -base64 32`; ver `.env.example`) y respaldarla: sin ella no se pueden recuperar. Nginx ya admite subidas de 15 MB.

### Limitaciones conocidas
* No se ha probado con hardware real ni se ha generado la APK en este entorno (no hay Android SDK): verificado con compilación del
  firmware, `vite build` + `cap sync`, pruebas automáticas y el flujo completo en navegador con el dije simulado.
* La transferencia en segundo plano funciona mientras el proceso de la app siga vivo; no hay un *foreground service* de Android que
  la mantenga con la pantalla apagada o la app cerrada. Si el dije se graba con la app cerrada, los clips se entregan al volver a abrirla.
* El firmware anterior de prueba (`dije_ble.ino`, protocolo de texto "ALERTA"/"VIBRAR") ya no es compatible con la app.
