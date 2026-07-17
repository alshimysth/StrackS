package com.stracks.core.auth;

import com.stracks.core.user.UserResponse;

public record AuthResponse(String token, UserResponse user) {
}
