using System;
using System.IO;
using System.Collections.Generic;

namespace Processing
{
    public interface IProcessor
    {
        string Process(string input);
        Status GetStatus();
    }

    public enum Status
    {
        Active,
        Inactive,
        Pending
    }

    public class Config
    {
        public string Name { get; set; }
        public int Value { get; set; }
        public bool Enabled { get; set; }
    }

    public class DataProcessor : IProcessor
    {
        private readonly Config _config;

        public DataProcessor(Config config)
        {
            _config = config;
        }

        public string Process(string input)
        {
            return File.ReadAllText(input).ToUpper();
        }

        public Status GetStatus()
        {
            return _config.Enabled ? Status.Active : Status.Inactive;
        }
    }

    public static class Factory
    {
        public static DataProcessor Create(string name)
        {
            var config = new Config { Name = name, Value = 42, Enabled = true };
            return new DataProcessor(config);
        }
    }

    public class CacheEntry<T>
    {
        public string Key { get; set; }
        public T Value { get; set; }
        public DateTime ExpiresAt { get; set; }
        public List<string> Tags { get; set; } = new List<string>();
    }

    public class LRUCache<T>
    {
        private readonly Dictionary<string, LinkedListNode<CacheEntry<T>>> _lookup;
        private readonly LinkedList<CacheEntry<T>> _order;
        private readonly int _capacity;
        private readonly TimeSpan _defaultTTL;
        private long _hits;
        private long _misses;

        public LRUCache(int capacity, TimeSpan? defaultTTL = null)
        {
            _capacity = capacity;
            _defaultTTL = defaultTTL ?? TimeSpan.FromMinutes(1);
            _lookup = new Dictionary<string, LinkedListNode<CacheEntry<T>>>();
            _order = new LinkedList<CacheEntry<T>>();
            _hits = 0;
            _misses = 0;
        }

        public T Get(string key)
        {
            if (!_lookup.TryGetValue(key, out var node))
            {
                _misses++;
                return default;
            }

            if (DateTime.UtcNow > node.Value.ExpiresAt)
            {
                Remove(key);
                _misses++;
                return default;
            }

            _hits++;
            _order.Remove(node);
            _order.AddFirst(node);
            return node.Value.Value;
        }

        public void Set(string key, T value, TimeSpan? ttl = null, List<string> tags = null)
        {
            if (_lookup.ContainsKey(key))
            {
                Remove(key);
            }
            else if (_lookup.Count >= _capacity)
            {
                var oldest = _order.Last;
                if (oldest != null)
                {
                    _lookup.Remove(oldest.Value.Key);
                    _order.RemoveLast();
                }
            }

            var entry = new CacheEntry<T>
            {
                Key = key,
                Value = value,
                ExpiresAt = DateTime.UtcNow + (ttl ?? _defaultTTL),
                Tags = tags ?? new List<string>()
            };

            var node = _order.AddFirst(entry);
            _lookup[key] = node;
        }

        public int InvalidateByTag(string tag)
        {
            var keysToRemove = _lookup
                .Where(kvp => kvp.Value.Value.Tags.Contains(tag))
                .Select(kvp => kvp.Key)
                .ToList();

            foreach (var key in keysToRemove)
            {
                Remove(key);
            }

            return keysToRemove.Count;
        }

        public (long Hits, long Misses, int Size, double HitRate) GetStats()
        {
            var total = _hits + _misses;
            var hitRate = total == 0 ? 0.0 : (double)_hits / total;
            return (_hits, _misses, _lookup.Count, hitRate);
        }

        public void Clear()
        {
            _lookup.Clear();
            _order.Clear();
            _hits = 0;
            _misses = 0;
        }

        private void Remove(string key)
        {
            if (_lookup.TryGetValue(key, out var node))
            {
                _order.Remove(node);
                _lookup.Remove(key);
            }
        }
    }

    public class EventBus
    {
        private readonly Dictionary<string, List<Action<object>>> _handlers = new();
        private readonly Dictionary<string, List<Action<object>>> _onceHandlers = new();
        private readonly int _maxListeners;

        public EventBus(int maxListeners = 10)
        {
            _maxListeners = maxListeners;
        }

        public Action On(string eventName, Action<object> handler)
        {
            if (!_handlers.ContainsKey(eventName))
                _handlers[eventName] = new List<Action<object>>();

            if (_handlers[eventName].Count >= _maxListeners)
                Console.WriteLine($"Warning: max listeners ({_maxListeners}) reached for event: {eventName}");

            _handlers[eventName].Add(handler);

            return () => Off(eventName, handler);
        }

        public void Once(string eventName, Action<object> handler)
        {
            if (!_onceHandlers.ContainsKey(eventName))
                _onceHandlers[eventName] = new List<Action<object>>();

            _onceHandlers[eventName].Add(handler);
        }

        public void Off(string eventName, Action<object> handler)
        {
            if (_handlers.ContainsKey(eventName))
                _handlers[eventName].Remove(handler);
        }

        public void Emit(string eventName, object data = null)
        {
            if (_handlers.TryGetValue(eventName, out var handlers))
            {
                foreach (var handler in handlers.ToList())
                    handler(data);
            }

            if (_onceHandlers.TryGetValue(eventName, out var onceHandlers))
            {
                foreach (var handler in onceHandlers.ToList())
                    handler(data);
                _onceHandlers.Remove(eventName);
            }
        }

        public int ListenerCount(string eventName)
        {
            var regular = _handlers.ContainsKey(eventName) ? _handlers[eventName].Count : 0;
            var once = _onceHandlers.ContainsKey(eventName) ? _onceHandlers[eventName].Count : 0;
            return regular + once;
        }

        public void RemoveAllListeners(string eventName = null)
        {
            if (eventName != null)
            {
                _handlers.Remove(eventName);
                _onceHandlers.Remove(eventName);
            }
            else
            {
                _handlers.Clear();
                _onceHandlers.Clear();
            }
        }
    }
}
