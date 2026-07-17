package com.sporttracker.core.auth;

import com.sporttracker.core.user.UserResponse;

public record AuthResponse(String token, UserResponse user) {
}
