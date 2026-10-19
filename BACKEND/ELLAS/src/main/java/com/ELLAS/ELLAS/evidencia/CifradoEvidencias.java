package com.ELLAS.ELLAS.evidencia;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

import javax.crypto.AEADBadTagException;
import javax.crypto.Cipher;
import javax.crypto.spec.GCMParameterSpec;
import javax.crypto.spec.SecretKeySpec;
import java.nio.charset.StandardCharsets;
import java.security.GeneralSecurityException;
import java.security.SecureRandom;
import java.util.Arrays;
import java.util.Base64;

/**
 * Cifrado de las evidencias con AES-256-GCM.
 * Formato del archivo: "ELE1" | IV (12 bytes aleatorios) | texto cifrado + etiqueta GCM (16 bytes).
 * El dato asociado (AAD) liga el archivo a su dueña y a su id: un archivo copiado o renombrado a la
 * evidencia de otra persona no se puede descifrar (la etiqueta no coincide).
 */
@Component
public class CifradoEvidencias {

    private static final byte[] MAGIA = {'E', 'L', 'E', '1'};
    private static final int IV_BYTES = 12;
    private static final int ETIQUETA_BITS = 128;

    private final SecretKeySpec clave;
    private final SecureRandom azar = new SecureRandom();

    public CifradoEvidencias(@Value("${app.evidencias.clave}") String claveBase64) {
        byte[] bytes;
        try {
            bytes = Base64.getDecoder().decode(claveBase64.trim());
        } catch (IllegalArgumentException e) {
            throw new IllegalStateException("EVIDENCIAS_CLAVE debe estar en base64", e);
        }
        if (bytes.length != 32) {
            throw new IllegalStateException(
                    "EVIDENCIAS_CLAVE debe ser de 32 bytes en base64 (AES-256). Genera una con: openssl rand -base64 32");
        }
        this.clave = new SecretKeySpec(bytes, "AES");
        Arrays.fill(bytes, (byte) 0);
    }

    public byte[] cifrar(byte[] claro, String aad) {
        try {
            byte[] iv = new byte[IV_BYTES];
            azar.nextBytes(iv);
            Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
            cipher.init(Cipher.ENCRYPT_MODE, clave, new GCMParameterSpec(ETIQUETA_BITS, iv));
            cipher.updateAAD(aad.getBytes(StandardCharsets.UTF_8));
            byte[] cifrado = cipher.doFinal(claro);

            byte[] salida = new byte[MAGIA.length + IV_BYTES + cifrado.length];
            System.arraycopy(MAGIA, 0, salida, 0, MAGIA.length);
            System.arraycopy(iv, 0, salida, MAGIA.length, IV_BYTES);
            System.arraycopy(cifrado, 0, salida, MAGIA.length + IV_BYTES, cifrado.length);
            return salida;
        } catch (GeneralSecurityException e) {
            throw new IllegalStateException("No se pudo cifrar la evidencia", e);
        }
    }

    /** @throws EvidenciaCorruptaException si el archivo está alterado, truncado o no es de ese dueño/id */
    public byte[] descifrar(byte[] archivo, String aad) {
        int cabecera = MAGIA.length + IV_BYTES;
        if (archivo.length < cabecera + ETIQUETA_BITS / 8 || !Arrays.equals(Arrays.copyOf(archivo, MAGIA.length), MAGIA)) {
            throw new EvidenciaCorruptaException("Formato de evidencia no reconocido");
        }
        try {
            Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
            cipher.init(Cipher.DECRYPT_MODE, clave,
                    new GCMParameterSpec(ETIQUETA_BITS, archivo, MAGIA.length, IV_BYTES));
            cipher.updateAAD(aad.getBytes(StandardCharsets.UTF_8));
            return cipher.doFinal(archivo, cabecera, archivo.length - cabecera);
        } catch (AEADBadTagException e) {
            throw new EvidenciaCorruptaException("La evidencia fue alterada o no corresponde a esta usuaria");
        } catch (GeneralSecurityException e) {
            throw new IllegalStateException("No se pudo descifrar la evidencia", e);
        }
    }
}
