package com.sporttracker.core.user;

import jakarta.validation.constraints.Size;

public record UpdateProfileRequest(@Size(max = 80) String displayName) {
}
