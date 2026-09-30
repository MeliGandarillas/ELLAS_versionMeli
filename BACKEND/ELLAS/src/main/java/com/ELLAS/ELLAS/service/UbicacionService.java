package com.ELLAS.ELLAS.service;

import com.ELLAS.ELLAS.dto.Dtos.*;
import com.ELLAS.ELLAS.model.Ubicacion;
import com.ELLAS.ELLAS.model.Usuario;
import com.ELLAS.ELLAS.repository.AmistadRepository;
import com.ELLAS.ELLAS.repository.UbicacionRepository;
import com.ELLAS.ELLAS.repository.UsuarioRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.messaging.simp.SimpMessagingTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;
import java.util.List;

@Service
@RequiredArgsConstructor
public class UbicacionService {

    public static final String COLA_UBICACIONES = "/queue/ubicaciones";
    public static final String COLA_OCULTAR = "/queue/ubicaciones-ocultas";

    private final UbicacionRepository ubicacionRepo;
    private final UsuarioRepository usuarioRepo;
    private final AmistadRepository amistadRepo;
    private final SimpMessagingTemplate broker;

    /** Guarda la última ubicación y la reenvía SOLO a las amistades aceptadas. */
    @Transactional
    public void actualizar(Long usuarioId, UbicacionEntrante in) {
        Usuario usuario = usuarioRepo.findById(usuarioId).orElse(null);
        if (usuario == null) return;

        Ubicacion u = Ubicacion.builder()
                .usuarioId(usuarioId)
                .lat(in.lat()).lng(in.lng()).precision(in.precision())
                .actualizadoEn(Instant.now())
                .build();
        ubicacionRepo.save(u);

        if (!usuario.isCompartiendoUbicacion()) return;

        UbicacionAmiga msg = new UbicacionAmiga(usuarioId, usuario.getNombre(),
                u.getLat(), u.getLng(), u.getPrecision(), u.getActualizadoEn());

        for (Usuario amiga : amistadRepo.findAmigosAceptados(usuarioId)) {
            broker.convertAndSendToUser(amiga.getId().toString(), COLA_UBICACIONES, msg);
        }
    }

    /** Para pintar el mapa al abrir la app, antes de que llegue el primer mensaje en vivo. */
    @Transactional(readOnly = true)
    public List<UbicacionAmiga> ubicacionesDeAmigas(Long usuarioId) {
        return amistadRepo.findAmigosAceptados(usuarioId).stream()
                .filter(Usuario::isCompartiendoUbicacion)
                .flatMap(a -> ubicacionRepo.findById(a.getId()).stream()
                        .map(u -> new UbicacionAmiga(a.getId(), a.getNombre(),
                                u.getLat(), u.getLng(), u.getPrecision(), u.getActualizadoEn())))
                .toList();
    }

    /** Avisa a las amistades que quiten a este usuario del mapa. */
    public void ocultarPara(Long usuarioId, List<Usuario> destinatarias) {
        UbicacionOculta msg = new UbicacionOculta(usuarioId);
        for (Usuario d : destinatarias) {
            broker.convertAndSendToUser(d.getId().toString(), COLA_OCULTAR, msg);
        }
    }
}
