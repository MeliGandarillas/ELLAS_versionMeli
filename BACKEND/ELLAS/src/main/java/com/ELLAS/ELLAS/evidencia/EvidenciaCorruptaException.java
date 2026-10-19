package com.ELLAS.ELLAS.evidencia;

/** El archivo cifrado no pasó la verificación de integridad (GCM). */
public class EvidenciaCorruptaException extends RuntimeException {
    public EvidenciaCorruptaException(String mensaje) {
        super(mensaje);
    }
}
