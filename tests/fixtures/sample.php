<?php

namespace App\Processing;

use App\Utils\Helper;
use App\Config\Settings;

interface ProcessorInterface
{
    public function process(string $input): ?string;
    public function getStatus(): string;
}

enum Status: string
{
    case Active = 'active';
    case Inactive = 'inactive';
    case Pending = 'pending';
}

class Config
{
    public function __construct(
        public readonly string $name,
        public readonly int $value = 42,
        public readonly bool $enabled = true,
    ) {}
}

class DataProcessor implements ProcessorInterface
{
    private Config $config;

    public function __construct(Config $config)
    {
        $this->config = $config;
    }

    public function process(string $input): ?string
    {
        $content = file_get_contents($input);
        return $content !== false ? strtoupper($content) : null;
    }

    public function getStatus(): string
    {
        return $this->config->enabled ? Status::Active->value : Status::Inactive->value;
    }
}

function createProcessor(string $name): DataProcessor
{
    $config = new Config(name: $name);
    return new DataProcessor($config);
}
