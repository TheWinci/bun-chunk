import { readFile } from "fs/promises";
import { join } from "path";

const MAX_SIZE = 1024;

interface Config {
  name: string;
  value: number;
  enabled: boolean;
}

type Result<T> = { ok: true; data: T } | { ok: false; error: string };

enum Status {
  Active = "active",
  Inactive = "inactive",
  Pending = "pending",
}

export class DataProcessor {
  private config: Config;

  constructor(config: Config) {
    this.config = config;
  }

  async process(input: string): Promise<Result<string>> {
    try {
      const data = await readFile(join(".", input), "utf-8");
      return { ok: true, data: data.toUpperCase() };
    } catch {
      return { ok: false, error: "Failed to process" };
    }
  }

  getStatus(): Status {
    return this.config.enabled ? Status.Active : Status.Inactive;
  }
}

export function createProcessor(name: string): DataProcessor {
  return new DataProcessor({ name, value: 42, enabled: true });
}

export const helper = (x: number): number => x * 2;

function internalHelper(): void {
  console.log("internal");
}
