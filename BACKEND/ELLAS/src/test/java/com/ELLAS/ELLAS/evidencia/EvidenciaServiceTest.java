package com.ELLAS.ELLAS.evidencia;

import com.ELLAS.ELLAS.model.Alerta;
import com.ELLAS.ELLAS.model.EvidenciaAudio;
import com.ELLAS.ELLAS.repository.AlertaRepository;
import com.ELLAS.ELLAS.repository.EvidenciaAudioRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import org.springframework.http.HttpStatus;
import org.springframework.web.server.ResponseStatusException;

import java.nio.file.Files;
import java.nio.file.Path;
import java.util.*;
import java.util.stream.Stream;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.*;

/** Servicio con repositorios simulados y disco real (carpeta temporal). */
class EvidenciaServiceTest {

    @TempDir Path dir;
    EvidenciaAudioRepository repo = mock(EvidenciaAudioRepository.class);
    AlertaRepository alertaRepo = mock(AlertaRepository.class);
    final Map<UUID, EvidenciaAudio> bd = new HashMap<>();
    EvidenciaService servicio;

    static byte[] wav(int extra) {
        byte[] w = new byte[44 + extra];
        System.arraycopy("RIFF".getBytes(), 0, w, 0, 4);
        System.arraycopy("WAVE".getBytes(), 0, w, 8, 4);
        for (int i = 44; i < w.length; i++) w[i] = (byte) (i * 31);
        return w;
    }

    @BeforeEach
    void preparar() {
        String clave = CifradoEvidenciasTest.claveAleatoria();
        servicio = new EvidenciaService(new CifradoEvidencias(clave), repo, alertaRepo, dir.toString(), 1);
        when(alertaRepo.findByIdAndUsuarioId(10L, 1L)).thenReturn(Optional.of(Alerta.builder().id(10L).usuarioId(1L).build()));
        when(repo.saveAndFlush(any())).thenAnswer(i -> {
            EvidenciaAudio e = i.getArgument(0);
            bd.put(e.getId(), e);
            return e;
        });
        when(repo.findByIdAndUsuarioId(any(), anyLong())).thenAnswer(i -> {
            EvidenciaAudio e = bd.get(i.<UUID>getArgument(0));
            return Optional.ofNullable(e != null && e.getUsuarioId().equals(i.<Long>getArgument(1)) ? e : null);
        });
        when(repo.totalBytes(anyLong())).thenAnswer(i -> bd.values().stream().mapToLong(EvidenciaAudio::getTamanoBytes).sum());
        doAnswer(i -> { bd.remove(i.<EvidenciaAudio>getArgument(0).getId()); return null; }).when(repo).delete(any());
    }

    long archivosEnDisco() throws Exception {
        try (Stream<Path> s = Files.list(dir)) { return s.count(); }
    }

    @Test
    void guardaCifradoYDevuelveElMismoAudioSoloALaDuena() throws Exception {
        byte[] audio = wav(5000);
        var s = servicio.subir(1L, 10L, audio, 60, null);
        assertTrue(s.nueva());

        Path archivo = dir.resolve(s.evidencia().getId() + ".ele");
        assertTrue(Files.exists(archivo));
        assertFalse(new String(Files.readAllBytes(archivo)).startsWith("RIFF"), "no debe quedar en claro");

        assertArrayEquals(audio, servicio.descargar(1L, s.evidencia().getId()).wav());
        var ajena = assertThrows(ResponseStatusException.class, () -> servicio.descargar(2L, s.evidencia().getId()));
        assertEquals(HttpStatus.NOT_FOUND, ajena.getStatusCode());
    }

    @Test
    void ajenaNoPuedeBorrarYLaDuenaSi() throws Exception {
        var s = servicio.subir(1L, 10L, wav(100), null, null);
        UUID id = s.evidencia().getId();
        assertThrows(ResponseStatusException.class, () -> servicio.borrar(2L, id));
        assertEquals(1, archivosEnDisco());

        servicio.borrar(1L, id);
        assertEquals(0, archivosEnDisco());
        assertThrows(ResponseStatusException.class, () -> servicio.descargar(1L, id));
    }

    @Test
    void noAceptaAlertaAjenaNiArchivosQueNoSonWav() {
        assertEquals(HttpStatus.NOT_FOUND,
                assertThrows(ResponseStatusException.class, () -> servicio.subir(2L, 10L, wav(10), null, null)).getStatusCode());
        assertEquals(HttpStatus.BAD_REQUEST,
                assertThrows(ResponseStatusException.class, () -> servicio.subir(1L, 10L, new byte[200], null, null)).getStatusCode());
    }

    @Test
    void respetaElLimiteDeEspacioPorUsuaria() {
        servicio.subir(1L, 10L, wav(700 * 1024), null, null);
        var e = assertThrows(ResponseStatusException.class, () -> servicio.subir(1L, 10L, wav(700 * 1024), null, null));
        assertEquals(HttpStatus.PAYLOAD_TOO_LARGE, e.getStatusCode());
    }

    @Test
    void laMismaClaveDeClienteNoDuplica() throws Exception {
        var primera = servicio.subir(1L, 10L, wav(100), null, "clip-7");
        when(repo.findByUsuarioIdAndClaveCliente(1L, "clip-7")).thenReturn(Optional.of(primera.evidencia()));
        var segunda = servicio.subir(1L, 10L, wav(100), null, "clip-7");
        assertFalse(segunda.nueva());
        assertEquals(primera.evidencia().getId(), segunda.evidencia().getId());
        assertEquals(1, archivosEnDisco());
    }

    @Test
    void siFallaLaBaseDeDatosNoQuedaArchivoHuerfano() throws Exception {
        doThrow(new IllegalStateException("bd caída")).when(repo).saveAndFlush(any());
        assertThrows(IllegalStateException.class, () -> servicio.subir(1L, 10L, wav(100), null, null));
        assertEquals(0, archivosEnDisco());
    }

    @Test
    void unArchivoAlteradoEnDiscoSeDetecta() throws Exception {
        var s = servicio.subir(1L, 10L, wav(300), null, null);
        Path archivo = dir.resolve(s.evidencia().getId() + ".ele");
        byte[] datos = Files.readAllBytes(archivo);
        datos[datos.length / 2] ^= 0x55;
        Files.write(archivo, datos);
        var e = assertThrows(ResponseStatusException.class, () -> servicio.descargar(1L, s.evidencia().getId()));
        assertEquals(HttpStatus.INTERNAL_SERVER_ERROR, e.getStatusCode());
    }
}
