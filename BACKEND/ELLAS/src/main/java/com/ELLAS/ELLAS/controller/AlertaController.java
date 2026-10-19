package com.ELLAS.ELLAS.controller;

import com.ELLAS.ELLAS.config.UsuarioActual;
import com.ELLAS.ELLAS.dto.Dtos.*;
import com.ELLAS.ELLAS.model.Alerta;
import com.ELLAS.ELLAS.model.Ubicacion;
import com.ELLAS.ELLAS.model.Usuario;
import com.ELLAS.ELLAS.repository.AlertaRepository;
import com.ELLAS.ELLAS.repository.AmistadRepository;
import com.ELLAS.ELLAS.repository.UbicacionRepository;
import com.ELLAS.ELLAS.repository.UsuarioRepository;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.messaging.simp.SimpMessagingTemplate;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.server.ResponseStatusException;

import java.time.Instant;
import java.util.List;

@RestController
@RequestMapping("/api/alertas")
@RequiredArgsConstructor
public class AlertaController {

    public static final String COLA_ALERTAS = "/queue/alertas";

    private final UsuarioRepository usuarioRepo;
    private final AmistadRepository amistadRepo;
    private final UbicacionRepository ubicacionRepo;
    private final AlertaRepository alertaRepo;
    private final SimpMessagingTemplate broker;

    /**
     * Botón del dije: avisa SOLO a los contactos de emergencia (amigas favoritas).
     * La alerta lleva la ubicación aunque la usuaria tenga apagado "compartir ubicación":
     * presionar el botón es pedir ayuda.
     * Devuelve también el id de la alerta registrada, al que la app liga el audio grabado por el dije.
     */
    @PostMapping
    @Transactional
    public AlertaResponse enviar(@UsuarioActual Long yo, @Valid @RequestBody AlertaRequest req) {
        Usuario usuario = usuarioRepo.findById(yo)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND));

        Double lat = req.lat(), lng = req.lng();
        if (lat == null || lng == null) {
            Ubicacion ultima = ubicacionRepo.findById(yo).orElse(null);
            lat = ultima == null ? null : ultima.getLat();
            lng = ultima == null ? null : ultima.getLng();
        }

        // Se registra la alerta para poder ligarle después las evidencias de audio del dije
        Alerta alerta = alertaRepo.save(Alerta.builder().usuarioId(yo).lat(lat).lng(lng).creadaEn(Instant.now()).build());

        AlertaAmiga msg = new AlertaAmiga(yo, usuario.getNombre(), lat, lng, Instant.now());
        List<Usuario> favoritas = amistadRepo.findFavoritas(yo);
        for (Usuario favorita : favoritas) {
            broker.convertAndSendToUser(favorita.getId().toString(), COLA_ALERTAS, msg);
        }
        return new AlertaResponse(favoritas.size(), alerta.getId());
    }
}
