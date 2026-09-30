package com.ELLAS.ELLAS.controller;

import com.ELLAS.ELLAS.config.UsuarioActual;
import com.ELLAS.ELLAS.dto.Dtos.*;
import com.ELLAS.ELLAS.model.Usuario;
import com.ELLAS.ELLAS.repository.AmistadRepository;
import com.ELLAS.ELLAS.repository.UsuarioRepository;
import com.ELLAS.ELLAS.service.TokenService;
import com.ELLAS.ELLAS.service.UbicacionService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.server.ResponseStatusException;

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

    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    public SesionResponse registrar(@Valid @RequestBody RegistroRequest req) {
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
    public SesionResponse login(@Valid @RequestBody LoginRequest req) {
        return usuarioRepo.findAllByNombreIgnoreCase(req.nombre().trim()).stream()
                .filter(u -> encoder.matches(req.password(), u.getPasswordHash()))
                .findFirst()
                .map(this::toSesion)
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

    private SesionResponse toSesion(Usuario u) {
        return new SesionResponse(u.getId(), u.getNombre(), u.getCorreo(), u.isCompartiendoUbicacion(),
                tokenService.crearToken(u));
    }

    private UsuarioResponse toResponse(Usuario u) {
        return new UsuarioResponse(u.getId(), u.getNombre(), u.getCorreo(), u.isCompartiendoUbicacion());
    }
}
