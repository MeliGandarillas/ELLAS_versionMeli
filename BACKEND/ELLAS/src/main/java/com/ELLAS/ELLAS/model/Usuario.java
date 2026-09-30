package com.ELLAS.ELLAS.model;

import jakarta.persistence.*;
import lombok.*;

@Entity
@Table(name = "usuarios")
@Getter @Setter @NoArgsConstructor @AllArgsConstructor @Builder
public class Usuario {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(nullable = false)
    private String nombre;

    @Column(nullable = false, unique = true)
    private String correo;

    @Column(nullable = false)
    private String passwordHash;

    /** Interruptor de privacidad: si es false, nadie recibe su ubicación. */
    @Builder.Default
    @Column(nullable = false)
    private boolean compartiendoUbicacion = true;
}
