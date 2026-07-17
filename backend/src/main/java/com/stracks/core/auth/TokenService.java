package com.stracks.core.auth;

import java.time.Duration;
import java.util.Set;

import com.stracks.core.user.UserEntity;

import io.smallrye.jwt.build.Jwt;
import jakarta.enterprise.context.ApplicationScoped;
import org.eclipse.microprofile.config.inject.ConfigProperty;

@ApplicationScoped
public class TokenService {

    @ConfigProperty(name = "mp.jwt.verify.issuer")
    String issuer;

    @ConfigProperty(name = "stracks.jwt.ttl-seconds")
    long ttlSeconds;

    public String issue(UserEntity user) {
        return Jwt.issuer(issuer)
                .subject(user.id.toString())
                .upn(user.email)
                .groups(Set.of("user"))
                .expiresIn(Duration.ofSeconds(ttlSeconds))
                .sign();
    }
}
