package com.stracks.core.activity.application;

import java.util.Comparator;
import java.util.List;
import java.util.Map;
import java.util.function.Function;
import java.util.stream.Collectors;

import com.stracks.core.activity.domain.SportPlugin;
import com.stracks.core.activity.domain.SportTypeDescriptor;
import com.stracks.core.common.ApiException;

import jakarta.enterprise.context.ApplicationScoped;
import jakarta.enterprise.inject.Any;
import jakarta.enterprise.inject.Instance;
import jakarta.inject.Inject;

/**
 * The ONLY place in the backend that knows the list of sports, and even then it
 * discovers it through CDI. Plugging in a sport = declaring a SportPlugin bean.
 *
 * <p>Two plugins claiming the same code is a programming error caught at boot, not a
 * runtime surprise: {@code toUnmodifiableMap} throws on a duplicate key.
 */
@ApplicationScoped
public class SportRegistry {

    private final Map<String, SportPlugin> plugins;

    @Inject
    public SportRegistry(@Any Instance<SportPlugin> discovered) {
        this.plugins = discovered.stream()
                .collect(Collectors.toUnmodifiableMap(p -> p.descriptor().code(), Function.identity()));
    }

    public SportPlugin require(String code) {
        SportPlugin plugin = plugins.get(code);
        if (plugin == null) {
            throw ApiException.unknownSport(code);
        }
        return plugin;
    }

    public boolean knows(String code) {
        return plugins.containsKey(code);
    }

    /**
     * Descriptors grouped by family then sorted by code within a family: the client shows
     * a picker by family and must not reorder on its own.
     */
    public List<SportTypeDescriptor> descriptors() {
        return plugins.values().stream()
                .map(SportPlugin::descriptor)
                .sorted(Comparator.comparing((SportTypeDescriptor d) -> d.family().code())
                        .thenComparing(SportTypeDescriptor::code))
                .toList();
    }
}
