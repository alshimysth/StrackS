package com.stracks.core.user;

import java.time.Instant;
import java.util.UUID;

public record UserResponse(UUID id, String email, String displayName, Instant createdAt,
        boolean emailVerified) {

    public static UserResponse of(UserEntity user) {
        return new UserResponse(user.id, user.email, user.displayName, user.createdAt,
                user.emailVerifiedAt != null);
    }
}
