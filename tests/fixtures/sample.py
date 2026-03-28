import os
from pathlib import Path
from typing import Optional, List

MAX_SIZE = 1024


class DataProcessor:
    """Process data from files."""

    def __init__(self, name: str, enabled: bool = True):
        self.name = name
        self.enabled = enabled

    def process(self, input_path: str) -> Optional[str]:
        """Process a single file."""
        try:
            path = Path(input_path)
            return path.read_text().upper()
        except FileNotFoundError:
            return None

    @staticmethod
    def validate(data: str) -> bool:
        """Validate data format."""
        return len(data) > 0 and len(data) < MAX_SIZE


def create_processor(name: str) -> DataProcessor:
    """Factory function."""
    return DataProcessor(name=name)


def helper(x: int) -> int:
    return x * 2


class EventBus:
    """A publish-subscribe event system with support for async handlers."""

    def __init__(self, max_listeners: int = 10):
        self._handlers: dict[str, List[callable]] = {}
        self._once_handlers: dict[str, List[callable]] = {}
        self._max_listeners = max_listeners

    def on(self, event: str, handler: callable) -> callable:
        """Register an event handler. Returns an unsubscribe function."""
        if event not in self._handlers:
            self._handlers[event] = []

        handlers = self._handlers[event]
        if len(handlers) >= self._max_listeners:
            import warnings
            warnings.warn(f"Max listeners ({self._max_listeners}) reached for event: {event}")

        handlers.append(handler)

        def unsubscribe():
            self.off(event, handler)

        return unsubscribe

    def once(self, event: str, handler: callable) -> None:
        """Register a one-time event handler."""
        if event not in self._once_handlers:
            self._once_handlers[event] = []
        self._once_handlers[event].append(handler)

    def off(self, event: str, handler: callable) -> None:
        """Remove an event handler."""
        if event in self._handlers:
            try:
                self._handlers[event].remove(handler)
            except ValueError:
                pass

    def emit(self, event: str, data=None) -> None:
        """Emit an event to all registered handlers."""
        handlers = self._handlers.get(event, [])
        once_handlers = self._once_handlers.pop(event, [])

        for handler in [*handlers, *once_handlers]:
            handler(data)

    def listener_count(self, event: str) -> int:
        """Return the number of listeners for an event."""
        regular = len(self._handlers.get(event, []))
        once = len(self._once_handlers.get(event, []))
        return regular + once

    def remove_all_listeners(self, event: Optional[str] = None) -> None:
        """Remove all listeners, optionally for a specific event."""
        if event:
            self._handlers.pop(event, None)
            self._once_handlers.pop(event, None)
        else:
            self._handlers.clear()
            self._once_handlers.clear()


class LRUCache:
    """A least-recently-used cache with TTL support."""

    def __init__(self, capacity: int, default_ttl: float = 60.0):
        self._capacity = capacity
        self._default_ttl = default_ttl
        self._cache: dict[str, dict] = {}
        self._order: List[str] = []
        self._hits = 0
        self._misses = 0

    def get(self, key: str) -> Optional[any]:
        """Get a value from the cache, returning None if expired or missing."""
        import time

        if key not in self._cache:
            self._misses += 1
            return None

        entry = self._cache[key]
        if time.time() > entry["expires_at"]:
            self._remove(key)
            self._misses += 1
            return None

        self._hits += 1
        self._order.remove(key)
        self._order.append(key)
        return entry["value"]

    def set(self, key: str, value, ttl: Optional[float] = None, tags: Optional[List[str]] = None) -> None:
        """Set a value in the cache with optional TTL and tags."""
        import time

        if key in self._cache:
            self._remove(key)
        elif len(self._cache) >= self._capacity:
            oldest = self._order[0]
            self._remove(oldest)

        self._cache[key] = {
            "value": value,
            "expires_at": time.time() + (ttl or self._default_ttl),
            "tags": tags or [],
        }
        self._order.append(key)

    def invalidate_by_tag(self, tag: str) -> int:
        """Remove all entries with the given tag. Returns count of removed entries."""
        keys_to_remove = [
            key for key, entry in self._cache.items()
            if tag in entry.get("tags", [])
        ]
        for key in keys_to_remove:
            self._remove(key)
        return len(keys_to_remove)

    def get_stats(self) -> dict:
        """Return cache statistics."""
        total = self._hits + self._misses
        return {
            "hits": self._hits,
            "misses": self._misses,
            "size": len(self._cache),
            "hit_rate": self._hits / total if total > 0 else 0.0,
        }

    def clear(self) -> None:
        """Clear the cache and reset statistics."""
        self._cache.clear()
        self._order.clear()
        self._hits = 0
        self._misses = 0

    def _remove(self, key: str) -> None:
        """Remove a key from both the cache dict and order list."""
        self._cache.pop(key, None)
        try:
            self._order.remove(key)
        except ValueError:
            pass


def retry_with_backoff(fn: callable, max_retries: int = 3, base_delay: float = 1.0, max_delay: float = 30.0):
    """Retry a function with exponential backoff and jitter."""
    import time
    import random

    last_error = None

    for attempt in range(max_retries + 1):
        try:
            return fn()
        except Exception as e:
            last_error = e
            if attempt == max_retries:
                break
            delay = min(base_delay * (2 ** attempt), max_delay)
            jitter = delay * (0.5 + random.random() * 0.5)
            time.sleep(jitter)

    raise last_error


def deep_merge(target: dict, *sources: dict) -> dict:
    """Deep merge multiple dictionaries into a target dictionary."""
    result = dict(target)

    for source in sources:
        for key, value in source.items():
            if (
                key in result
                and isinstance(result[key], dict)
                and isinstance(value, dict)
            ):
                result[key] = deep_merge(result[key], value)
            else:
                result[key] = value

    return result
