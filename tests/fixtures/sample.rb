require 'json'
require_relative 'utils'

class DataProcessor
  attr_reader :name, :enabled

  def initialize(name, enabled: true)
    @name = name
    @enabled = enabled
  end

  def process(input)
    File.read(input).upcase
  rescue Errno::ENOENT
    nil
  end

  def self.create(name)
    new(name)
  end
end

module Helpers
  def self.helper(x)
    x * 2
  end
end

class EventBus
  attr_reader :max_listeners

  def initialize(max_listeners: 10)
    @handlers = Hash.new { |h, k| h[k] = [] }
    @once_handlers = Hash.new { |h, k| h[k] = [] }
    @max_listeners = max_listeners
  end

  def on(event, &handler)
    if @handlers[event].length >= @max_listeners
      warn "Max listeners (#{@max_listeners}) reached for event: #{event}"
    end
    @handlers[event] << handler

    -> { off(event, handler) }
  end

  def once(event, &handler)
    @once_handlers[event] << handler
  end

  def off(event, handler)
    @handlers[event].delete(handler)
  end

  def emit(event, data = nil)
    @handlers[event].each { |h| h.call(data) }
    @once_handlers.delete(event)&.each { |h| h.call(data) }
  end

  def listener_count(event)
    @handlers[event].length + @once_handlers[event].length
  end

  def remove_all_listeners(event = nil)
    if event
      @handlers.delete(event)
      @once_handlers.delete(event)
    else
      @handlers.clear
      @once_handlers.clear
    end
  end
end

class LRUCache
  def initialize(capacity, default_ttl: 60)
    @capacity = capacity
    @default_ttl = default_ttl
    @cache = {}
    @order = []
    @hits = 0
    @misses = 0
  end

  def get(key)
    unless @cache.key?(key)
      @misses += 1
      return nil
    end

    entry = @cache[key]
    if Time.now.to_f > entry[:expires_at]
      remove(key)
      @misses += 1
      return nil
    end

    @hits += 1
    @order.delete(key)
    @order.push(key)
    entry[:value]
  end

  def set(key, value, ttl: nil, tags: [])
    if @cache.key?(key)
      remove(key)
    elsif @cache.size >= @capacity
      remove(@order.first)
    end

    @cache[key] = {
      value: value,
      expires_at: Time.now.to_f + (ttl || @default_ttl),
      tags: tags
    }
    @order.push(key)
  end

  def invalidate_by_tag(tag)
    keys_to_remove = @cache.select { |_, entry| entry[:tags].include?(tag) }.keys
    keys_to_remove.each { |key| remove(key) }
    keys_to_remove.length
  end

  def stats
    total = @hits + @misses
    {
      hits: @hits,
      misses: @misses,
      size: @cache.size,
      hit_rate: total.zero? ? 0.0 : @hits.to_f / total
    }
  end

  def clear
    @cache.clear
    @order.clear
    @hits = 0
    @misses = 0
  end

  private

  def remove(key)
    @cache.delete(key)
    @order.delete(key)
  end
end

def self.retry_with_backoff(max_retries: 3, base_delay: 1.0, max_delay: 30.0)
  last_error = nil

  (0..max_retries).each do |attempt|
    begin
      return yield
    rescue StandardError => e
      last_error = e
      break if attempt == max_retries

      delay = [base_delay * (2**attempt), max_delay].min
      jitter = delay * (0.5 + rand * 0.5)
      sleep(jitter)
    end
  end

  raise last_error
end

def self.deep_merge(target, *sources)
  result = target.dup

  sources.each do |source|
    source.each do |key, value|
      if result[key].is_a?(Hash) && value.is_a?(Hash)
        result[key] = deep_merge(result[key], value)
      else
        result[key] = value
      end
    end
  end

  result
end
