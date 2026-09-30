package com.ELLAS.ELLAS.config;

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

import java.security.Principal;

@Configuration
@EnableWebSocketMessageBroker
@RequiredArgsConstructor
public class WebSocketConfig implements WebSocketMessageBrokerConfigurer {

    private final JwtDecoder jwtDecoder;

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
                if (accessor != null && StompCommand.CONNECT.equals(accessor.getCommand())) {
                    accessor.setUser(autenticar(accessor.getFirstNativeHeader("Authorization")));
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
