package com.ELLAS.ELLAS.model;

import jakarta.persistence.*;
import lombok.*;

import java.time.Instant;

/**
 * Registro de cada alerta que una usuaria disparó con su dije. Existe para poder ligar a ella las
 * evidencias (audios). NO es un historial de recorridos: guarda un solo punto, el de la alerta.
 */
@Entity
@Table(name = "alertas", indexes = @Index(columnList = "usuarioId"))
@Getter @Setter @NoArgsConstructor @AllArgsConstructor @Builder
public class Alerta {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(nullable = false)
    private Long usuarioId;

    private Double lat;
    private Double lng;

    @Column(nullable = false)
    private Instant creadaEn;
}
