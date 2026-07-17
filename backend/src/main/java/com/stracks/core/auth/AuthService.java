package com.stracks.core.auth;

import com.stracks.core.common.ApiException;
import com.stracks.core.user.UserEntity;

import io.quarkus.elytron.security.common.BcryptUtil;
import jakarta.enterprise.context.ApplicationScoped;
import jakarta.inject.Inject;
import jakarta.transaction.Transactional;

@ApplicationScoped
public class AuthService {

    @Inject
    TokenService tokenService;

    public record AuthResult(String token, UserEntity user) {
    }

    @Transactional
    public AuthResult register(RegisterRequest request) {
        String email = request.email().toLowerCase().trim();
        if (UserEntity.findByEmail(email).isPresent()) {
            throw ApiException.emailAlreadyUsed();
        }
        UserEntity user = new UserEntity();
        user.email = email;
        user.passwordHash = BcryptUtil.bcryptHash(request.password());
        user.displayName = request.displayName();
        user.persist();
        return new AuthResult(tokenService.issue(user), user);
    }

    public AuthResult login(LoginRequest request) {
        UserEntity user = UserEntity.findByEmail(request.email().toLowerCase().trim())
                .orElseThrow(ApiException::invalidCredentials);
        if (!BcryptUtil.matches(request.password(), user.passwordHash)) {
            throw ApiException.invalidCredentials();
        }
        return new AuthResult(tokenService.issue(user), user);
    }
}
