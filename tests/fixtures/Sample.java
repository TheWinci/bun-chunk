package com.example;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.*;
import java.util.function.Consumer;
import java.util.stream.Collectors;

public class Sample {
    private static final int MAX_SIZE = 1024;
    private String name;
    private boolean enabled;

    public Sample(String name, boolean enabled) {
        this.name = name;
        this.enabled = enabled;
    }

    public String process(String input) throws IOException {
        String data = Files.readString(Path.of(input));
        return data.toUpperCase();
    }

    public boolean isEnabled() {
        return enabled;
    }

    public enum Status {
        ACTIVE, INACTIVE, PENDING
    }

    public static Sample create(String name) {
        return new Sample(name, true);
    }
}

class CacheEntry<T> {
    private final String key;
    private final T value;
    private final long expiresAt;
    private final List<String> tags;

    public CacheEntry(String key, T value, long expiresAt, List<String> tags) {
        this.key = key;
        this.value = value;
        this.expiresAt = expiresAt;
        this.tags = tags != null ? tags : List.of();
    }

    public String getKey() { return key; }
    public T getValue() { return value; }
    public long getExpiresAt() { return expiresAt; }
    public List<String> getTags() { return tags; }
}

class LRUCache<T> {
    private final LinkedHashMap<String, CacheEntry<T>> cache;
    private final int capacity;
    private final long defaultTTL;
    private long hits;
    private long misses;

    public LRUCache(int capacity, long defaultTTL) {
        this.capacity = capacity;
        this.defaultTTL = defaultTTL;
        this.hits = 0;
        this.misses = 0;
        this.cache = new LinkedHashMap<>(capacity, 0.75f, true) {
            @Override
            protected boolean removeEldestEntry(Map.Entry<String, CacheEntry<T>> eldest) {
                return size() > LRUCache.this.capacity;
            }
        };
    }

    public T get(String key) {
        CacheEntry<T> entry = cache.get(key);
        if (entry == null) {
            misses++;
            return null;
        }

        if (System.currentTimeMillis() > entry.getExpiresAt()) {
            cache.remove(key);
            misses++;
            return null;
        }

        hits++;
        return entry.getValue();
    }

    public void set(String key, T value, Long ttl, List<String> tags) {
        long expiresAt = System.currentTimeMillis() + (ttl != null ? ttl : defaultTTL);
        cache.put(key, new CacheEntry<>(key, value, expiresAt, tags));
    }

    public int invalidateByTag(String tag) {
        List<String> keysToRemove = cache.entrySet().stream()
                .filter(e -> e.getValue().getTags().contains(tag))
                .map(Map.Entry::getKey)
                .toList();

        keysToRemove.forEach(cache::remove);
        return keysToRemove.size();
    }

    public Map<String, Object> getStats() {
        long total = hits + misses;
        double hitRate = total == 0 ? 0.0 : (double) hits / total;
        return Map.of(
                "hits", hits,
                "misses", misses,
                "size", cache.size(),
                "hitRate", hitRate
        );
    }

    public void clear() {
        cache.clear();
        hits = 0;
        misses = 0;
    }
}

class EventBus {
    private final Map<String, List<Consumer<Object>>> handlers = new HashMap<>();
    private final Map<String, List<Consumer<Object>>> onceHandlers = new HashMap<>();
    private final int maxListeners;

    public EventBus(int maxListeners) {
        this.maxListeners = maxListeners;
    }

    public EventBus() {
        this(10);
    }

    public Runnable on(String event, Consumer<Object> handler) {
        List<Consumer<Object>> eventHandlers = handlers.computeIfAbsent(event, k -> new ArrayList<>());
        if (eventHandlers.size() >= maxListeners) {
            System.err.printf("Warning: max listeners (%d) reached for event: %s%n", maxListeners, event);
        }
        eventHandlers.add(handler);

        return () -> off(event, handler);
    }

    public void once(String event, Consumer<Object> handler) {
        onceHandlers.computeIfAbsent(event, k -> new ArrayList<>()).add(handler);
    }

    public void off(String event, Consumer<Object> handler) {
        List<Consumer<Object>> eventHandlers = handlers.get(event);
        if (eventHandlers != null) {
            eventHandlers.remove(handler);
        }
    }

    public void emit(String event, Object data) {
        List<Consumer<Object>> eventHandlers = handlers.getOrDefault(event, List.of());
        for (Consumer<Object> handler : eventHandlers) {
            handler.accept(data);
        }

        List<Consumer<Object>> once = onceHandlers.remove(event);
        if (once != null) {
            for (Consumer<Object> handler : once) {
                handler.accept(data);
            }
        }
    }

    public int listenerCount(String event) {
        int regular = handlers.containsKey(event) ? handlers.get(event).size() : 0;
        int once = onceHandlers.containsKey(event) ? onceHandlers.get(event).size() : 0;
        return regular + once;
    }

    public void removeAllListeners(String event) {
        if (event != null) {
            handlers.remove(event);
            onceHandlers.remove(event);
        } else {
            handlers.clear();
            onceHandlers.clear();
        }
    }
}

class RetryHelper {
    @FunctionalInterface
    interface ThrowingSupplier<T> {
        T get() throws Exception;
    }

    public static <T> T retryWithBackoff(
            ThrowingSupplier<T> operation,
            int maxRetries,
            long baseDelay,
            long maxDelay
    ) throws Exception {
        Exception lastError = null;

        for (int attempt = 0; attempt <= maxRetries; attempt++) {
            try {
                return operation.get();
            } catch (Exception e) {
                lastError = e;
                if (attempt == maxRetries) break;

                long delay = Math.min(baseDelay * (1L << attempt), maxDelay);
                long jitter = (long) (delay * (0.5 + Math.random() * 0.5));
                Thread.sleep(jitter);
            }
        }

        throw lastError;
    }
}

class DeepMerge {
    @SuppressWarnings("unchecked")
    public static Map<String, Object> deepMerge(Map<String, Object> target, Map<String, Object>... sources) {
        Map<String, Object> result = new HashMap<>(target);

        for (Map<String, Object> source : sources) {
            for (Map.Entry<String, Object> entry : source.entrySet()) {
                String key = entry.getKey();
                Object sourceVal = entry.getValue();
                Object targetVal = result.get(key);

                if (targetVal instanceof Map && sourceVal instanceof Map) {
                    result.put(key, deepMerge(
                            (Map<String, Object>) targetVal,
                            (Map<String, Object>) sourceVal
                    ));
                } else {
                    result.put(key, sourceVal);
                }
            }
        }

        return result;
    }
}
