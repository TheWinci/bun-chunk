import { describe, test, expect } from "bun:test";
import { chunk } from "../src";
import { readFile } from "fs/promises";
import { join } from "path";

const FIXTURES = join(import.meta.dir, "fixtures");

async function readFixture(name: string): Promise<string> {
  return readFile(join(FIXTURES, name), "utf-8");
}

describe("chunk", () => {
  describe("TypeScript", () => {
    test("extracts all entities", async () => {
      const code = await readFixture("sample.ts");
      const chunks = await chunk("sample.ts", code);

      const names = chunks.map(c => c.name).filter(Boolean);
      expect(names).toContain("DataProcessor");
      expect(names).toContain("createProcessor");
      expect(names).toContain("helper");
      expect(names).toContain("Config");
      expect(names).toContain("Status");
    });

    test("preserves all source lines", async () => {
      const code = await readFixture("sample.ts");
      const chunks = await chunk("sample.ts", code);

      // Reconstruct from chunks — should cover all non-empty lines
      const lines = code.split("\n");
      const covered = new Set<number>();
      for (const c of chunks) {
        for (let i = c.startLine; i <= c.endLine; i++) {
          covered.add(i);
        }
      }

      // Every non-empty line should be covered
      for (let i = 0; i < lines.length; i++) {
        if (lines[i].trim()) {
          expect(covered.has(i)).toBe(true);
        }
      }
    });

    test("respects maxLines", async () => {
      const code = await readFixture("sample.ts");
      const chunks = await chunk("sample.ts", code, { maxLines: 10 });

      for (const c of chunks) {
        const size = c.endLine - c.startLine + 1;
        expect(size).toBeLessThanOrEqual(10);
      }
    });

    test("chunks do not overlap", async () => {
      const code = await readFixture("sample.ts");
      const chunks = await chunk("sample.ts", code);

      for (let i = 1; i < chunks.length; i++) {
        expect(chunks[i].startLine).toBeGreaterThan(chunks[i - 1].endLine);
      }
    });
  });

  describe("JavaScript", () => {
    test("extracts entities", async () => {
      const code = await readFixture("sample.js");
      const chunks = await chunk("sample.js", code);

      const names = chunks.map(c => c.name).filter(Boolean);
      expect(names).toContain("DataProcessor");
      expect(names).toContain("createProcessor");
      expect(names).toContain("helper");
    });
  });

  describe("Python", () => {
    test("extracts classes and functions", async () => {
      const code = await readFixture("sample.py");
      const chunks = await chunk("sample.py", code);

      const names = chunks.map(c => c.name).filter(Boolean);
      expect(names).toContain("DataProcessor");
      expect(names).toContain("create_processor");
      expect(names).toContain("helper");
    });
  });

  describe("Rust", () => {
    test("extracts structs, enums, traits, impls", async () => {
      const code = await readFixture("sample.rs");
      const chunks = await chunk("sample.rs", code);

      const names = chunks.map(c => c.name).filter(Boolean);
      expect(names).toContain("Config");
      expect(names).toContain("Status");
      expect(names).toContain("Processor");
      expect(names).toContain("create_config");
      expect(names).toContain("helper");
    });
  });

  describe("Go", () => {
    test("extracts types, functions, methods", async () => {
      const code = await readFixture("sample.go");
      const chunks = await chunk("sample.go", code);

      const names = chunks.map(c => c.name).filter(Boolean);
      expect(names).toContain("Config");
      expect(names).toContain("CreateConfig");
      expect(names).toContain("helper");
    });
  });

  describe("Java", () => {
    test("extracts classes, methods, enums", async () => {
      const code = await readFixture("Sample.java");
      const chunks = await chunk("Sample.java", code);

      const names = chunks.map(c => c.name).filter(Boolean);
      expect(names).toContain("Sample");
    });
  });

  describe("unknown language", () => {
    test("falls back to line-based splitting", async () => {
      const code = "line1\nline2\nline3\nline4\nline5";
      const chunks = await chunk("file.xyz", code, { maxLines: 2 });

      expect(chunks.length).toBeGreaterThanOrEqual(2);
      for (const c of chunks) {
        expect(c.type).toBe("block");
      }
    });
  });

  describe("edge cases", () => {
    test("empty file", async () => {
      const chunks = await chunk("empty.ts", "");
      expect(chunks).toEqual([]);
    });

    test("single line", async () => {
      const chunks = await chunk("one.ts", "const x = 1;");
      expect(chunks.length).toBe(1);
    });
  });
});
