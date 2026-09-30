package com.ELLAS.ELLAS.repository;

import com.ELLAS.ELLAS.model.Amistad;
import com.ELLAS.ELLAS.model.EstadoAmistad;
import com.ELLAS.ELLAS.model.Usuario;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.ArrayList;
import java.util.List;
import java.util.Optional;

public interface AmistadRepository extends JpaRepository<Amistad, Long> {

    @Query("SELECT a.receptor FROM Amistad a WHERE a.estado = :estado AND a.solicitante.id = :id")
    List<Usuario> findReceptores(@Param("id") Long usuarioId, @Param("estado") EstadoAmistad estado);

    @Query("SELECT a.solicitante FROM Amistad a WHERE a.estado = :estado AND a.receptor.id = :id")
    List<Usuario> findSolicitantes(@Param("id") Long usuarioId, @Param("estado") EstadoAmistad estado);

    /** Todas las amistades ACEPTADAS de un usuario, sin importar quién envió la solicitud. */
    default List<Usuario> findAmigosAceptados(Long usuarioId) {
        List<Usuario> amigas = new ArrayList<>(findReceptores(usuarioId, EstadoAmistad.ACEPTADA));
        amigas.addAll(findSolicitantes(usuarioId, EstadoAmistad.ACEPTADA));
        return amigas;
    }

    @Query("""
           SELECT a FROM Amistad a
           WHERE (a.solicitante.id = :a AND a.receptor.id = :b)
              OR (a.solicitante.id = :b AND a.receptor.id = :a)
           """)
    Optional<Amistad> findEntre(@Param("a") Long a, @Param("b") Long b);

    List<Amistad> findByReceptorIdAndEstado(Long receptorId, EstadoAmistad estado);

    /** Amistades de un usuario en cierto estado, sin importar quién envió la solicitud. */
    @Query("""
           SELECT a FROM Amistad a
           WHERE a.estado = :estado AND (a.solicitante.id = :id OR a.receptor.id = :id)
           """)
    List<Amistad> findDeUsuario(@Param("id") Long usuarioId, @Param("estado") EstadoAmistad estado);

    /** Cuántas amigas tiene marcadas como favoritas (contactos de emergencia). */
    @Query("""
           SELECT COUNT(a) FROM Amistad a
           WHERE (a.solicitante.id = :id AND a.favoritaDeSolicitante = true)
              OR (a.receptor.id = :id AND a.favoritaDeReceptor = true)
           """)
    long contarFavoritas(@Param("id") Long usuarioId);
}
