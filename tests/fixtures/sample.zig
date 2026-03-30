const std = @import("std");
const mem = std.mem;
const Allocator = mem.Allocator;

pub const Config = struct {
    name: []const u8,
    value: i32 = 42,
    enabled: bool = true,

    pub fn init(name: []const u8) Config {
        return .{ .name = name };
    }

    pub fn withValue(self: Config, value: i32) Config {
        var copy = self;
        copy.value = value;
        return copy;
    }
};

pub const Status = enum {
    active,
    inactive,
    pending,

    pub fn isActive(self: Status) bool {
        return self == .active;
    }
};

pub const ProcessError = error{
    FileNotFound,
    ReadError,
    OutOfMemory,
};

pub fn process(allocator: Allocator, path: []const u8) ProcessError![]u8 {
    const file = std.fs.cwd().openFile(path, .{}) catch return error.FileNotFound;
    defer file.close();

    const content = file.readToEndAlloc(allocator, 1024 * 1024) catch return error.ReadError;
    return content;
}

pub fn helper(x: i32) i32 {
    return x * 2;
}

fn privateHelper(x: i32) i32 {
    return x + 1;
}

pub const CacheEntry = struct {
    key: []const u8,
    value: []const u8,
    expires_at: i64,
    tags: []const []const u8,
};

pub const LRUCache = struct {
    entries: std.StringHashMap(CacheEntry),
    order: std.ArrayList([]const u8),
    capacity: usize,
    default_ttl: i64,
    hits: u64 = 0,
    misses: u64 = 0,
    allocator: Allocator,

    pub fn init(allocator: Allocator, capacity: usize, default_ttl: i64) LRUCache {
        return .{
            .entries = std.StringHashMap(CacheEntry).init(allocator),
            .order = std.ArrayList([]const u8).init(allocator),
            .capacity = capacity,
            .default_ttl = default_ttl,
            .allocator = allocator,
        };
    }

    pub fn deinit(self: *LRUCache) void {
        self.entries.deinit();
        self.order.deinit();
    }

    pub fn get(self: *LRUCache, key: []const u8) ?[]const u8 {
        const entry = self.entries.get(key) orelse {
            self.misses += 1;
            return null;
        };

        if (std.time.timestamp() > entry.expires_at) {
            self.remove(key);
            self.misses += 1;
            return null;
        }

        self.hits += 1;
        return entry.value;
    }

    pub fn put(self: *LRUCache, key: []const u8, value: []const u8) !void {
        if (self.entries.contains(key)) {
            self.remove(key);
        } else if (self.order.items.len >= self.capacity) {
            if (self.order.items.len > 0) {
                const oldest = self.order.orderedRemove(0);
                _ = self.entries.remove(oldest);
            }
        }

        try self.entries.put(key, .{
            .key = key,
            .value = value,
            .expires_at = std.time.timestamp() + self.default_ttl,
            .tags = &.{},
        });
        try self.order.append(key);
    }

    pub fn remove(self: *LRUCache, key: []const u8) void {
        _ = self.entries.remove(key);
        for (self.order.items, 0..) |item, i| {
            if (mem.eql(u8, item, key)) {
                _ = self.order.orderedRemove(i);
                break;
            }
        }
    }

    pub fn clear(self: *LRUCache) void {
        self.entries.clearAndFree();
        self.order.clearAndFree();
        self.hits = 0;
        self.misses = 0;
    }
};

test "Config init" {
    const config = Config.init("test");
    try std.testing.expectEqualStrings("test", config.name);
    try std.testing.expectEqual(@as(i32, 42), config.value);
}

test "helper function" {
    try std.testing.expectEqual(@as(i32, 10), helper(5));
}
