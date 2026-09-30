package com.ELLAS.ELLAS.controller;

import com.ELLAS.ELLAS.config.UsuarioActual;
import com.ELLAS.ELLAS.dto.Dtos.*;
import com.ELLAS.ELLAS.model.Amistad;
import com.ELLAS.ELLAS.model.EstadoAmistad;
import com.ELLAS.ELLAS.model.Usuario;
import com.ELLAS.ELLAS.repository.AmistadRepository;
import com.ELLAS.ELLAS.repository.UsuarioRepository;
import com.ELLAS.ELLAS.service.UbicacionService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.server.ResponseStatusException;

import java.util.List;


@RestController
@RequestMapping("/api/amistades")
@RequiredArgsConstructor
public class AmistadController {

    /** Máximo de amigas que se pueden marcar como contacto de emergencia. */
    static final int MAX_FAVORITAS = 2;

    private final AmistadRepository amistadRepo;
    private final UsuarioRepository usuarioRepo;
    private final UbicacionService ubicacionService;

    /** Envía solicitud por correo. La ubicación NO se comparte hasta que la otra persona acepte. */
    @PostMapping("/solicitar")
    @ResponseStatus(HttpStatus.CREATED)
    @Transactional
    public AmistadResponse solicitar(@UsuarioActual Long yo,
                                     @Valid @RequestBody SolicitudAmistadRequest req) {
        Usuario solicitante = buscar(yo);
        Usuario receptor = usuarioRepo.findByCorreo(req.correo().trim().toLowerCase())
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "No existe ese usuario"));
        if (receptor.getId().equals(yo)) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "No puedes agregarte a ti misma");
        }
        if (amistadRepo.findEntre(yo, receptor.getId()).isPresent()) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "Ya existe una solicitud o amistad");
        }
        Amistad a = amistadRepo.save(Amistad.builder()
                .solicitante(solicitante).receptor(receptor)
                .estado(EstadoAmistad.PENDIENTE).build());
        return toResponse(a, yo);
    }

    @GetMapping("/pendientes")
    @Transactional(readOnly = true)
    public List<AmistadResponse> pendientes(@UsuarioActual Long yo) {
        return amistadRepo.findByReceptorIdAndEstado(yo, EstadoAmistad.PENDIENTE).stream()
                .map(a -> toResponse(a, yo)).toList();
    }

    /** Solo quien RECIBIÓ la solicitud puede aceptarla. */
    @PostMapping("/{id}/aceptar")
    @Transactional
    public AmistadResponse aceptar(@UsuarioActual Long yo, @PathVariable Long id) {
        Amistad a = amistadRepo.findById(id)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND));
        if (!a.getReceptor().getId().equals(yo)) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN);
        }
        a.setEstado(EstadoAmistad.ACEPTADA);
        return toResponse(amistadRepo.save(a), yo);
    }

    /** Rechazar o revocar: cualquiera de las dos puede cortar la amistad en cualquier momento. */
    @DeleteMapping("/{id}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    @Transactional
    public void eliminar(@UsuarioActual Long yo, @PathVariable Long id) {
        Amistad a = amistadRepo.findById(id)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND));
        Usuario s = a.getSolicitante(), r = a.getReceptor();
        if (!s.getId().equals(yo) && !r.getId().equals(yo)) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN);
        }
        amistadRepo.delete(a);
        // Cada una deja de ver a la otra en el mapa de inmediato
        ubicacionService.ocultarPara(s.getId(), List.of(r));
        ubicacionService.ocultarPara(r.getId(), List.of(s));
    }

    /** Todas las amistades aceptadas, con cuáles son favoritas (contactos de emergencia). */
    @GetMapping
    @Transactional(readOnly = true)
    public List<AmistadResponse> amigas(@UsuarioActual Long yo) {
        return amistadRepo.findDeUsuario(yo, EstadoAmistad.ACEPTADA).stream()
                .map(a -> toResponse(a, yo)).toList();
    }

    /** Marca o desmarca a una amiga como contacto de emergencia. Máximo 2 por usuaria. */
    @PutMapping("/{id}/favorita")
    @Transactional
    public AmistadResponse marcarFavorita(@UsuarioActual Long yo, @PathVariable Long id,
                                          @RequestBody FavoritaRequest req) {
        Amistad a = amistadRepo.findById(id)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND));
        if (!a.getSolicitante().getId().equals(yo) && !a.getReceptor().getId().equals(yo)) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN);
        }
        if (a.getEstado() != EstadoAmistad.ACEPTADA) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Primero debe aceptar tu solicitud de amistad");
        }
        if (req.favorita() && !a.esFavoritaPara(yo)
                && amistadRepo.contarFavoritas(yo) >= MAX_FAVORITAS) {
            throw new ResponseStatusException(HttpStatus.CONFLICT,
                    "Solo puedes tener " + MAX_FAVORITAS + " contactos de emergencia");
        }
        a.setFavoritaPara(yo, req.favorita());
        return toResponse(amistadRepo.save(a), yo);
    }

    /** Ubicaciones actuales de las amistades aceptadas (carga inicial del mapa). */
    @GetMapping("/ubicaciones")
    public List<UbicacionAmiga> ubicaciones(@UsuarioActual Long yo) {
        return ubicacionService.ubicacionesDeAmigas(yo);
    }

    private Usuario buscar(Long id) {
        return usuarioRepo.findById(id)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND));
    }

    private AmistadResponse toResponse(Amistad a, Long yo) {
        Usuario otro = a.getSolicitante().getId().equals(yo) ? a.getReceptor() : a.getSolicitante();
        return new AmistadResponse(a.getId(), otro.getId(), otro.getNombre(), a.getEstado().name(),
                a.esFavoritaPara(yo));
    }
}
