package com.ELLAS.ELLAS.model;

import jakarta.persistence.*;
import lombok.*;

import java.time.Instant;

/**
 * Solo guarda la ÚLTIMA ubicación de cada usuario (una fila por usuario).
 * No hay historial: así nadie puede reconstruir sus recorridos.
 */
@Entity
@Table(name = "ubicaciones")
@Getter @Setter @NoArgsConstructor @AllArgsConstructor @Builder
public class Ubicacion {

    @Id
    private Long usuarioId;

    @Column(nullable = false)
    private double lat;

    @Column(nullable = false)
    private double lng;

    /** Precisión en metros que reporta el dispositivo. */
    private Double precision;

    @Column(nullable = false)
    private Instant actualizadoEn;
}
