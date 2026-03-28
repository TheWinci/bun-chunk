import { readFile } from "fs/promises";
import { join } from "path";

const MAX_SIZE = 1024;

interface Config {
  name: string;
  value: number;
  enabled: boolean;
}

type Result<T> = { ok: true; data: T } | { ok: false; error: string };

enum Status {
  Active = "active",
  Inactive = "inactive",
  Pending = "pending",
}

export class DataProcessor {
  private config: Config;

  constructor(config: Config) {
    this.config = config;
  }

  async process(input: string): Promise<Result<string>> {
    try {
      const data = await readFile(join(".", input), "utf-8");
      return { ok: true, data: data.toUpperCase() };
    } catch {
      return { ok: false, error: "Failed to process" };
    }
  }

  getStatus(): Status {
    return this.config.enabled ? Status.Active : Status.Inactive;
  }
}

export function createProcessor(name: string): DataProcessor {
  return new DataProcessor({ name, value: 42, enabled: true });
}

export const helper = (x: number): number => x * 2;

function internalHelper(): void {
  console.log("internal");
}

interface CacheEntry<T> {
  key: string;
  value: T;
  expiresAt: number;
  tags: string[];
}

type EventHandler<T = unknown> = (event: T) => void | Promise<void>;

export class EventBus {
  private handlers: Map<string, EventHandler[]> = new Map();
  private onceHandlers: Map<string, EventHandler[]> = new Map();
  private maxListeners: number;

  constructor(maxListeners: number = 10) {
    this.maxListeners = maxListeners;
  }

  on<T>(event: string, handler: EventHandler<T>): () => void {
    const handlers = this.handlers.get(event) ?? [];
    if (handlers.length >= this.maxListeners) {
      console.warn(`Max listeners (${this.maxListeners}) reached for event: ${event}`);
    }
    handlers.push(handler as EventHandler);
    this.handlers.set(event, handlers);

    return () => {
      this.off(event, handler);
    };
  }

  once<T>(event: string, handler: EventHandler<T>): void {
    const onceHandlers = this.onceHandlers.get(event) ?? [];
    onceHandlers.push(handler as EventHandler);
    this.onceHandlers.set(event, onceHandlers);
  }

  off<T>(event: string, handler: EventHandler<T>): void {
    const handlers = this.handlers.get(event);
    if (handlers) {
      const index = handlers.indexOf(handler as EventHandler);
      if (index !== -1) {
        handlers.splice(index, 1);
      }
    }
  }

  async emit<T>(event: string, data: T): Promise<void> {
    const handlers = this.handlers.get(event) ?? [];
    const onceHandlers = this.onceHandlers.get(event) ?? [];

    for (const handler of [...handlers, ...onceHandlers]) {
      await handler(data);
    }

    this.onceHandlers.delete(event);
  }

  listenerCount(event: string): number {
    const regular = this.handlers.get(event)?.length ?? 0;
    const once = this.onceHandlers.get(event)?.length ?? 0;
    return regular + once;
  }

  removeAllListeners(event?: string): void {
    if (event) {
      this.handlers.delete(event);
      this.onceHandlers.delete(event);
    } else {
      this.handlers.clear();
      this.onceHandlers.clear();
    }
  }
}

export class LRUCache<T> {
  private cache: Map<string, CacheEntry<T>> = new Map();
  private readonly capacity: number;
  private readonly defaultTTL: number;
  private hits: number = 0;
  private misses: number = 0;

  constructor(capacity: number, defaultTTL: number = 60000) {
    this.capacity = capacity;
    this.defaultTTL = defaultTTL;
  }

  get(key: string): T | undefined {
    const entry = this.cache.get(key);
    if (!entry) {
      this.misses++;
      return undefined;
    }

    if (Date.now() > entry.expiresAt) {
      this.cache.delete(key);
      this.misses++;
      return undefined;
    }

    this.hits++;
    this.cache.delete(key);
    this.cache.set(key, entry);
    return entry.value;
  }

  set(key: string, value: T, ttl?: number, tags: string[] = []): void {
    if (this.cache.has(key)) {
      this.cache.delete(key);
    } else if (this.cache.size >= this.capacity) {
      const firstKey = this.cache.keys().next().value;
      if (firstKey !== undefined) {
        this.cache.delete(firstKey);
      }
    }

    this.cache.set(key, {
      key,
      value,
      expiresAt: Date.now() + (ttl ?? this.defaultTTL),
      tags,
    });
  }

  invalidateByTag(tag: string): number {
    let count = 0;
    for (const [key, entry] of this.cache) {
      if (entry.tags.includes(tag)) {
        this.cache.delete(key);
        count++;
      }
    }
    return count;
  }

  getStats(): { hits: number; misses: number; size: number; hitRate: number } {
    const total = this.hits + this.misses;
    return {
      hits: this.hits,
      misses: this.misses,
      size: this.cache.size,
      hitRate: total === 0 ? 0 : this.hits / total,
    };
  }

  clear(): void {
    this.cache.clear();
    this.hits = 0;
    this.misses = 0;
  }
}

export async function retryWithBackoff<T>(
  fn: () => Promise<T>,
  options: { maxRetries?: number; baseDelay?: number; maxDelay?: number } = {}
): Promise<T> {
  const { maxRetries = 3, baseDelay = 1000, maxDelay = 30000 } = options;
  let lastError: Error | undefined;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));

      if (attempt === maxRetries) {
        break;
      }

      const delay = Math.min(baseDelay * Math.pow(2, attempt), maxDelay);
      const jitter = delay * (0.5 + Math.random() * 0.5);
      await new Promise((resolve) => setTimeout(resolve, jitter));
    }
  }

  throw lastError;
}

export function deepMerge<T extends Record<string, unknown>>(
  target: T,
  ...sources: Partial<T>[]
): T {
  const result = { ...target };

  for (const source of sources) {
    for (const key of Object.keys(source) as (keyof T)[]) {
      const sourceVal = source[key];
      const targetVal = result[key];

      if (
        sourceVal &&
        typeof sourceVal === "object" &&
        !Array.isArray(sourceVal) &&
        targetVal &&
        typeof targetVal === "object" &&
        !Array.isArray(targetVal)
      ) {
        (result as Record<string, unknown>)[key as string] = deepMerge(
          targetVal as Record<string, unknown>,
          sourceVal as Record<string, unknown>
        );
      } else if (sourceVal !== undefined) {
        (result as Record<string, unknown>)[key as string] = sourceVal;
      }
    }
  }

  return result;
}
