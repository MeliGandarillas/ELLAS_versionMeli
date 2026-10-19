package com.ELLAS.ELLAS.evidencia;

import org.junit.jupiter.api.Test;

import java.security.SecureRandom;
import java.util.Base64;

import static org.junit.jupiter.api.Assertions.*;

class CifradoEvidenciasTest {

    static String claveAleatoria() {
        byte[] k = new byte[32];
        new SecureRandom().nextBytes(k);
        return Base64.getEncoder().encodeToString(k);
    }

    final CifradoEvidencias cifrado = new CifradoEvidencias(claveAleatoria());
    final byte[] audio = "RIFF....WAVEfmt audio de prueba".getBytes();

    @Test
    void descifraLoQueCifro() {
        byte[] archivo = cifrado.cifrar(audio, "u:1");
        assertArrayEquals(audio, cifrado.descifrar(archivo, "u:1"));
    }

    @Test
    void elArchivoCifradoNoContieneElAudioEnClaro() {
        byte[] archivo = cifrado.cifrar(audio, "u:1");
        assertFalse(new String(archivo).contains("RIFF"));
    }

    @Test
    void dosCifradosDelMismoAudioSonDistintos() {
        assertFalse(java.util.Arrays.equals(cifrado.cifrar(audio, "u:1"), cifrado.cifrar(audio, "u:1")));
    }

    @Test
    void otroDuenoNoPuedeDescifrar() {
        byte[] archivo = cifrado.cifrar(audio, "ellas-evidencia:1:abc");
        assertThrows(EvidenciaCorruptaException.class, () -> cifrado.descifrar(archivo, "ellas-evidencia:2:abc"));
    }

    @Test
    void detectaArchivoAlterado() {
        byte[] archivo = cifrado.cifrar(audio, "u:1");
        archivo[archivo.length - 20] ^= 1;
        assertThrows(EvidenciaCorruptaException.class, () -> cifrado.descifrar(archivo, "u:1"));
    }

    @Test
    void detectaArchivoTruncadoOAjeno() {
        byte[] archivo = cifrado.cifrar(audio, "u:1");
        assertThrows(EvidenciaCorruptaException.class, () -> cifrado.descifrar(java.util.Arrays.copyOf(archivo, 20), "u:1"));
        assertThrows(EvidenciaCorruptaException.class, () -> cifrado.descifrar("no es una evidencia cifrada".getBytes(), "u:1"));
    }

    @Test
    void otraClaveNoDescifra() {
        byte[] archivo = cifrado.cifrar(audio, "u:1");
        assertThrows(EvidenciaCorruptaException.class, () -> new CifradoEvidencias(claveAleatoria()).descifrar(archivo, "u:1"));
    }

    @Test
    void rechazaClavesInvalidas() {
        assertThrows(IllegalStateException.class, () -> new CifradoEvidencias("no-es-base64!!"));
        assertThrows(IllegalStateException.class, () -> new CifradoEvidencias(Base64.getEncoder().encodeToString(new byte[16])));
    }
}
