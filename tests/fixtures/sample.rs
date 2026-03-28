use std::fs;
use std::path::Path;

const MAX_SIZE: usize = 1024;

#[derive(Debug, Clone)]
pub struct Config {
    pub name: String,
    pub value: u32,
    pub enabled: bool,
}

pub enum Status {
    Active,
    Inactive,
    Pending,
}

pub trait Processor {
    fn process(&self, input: &str) -> Result<String, String>;
    fn status(&self) -> Status;
}

impl Processor for Config {
    fn process(&self, input: &str) -> Result<String, String> {
        match fs::read_to_string(Path::new(input)) {
            Ok(data) => Ok(data.to_uppercase()),
            Err(_) => Err("Failed to process".to_string()),
        }
    }

    fn status(&self) -> Status {
        if self.enabled {
            Status::Active
        } else {
            Status::Inactive
        }
    }
}

pub fn create_config(name: &str) -> Config {
    Config {
        name: name.to_string(),
        value: 42,
        enabled: true,
    }
}

fn helper(x: u32) -> u32 {
    x * 2
}

use std::collections::HashMap;
use std::time::{Duration, Instant};

pub struct CacheEntry<T> {
    pub value: T,
    pub expires_at: Instant,
    pub tags: Vec<String>,
}

pub struct LRUCache<T: Clone> {
    entries: HashMap<String, CacheEntry<T>>,
    order: Vec<String>,
    capacity: usize,
    default_ttl: Duration,
    hits: u64,
    misses: u64,
}

impl<T: Clone> LRUCache<T> {
    pub fn new(capacity: usize, default_ttl: Duration) -> Self {
        Self {
            entries: HashMap::new(),
            order: Vec::new(),
            capacity,
            default_ttl,
            hits: 0,
            misses: 0,
        }
    }

    pub fn get(&mut self, key: &str) -> Option<T> {
        if let Some(entry) = self.entries.get(key) {
            if Instant::now() > entry.expires_at {
                self.remove(key);
                self.misses += 1;
                return None;
            }
            self.hits += 1;
            let key_string = key.to_string();
            self.order.retain(|k| k != &key_string);
            self.order.push(key_string);
            Some(entry.value.clone())
        } else {
            self.misses += 1;
            None
        }
    }

    pub fn set(&mut self, key: &str, value: T, ttl: Option<Duration>, tags: Vec<String>) {
        let key_string = key.to_string();

        if self.entries.contains_key(key) {
            self.remove(key);
        } else if self.entries.len() >= self.capacity {
            if let Some(oldest) = self.order.first().cloned() {
                self.remove(&oldest);
            }
        }

        let expires_at = Instant::now() + ttl.unwrap_or(self.default_ttl);
        self.entries.insert(
            key_string.clone(),
            CacheEntry {
                value,
                expires_at,
                tags,
            },
        );
        self.order.push(key_string);
    }

    pub fn invalidate_by_tag(&mut self, tag: &str) -> usize {
        let keys_to_remove: Vec<String> = self
            .entries
            .iter()
            .filter(|(_, entry)| entry.tags.iter().any(|t| t == tag))
            .map(|(key, _)| key.clone())
            .collect();

        let count = keys_to_remove.len();
        for key in keys_to_remove {
            self.remove(&key);
        }
        count
    }

    pub fn stats(&self) -> (u64, u64, usize, f64) {
        let total = self.hits + self.misses;
        let hit_rate = if total == 0 {
            0.0
        } else {
            self.hits as f64 / total as f64
        };
        (self.hits, self.misses, self.entries.len(), hit_rate)
    }

    pub fn clear(&mut self) {
        self.entries.clear();
        self.order.clear();
        self.hits = 0;
        self.misses = 0;
    }

    fn remove(&mut self, key: &str) {
        self.entries.remove(key);
        self.order.retain(|k| k != key);
    }
}

pub struct EventBus {
    handlers: HashMap<String, Vec<Box<dyn Fn(&str)>>>,
    max_listeners: usize,
}

impl EventBus {
    pub fn new(max_listeners: usize) -> Self {
        Self {
            handlers: HashMap::new(),
            max_listeners,
        }
    }

    pub fn on(&mut self, event: &str, handler: Box<dyn Fn(&str)>) {
        let handlers = self.handlers.entry(event.to_string()).or_insert_with(Vec::new);
        if handlers.len() >= self.max_listeners {
            eprintln!(
                "Warning: max listeners ({}) reached for event: {}",
                self.max_listeners, event
            );
        }
        handlers.push(handler);
    }

    pub fn emit(&self, event: &str, data: &str) {
        if let Some(handlers) = self.handlers.get(event) {
            for handler in handlers {
                handler(data);
            }
        }
    }

    pub fn listener_count(&self, event: &str) -> usize {
        self.handlers.get(event).map_or(0, |h| h.len())
    }

    pub fn remove_all(&mut self, event: Option<&str>) {
        match event {
            Some(e) => {
                self.handlers.remove(e);
            }
            None => {
                self.handlers.clear();
            }
        }
    }
}

pub fn retry_with_backoff<T, F>(
    f: F,
    max_retries: u32,
    base_delay: Duration,
    max_delay: Duration,
) -> Result<T, String>
where
    F: Fn() -> Result<T, String>,
{
    let mut last_error = String::new();

    for attempt in 0..=max_retries {
        match f() {
            Ok(value) => return Ok(value),
            Err(e) => {
                last_error = e;
                if attempt == max_retries {
                    break;
                }
                let delay = base_delay
                    .mul_f64(2.0_f64.powi(attempt as i32))
                    .min(max_delay);
                std::thread::sleep(delay);
            }
        }
    }

    Err(last_error)
}

pub fn deep_merge(
    target: &HashMap<String, serde_json::Value>,
    source: &HashMap<String, serde_json::Value>,
) -> HashMap<String, serde_json::Value> {
    let mut result = target.clone();

    for (key, source_val) in source {
        if let Some(target_val) = result.get(key) {
            if let (Some(target_obj), Some(source_obj)) =
                (target_val.as_object(), source_val.as_object())
            {
                let merged_target: HashMap<String, serde_json::Value> =
                    target_obj.iter().map(|(k, v)| (k.clone(), v.clone())).collect();
                let merged_source: HashMap<String, serde_json::Value> =
                    source_obj.iter().map(|(k, v)| (k.clone(), v.clone())).collect();
                let merged = deep_merge(&merged_target, &merged_source);
                result.insert(
                    key.clone(),
                    serde_json::Value::Object(merged.into_iter().collect()),
                );
                continue;
            }
        }
        result.insert(key.clone(), source_val.clone());
    }

    result
}
