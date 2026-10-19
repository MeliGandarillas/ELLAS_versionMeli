package com.ELLAS.ELLAS.service;

import org.junit.jupiter.api.Test;
import org.springframework.web.server.ResponseStatusException;

import java.time.Duration;

import static org.junit.jupiter.api.Assertions.assertDoesNotThrow;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;

class LimitadorDeIntentosTest {

    private final LimitadorDeIntentos limitador = new LimitadorDeIntentos();

    @Test
    void bloqueaAlSuperarElMaximo() {
        for (int i = 0; i < 3; i++) limitador.intentar("k", 3, Duration.ofMinutes(1));
        ResponseStatusException e = assertThrows(ResponseStatusException.class,
                () -> limitador.intentar("k", 3, Duration.ofMinutes(1)));
        assertEquals(429, e.getStatusCode().value());
    }

    @Test
    void lasClavesSonIndependientes() {
        for (int i = 0; i < 3; i++) limitador.intentar("a", 3, Duration.ofMinutes(1));
        assertDoesNotThrow(() -> limitador.intentar("b", 3, Duration.ofMinutes(1)));
    }

    @Test
    void reiniciarLibera() {
        for (int i = 0; i < 3; i++) limitador.intentar("k", 3, Duration.ofMinutes(1));
        limitador.reiniciar("k");
        assertDoesNotThrow(() -> limitador.intentar("k", 3, Duration.ofMinutes(1)));
    }

    @Test
    void laVentanaExpira() throws InterruptedException {
        limitador.intentar("k", 1, Duration.ofMillis(50));
        Thread.sleep(80);
        assertDoesNotThrow(() -> limitador.intentar("k", 1, Duration.ofMillis(50)));
    }
}
