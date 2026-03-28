#include <stdio.h>
#include <stdlib.h>
#include "utils.h"

#define MAX_SIZE 1024
#define SQUARE(x) ((x) * (x))

typedef struct {
    char *name;
    int value;
    int enabled;
} Config;

enum Status {
    ACTIVE,
    INACTIVE,
    PENDING
};

Config *create_config(const char *name) {
    Config *config = malloc(sizeof(Config));
    config->name = strdup(name);
    config->value = 42;
    config->enabled = 1;
    return config;
}

void process(Config *config, const char *input) {
    FILE *file = fopen(input, "r");
    if (file) {
        char buffer[MAX_SIZE];
        while (fgets(buffer, MAX_SIZE, file)) {
            printf("%s", buffer);
        }
        fclose(file);
    }
}

static int helper(int x) {
    return x * 2;
}

#define CACHE_CAPACITY 256
#define DEFAULT_TTL 60

typedef struct CacheEntry {
    char *key;
    void *value;
    size_t value_size;
    time_t expires_at;
    char **tags;
    int tag_count;
    struct CacheEntry *next;
    struct CacheEntry *prev;
} CacheEntry;

typedef struct {
    CacheEntry **buckets;
    int bucket_count;
    CacheEntry *head;
    CacheEntry *tail;
    int size;
    int capacity;
    int default_ttl;
    long hits;
    long misses;
} LRUCache;

LRUCache *cache_create(int capacity, int default_ttl) {
    LRUCache *cache = malloc(sizeof(LRUCache));
    cache->bucket_count = capacity * 2;
    cache->buckets = calloc(cache->bucket_count, sizeof(CacheEntry *));
    cache->head = NULL;
    cache->tail = NULL;
    cache->size = 0;
    cache->capacity = capacity;
    cache->default_ttl = default_ttl;
    cache->hits = 0;
    cache->misses = 0;
    return cache;
}

static unsigned int hash_key(const char *key, int bucket_count) {
    unsigned int hash = 5381;
    int c;
    while ((c = *key++)) {
        hash = ((hash << 5) + hash) + c;
    }
    return hash % bucket_count;
}

static void move_to_front(LRUCache *cache, CacheEntry *entry) {
    if (entry == cache->head) return;

    if (entry->prev) entry->prev->next = entry->next;
    if (entry->next) entry->next->prev = entry->prev;
    if (entry == cache->tail) cache->tail = entry->prev;

    entry->prev = NULL;
    entry->next = cache->head;
    if (cache->head) cache->head->prev = entry;
    cache->head = entry;
}

static void evict_oldest(LRUCache *cache) {
    if (!cache->tail) return;

    CacheEntry *victim = cache->tail;
    if (victim->prev) {
        victim->prev->next = NULL;
        cache->tail = victim->prev;
    } else {
        cache->head = NULL;
        cache->tail = NULL;
    }

    unsigned int bucket = hash_key(victim->key, cache->bucket_count);
    CacheEntry **ptr = &cache->buckets[bucket];
    while (*ptr && *ptr != victim) {
        ptr = &(*ptr)->next;
    }
    if (*ptr) *ptr = victim->next;

    free(victim->key);
    free(victim->value);
    for (int i = 0; i < victim->tag_count; i++) {
        free(victim->tags[i]);
    }
    free(victim->tags);
    free(victim);
    cache->size--;
}

void *cache_get(LRUCache *cache, const char *key) {
    unsigned int bucket = hash_key(key, cache->bucket_count);
    CacheEntry *entry = cache->buckets[bucket];

    while (entry) {
        if (strcmp(entry->key, key) == 0) {
            if (time(NULL) > entry->expires_at) {
                cache->misses++;
                return NULL;
            }
            cache->hits++;
            move_to_front(cache, entry);
            return entry->value;
        }
        entry = entry->next;
    }

    cache->misses++;
    return NULL;
}

void cache_set(LRUCache *cache, const char *key, void *value, size_t value_size, int ttl) {
    if (cache->size >= cache->capacity) {
        evict_oldest(cache);
    }

    CacheEntry *entry = malloc(sizeof(CacheEntry));
    entry->key = strdup(key);
    entry->value = malloc(value_size);
    memcpy(entry->value, value, value_size);
    entry->value_size = value_size;
    entry->expires_at = time(NULL) + (ttl > 0 ? ttl : cache->default_ttl);
    entry->tags = NULL;
    entry->tag_count = 0;
    entry->prev = NULL;
    entry->next = cache->head;

    if (cache->head) cache->head->prev = entry;
    cache->head = entry;
    if (!cache->tail) cache->tail = entry;

    unsigned int bucket = hash_key(key, cache->bucket_count);
    entry->next = cache->buckets[bucket];
    cache->buckets[bucket] = entry;
    cache->size++;
}

int cache_invalidate_by_tag(LRUCache *cache, const char *tag) {
    int count = 0;
    CacheEntry *entry = cache->head;
    while (entry) {
        CacheEntry *next = entry->next;
        for (int i = 0; i < entry->tag_count; i++) {
            if (strcmp(entry->tags[i], tag) == 0) {
                evict_oldest(cache);
                count++;
                break;
            }
        }
        entry = next;
    }
    return count;
}

void cache_stats(LRUCache *cache, long *hits, long *misses, int *size, double *hit_rate) {
    *hits = cache->hits;
    *misses = cache->misses;
    *size = cache->size;
    long total = cache->hits + cache->misses;
    *hit_rate = total > 0 ? (double)cache->hits / total : 0.0;
}

void cache_destroy(LRUCache *cache) {
    CacheEntry *entry = cache->head;
    while (entry) {
        CacheEntry *next = entry->next;
        free(entry->key);
        free(entry->value);
        for (int i = 0; i < entry->tag_count; i++) {
            free(entry->tags[i]);
        }
        free(entry->tags);
        free(entry);
        entry = next;
    }
    free(cache->buckets);
    free(cache);
}
