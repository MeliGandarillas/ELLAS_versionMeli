package com.ELLAS.ELLAS.evidencia;

import com.ELLAS.ELLAS.model.EvidenciaAudio;
import com.ELLAS.ELLAS.repository.AlertaRepository;
import com.ELLAS.ELLAS.repository.EvidenciaAudioRepository;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.web.server.ResponseStatusException;

import java.io.IOException;
import java.io.UncheckedIOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.*;
import java.nio.file.attribute.PosixFilePermissions;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.time.Instant;
import java.util.HexFormat;
import java.util.List;
import java.util.UUID;

/**
 * Guarda las evidencias de audio cifradas en disco y controla quién puede tocarlas:
 * TODAS las operaciones reciben el id de la usuaria autenticada y solo ven sus propias evidencias.
 * Una evidencia ajena responde 404 (no 403), para no revelar que existe.
 */
@Slf4j
@Service
public class EvidenciaService {

    public record Descarga(EvidenciaAudio evidencia, byte[] wav) {}
    public record Subida(EvidenciaAudio evidencia, boolean nueva) {}

    private final CifradoEvidencias cifrado;
    private final EvidenciaAudioRepository repo;
    private final AlertaRepository alertaRepo;
    private final Path raiz;
    private final long maxBytesPorUsuaria;

    public EvidenciaService(CifradoEvidencias cifrado, EvidenciaAudioRepository repo, AlertaRepository alertaRepo,
                            @Value("${app.evidencias.directorio}") String directorio,
                            @Value("${app.evidencias.max-mb-por-usuaria}") long maxMbPorUsuaria) {
        this.cifrado = cifrado;
        this.repo = repo;
        this.alertaRepo = alertaRepo;
        this.maxBytesPorUsuaria = maxMbPorUsuaria * 1024 * 1024;
        this.raiz = Path.of(directorio).toAbsolutePath().normalize();
        try {
            Files.createDirectories(raiz);
            try {
                Files.setPosixFilePermissions(raiz, PosixFilePermissions.fromString("rwx------"));
            } catch (UnsupportedOperationException | IOException ignorada) {
                // Sistema de archivos sin permisos POSIX (Windows): se confía en los del usuario del servicio
            }
        } catch (IOException e) {
            throw new IllegalStateException("No se pudo crear el directorio de evidencias " + raiz, e);
        }
    }

    public Subida subir(Long usuarioId, Long alertaId, byte[] wav, Integer duracionSeg, String claveCliente) {
        if (wav.length < 44 || !coincide(wav, 0, "RIFF") || !coincide(wav, 8, "WAVE")) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "El archivo debe ser un audio WAV");
        }
        if (alertaRepo.findByIdAndUsuarioId(alertaId, usuarioId).isEmpty()) {
            throw new ResponseStatusException(HttpStatus.NOT_FOUND, "La alerta no existe");
        }
        String clave = claveCliente == null || claveCliente.isBlank() ? null : claveCliente.trim();
        if (clave != null) {
            // Reintento de una subida que ya llegó: se responde con la misma evidencia
            var existente = repo.findByUsuarioIdAndClaveCliente(usuarioId, clave);
            if (existente.isPresent()) return new Subida(existente.get(), false);
        }
        if (repo.totalBytes(usuarioId) + wav.length > maxBytesPorUsuaria) {
            throw new ResponseStatusException(HttpStatus.PAYLOAD_TOO_LARGE,
                    "Llegaste al límite de espacio para evidencias. Descarga y borra algunas para subir más");
        }

        UUID id = UUID.randomUUID();
        EvidenciaAudio meta = EvidenciaAudio.builder()
                .id(id).usuarioId(usuarioId).alertaId(alertaId).claveCliente(clave)
                .creadaEn(Instant.now()).duracionSeg(duracionSeg)
                .tamanoBytes(wav.length).sha256(sha256(wav))
                .build();

        escribir(id, cifrado.cifrar(wav, aad(usuarioId, id)));
        try {
            repo.saveAndFlush(meta);
        } catch (DataIntegrityViolationException e) {
            borrarArchivo(id);
            // Dos subidas simultáneas con la misma clave: gana la primera
            if (clave != null) {
                var ganadora = repo.findByUsuarioIdAndClaveCliente(usuarioId, clave);
                if (ganadora.isPresent()) return new Subida(ganadora.get(), false);
            }
            throw e;
        } catch (RuntimeException e) {
            borrarArchivo(id);
            throw e;
        }
        return new Subida(meta, true);
    }

    public List<EvidenciaAudio> listar(Long usuarioId, Long alertaId) {
        return alertaId == null
                ? repo.findByUsuarioIdOrderByCreadaEnDesc(usuarioId)
                : repo.findByUsuarioIdAndAlertaIdOrderByCreadaEnDesc(usuarioId, alertaId);
    }

    public Descarga descargar(Long usuarioId, UUID id) {
        EvidenciaAudio meta = repo.findByIdAndUsuarioId(id, usuarioId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Evidencia no encontrada"));
        try {
            byte[] wav = cifrado.descifrar(Files.readAllBytes(ruta(id)), aad(usuarioId, id));
            return new Descarga(meta, wav);
        } catch (NoSuchFileException e) {
            log.error("Falta el archivo de la evidencia {}", id);
            throw new ResponseStatusException(HttpStatus.NOT_FOUND, "El archivo de la evidencia ya no está");
        } catch (EvidenciaCorruptaException e) {
            log.error("Evidencia {} no pasó la verificación de integridad: {}", id, e.getMessage());
            throw new ResponseStatusException(HttpStatus.INTERNAL_SERVER_ERROR, "No se pudo leer la evidencia");
        } catch (IOException e) {
            throw new UncheckedIOException(e);
        }
    }

    public void borrar(Long usuarioId, UUID id) {
        EvidenciaAudio meta = repo.findByIdAndUsuarioId(id, usuarioId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Evidencia no encontrada"));
        repo.delete(meta);
        repo.flush();
        borrarArchivo(id);
    }

    // ---------------------------------------------------------------- disco
    private Path ruta(UUID id) {
        return raiz.resolve(id + ".ele");
    }

    private void escribir(UUID id, byte[] datos) {
        try {
            Path tmp = raiz.resolve(id + ".tmp");
            Files.write(tmp, datos, StandardOpenOption.CREATE_NEW);
            try {
                Files.setPosixFilePermissions(tmp, PosixFilePermissions.fromString("rw-------"));
            } catch (UnsupportedOperationException ignorada) {
                // Sin permisos POSIX (Windows)
            }
            Files.move(tmp, ruta(id), StandardCopyOption.ATOMIC_MOVE);
        } catch (IOException e) {
            throw new UncheckedIOException("No se pudo guardar la evidencia", e);
        }
    }

    private void borrarArchivo(UUID id) {
        try {
            Files.deleteIfExists(ruta(id));
            Files.deleteIfExists(raiz.resolve(id + ".tmp"));
        } catch (IOException e) {
            log.error("No se pudo borrar el archivo de la evidencia {}", id, e);
        }
    }

    // ---------------------------------------------------------------- utilidades
    static String aad(Long usuarioId, UUID id) {
        return "ellas-evidencia:" + usuarioId + ":" + id;
    }

    private static boolean coincide(byte[] datos, int desde, String texto) {
        byte[] t = texto.getBytes(StandardCharsets.US_ASCII);
        for (int i = 0; i < t.length; i++) {
            if (datos[desde + i] != t[i]) return false;
        }
        return true;
    }

    private static String sha256(byte[] datos) {
        try {
            return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(datos));
        } catch (NoSuchAlgorithmException e) {
            throw new IllegalStateException(e);
        }
    }
}
