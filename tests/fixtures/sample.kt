package com.example.processing

import java.io.File
import java.nio.file.Path

data class Config(
    val name: String,
    val value: Int = 42,
    val enabled: Boolean = true
)

enum class Status {
    ACTIVE, INACTIVE, PENDING
}

interface Processor {
    fun process(input: String): String?
    fun getStatus(): Status
}

class DataProcessor(private val config: Config) : Processor {
    override fun process(input: String): String? {
        return try {
            File(input).readText().uppercase()
        } catch (e: Exception) {
            null
        }
    }

    override fun getStatus(): Status {
        return if (config.enabled) Status.ACTIVE else Status.INACTIVE
    }
}

fun createProcessor(name: String): DataProcessor {
    val config = Config(name = name)
    return DataProcessor(config)
}

fun helper(x: Int): Int = x * 2

data class CacheEntry<T>(
    val key: String,
    val value: T,
    val expiresAt: Long,
    val tags: List<String> = emptyList()
)

class LRUCache<T>(
    private val capacity: Int,
    private val defaultTTL: Long = 60000L
) {
    private val cache = LinkedHashMap<String, CacheEntry<T>>()
    private var hits: Long = 0
    private var misses: Long = 0

    fun get(key: String): T? {
        val entry = cache[key]
        if (entry == null) {
            misses++
            return null
        }

        if (System.currentTimeMillis() > entry.expiresAt) {
            cache.remove(key)
            misses++
            return null
        }

        hits++
        cache.remove(key)
        cache[key] = entry
        return entry.value
    }

    fun set(key: String, value: T, ttl: Long? = null, tags: List<String> = emptyList()) {
        if (cache.containsKey(key)) {
            cache.remove(key)
        } else if (cache.size >= capacity) {
            val oldest = cache.keys.firstOrNull()
            if (oldest != null) cache.remove(oldest)
        }

        cache[key] = CacheEntry(
            key = key,
            value = value,
            expiresAt = System.currentTimeMillis() + (ttl ?: defaultTTL),
            tags = tags
        )
    }

    fun invalidateByTag(tag: String): Int {
        val keysToRemove = cache.entries
            .filter { it.value.tags.contains(tag) }
            .map { it.key }

        keysToRemove.forEach { cache.remove(it) }
        return keysToRemove.size
    }

    fun stats(): Map<String, Any> {
        val total = hits + misses
        return mapOf(
            "hits" to hits,
            "misses" to misses,
            "size" to cache.size,
            "hitRate" to if (total == 0L) 0.0 else hits.toDouble() / total
        )
    }

    fun clear() {
        cache.clear()
        hits = 0
        misses = 0
    }
}

class EventBus(private val maxListeners: Int = 10) {
    private val handlers = mutableMapOf<String, MutableList<(Any?) -> Unit>>()
    private val onceHandlers = mutableMapOf<String, MutableList<(Any?) -> Unit>>()

    fun on(event: String, handler: (Any?) -> Unit): () -> Unit {
        val eventHandlers = handlers.getOrPut(event) { mutableListOf() }
        if (eventHandlers.size >= maxListeners) {
            println("Warning: max listeners ($maxListeners) reached for event: $event")
        }
        eventHandlers.add(handler)

        return { off(event, handler) }
    }

    fun once(event: String, handler: (Any?) -> Unit) {
        onceHandlers.getOrPut(event) { mutableListOf() }.add(handler)
    }

    fun off(event: String, handler: (Any?) -> Unit) {
        handlers[event]?.remove(handler)
    }

    fun emit(event: String, data: Any? = null) {
        handlers[event]?.forEach { it(data) }
        onceHandlers.remove(event)?.forEach { it(data) }
    }

    fun listenerCount(event: String): Int {
        return (handlers[event]?.size ?: 0) + (onceHandlers[event]?.size ?: 0)
    }

    fun removeAllListeners(event: String? = null) {
        if (event != null) {
            handlers.remove(event)
            onceHandlers.remove(event)
        } else {
            handlers.clear()
            onceHandlers.clear()
        }
    }
}

fun <T> retryWithBackoff(
    maxRetries: Int = 3,
    baseDelay: Long = 1000L,
    maxDelay: Long = 30000L,
    operation: () -> T
): T {
    var lastError: Exception? = null

    for (attempt in 0..maxRetries) {
        try {
            return operation()
        } catch (e: Exception) {
            lastError = e
            if (attempt == maxRetries) break

            val delay = minOf(baseDelay * (1L shl attempt), maxDelay)
            val jitter = (delay * (0.5 + Math.random() * 0.5)).toLong()
            Thread.sleep(jitter)
        }
    }

    throw lastError!!
}

fun deepMerge(target: Map<String, Any?>, vararg sources: Map<String, Any?>): Map<String, Any?> {
    val result = target.toMutableMap()

    for (source in sources) {
        for ((key, value) in source) {
            val targetVal = result[key]
            if (targetVal is Map<*, *> && value is Map<*, *>) {
                @Suppress("UNCHECKED_CAST")
                result[key] = deepMerge(
                    targetVal as Map<String, Any?>,
                    value as Map<String, Any?>
                )
            } else {
                result[key] = value
            }
        }
    }

    return result
}
