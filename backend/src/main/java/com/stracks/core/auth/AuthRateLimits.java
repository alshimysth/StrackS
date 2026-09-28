package com.stracks.core.auth;

import java.util.Locale;

import com.stracks.core.common.RateLimiter;
import com.stracks.core.common.RateLimiter.Limit;

import jakarta.annotation.PostConstruct;
import jakarta.enterprise.context.ApplicationScoped;
import jakarta.inject.Inject;
import org.eclipse.microprofile.config.inject.ConfigProperty;

/**
 * Seuils de débit des endpoints d'authentification et de compte (#72).
 *
 * <p>Chaque contrôle est appelé <b>avant</b> tout travail coûteux : un 429 ne doit pas
 * avoir évalué BCrypt, sinon le limiteur ne protège pas le processeur.
 *
 * <p>Deux clés sur les points sensibles : l'IP (un script qui balaie des comptes) et le
 * compte visé (un réseau d'IP qui s'acharne sur une seule adresse). La clé « compte » vise
 * l'email présenté, qu'il existe ou non — la limiter seulement pour les comptes existants
 * révélerait lesquels existent.
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

    /** Une configuration illisible fait échouer le démarrage, pas la première connexion. */
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
     * Seuil large : un renouvellement concerne une session déjà ouverte, et bloquer un
     * utilisateur légitime ici le déconnecterait. Il ne vise que les rafales anormales.
     */
    public void refresh(String ip) {
        limiter.acquire("refresh:ip:" + ip, refreshPerIp);
    }

    /** Toute demande qui envoie un email : réinitialisation, changement, vérification. */
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
