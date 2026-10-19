package com.ELLAS.ELLAS.dto;

import jakarta.validation.constraints.*;

import java.time.Instant;

public final class Dtos {
    private Dtos() {}

    public record UbicacionEntrante(
            @DecimalMin("-90") @DecimalMax("90") double lat,
            @DecimalMin("-180") @DecimalMax("180") double lng,
            Double precision) {}

    /** Lo que recibe cada amiga en su mapa. */
    public record UbicacionAmiga(
            Long usuarioId, String nombre, double lat, double lng,
            Double precision, Instant actualizadoEn) {}


    public record UbicacionOculta(Long usuarioId) {}

    public record RegistroRequest(
            @NotBlank String nombre,
            @Email @NotBlank String correo,
            @NotBlank @Size(min = 8) String password) {}

    public record LoginRequest(@NotBlank String nombre, @NotBlank String password) {}

    public record UsuarioResponse(Long id, String nombre, String correo, boolean compartiendoUbicacion) {}

    
    public record SesionResponse(Long id, String nombre, String correo, boolean compartiendoUbicacion,
                                 String token) {}

    public record SolicitudAmistadRequest(@Email @NotBlank String correo) {}

    public record AmistadResponse(Long id, Long otroUsuarioId, String otroNombre, String estado, boolean favorita) {}

    public record FavoritaRequest(boolean favorita) {}

    public record CompartirRequest(boolean activo) {}

    /** Alerta del dije. La ubicación es opcional: si no llega, se usa la última que se guardó. */
    public record AlertaRequest(
            @DecimalMin("-90") @DecimalMax("90") Double lat,
            @DecimalMin("-180") @DecimalMax("180") Double lng) {}

    /** Lo que recibe cada contacto de emergencia cuando una amiga presiona el botón de su dije. */
    public record AlertaAmiga(Long usuarioId, String nombre, Double lat, Double lng, Instant enviadaEn) {}

    /** A cuántos contactos de emergencia se les envió la alerta, y el id con el que se registró (para ligarle evidencias). */
    public record AlertaResponse(int enviadas, Long alertaId) {}

    /** Metadatos de una evidencia de audio (el audio se pide aparte, descifrado solo para su dueña). */
    public record EvidenciaResponse(java.util.UUID id, Long alertaId, Instant creadaEn, Integer duracionSeg,
                                    long tamanoBytes, String sha256) {}
}
