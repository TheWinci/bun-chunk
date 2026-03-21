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
