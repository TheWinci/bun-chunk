import { readFile } from "fs/promises";
import { join } from "path";

const MAX_SIZE = 1024;

class DataProcessor {
  constructor(config) {
    this.config = config;
  }

  async process(input) {
    const data = await readFile(join(".", input), "utf-8");
    return data.toUpperCase();
  }

  getStatus() {
    return this.config.enabled ? "active" : "inactive";
  }
}

function createProcessor(name) {
  return new DataProcessor({ name, value: 42, enabled: true });
}

const helper = (x) => x * 2;

class EventBus {
  #handlers = new Map();
  #onceHandlers = new Map();
  #maxListeners;

  constructor(maxListeners = 10) {
    this.#maxListeners = maxListeners;
  }

  on(event, handler) {
    const handlers = this.#handlers.get(event) ?? [];
    if (handlers.length >= this.#maxListeners) {
      console.warn(`Max listeners (${this.#maxListeners}) reached for event: ${event}`);
    }
    handlers.push(handler);
    this.#handlers.set(event, handlers);

    return () => this.off(event, handler);
  }

  once(event, handler) {
    const onceHandlers = this.#onceHandlers.get(event) ?? [];
    onceHandlers.push(handler);
    this.#onceHandlers.set(event, onceHandlers);
  }

  off(event, handler) {
    const handlers = this.#handlers.get(event);
    if (handlers) {
      const index = handlers.indexOf(handler);
      if (index !== -1) {
        handlers.splice(index, 1);
      }
    }
  }

  async emit(event, data) {
    const handlers = this.#handlers.get(event) ?? [];
    const onceHandlers = this.#onceHandlers.get(event) ?? [];

    for (const handler of [...handlers, ...onceHandlers]) {
      await handler(data);
    }

    this.#onceHandlers.delete(event);
  }

  listenerCount(event) {
    const regular = this.#handlers.get(event)?.length ?? 0;
    const once = this.#onceHandlers.get(event)?.length ?? 0;
    return regular + once;
  }

  removeAllListeners(event) {
    if (event) {
      this.#handlers.delete(event);
      this.#onceHandlers.delete(event);
    } else {
      this.#handlers.clear();
      this.#onceHandlers.clear();
    }
  }
}

class LRUCache {
  #cache = new Map();
  #capacity;
  #defaultTTL;
  #hits = 0;
  #misses = 0;

  constructor(capacity, defaultTTL = 60000) {
    this.#capacity = capacity;
    this.#defaultTTL = defaultTTL;
  }

  get(key) {
    const entry = this.#cache.get(key);
    if (!entry) {
      this.#misses++;
      return undefined;
    }

    if (Date.now() > entry.expiresAt) {
      this.#cache.delete(key);
      this.#misses++;
      return undefined;
    }

    this.#hits++;
    this.#cache.delete(key);
    this.#cache.set(key, entry);
    return entry.value;
  }

  set(key, value, ttl, tags = []) {
    if (this.#cache.has(key)) {
      this.#cache.delete(key);
    } else if (this.#cache.size >= this.#capacity) {
      const firstKey = this.#cache.keys().next().value;
      this.#cache.delete(firstKey);
    }

    this.#cache.set(key, {
      value,
      expiresAt: Date.now() + (ttl ?? this.#defaultTTL),
      tags,
    });
  }

  invalidateByTag(tag) {
    let count = 0;
    for (const [key, entry] of this.#cache) {
      if (entry.tags.includes(tag)) {
        this.#cache.delete(key);
        count++;
      }
    }
    return count;
  }

  getStats() {
    const total = this.#hits + this.#misses;
    return {
      hits: this.#hits,
      misses: this.#misses,
      size: this.#cache.size,
      hitRate: total === 0 ? 0 : this.#hits / total,
    };
  }

  clear() {
    this.#cache.clear();
    this.#hits = 0;
    this.#misses = 0;
  }
}

async function retryWithBackoff(fn, { maxRetries = 3, baseDelay = 1000, maxDelay = 30000 } = {}) {
  let lastError;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      if (attempt === maxRetries) break;

      const delay = Math.min(baseDelay * Math.pow(2, attempt), maxDelay);
      const jitter = delay * (0.5 + Math.random() * 0.5);
      await new Promise((resolve) => setTimeout(resolve, jitter));
    }
  }

  throw lastError;
}

function deepMerge(target, ...sources) {
  const result = { ...target };

  for (const source of sources) {
    for (const key of Object.keys(source)) {
      const sourceVal = source[key];
      const targetVal = result[key];

      if (
        sourceVal && typeof sourceVal === "object" && !Array.isArray(sourceVal) &&
        targetVal && typeof targetVal === "object" && !Array.isArray(targetVal)
      ) {
        result[key] = deepMerge(targetVal, sourceVal);
      } else {
        result[key] = sourceVal;
      }
    }
  }

  return result;
}

export { DataProcessor, createProcessor, helper, EventBus, LRUCache, retryWithBackoff, deepMerge };
