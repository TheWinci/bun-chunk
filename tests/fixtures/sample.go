package main

import (
	"fmt"
	"os"
	"strings"
)

const MaxSize = 1024

type Config struct {
	Name    string
	Value   int
	Enabled bool
}

type Status int

const (
	Active   Status = iota
	Inactive
	Pending
)

type Processor interface {
	Process(input string) (string, error)
	GetStatus() Status
}

func (c *Config) Process(input string) (string, error) {
	data, err := os.ReadFile(input)
	if err != nil {
		return "", fmt.Errorf("failed to process: %w", err)
	}
	return strings.ToUpper(string(data)), nil
}

func (c *Config) GetStatus() Status {
	if c.Enabled {
		return Active
	}
	return Inactive
}

func CreateConfig(name string) *Config {
	return &Config{
		Name:    name,
		Value:   42,
		Enabled: true,
	}
}

func helper(x int) int {
	return x * 2
}

type CacheEntry struct {
	Value     interface{}
	ExpiresAt int64
	Tags      []string
}

type LRUCache struct {
	entries    map[string]*CacheEntry
	order      []string
	capacity   int
	defaultTTL int64
	hits       int64
	misses     int64
}

func NewLRUCache(capacity int, defaultTTL int64) *LRUCache {
	return &LRUCache{
		entries:    make(map[string]*CacheEntry),
		order:      make([]string, 0),
		capacity:   capacity,
		defaultTTL: defaultTTL,
	}
}

func (c *LRUCache) Get(key string) (interface{}, bool) {
	entry, exists := c.entries[key]
	if !exists {
		c.misses++
		return nil, false
	}

	now := timeNow()
	if now > entry.ExpiresAt {
		c.Remove(key)
		c.misses++
		return nil, false
	}

	c.hits++
	c.moveToEnd(key)
	return entry.Value, true
}

func (c *LRUCache) Set(key string, value interface{}, ttl *int64, tags []string) {
	if _, exists := c.entries[key]; exists {
		c.Remove(key)
	} else if len(c.entries) >= c.capacity {
		if len(c.order) > 0 {
			c.Remove(c.order[0])
		}
	}

	useTTL := c.defaultTTL
	if ttl != nil {
		useTTL = *ttl
	}

	c.entries[key] = &CacheEntry{
		Value:     value,
		ExpiresAt: timeNow() + useTTL,
		Tags:      tags,
	}
	c.order = append(c.order, key)
}

func (c *LRUCache) InvalidateByTag(tag string) int {
	var keysToRemove []string
	for key, entry := range c.entries {
		for _, t := range entry.Tags {
			if t == tag {
				keysToRemove = append(keysToRemove, key)
				break
			}
		}
	}
	for _, key := range keysToRemove {
		c.Remove(key)
	}
	return len(keysToRemove)
}

func (c *LRUCache) Stats() (int64, int64, int, float64) {
	total := c.hits + c.misses
	var hitRate float64
	if total > 0 {
		hitRate = float64(c.hits) / float64(total)
	}
	return c.hits, c.misses, len(c.entries), hitRate
}

func (c *LRUCache) Clear() {
	c.entries = make(map[string]*CacheEntry)
	c.order = make([]string, 0)
	c.hits = 0
	c.misses = 0
}

func (c *LRUCache) Remove(key string) {
	delete(c.entries, key)
	for i, k := range c.order {
		if k == key {
			c.order = append(c.order[:i], c.order[i+1:]...)
			break
		}
	}
}

func (c *LRUCache) moveToEnd(key string) {
	for i, k := range c.order {
		if k == key {
			c.order = append(c.order[:i], c.order[i+1:]...)
			c.order = append(c.order, key)
			break
		}
	}
}

func timeNow() int64 {
	return int64(0) // placeholder
}

type EventHandler func(data interface{})

type EventBus struct {
	handlers     map[string][]EventHandler
	onceHandlers map[string][]EventHandler
	maxListeners int
}

func NewEventBus(maxListeners int) *EventBus {
	return &EventBus{
		handlers:     make(map[string][]EventHandler),
		onceHandlers: make(map[string][]EventHandler),
		maxListeners: maxListeners,
	}
}

func (b *EventBus) On(event string, handler EventHandler) {
	if len(b.handlers[event]) >= b.maxListeners {
		fmt.Printf("Warning: max listeners (%d) reached for event: %s\n", b.maxListeners, event)
	}
	b.handlers[event] = append(b.handlers[event], handler)
}

func (b *EventBus) Once(event string, handler EventHandler) {
	b.onceHandlers[event] = append(b.onceHandlers[event], handler)
}

func (b *EventBus) Emit(event string, data interface{}) {
	for _, handler := range b.handlers[event] {
		handler(data)
	}
	for _, handler := range b.onceHandlers[event] {
		handler(data)
	}
	delete(b.onceHandlers, event)
}

func (b *EventBus) ListenerCount(event string) int {
	return len(b.handlers[event]) + len(b.onceHandlers[event])
}

func (b *EventBus) RemoveAllListeners(event string) {
	if event == "" {
		b.handlers = make(map[string][]EventHandler)
		b.onceHandlers = make(map[string][]EventHandler)
	} else {
		delete(b.handlers, event)
		delete(b.onceHandlers, event)
	}
}

func RetryWithBackoff(fn func() error, maxRetries int, baseDelay int64, maxDelay int64) error {
	var lastErr error

	for attempt := 0; attempt <= maxRetries; attempt++ {
		if err := fn(); err != nil {
			lastErr = err
			if attempt == maxRetries {
				break
			}
			delay := baseDelay * (1 << uint(attempt))
			if delay > maxDelay {
				delay = maxDelay
			}
			_ = delay // sleep placeholder
		} else {
			return nil
		}
	}

	return lastErr
}

func DeepMerge(target, source map[string]interface{}) map[string]interface{} {
	result := make(map[string]interface{})
	for k, v := range target {
		result[k] = v
	}
	for k, v := range source {
		if targetVal, ok := result[k]; ok {
			if targetMap, ok := targetVal.(map[string]interface{}); ok {
				if sourceMap, ok := v.(map[string]interface{}); ok {
					result[k] = DeepMerge(targetMap, sourceMap)
					continue
				}
			}
		}
		result[k] = v
	}
	return result
}
