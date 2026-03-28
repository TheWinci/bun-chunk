import Foundation

struct Config {
    let name: String
    var value: Int
    var enabled: Bool
}

enum Status {
    case active
    case inactive
    case pending
}

protocol Processor {
    func process(input: String) -> String?
    func getStatus() -> Status
}

class DataProcessor: Processor {
    private let config: Config

    init(config: Config) {
        self.config = config
    }

    func process(input: String) -> String? {
        guard let data = try? String(contentsOfFile: input) else {
            return nil
        }
        return data.uppercased()
    }

    func getStatus() -> Status {
        return config.enabled ? .active : .inactive
    }
}

func createProcessor(name: String) -> DataProcessor {
    let config = Config(name: name, value: 42, enabled: true)
    return DataProcessor(config: config)
}

func helper(x: Int) -> Int {
    return x * 2
}

struct CacheEntry<T> {
    let key: String
    let value: T
    let expiresAt: Date
    var tags: [String]
}

class LRUCache<T> {
    private var cache: [String: CacheEntry<T>] = [:]
    private var order: [String] = []
    private let capacity: Int
    private let defaultTTL: TimeInterval
    private var hits: Int = 0
    private var misses: Int = 0

    init(capacity: Int, defaultTTL: TimeInterval = 60.0) {
        self.capacity = capacity
        self.defaultTTL = defaultTTL
    }

    func get(_ key: String) -> T? {
        guard let entry = cache[key] else {
            misses += 1
            return nil
        }

        if Date() > entry.expiresAt {
            remove(key)
            misses += 1
            return nil
        }

        hits += 1
        moveToEnd(key)
        return entry.value
    }

    func set(_ key: String, value: T, ttl: TimeInterval? = nil, tags: [String] = []) {
        if cache[key] != nil {
            remove(key)
        } else if cache.count >= capacity {
            if let oldest = order.first {
                remove(oldest)
            }
        }

        let entry = CacheEntry(
            key: key,
            value: value,
            expiresAt: Date().addingTimeInterval(ttl ?? defaultTTL),
            tags: tags
        )
        cache[key] = entry
        order.append(key)
    }

    func invalidateByTag(_ tag: String) -> Int {
        let keysToRemove = cache.filter { $0.value.tags.contains(tag) }.map { $0.key }
        for key in keysToRemove {
            remove(key)
        }
        return keysToRemove.count
    }

    func stats() -> (hits: Int, misses: Int, size: Int, hitRate: Double) {
        let total = hits + misses
        let hitRate = total == 0 ? 0.0 : Double(hits) / Double(total)
        return (hits, misses, cache.count, hitRate)
    }

    func clear() {
        cache.removeAll()
        order.removeAll()
        hits = 0
        misses = 0
    }

    private func remove(_ key: String) {
        cache.removeValue(forKey: key)
        order.removeAll { $0 == key }
    }

    private func moveToEnd(_ key: String) {
        order.removeAll { $0 == key }
        order.append(key)
    }
}

protocol EventHandler {
    func handle(event: String, data: Any?)
}

class EventBus {
    private var handlers: [String: [(Any?) -> Void]] = [:]
    private var onceHandlers: [String: [(Any?) -> Void]] = [:]
    private let maxListeners: Int

    init(maxListeners: Int = 10) {
        self.maxListeners = maxListeners
    }

    func on(_ event: String, handler: @escaping (Any?) -> Void) -> () -> Void {
        if handlers[event] == nil {
            handlers[event] = []
        }

        if (handlers[event]?.count ?? 0) >= maxListeners {
            print("Warning: max listeners (\(maxListeners)) reached for event: \(event)")
        }

        handlers[event]?.append(handler)

        return { [weak self] in
            self?.handlers[event]?.removeAll { $0 as AnyObject === handler as AnyObject }
        }
    }

    func once(_ event: String, handler: @escaping (Any?) -> Void) {
        if onceHandlers[event] == nil {
            onceHandlers[event] = []
        }
        onceHandlers[event]?.append(handler)
    }

    func emit(_ event: String, data: Any? = nil) {
        handlers[event]?.forEach { $0(data) }
        onceHandlers[event]?.forEach { $0(data) }
        onceHandlers.removeValue(forKey: event)
    }

    func listenerCount(_ event: String) -> Int {
        return (handlers[event]?.count ?? 0) + (onceHandlers[event]?.count ?? 0)
    }

    func removeAllListeners(_ event: String? = nil) {
        if let event = event {
            handlers.removeValue(forKey: event)
            onceHandlers.removeValue(forKey: event)
        } else {
            handlers.removeAll()
            onceHandlers.removeAll()
        }
    }
}

enum RetryError: Error {
    case maxRetriesExceeded(lastError: Error)
}

func retryWithBackoff<T>(
    maxRetries: Int = 3,
    baseDelay: TimeInterval = 1.0,
    maxDelay: TimeInterval = 30.0,
    operation: () throws -> T
) throws -> T {
    var lastError: Error?

    for attempt in 0...maxRetries {
        do {
            return try operation()
        } catch {
            lastError = error
            if attempt == maxRetries { break }

            let delay = min(baseDelay * pow(2.0, Double(attempt)), maxDelay)
            let jitter = delay * (0.5 + Double.random(in: 0...0.5))
            Thread.sleep(forTimeInterval: jitter)
        }
    }

    throw RetryError.maxRetriesExceeded(lastError: lastError!)
}

func deepMerge(_ target: [String: Any], _ sources: [String: Any]...) -> [String: Any] {
    var result = target

    for source in sources {
        for (key, value) in source {
            if let targetDict = result[key] as? [String: Any],
               let sourceDict = value as? [String: Any] {
                result[key] = deepMerge(targetDict, sourceDict)
            } else {
                result[key] = value
            }
        }
    }

    return result
}
