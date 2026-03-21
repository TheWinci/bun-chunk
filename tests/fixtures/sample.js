import { readFile } from "fs/promises";
import { join } from "path";

const MAX_SIZE = 1024;

class DataProcessor {
  constructor(config) {
    this.config = config;
  }

  async process(input) {
    const data = await readFile(join(".", input), "utf-8");
    return data.toUpperCase();
  }

  getStatus() {
    return this.config.enabled ? "active" : "inactive";
  }
}

function createProcessor(name) {
  return new DataProcessor({ name, value: 42, enabled: true });
}

const helper = (x) => x * 2;

export { DataProcessor, createProcessor, helper };
