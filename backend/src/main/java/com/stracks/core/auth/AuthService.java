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
     * Renouvelle la session à partir du seul jeton de renouvellement.
     *
     * <p>Anti-IDOR : l'utilisateur servi est celui inscrit sur la ligne du jeton, jamais
     * une valeur venue de la requête. Il n'existe aucun paramètre à substituer pour viser
     * le compte d'autrui.
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

    private AuthResult issueSession(UserEntity user) {
        return new AuthResult(
                tokenService.issue(user),
                refreshTokenService.issueForNewSession(user.id),
                user);
    }

    /**
     * Le {@code ON DELETE CASCADE} de V5 efface les jetons avec le compte ; ce garde-fou
     * couvre la fenêtre où un jeton survivrait à son utilisateur.
     */
    private UserEntity findActiveUser(UUID userId) {
        UserEntity user = UserEntity.findById(userId);
        if (user == null) {
            throw AuthErrors.invalidRefreshToken();
        }
        return user;
    }
}
