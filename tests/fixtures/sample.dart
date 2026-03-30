import 'dart:io';
import 'package:http/http.dart' as http;

class Config {
  final String name;
  final int value;
  final bool enabled;

  const Config({required this.name, this.value = 42, this.enabled = true});

  Config copyWith({String? name, int? value, bool? enabled}) {
    return Config(
      name: name ?? this.name,
      value: value ?? this.value,
      enabled: enabled ?? this.enabled,
    );
  }
}

enum Status { active, inactive, pending }

abstract class Processor {
  String? process(String input);
  Status getStatus();
}

class DataProcessor extends Processor {
  final Config config;

  DataProcessor(this.config);

  @override
  String? process(String input) {
    try {
      final file = File(input);
      return file.readAsStringSync().toUpperCase();
    } catch (e) {
      return null;
    }
  }

  @override
  Status getStatus() {
    return config.enabled ? Status.active : Status.inactive;
  }
}

DataProcessor createProcessor(String name) {
  final config = Config(name: name);
  return DataProcessor(config);
}

int helper(int x) => x * 2;

class CacheEntry<T> {
  final String key;
  final T value;
  final DateTime expiresAt;
  final List<String> tags;

  CacheEntry({
    required this.key,
    required this.value,
    required this.expiresAt,
    this.tags = const [],
  });
}

class LRUCache<T> {
  final int capacity;
  final Duration defaultTTL;
  final Map<String, CacheEntry<T>> _cache = {};
  int _hits = 0;
  int _misses = 0;

  LRUCache({required this.capacity, this.defaultTTL = const Duration(seconds: 60)});

  T? get(String key) {
    final entry = _cache[key];
    if (entry == null) {
      _misses++;
      return null;
    }

    if (DateTime.now().isAfter(entry.expiresAt)) {
      _cache.remove(key);
      _misses++;
      return null;
    }

    _hits++;
    _cache.remove(key);
    _cache[key] = entry;
    return entry.value;
  }

  void set(String key, T value, {Duration? ttl, List<String> tags = const []}) {
    if (_cache.containsKey(key)) {
      _cache.remove(key);
    } else if (_cache.length >= capacity) {
      _cache.remove(_cache.keys.first);
    }

    _cache[key] = CacheEntry(
      key: key,
      value: value,
      expiresAt: DateTime.now().add(ttl ?? defaultTTL),
      tags: tags,
    );
  }

  int invalidateByTag(String tag) {
    final keysToRemove = _cache.entries
        .where((e) => e.value.tags.contains(tag))
        .map((e) => e.key)
        .toList();

    for (final key in keysToRemove) {
      _cache.remove(key);
    }
    return keysToRemove.length;
  }

  Map<String, dynamic> stats() {
    final total = _hits + _misses;
    return {
      'hits': _hits,
      'misses': _misses,
      'size': _cache.length,
      'hitRate': total == 0 ? 0.0 : _hits / total,
    };
  }

  void clear() {
    _cache.clear();
    _hits = 0;
    _misses = 0;
  }
}

mixin Serializable {
  Map<String, dynamic> toJson();

  String serialize() {
    return toJson().toString();
  }
}

extension StringUtils on String {
  String capitalize() {
    if (isEmpty) return this;
    return '${this[0].toUpperCase()}${substring(1)}';
  }

  bool get isBlank => trim().isEmpty;
}
