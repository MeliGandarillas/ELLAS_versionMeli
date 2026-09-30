package com.ELLAS.ELLAS.dto;

import jakarta.validation.constraints.*;

import java.time.Instant;

/** DTOs agrupados en un solo archivo para avanzar rápido en el hackathon. */
public final class Dtos {
    private Dtos() {}

    /** Lo que manda el teléfono por WebSocket cada pocos segundos. */
    public record UbicacionEntrante(
            @DecimalMin("-90") @DecimalMax("90") double lat,
            @DecimalMin("-180") @DecimalMax("180") double lng,
            Double precision) {}

    /** Lo que recibe cada amiga en su mapa. */
    public record UbicacionAmiga(
            Long usuarioId, String nombre, double lat, double lng,
            Double precision, Instant actualizadoEn) {}

    /** Aviso para quitar a alguien del mapa (apagó ubicación o revocó la amistad). */
    public record UbicacionOculta(Long usuarioId) {}

    public record RegistroRequest(
            @NotBlank String nombre,
            @Email @NotBlank String correo,
            @NotBlank @Size(min = 8) String password) {}

    public record LoginRequest(@NotBlank String nombre, @NotBlank String password) {}

    public record UsuarioResponse(Long id, String nombre, String correo, boolean compartiendoUbicacion) {}

    /** Respuesta de registro e inicio de sesión: los datos de la usuaria + su token (JWT). */
    public record SesionResponse(Long id, String nombre, String correo, boolean compartiendoUbicacion,
                                 String token) {}

    public record SolicitudAmistadRequest(@Email @NotBlank String correo) {}

    public record AmistadResponse(Long id, Long otroUsuarioId, String otroNombre, String estado, boolean favorita) {}

    public record FavoritaRequest(boolean favorita) {}

    public record CompartirRequest(boolean activo) {}
}
