local json = require("cjson")
local utils = require("utils")

-- Configuration
local Config = {}
Config.__index = Config

function Config.new(name, value, enabled)
  local self = setmetatable({}, Config)
  self.name = name
  self.value = value or 42
  self.enabled = enabled ~= false
  return self
end

function Config:toString()
  return string.format("Config(%s, %d, %s)", self.name, self.value, tostring(self.enabled))
end

-- Data processor class
local DataProcessor = {}
DataProcessor.__index = DataProcessor

function DataProcessor.new(config)
  local self = setmetatable({}, DataProcessor)
  self.config = config
  return self
end

function DataProcessor:process(input)
  local file = io.open(input, "r")
  if not file then
    return nil
  end

  local content = file:read("*a")
  file:close()
  return string.upper(content)
end

function DataProcessor:getStatus()
  if self.config.enabled then
    return "active"
  else
    return "inactive"
  end
end

-- Helper functions
local function helper(x)
  return x * 2
end

local function createProcessor(name)
  local config = Config.new(name)
  return DataProcessor.new(config)
end

-- LRU Cache
local LRUCache = {}
LRUCache.__index = LRUCache

function LRUCache.new(capacity, defaultTTL)
  local self = setmetatable({}, LRUCache)
  self.capacity = capacity
  self.defaultTTL = defaultTTL or 60
  self.cache = {}
  self.order = {}
  self.hits = 0
  self.misses = 0
  return self
end

function LRUCache:get(key)
  local entry = self.cache[key]
  if not entry then
    self.misses = self.misses + 1
    return nil
  end

  if os.time() > entry.expiresAt then
    self:remove(key)
    self.misses = self.misses + 1
    return nil
  end

  self.hits = self.hits + 1
  self:moveToEnd(key)
  return entry.value
end

function LRUCache:set(key, value, ttl, tags)
  if self.cache[key] then
    self:remove(key)
  elseif #self.order >= self.capacity then
    self:remove(self.order[1])
  end

  self.cache[key] = {
    key = key,
    value = value,
    expiresAt = os.time() + (ttl or self.defaultTTL),
    tags = tags or {},
  }
  table.insert(self.order, key)
end

function LRUCache:remove(key)
  self.cache[key] = nil
  for i, k in ipairs(self.order) do
    if k == key then
      table.remove(self.order, i)
      break
    end
  end
end

function LRUCache:moveToEnd(key)
  self:remove(key)
  table.insert(self.order, key)
  -- Re-add to cache (already there, just updating order)
end

function LRUCache:stats()
  local total = self.hits + self.misses
  return {
    hits = self.hits,
    misses = self.misses,
    size = #self.order,
    hitRate = total == 0 and 0 or self.hits / total,
  }
end

function LRUCache:clear()
  self.cache = {}
  self.order = {}
  self.hits = 0
  self.misses = 0
end

return {
  Config = Config,
  DataProcessor = DataProcessor,
  LRUCache = LRUCache,
  helper = helper,
  createProcessor = createProcessor,
}
