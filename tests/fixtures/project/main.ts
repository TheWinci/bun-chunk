import { formatDate, parseNumber } from "./utils";
import type { Config, Status } from "./types";

export function createConfig(name: string, value: string): Config {
  return {
    name,
    value: parseNumber(value),
  };
}

export function getStatus(): Status {
  return "active";
}

export function formatNow(): string {
  return formatDate(new Date());
}
