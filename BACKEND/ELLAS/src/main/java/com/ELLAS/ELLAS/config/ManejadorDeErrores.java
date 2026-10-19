package com.ELLAS.ELLAS.config;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.http.converter.HttpMessageNotReadableException;
import org.springframework.web.bind.MethodArgumentNotValidException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;
import org.springframework.web.server.ResponseStatusException;

import java.util.Map;

/**
 * Errores con el mismo formato de siempre ({"status", "error", "message"}), pero sin dejar
 * pasar textos internos de excepciones (SQL, nombres de clases, detalles del parseo de JSON).
 * Solo se muestran los mensajes que el propio código escribió a propósito.
 */
@RestControllerAdvice
public class ManejadorDeErrores {

    private static final Logger log = LoggerFactory.getLogger(ManejadorDeErrores.class);

    @ExceptionHandler(ResponseStatusException.class)
    ResponseEntity<Map<String, Object>> estado(ResponseStatusException e) {
        return responder(HttpStatus.valueOf(e.getStatusCode().value()), e.getReason());
    }

    @ExceptionHandler({MethodArgumentNotValidException.class, HttpMessageNotReadableException.class})
    ResponseEntity<Map<String, Object>> datosInvalidos(Exception e) {
        return responder(HttpStatus.BAD_REQUEST, "Los datos enviados no son válidos");
    }

    @ExceptionHandler(DataIntegrityViolationException.class)
    ResponseEntity<Map<String, Object>> conflicto(DataIntegrityViolationException e) {
        return responder(HttpStatus.CONFLICT, "Ya existe un registro con esos datos");
    }

    @ExceptionHandler(Exception.class)
    ResponseEntity<Map<String, Object>> inesperado(Exception e) throws Exception {
        // Los errores que Spring ya traduce a 4xx (método no permitido, etc.) siguen su camino
        if (e instanceof org.springframework.web.ErrorResponse er) {
            return responder(HttpStatus.valueOf(er.getStatusCode().value()), null);
        }
        log.error("Error inesperado", e);
        return responder(HttpStatus.INTERNAL_SERVER_ERROR, "Ocurrió un error, inténtalo más tarde");
    }

    private static ResponseEntity<Map<String, Object>> responder(HttpStatus status, String mensaje) {
        return ResponseEntity.status(status).body(Map.of(
                "status", status.value(),
                "error", status.getReasonPhrase(),
                "message", mensaje == null ? "" : mensaje));
    }
}
