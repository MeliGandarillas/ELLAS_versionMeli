package com.ELLAS.ELLAS.config;

import org.springframework.security.core.annotation.AuthenticationPrincipal;

import java.lang.annotation.ElementType;
import java.lang.annotation.Retention;
import java.lang.annotation.RetentionPolicy;
import java.lang.annotation.Target;

/**
 * Inyecta el id de la usuaria que hizo la petición, sacado del JWT ya validado
 * (el "subject" del token). Uso: {@code metodo(@UsuarioActual Long yo)}.
 */
@Target(ElementType.PARAMETER)
@Retention(RetentionPolicy.RUNTIME)
@AuthenticationPrincipal(expression = "T(java.lang.Long).valueOf(subject)")
public @interface UsuarioActual {
}
