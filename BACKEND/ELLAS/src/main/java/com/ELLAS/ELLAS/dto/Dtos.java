package com.ELLAS.ELLAS.dto;

import jakarta.validation.constraints.*;

import java.time.Instant;

public final class Dtos {
    private Dtos() {}

    public record UbicacionEntrante(
            @DecimalMin("-90") @DecimalMax("90") double lat,
            @DecimalMin("-180") @DecimalMax("180") double lng,
            @DecimalMin("0") @DecimalMax("100000") Double precision) {}

    /** Lo que recibe cada amiga en su mapa. */
    public record UbicacionAmiga(
            Long usuarioId, String nombre, double lat, double lng,
            Double precision, Instant actualizadoEn) {}


    public record UbicacionOculta(Long usuarioId) {}

    public record RegistroRequest(
            @NotBlank @Size(max = 50) String nombre,
            @Email @NotBlank @Size(max = 254) String correo,
            // 72 es el máximo que BCrypt procesa; más largo solo gasta CPU
            @NotBlank @Size(min = 8, max = 72) String password) {}

    public record LoginRequest(@NotBlank @Size(max = 50) String nombre,
                               @NotBlank @Size(max = 72) String password) {}

    public record UsuarioResponse(Long id, String nombre, String correo, boolean compartiendoUbicacion) {}

    
    public record SesionResponse(Long id, String nombre, String correo, boolean compartiendoUbicacion,
                                 String token) {}

    public record SolicitudAmistadRequest(@Email @NotBlank @Size(max = 254) String correo) {}

    public record AmistadResponse(Long id, Long otroUsuarioId, String otroNombre, String estado, boolean favorita) {}

    public record FavoritaRequest(boolean favorita) {}

    public record CompartirRequest(boolean activo) {}

    /** Alerta del dije. La ubicación es opcional: si no llega, se usa la última que se guardó. */
    public record AlertaRequest(
            @DecimalMin("-90") @DecimalMax("90") Double lat,
            @DecimalMin("-180") @DecimalMax("180") Double lng) {}

    /** Lo que recibe cada contacto de emergencia cuando una amiga presiona el botón de su dije. */
    public record AlertaAmiga(Long usuarioId, String nombre, Double lat, Double lng, Instant enviadaEn) {}

    /** A cuántos contactos de emergencia se les envió la alerta. */
    public record AlertaResponse(int enviadas) {}
}
