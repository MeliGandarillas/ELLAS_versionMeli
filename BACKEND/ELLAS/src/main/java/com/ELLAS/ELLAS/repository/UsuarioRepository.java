package com.ELLAS.ELLAS.repository;

import com.ELLAS.ELLAS.model.Usuario;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;

public interface UsuarioRepository extends JpaRepository<Usuario, Long> {
    Optional<Usuario> findByCorreo(String correo);
    boolean existsByCorreo(String correo);

    // El nombre se usa para iniciar sesión (sin distinguir mayúsculas/minúsculas)
    List<Usuario> findAllByNombreIgnoreCase(String nombre);
    boolean existsByNombreIgnoreCase(String nombre);
}
