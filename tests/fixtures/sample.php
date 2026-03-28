<?php

namespace App\Processing;

use App\Utils\Helper;
use App\Config\Settings;

interface ProcessorInterface
{
    public function process(string $input): ?string;
    public function getStatus(): string;
}

enum Status: string
{
    case Active = 'active';
    case Inactive = 'inactive';
    case Pending = 'pending';
}

class Config
{
    public function __construct(
        public readonly string $name,
        public readonly int $value = 42,
        public readonly bool $enabled = true,
    ) {}
}

class DataProcessor implements ProcessorInterface
{
    private Config $config;

    public function __construct(Config $config)
    {
        $this->config = $config;
    }

    public function process(string $input): ?string
    {
        $content = file_get_contents($input);
        return $content !== false ? strtoupper($content) : null;
    }

    public function getStatus(): string
    {
        return $this->config->enabled ? Status::Active->value : Status::Inactive->value;
    }
}

function createProcessor(string $name): DataProcessor
{
    $config = new Config(name: $name);
    return new DataProcessor($config);
}

class CacheEntry
{
    public function __construct(
        public readonly string $key,
        public readonly mixed $value,
        public readonly float $expiresAt,
        public readonly array $tags = [],
    ) {}
}

class LRUCache
{
    private array $cache = [];
    private array $order = [];
    private int $hits = 0;
    private int $misses = 0;

    public function __construct(
        private readonly int $capacity,
        private readonly float $defaultTTL = 60.0,
    ) {}

    public function get(string $key): mixed
    {
        if (!isset($this->cache[$key])) {
            $this->misses++;
            return null;
        }

        $entry = $this->cache[$key];
        if (microtime(true) > $entry->expiresAt) {
            $this->remove($key);
            $this->misses++;
            return null;
        }

        $this->hits++;
        $this->moveToEnd($key);
        return $entry->value;
    }

    public function set(string $key, mixed $value, ?float $ttl = null, array $tags = []): void
    {
        if (isset($this->cache[$key])) {
            $this->remove($key);
        } elseif (count($this->cache) >= $this->capacity) {
            $oldest = $this->order[0] ?? null;
            if ($oldest !== null) {
                $this->remove($oldest);
            }
        }

        $this->cache[$key] = new CacheEntry(
            key: $key,
            value: $value,
            expiresAt: microtime(true) + ($ttl ?? $this->defaultTTL),
            tags: $tags,
        );
        $this->order[] = $key;
    }

    public function invalidateByTag(string $tag): int
    {
        $keysToRemove = [];
        foreach ($this->cache as $key => $entry) {
            if (in_array($tag, $entry->tags, true)) {
                $keysToRemove[] = $key;
            }
        }

        foreach ($keysToRemove as $key) {
            $this->remove($key);
        }

        return count($keysToRemove);
    }

    public function getStats(): array
    {
        $total = $this->hits + $this->misses;
        return [
            'hits' => $this->hits,
            'misses' => $this->misses,
            'size' => count($this->cache),
            'hit_rate' => $total === 0 ? 0.0 : $this->hits / $total,
        ];
    }

    public function clear(): void
    {
        $this->cache = [];
        $this->order = [];
        $this->hits = 0;
        $this->misses = 0;
    }

    private function remove(string $key): void
    {
        unset($this->cache[$key]);
        $this->order = array_values(array_filter($this->order, fn($k) => $k !== $key));
    }

    private function moveToEnd(string $key): void
    {
        $this->order = array_values(array_filter($this->order, fn($k) => $k !== $key));
        $this->order[] = $key;
    }
}

class EventBus
{
    private array $handlers = [];
    private array $onceHandlers = [];

    public function __construct(
        private readonly int $maxListeners = 10,
    ) {}

    public function on(string $event, callable $handler): callable
    {
        if (!isset($this->handlers[$event])) {
            $this->handlers[$event] = [];
        }

        if (count($this->handlers[$event]) >= $this->maxListeners) {
            trigger_error("Max listeners ({$this->maxListeners}) reached for event: {$event}", E_USER_WARNING);
        }

        $this->handlers[$event][] = $handler;

        return fn() => $this->off($event, $handler);
    }

    public function once(string $event, callable $handler): void
    {
        if (!isset($this->onceHandlers[$event])) {
            $this->onceHandlers[$event] = [];
        }
        $this->onceHandlers[$event][] = $handler;
    }

    public function off(string $event, callable $handler): void
    {
        if (isset($this->handlers[$event])) {
            $this->handlers[$event] = array_values(
                array_filter($this->handlers[$event], fn($h) => $h !== $handler)
            );
        }
    }

    public function emit(string $event, mixed $data = null): void
    {
        foreach ($this->handlers[$event] ?? [] as $handler) {
            $handler($data);
        }

        foreach ($this->onceHandlers[$event] ?? [] as $handler) {
            $handler($data);
        }
        unset($this->onceHandlers[$event]);
    }

    public function listenerCount(string $event): int
    {
        $regular = count($this->handlers[$event] ?? []);
        $once = count($this->onceHandlers[$event] ?? []);
        return $regular + $once;
    }

    public function removeAllListeners(?string $event = null): void
    {
        if ($event !== null) {
            unset($this->handlers[$event]);
            unset($this->onceHandlers[$event]);
        } else {
            $this->handlers = [];
            $this->onceHandlers = [];
        }
    }
}

function retryWithBackoff(callable $fn, int $maxRetries = 3, float $baseDelay = 1.0, float $maxDelay = 30.0): mixed
{
    $lastError = null;

    for ($attempt = 0; $attempt <= $maxRetries; $attempt++) {
        try {
            return $fn();
        } catch (\Throwable $e) {
            $lastError = $e;
            if ($attempt === $maxRetries) {
                break;
            }

            $delay = min($baseDelay * pow(2, $attempt), $maxDelay);
            $jitter = $delay * (0.5 + lcg_value() * 0.5);
            usleep((int)($jitter * 1_000_000));
        }
    }

    throw $lastError;
}

function deepMerge(array $target, array ...$sources): array
{
    $result = $target;

    foreach ($sources as $source) {
        foreach ($source as $key => $value) {
            if (isset($result[$key]) && is_array($result[$key]) && is_array($value)) {
                $result[$key] = deepMerge($result[$key], $value);
            } else {
                $result[$key] = $value;
            }
        }
    }

    return $result;
}
