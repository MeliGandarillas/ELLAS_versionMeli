package com.ELLAS.ELLAS.repository;

import com.ELLAS.ELLAS.model.EvidenciaAudio;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

public interface EvidenciaAudioRepository extends JpaRepository<EvidenciaAudio, UUID> {

    Optional<EvidenciaAudio> findByIdAndUsuarioId(UUID id, Long usuarioId);

    Optional<EvidenciaAudio> findByUsuarioIdAndClaveCliente(Long usuarioId, String claveCliente);

    List<EvidenciaAudio> findByUsuarioIdOrderByCreadaEnDesc(Long usuarioId);

    List<EvidenciaAudio> findByUsuarioIdAndAlertaIdOrderByCreadaEnDesc(Long usuarioId, Long alertaId);

    @Query("SELECT COALESCE(SUM(e.tamanoBytes), 0) FROM EvidenciaAudio e WHERE e.usuarioId = :usuarioId")
    long totalBytes(@Param("usuarioId") Long usuarioId);
}
