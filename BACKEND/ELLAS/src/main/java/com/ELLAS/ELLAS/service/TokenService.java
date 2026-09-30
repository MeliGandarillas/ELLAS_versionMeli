package com.ELLAS.ELLAS.service;

import com.ELLAS.ELLAS.model.Usuario;
import lombok.RequiredArgsConstructor;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.security.oauth2.jose.jws.MacAlgorithm;
import org.springframework.security.oauth2.jwt.JwsHeader;
import org.springframework.security.oauth2.jwt.JwtClaimsSet;
import org.springframework.security.oauth2.jwt.JwtEncoder;
import org.springframework.security.oauth2.jwt.JwtEncoderParameters;
import org.springframework.stereotype.Service;

import java.time.Duration;
import java.time.Instant;

/** Crea el token de sesión que la app manda en cada petición (header Authorization: Bearer ...). */
@Service
@RequiredArgsConstructor
public class TokenService {

    private final JwtEncoder encoder;

    @Value("${app.jwt.dias:30}")
    private long diasDeValidez;

    public String crearToken(Usuario usuario) {
        Instant ahora = Instant.now();
        JwtClaimsSet claims = JwtClaimsSet.builder()
                .issuer("ellas")
                .subject(usuario.getId().toString()) // quién es: el id de la usuaria
                .claim("nombre", usuario.getNombre())
                .issuedAt(ahora)
                .expiresAt(ahora.plus(Duration.ofDays(diasDeValidez)))
                .build();
        JwsHeader header = JwsHeader.with(MacAlgorithm.HS256).build();
        return encoder.encode(JwtEncoderParameters.from(header, claims)).getTokenValue();
    }
}
