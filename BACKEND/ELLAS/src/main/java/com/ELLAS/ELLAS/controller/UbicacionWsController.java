package com.ELLAS.ELLAS.controller;

import com.ELLAS.ELLAS.dto.Dtos.UbicacionEntrante;
import com.ELLAS.ELLAS.service.UbicacionService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.messaging.handler.annotation.MessageMapping;
import org.springframework.messaging.handler.annotation.Payload;
import org.springframework.stereotype.Controller;

import java.security.Principal;

@Controller
@RequiredArgsConstructor
public class UbicacionWsController {

    private final UbicacionService service;

    /** El cliente publica en /app/ubicacion; el usuario sale de la conexión, no del mensaje. */
    @MessageMapping("/ubicacion")
    public void recibir(@Valid @Payload UbicacionEntrante ubicacion, Principal principal) {
        if (principal == null) return;
        service.actualizar(Long.valueOf(principal.getName()), ubicacion);
    }
}
