#include <iostream>
#include <string>
#include <vector>

#define MAX_SIZE 1024

namespace processing {

class Config {
public:
    std::string name;
    int value;
    bool enabled;

    Config(const std::string& name, int value)
        : name(name), value(value), enabled(true) {}
};

enum class Status {
    Active,
    Inactive,
    Pending
};

class DataProcessor {
public:
    DataProcessor(const Config& config) : config_(config) {}

    std::string process(const std::string& input) {
        return input;
    }

    Status getStatus() const {
        return config_.enabled ? Status::Active : Status::Inactive;
    }

private:
    Config config_;
};

DataProcessor createProcessor(const std::string& name) {
    Config config(name, 42);
    return DataProcessor(config);
}

} // namespace processing

int helper(int x) {
    return x * 2;
}

#include <unordered_map>
#include <list>
#include <chrono>
#include <functional>
#include <optional>

namespace caching {

template <typename T>
struct CacheEntry {
    std::string key;
    T value;
    std::chrono::steady_clock::time_point expires_at;
    std::vector<std::string> tags;
};

template <typename T>
class LRUCache {
public:
    LRUCache(size_t capacity, std::chrono::milliseconds default_ttl = std::chrono::milliseconds(60000))
        : capacity_(capacity), default_ttl_(default_ttl), hits_(0), misses_(0) {}

    std::optional<T> get(const std::string& key) {
        auto it = lookup_.find(key);
        if (it == lookup_.end()) {
            misses_++;
            return std::nullopt;
        }

        auto& entry = *it->second;
        if (std::chrono::steady_clock::now() > entry.expires_at) {
            remove(key);
            misses_++;
            return std::nullopt;
        }

        hits_++;
        order_.splice(order_.begin(), order_, it->second);
        return entry.value;
    }

    void set(const std::string& key, const T& value,
             std::optional<std::chrono::milliseconds> ttl = std::nullopt,
             const std::vector<std::string>& tags = {}) {
        auto it = lookup_.find(key);
        if (it != lookup_.end()) {
            order_.erase(it->second);
            lookup_.erase(it);
        } else if (lookup_.size() >= capacity_) {
            auto& oldest = order_.back();
            lookup_.erase(oldest.key);
            order_.pop_back();
        }

        auto expires_at = std::chrono::steady_clock::now() + ttl.value_or(default_ttl_);
        order_.push_front({key, value, expires_at, tags});
        lookup_[key] = order_.begin();
    }

    size_t invalidate_by_tag(const std::string& tag) {
        size_t count = 0;
        for (auto it = order_.begin(); it != order_.end();) {
            bool has_tag = false;
            for (const auto& t : it->tags) {
                if (t == tag) {
                    has_tag = true;
                    break;
                }
            }
            if (has_tag) {
                lookup_.erase(it->key);
                it = order_.erase(it);
                count++;
            } else {
                ++it;
            }
        }
        return count;
    }

    struct Stats {
        uint64_t hits;
        uint64_t misses;
        size_t size;
        double hit_rate;
    };

    Stats stats() const {
        uint64_t total = hits_ + misses_;
        double hit_rate = total == 0 ? 0.0 : static_cast<double>(hits_) / total;
        return {hits_, misses_, lookup_.size(), hit_rate};
    }

    void clear() {
        order_.clear();
        lookup_.clear();
        hits_ = 0;
        misses_ = 0;
    }

private:
    void remove(const std::string& key) {
        auto it = lookup_.find(key);
        if (it != lookup_.end()) {
            order_.erase(it->second);
            lookup_.erase(it);
        }
    }

    size_t capacity_;
    std::chrono::milliseconds default_ttl_;
    std::list<CacheEntry<T>> order_;
    std::unordered_map<std::string, typename std::list<CacheEntry<T>>::iterator> lookup_;
    uint64_t hits_;
    uint64_t misses_;
};

} // namespace caching

namespace events {

using EventHandler = std::function<void(const std::string&)>;

class EventBus {
public:
    explicit EventBus(size_t max_listeners = 10) : max_listeners_(max_listeners) {}

    void on(const std::string& event, EventHandler handler) {
        auto& handlers = handlers_[event];
        if (handlers.size() >= max_listeners_) {
            std::cerr << "Warning: max listeners (" << max_listeners_
                      << ") reached for event: " << event << std::endl;
        }
        handlers.push_back(std::move(handler));
    }

    void emit(const std::string& event, const std::string& data) {
        auto it = handlers_.find(event);
        if (it != handlers_.end()) {
            for (auto& handler : it->second) {
                handler(data);
            }
        }

        auto once_it = once_handlers_.find(event);
        if (once_it != once_handlers_.end()) {
            for (auto& handler : once_it->second) {
                handler(data);
            }
            once_handlers_.erase(once_it);
        }
    }

    size_t listener_count(const std::string& event) const {
        size_t count = 0;
        auto it = handlers_.find(event);
        if (it != handlers_.end()) count += it->second.size();
        auto once_it = once_handlers_.find(event);
        if (once_it != once_handlers_.end()) count += once_it->second.size();
        return count;
    }

    void remove_all(const std::string& event = "") {
        if (event.empty()) {
            handlers_.clear();
            once_handlers_.clear();
        } else {
            handlers_.erase(event);
            once_handlers_.erase(event);
        }
    }

private:
    size_t max_listeners_;
    std::unordered_map<std::string, std::vector<EventHandler>> handlers_;
    std::unordered_map<std::string, std::vector<EventHandler>> once_handlers_;
};

} // namespace events
