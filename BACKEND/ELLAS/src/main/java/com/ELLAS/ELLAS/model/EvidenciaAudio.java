package com.ELLAS.ELLAS.model;

import jakarta.persistence.*;
import lombok.*;

import java.time.Instant;
import java.util.UUID;

/**
 * Metadatos de una evidencia de audio. El audio en sí vive CIFRADO en disco (ver EvidenciaService);
 * aquí no hay nada que permita escucharlo.
 */
@Entity
@Table(name = "evidencias_audio",
        indexes = @Index(columnList = "usuarioId, creadaEn"),
        // Reintentos de subida de la app: la misma clave de cliente no crea un duplicado
        uniqueConstraints = @UniqueConstraint(columnNames = {"usuarioId", "claveCliente"}))
@Getter @Setter @NoArgsConstructor @AllArgsConstructor @Builder
public class EvidenciaAudio {

    @Id
    private UUID id;

    /** Dueña de la evidencia: la única que puede escucharla, descargarla o borrarla. */
    @Column(nullable = false)
    private Long usuarioId;

    @Column(nullable = false)
    private Long alertaId;

    private String claveCliente;

    @Column(nullable = false)
    private Instant creadaEn;

    private Integer duracionSeg;

    /** Tamaño del WAV original (sin cifrar). */
    @Column(nullable = false)
    private long tamanoBytes;

    /** SHA-256 del WAV original, para que la dueña pueda demostrar que no se alteró al entregarlo. */
    @Column(nullable = false, length = 64)
    private String sha256;
}
