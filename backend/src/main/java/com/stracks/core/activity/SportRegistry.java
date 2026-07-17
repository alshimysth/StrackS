package com.stracks.core.activity;

import java.util.Comparator;
import java.util.List;
import java.util.Map;
import java.util.function.Function;
import java.util.stream.Collectors;

import com.stracks.core.common.ApiException;

import jakarta.enterprise.context.ApplicationScoped;
import jakarta.enterprise.inject.Any;
import jakarta.enterprise.inject.Instance;
import jakarta.inject.Inject;

/**
 * SEUL endroit du backend qui connaît la liste des sports — et encore : il la
 * découvre par CDI. Brancher un sport = déclarer un bean SportPlugin.
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

    public List<SportTypeDescriptor> descriptors() {
        return plugins.values().stream()
                .map(SportPlugin::descriptor)
                .sorted(Comparator.comparing(SportTypeDescriptor::code))
                .toList();
    }
}
