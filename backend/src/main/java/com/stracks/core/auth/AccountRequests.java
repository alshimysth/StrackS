package com.stracks.core.auth;

import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

/** Request bodies for account management (#73, #74, #75). */
public final class AccountRequests {

    private AccountRequests() {
    }

    /** Same rule as at registration ({@link RegisterRequest}): 8 characters minimum. */
    public record ChangePassword(@NotBlank String currentPassword, @NotBlank @Size(min = 8) String newPassword) {
    }

    public record PasswordReset(@NotBlank @Email String email) {
    }

    public record PasswordResetConfirmation(
            @NotBlank @Email String email,
            @NotBlank String code,
            @NotBlank @Size(min = 8) String newPassword) {
    }

    public record EmailChange(@NotBlank @Email String newEmail, @NotBlank String currentPassword) {
    }

    public record CodeConfirmation(@NotBlank String code) {
    }
}
