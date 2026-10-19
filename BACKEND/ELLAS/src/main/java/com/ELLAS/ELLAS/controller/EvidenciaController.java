package com.ELLAS.ELLAS.controller;

import com.ELLAS.ELLAS.config.UsuarioActual;
import com.ELLAS.ELLAS.dto.Dtos.EvidenciaResponse;
import com.ELLAS.ELLAS.evidencia.EvidenciaService;
import com.ELLAS.ELLAS.model.EvidenciaAudio;
import lombok.RequiredArgsConstructor;
import org.springframework.http.CacheControl;
import org.springframework.http.ContentDisposition;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;
import org.springframework.web.server.ResponseStatusException;

import java.io.IOException;
import java.time.ZoneOffset;
import java.time.format.DateTimeFormatter;
import java.util.List;
import java.util.UUID;

/** Evidencias de audio de una alerta. Solo su dueña las ve; todo va cifrado en disco. */
@RestController
@RequestMapping("/api/evidencias")
@RequiredArgsConstructor
public class EvidenciaController {

    private static final MediaType AUDIO_WAV = MediaType.parseMediaType("audio/wav");
    private static final DateTimeFormatter FECHA = DateTimeFormatter.ofPattern("yyyyMMdd-HHmmss").withZone(ZoneOffset.UTC);

    private final EvidenciaService servicio;

    /**
     * Sube el audio (WAV) de una alerta. `clave` (opcional) hace la subida idempotente: si la app
     * reintenta con la misma clave se devuelve la evidencia ya guardada (200) en vez de duplicarla (201).
     */
    @PostMapping(consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    public ResponseEntity<EvidenciaResponse> subir(@UsuarioActual Long yo,
                                                   @RequestParam Long alertaId,
                                                   @RequestParam(required = false) Integer duracionSeg,
                                                   @RequestParam(required = false) String clave,
                                                   @RequestParam("archivo") MultipartFile archivo) throws IOException {
        if (archivo.isEmpty()) throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Falta el archivo de audio");
        if (clave != null && clave.length() > 100) throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Clave demasiado larga");
        if (duracionSeg != null && (duracionSeg < 0 || duracionSeg > 3600)) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Duración inválida");
        }
        var subida = servicio.subir(yo, alertaId, archivo.getBytes(), duracionSeg, clave);
        return ResponseEntity.status(subida.nueva() ? HttpStatus.CREATED : HttpStatus.OK)
                .body(aRespuesta(subida.evidencia()));
    }

    @GetMapping
    public List<EvidenciaResponse> listar(@UsuarioActual Long yo, @RequestParam(required = false) Long alertaId) {
        return servicio.listar(yo, alertaId).stream().map(EvidenciaController::aRespuesta).toList();
    }

    /** Audio descifrado. Con `descargar=true` el navegador lo guarda como archivo en vez de reproducirlo. */
    @GetMapping("/{id}/audio")
    public ResponseEntity<byte[]> audio(@UsuarioActual Long yo, @PathVariable UUID id,
                                        @RequestParam(defaultValue = "false") boolean descargar) {
        var d = servicio.descargar(yo, id);
        String nombre = "ellas-evidencia-" + FECHA.format(d.evidencia().getCreadaEn()) + "-" + id.toString().substring(0, 8) + ".wav";
        return ResponseEntity.ok()
                .contentType(AUDIO_WAV)
                .contentLength(d.wav().length)
                .header(HttpHeaders.CONTENT_DISPOSITION,
                        (descargar ? ContentDisposition.attachment() : ContentDisposition.inline()).filename(nombre).build().toString())
                .header("X-Content-Type-Options", "nosniff")
                .header("X-Evidencia-Sha256", d.evidencia().getSha256())
                .cacheControl(CacheControl.noStore())
                .body(d.wav());
    }

    @DeleteMapping("/{id}")
    public ResponseEntity<Void> borrar(@UsuarioActual Long yo, @PathVariable UUID id) {
        servicio.borrar(yo, id);
        return ResponseEntity.noContent().build();
    }

    private static EvidenciaResponse aRespuesta(EvidenciaAudio e) {
        return new EvidenciaResponse(e.getId(), e.getAlertaId(), e.getCreadaEn(), e.getDuracionSeg(),
                e.getTamanoBytes(), e.getSha256());
    }
}
