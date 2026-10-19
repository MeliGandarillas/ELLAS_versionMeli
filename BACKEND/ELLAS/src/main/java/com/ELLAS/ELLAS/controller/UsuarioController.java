package com.ELLAS.ELLAS.controller;

import com.ELLAS.ELLAS.config.UsuarioActual;
import com.ELLAS.ELLAS.dto.Dtos.*;
import com.ELLAS.ELLAS.model.Usuario;
import com.ELLAS.ELLAS.repository.AmistadRepository;
import com.ELLAS.ELLAS.repository.UsuarioRepository;
import com.ELLAS.ELLAS.service.LimitadorDeIntentos;
import com.ELLAS.ELLAS.service.TokenService;
import com.ELLAS.ELLAS.service.UbicacionService;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.server.ResponseStatusException;

import java.time.Duration;
import java.util.List;

@RestController
@RequestMapping("/api/usuarios")
@RequiredArgsConstructor
public class UsuarioController {

    private final UsuarioRepository usuarioRepo;
    private final AmistadRepository amistadRepo;
    private final UbicacionService ubicacionService;
    private final PasswordEncoder encoder;
    private final TokenService tokenService;
    private final LimitadorDeIntentos limitador;

    /**
     * Hash de relleno: si el nombre no existe se compara igual contra él, para que responder
     * tarde o temprano no delate qué nombres están registrados.
     */
    private String hashDeRelleno;

    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    public SesionResponse registrar(@Valid @RequestBody RegistroRequest req, HttpServletRequest http) {
        limitador.intentar("registro:" + http.getRemoteAddr(), 5, Duration.ofHours(1));
        String correo = req.correo().trim().toLowerCase();
        String nombre = req.nombre().trim();
        if (usuarioRepo.existsByCorreo(correo)) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "El correo ya está registrado");
        }
        // El nombre es con el que se inicia sesión, así que no se puede repetir
        if (usuarioRepo.existsByNombreIgnoreCase(nombre)) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "Ese nombre ya está en uso, elige otro");
        }
        Usuario u = usuarioRepo.save(Usuario.builder()
                .nombre(nombre)
                .correo(correo)
                .passwordHash(encoder.encode(req.password()))
                .build());
        return toSesion(u);
    }

    /** Inicio de sesión con el nombre y la contraseña que se usaron en el registro. */
    @PostMapping("/login")
    public SesionResponse login(@Valid @RequestBody LoginRequest req, HttpServletRequest http) {
        String nombre = req.nombre().trim().toLowerCase();
        // Por IP (todos los intentos) y por nombre (solo los fallidos, ver abajo)
        limitador.intentar("login-ip:" + http.getRemoteAddr(), 10, Duration.ofMinutes(1));
        String claveNombre = "login-nombre:" + nombre;
        limitador.intentar(claveNombre, 10, Duration.ofMinutes(15));

        List<Usuario> candidatas = usuarioRepo.findAllByNombreIgnoreCase(req.nombre().trim());
        if (candidatas.isEmpty()) encoder.matches(req.password(), hashDeRelleno());
        return candidatas.stream()
                .filter(u -> encoder.matches(req.password(), u.getPasswordHash()))
                .findFirst()
                .map(u -> {
                    limitador.reiniciar(claveNombre);
                    return toSesion(u);
                })
                // Mismo mensaje si falla el nombre o la contraseña, para no revelar qué cuentas existen
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.UNAUTHORIZED,
                        "Nombre o contraseña incorrectos"));
    }

    /** Interruptor de privacidad: prende/apaga compartir ubicación con todas sus amistades. */
    @PatchMapping("/me/compartir")
    public UsuarioResponse compartir(@UsuarioActual Long yo,
                                     @RequestBody CompartirRequest req) {
        Usuario u = usuarioRepo.findById(yo)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND));
        u.setCompartiendoUbicacion(req.activo());
        usuarioRepo.save(u);
        if (!req.activo()) {
            List<Usuario> amigas = amistadRepo.findAmigosAceptados(yo);
            ubicacionService.ocultarPara(yo, amigas);
        }
        return toResponse(u);
    }

    private synchronized String hashDeRelleno() {
        if (hashDeRelleno == null) hashDeRelleno = encoder.encode("relleno-para-igualar-tiempos");
        return hashDeRelleno;
    }

    private SesionResponse toSesion(Usuario u) {
        return new SesionResponse(u.getId(), u.getNombre(), u.getCorreo(), u.isCompartiendoUbicacion(),
                tokenService.crearToken(u));
    }

    private UsuarioResponse toResponse(Usuario u) {
        return new UsuarioResponse(u.getId(), u.getNombre(), u.getCorreo(), u.isCompartiendoUbicacion());
    }
}
