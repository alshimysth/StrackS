package com.stracks.core.auth;

import java.util.Locale;

import com.stracks.core.common.RateLimiter;
import com.stracks.core.common.RateLimiter.Limit;

import jakarta.annotation.PostConstruct;
import jakarta.enterprise.context.ApplicationScoped;
import jakarta.inject.Inject;
import org.eclipse.microprofile.config.inject.ConfigProperty;

/**
 * Rate thresholds of the authentication and account endpoints (#72).
 *
 * <p>Each check is called <b>before</b> any expensive work: a 429 must not have evaluated
 * BCrypt, otherwise the limiter doesn't protect the CPU.
 *
 * <p>Two keys on sensitive endpoints: the IP (a script sweeping accounts) and the target
 * account (a network of IPs hammering a single address). The "account" key targets the
 * presented email, whether it exists or not: limiting only existing accounts would reveal
 * which ones exist.
 */
@ApplicationScoped
public class AuthRateLimits {

    @Inject
    RateLimiter limiter;

    @ConfigProperty(name = "stracks.rate-limit.login-per-ip")
    String loginPerIpSpec;

    @ConfigProperty(name = "stracks.rate-limit.login-per-account")
    String loginPerAccountSpec;

    @ConfigProperty(name = "stracks.rate-limit.register-per-ip")
    String registerPerIpSpec;

    @ConfigProperty(name = "stracks.rate-limit.refresh-per-ip")
    String refreshPerIpSpec;

    @ConfigProperty(name = "stracks.rate-limit.code-request-per-ip")
    String codeRequestPerIpSpec;

    @ConfigProperty(name = "stracks.rate-limit.code-request-per-account")
    String codeRequestPerAccountSpec;

    @ConfigProperty(name = "stracks.rate-limit.code-confirm-per-ip")
    String codeConfirmPerIpSpec;

    private Limit loginPerIp;
    private Limit loginPerAccount;
    private Limit registerPerIp;
    private Limit refreshPerIp;
    private Limit codeRequestPerIp;
    private Limit codeRequestPerAccount;
    private Limit codeConfirmPerIp;

    /** An unreadable configuration fails startup, not the first login. */
    @PostConstruct
    void parse() {
        loginPerIp = Limit.parse(loginPerIpSpec);
        loginPerAccount = Limit.parse(loginPerAccountSpec);
        registerPerIp = Limit.parse(registerPerIpSpec);
        refreshPerIp = Limit.parse(refreshPerIpSpec);
        codeRequestPerIp = Limit.parse(codeRequestPerIpSpec);
        codeRequestPerAccount = Limit.parse(codeRequestPerAccountSpec);
        codeConfirmPerIp = Limit.parse(codeConfirmPerIpSpec);
    }

    public void login(String ip, String email) {
        limiter.acquire("login:ip:" + ip, loginPerIp);
        limiter.acquire("login:account:" + account(email), loginPerAccount);
    }

    public void register(String ip) {
        limiter.acquire("register:ip:" + ip, registerPerIp);
    }

    /**
     * Wide threshold: a refresh concerns an already open session, and blocking a legitimate
     * user here would log them out. It only targets abnormal bursts.
     */
    public void refresh(String ip) {
        limiter.acquire("refresh:ip:" + ip, refreshPerIp);
    }

    /** Any request that sends an email: reset, change, verification. */
    public void codeRequest(String ip, String accountKey) {
        limiter.acquire("code-request:ip:" + ip, codeRequestPerIp);
        limiter.acquire("code-request:account:" + account(accountKey), codeRequestPerAccount);
    }

    public void codeConfirm(String ip) {
        limiter.acquire("code-confirm:ip:" + ip, codeConfirmPerIp);
    }

    private static String account(String key) {
        return key == null ? "" : key.toLowerCase(Locale.ROOT).trim();
    }
}
