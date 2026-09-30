package com.ELLAS.ELLAS.model;

import jakarta.persistence.*;
import lombok.*;
import org.hibernate.annotations.ColumnDefault;

import java.time.Instant;

@Entity
@Table(name = "amistades",
       uniqueConstraints = @UniqueConstraint(columnNames = {"solicitante_id", "receptor_id"}))
@Getter @Setter @NoArgsConstructor @AllArgsConstructor @Builder
public class Amistad {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne(optional = false, fetch = FetchType.LAZY)
    @JoinColumn(name = "solicitante_id")
    private Usuario solicitante;

    @ManyToOne(optional = false, fetch = FetchType.LAZY)
    @JoinColumn(name = "receptor_id")
    private Usuario receptor;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false)
    private EstadoAmistad estado;

    @Builder.Default
    private Instant creadaEn = Instant.now();

    /**
     * Contacto de emergencia: cada una decide por su lado si la otra es su favorita
     * (máximo 2 por usuaria). El default permite agregar la columna a tablas con datos.
     */
    @Builder.Default
    @ColumnDefault("false")
    @Column(nullable = false)
    private boolean favoritaDeSolicitante = false;

    @Builder.Default
    @ColumnDefault("false")
    @Column(nullable = false)
    private boolean favoritaDeReceptor = false;

    /** ¿La usuaria `usuarioId` marcó a la otra persona de esta amistad como favorita? */
    public boolean esFavoritaPara(Long usuarioId) {
        return solicitante.getId().equals(usuarioId) ? favoritaDeSolicitante : favoritaDeReceptor;
    }

    public void setFavoritaPara(Long usuarioId, boolean favorita) {
        if (solicitante.getId().equals(usuarioId)) favoritaDeSolicitante = favorita;
        else favoritaDeReceptor = favorita;
    }
}
