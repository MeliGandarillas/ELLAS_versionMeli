package com.ELLAS.ELLAS.service;

import org.springframework.http.HttpStatus;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;
import org.springframework.web.server.ResponseStatusException;

import java.time.Duration;
import java.util.ArrayDeque;
import java.util.Deque;
import java.util.concurrent.ConcurrentHashMap;

/**
 * Límite de intentos en memoria (ventana deslizante), suficiente para un solo servidor.
 * Se usa contra la fuerza bruta en login/registro y contra el abuso de endpoints sensibles.
 */
@Component
public class LimitadorDeIntentos {

    private record Ventana(Deque<Long> marcas, long duracionMs) {}

    private final ConcurrentHashMap<String, Ventana> ventanas = new ConcurrentHashMap<>();

    /** Registra un intento; lanza 429 si ya se superó el máximo en esa ventana. */
    public void intentar(String clave, int maximo, Duration ventana) {
        long ahora = System.currentTimeMillis();
        Ventana v = ventanas.computeIfAbsent(clave, k -> new Ventana(new ArrayDeque<>(), ventana.toMillis()));
        synchronized (v) {
            purgar(v, ahora);
            if (v.marcas().size() >= maximo) {
                throw new ResponseStatusException(HttpStatus.TOO_MANY_REQUESTS,
                        "Demasiados intentos, espera unos minutos e inténtalo de nuevo");
            }
            v.marcas().addLast(ahora);
        }
    }

    /** Olvida los intentos de una clave (p. ej. tras un login correcto). */
    public void reiniciar(String clave) {
        ventanas.remove(clave);
    }

    private static void purgar(Ventana v, long ahora) {
        while (!v.marcas().isEmpty() && ahora - v.marcas().peekFirst() > v.duracionMs()) {
            v.marcas().pollFirst();
        }
    }

    /** Evita que el mapa crezca sin límite con claves que ya no se usan. */
    @Scheduled(fixedDelay = 60_000)
    void limpiar() {
        long ahora = System.currentTimeMillis();
        ventanas.entrySet().removeIf(e -> {
            synchronized (e.getValue()) {
                purgar(e.getValue(), ahora);
                return e.getValue().marcas().isEmpty();
            }
        });
    }
}
