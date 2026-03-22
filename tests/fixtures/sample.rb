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
