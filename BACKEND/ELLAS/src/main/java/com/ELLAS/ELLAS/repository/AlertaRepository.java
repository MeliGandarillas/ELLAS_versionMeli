package com.ELLAS.ELLAS.repository;

import com.ELLAS.ELLAS.model.Alerta;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.Optional;

public interface AlertaRepository extends JpaRepository<Alerta, Long> {
    Optional<Alerta> findByIdAndUsuarioId(Long id, Long usuarioId);
}
