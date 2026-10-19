package com.ELLAS.ELLAS.config;

import com.ELLAS.ELLAS.controller.AlertaController;
import com.ELLAS.ELLAS.service.LimitadorDeIntentos;
import com.ELLAS.ELLAS.service.UbicacionService;
import lombok.RequiredArgsConstructor;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Configuration;
import org.springframework.messaging.Message;
import org.springframework.messaging.MessageChannel;
import org.springframework.messaging.MessageDeliveryException;
import org.springframework.messaging.simp.config.ChannelRegistration;
import org.springframework.messaging.simp.config.MessageBrokerRegistry;
import org.springframework.messaging.simp.stomp.StompCommand;
import org.springframework.messaging.simp.stomp.StompHeaderAccessor;
import org.springframework.messaging.support.ChannelInterceptor;
import org.springframework.messaging.support.MessageHeaderAccessor;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.security.oauth2.jwt.JwtDecoder;
import org.springframework.security.oauth2.jwt.JwtException;
import org.springframework.web.socket.config.annotation.*;

import org.springframework.web.server.ResponseStatusException;

import java.security.Principal;
import java.time.Duration;
import java.util.Set;

@Configuration
@EnableWebSocketMessageBroker
@RequiredArgsConstructor
public class WebSocketConfig implements WebSocketMessageBrokerConfigurer {

    /** Únicas colas a las que una usuaria puede suscribirse: todas privadas (/user/...). */
    private static final Set<String> COLAS_PERMITIDAS = Set.of(
            "/user" + UbicacionService.COLA_UBICACIONES,
            "/user" + UbicacionService.COLA_OCULTAR,
            "/user" + AlertaController.COLA_ALERTAS);
    private static final String DESTINO_UBICACION = "/app/ubicacion";

    private final JwtDecoder jwtDecoder;
    private final LimitadorDeIntentos limitador;

    @Value("${app.cors.origenes}")
    private String[] origenes;

    @Override
    public void configureMessageBroker(MessageBrokerRegistry registry) {
        registry.enableSimpleBroker("/queue");            // mensajes que el servidor envía
        registry.setApplicationDestinationPrefixes("/app"); // mensajes que el cliente envía
        registry.setUserDestinationPrefix("/user");        // colas privadas por usuario
    }

    @Override
    public void registerStompEndpoints(StompEndpointRegistry registry) {
        registry.addEndpoint("/ws").setAllowedOriginPatterns(origenes);
    }

    @Override
    public void configureWebSocketTransport(WebSocketTransportRegistration registration) {
        // Una ubicación pesa unos 100 bytes: nadie necesita mensajes de 64 KB
        registration.setMessageSizeLimit(4 * 1024).setSendBufferSizeLimit(256 * 1024);
    }

    /**
     * La usuaria se identifica con su JWT en el mensaje CONNECT de STOMP
     * (header Authorization: Bearer ...). Sin un token válido no se acepta la conexión.
     */
    @Override
    public void configureClientInboundChannel(ChannelRegistration registration) {
        registration.interceptors(new ChannelInterceptor() {
            @Override
            public Message<?> preSend(Message<?> message, MessageChannel channel) {
                StompHeaderAccessor accessor =
                        MessageHeaderAccessor.getAccessor(message, StompHeaderAccessor.class);
                if (accessor == null) return message;
                StompCommand comando = accessor.getCommand();
                if (StompCommand.CONNECT.equals(comando)) {
                    accessor.setUser(autenticar(accessor.getFirstNativeHeader("Authorization")));
                    return message;
                }
                if (comando == null || StompCommand.DISCONNECT.equals(comando)
                        || StompCommand.UNSUBSCRIBE.equals(comando)) {
                    return message;
                }
                // Cualquier otro frame exige una conexión ya autenticada
                if (accessor.getUser() == null) {
                    throw new MessageDeliveryException("No autenticada");
                }
                if (StompCommand.SUBSCRIBE.equals(comando)
                        && !COLAS_PERMITIDAS.contains(accessor.getDestination())) {
                    throw new MessageDeliveryException("Destino no permitido");
                }
                if (StompCommand.SEND.equals(comando)) {
                    if (!DESTINO_UBICACION.equals(accessor.getDestination())) {
                        throw new MessageDeliveryException("Destino no permitido");
                    }
                    // Exceso de mensajes: se descartan sin cortar la conexión
                    try {
                        limitador.intentar("ws-ubicacion:" + accessor.getUser().getName(), 120, Duration.ofMinutes(1));
                    } catch (ResponseStatusException e) {
                        return null;
                    }
                }
                return message;
            }
        });
    }

    private Principal autenticar(String authorization) {
        if (authorization == null || !authorization.startsWith("Bearer ")) {
            throw new MessageDeliveryException("Falta el token de sesión");
        }
        try {
            Jwt jwt = jwtDecoder.decode(authorization.substring("Bearer ".length()));
            String usuarioId = jwt.getSubject();
            return () -> usuarioId;
        } catch (JwtException e) {
            throw new MessageDeliveryException("Token de sesión inválido o vencido");
        }
    }
}
