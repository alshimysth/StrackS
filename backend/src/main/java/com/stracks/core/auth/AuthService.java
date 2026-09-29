package com.stracks.core.auth;

import java.util.UUID;

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

    @Inject
    RefreshTokenService refreshTokenService;

    @Inject
    AccountService accountService;

    public record AuthResult(String token, String refreshToken, UserEntity user) {
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
        // Address verification (#75): offered, never blocking in Phase 1. An unverified
        // account logs in and records normally.
        accountService.sendVerificationCode(user);
        return issueSession(user);
    }

    @Transactional
    public AuthResult login(LoginRequest request) {
        UserEntity user = UserEntity.findByEmail(request.email().toLowerCase().trim())
                .orElseThrow(ApiException::invalidCredentials);
        if (!BcryptUtil.matches(request.password(), user.passwordHash)) {
            throw ApiException.invalidCredentials();
        }
        return issueSession(user);
    }

    /**
     * Refreshes the session from the refresh token alone.
     *
     * <p>Anti-IDOR: the user served is the one written on the token's row, never a value
     * taken from the request. There is no parameter to substitute to target someone
     * else's account.
     */
    @Transactional
    public AuthResult refresh(String presentedRefreshToken) {
        RefreshTokenService.Rotation rotation = refreshTokenService.rotate(presentedRefreshToken);
        UserEntity user = findActiveUser(rotation.userId());
        return new AuthResult(tokenService.issue(user), rotation.secret(), user);
    }

    @Transactional
    public void logout(String presentedRefreshToken) {
        refreshTokenService.revokeSession(presentedRefreshToken);
    }

    /** Opens a fresh session: access JWT + new refresh token family. */
    AuthResult issueSession(UserEntity user) {
        return new AuthResult(
                tokenService.issue(user),
                refreshTokenService.issueForNewSession(user.id),
                user);
    }

    /**
     * V5's {@code ON DELETE CASCADE} deletes the tokens with the account; this guard covers
     * the window where a token would outlive its user.
     */
    private UserEntity findActiveUser(UUID userId) {
        UserEntity user = UserEntity.findById(userId);
        if (user == null) {
            throw AuthErrors.invalidRefreshToken();
        }
        return user;
    }
}
