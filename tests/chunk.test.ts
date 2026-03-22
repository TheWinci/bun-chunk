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
      const { chunks } = await chunk("sample.ts", code);

      const names = chunks.map(c => c.name).filter(Boolean);
      expect(names).toContain("DataProcessor");
      expect(names).toContain("createProcessor");
      expect(names).toContain("helper");
      expect(names).toContain("Config");
      expect(names).toContain("Status");
    });

    test("preserves all source lines", async () => {
      const code = await readFixture("sample.ts");
      const { chunks } = await chunk("sample.ts", code);

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
      const { chunks } = await chunk("sample.ts", code, { maxLines: 10 });

      for (const c of chunks) {
        const size = c.endLine - c.startLine + 1;
        expect(size).toBeLessThanOrEqual(10);
      }
    });

    test("chunks do not overlap", async () => {
      const code = await readFixture("sample.ts");
      const { chunks } = await chunk("sample.ts", code);

      for (let i = 1; i < chunks.length; i++) {
        expect(chunks[i].startLine).toBeGreaterThan(chunks[i - 1].endLine);
      }
    });

    test("extracts structured imports", async () => {
      const code = await readFixture("sample.ts");
      const { fileImports } = await chunk("sample.ts", code);

      expect(fileImports.length).toBeGreaterThan(0);

      const sources = fileImports.map(i => i.source);
      expect(sources).toContain("fs/promises");
      expect(sources).toContain("path");

      const names = fileImports.map(i => i.name);
      expect(names).toContain("readFile");
      expect(names).toContain("join");
    });

    test("extracts structured exports", async () => {
      const code = await readFixture("sample.ts");
      const { fileExports } = await chunk("sample.ts", code);

      expect(fileExports.length).toBeGreaterThan(0);

      const names = fileExports.map(e => e.name);
      expect(names).toContain("DataProcessor");
      expect(names).toContain("createProcessor");
      expect(names).toContain("helper");
    });
  });

  describe("JavaScript", () => {
    test("extracts entities", async () => {
      const code = await readFixture("sample.js");
      const { chunks } = await chunk("sample.js", code);

      const names = chunks.map(c => c.name).filter(Boolean);
      expect(names).toContain("DataProcessor");
      expect(names).toContain("createProcessor");
      expect(names).toContain("helper");
    });

    test("extracts structured imports", async () => {
      const code = await readFixture("sample.js");
      const { fileImports } = await chunk("sample.js", code);

      expect(fileImports.length).toBeGreaterThan(0);
      const names = fileImports.map(i => i.name);
      expect(names).toContain("readFile");
      expect(names).toContain("join");
    });

    test("extracts structured exports", async () => {
      const code = await readFixture("sample.js");
      const { fileExports } = await chunk("sample.js", code);

      expect(fileExports.length).toBeGreaterThan(0);
      const names = fileExports.map(e => e.name);
      expect(names).toContain("DataProcessor");
      expect(names).toContain("createProcessor");
      expect(names).toContain("helper");
    });
  });

  describe("Python", () => {
    test("extracts classes and functions", async () => {
      const code = await readFixture("sample.py");
      const { chunks } = await chunk("sample.py", code);

      const names = chunks.map(c => c.name).filter(Boolean);
      expect(names).toContain("DataProcessor");
      expect(names).toContain("create_processor");
      expect(names).toContain("helper");
    });

    test("extracts structured imports", async () => {
      const code = await readFixture("sample.py");
      const { fileImports } = await chunk("sample.py", code);

      expect(fileImports.length).toBeGreaterThan(0);
      const sources = fileImports.map(i => i.source);
      expect(sources).toContain("os");
      expect(sources).toContain("pathlib");
    });

    test("exports public symbols", async () => {
      const code = await readFixture("sample.py");
      const { fileExports } = await chunk("sample.py", code);

      const names = fileExports.map(e => e.name);
      expect(names).toContain("DataProcessor");
      expect(names).toContain("create_processor");
      expect(names).toContain("helper");
    });
  });

  describe("Rust", () => {
    test("extracts structs, enums, traits, impls", async () => {
      const code = await readFixture("sample.rs");
      const { chunks } = await chunk("sample.rs", code);

      const names = chunks.map(c => c.name).filter(Boolean);
      expect(names).toContain("Config");
      expect(names).toContain("Status");
      expect(names).toContain("Processor");
      expect(names).toContain("create_config");
      expect(names).toContain("helper");
    });

    test("extracts structured imports", async () => {
      const code = await readFixture("sample.rs");
      const { fileImports } = await chunk("sample.rs", code);

      expect(fileImports.length).toBeGreaterThan(0);
      const names = fileImports.map(i => i.name);
      expect(names).toContain("fs");
      expect(names).toContain("Path");
    });

    test("exports pub symbols", async () => {
      const code = await readFixture("sample.rs");
      const { fileExports } = await chunk("sample.rs", code);

      const names = fileExports.map(e => e.name);
      expect(names).toContain("Config");
      expect(names).toContain("Status");
      expect(names).toContain("Processor");
      expect(names).toContain("create_config");
    });
  });

  describe("Go", () => {
    test("extracts types, functions, methods", async () => {
      const code = await readFixture("sample.go");
      const { chunks } = await chunk("sample.go", code);

      const names = chunks.map(c => c.name).filter(Boolean);
      expect(names).toContain("Config");
      expect(names).toContain("CreateConfig");
      expect(names).toContain("helper");
    });

    test("extracts structured imports", async () => {
      const code = await readFixture("sample.go");
      const { fileImports } = await chunk("sample.go", code);

      expect(fileImports.length).toBeGreaterThan(0);
      const names = fileImports.map(i => i.name);
      expect(names).toContain("fmt");
      expect(names).toContain("os");
      expect(names).toContain("strings");
    });

    test("exports capitalized symbols", async () => {
      const code = await readFixture("sample.go");
      const { fileExports } = await chunk("sample.go", code);

      const names = fileExports.map(e => e.name);
      expect(names).toContain("Config");
      expect(names).toContain("CreateConfig");
      // lowercase helper should NOT be exported
      expect(names).not.toContain("helper");
    });
  });

  describe("Java", () => {
    test("extracts classes, methods, enums", async () => {
      const code = await readFixture("Sample.java");
      const { chunks } = await chunk("Sample.java", code);

      const names = chunks.map(c => c.name).filter(Boolean);
      expect(names).toContain("Sample");
    });

    test("extracts structured imports", async () => {
      const code = await readFixture("Sample.java");
      const { fileImports } = await chunk("Sample.java", code);

      expect(fileImports.length).toBeGreaterThan(0);
      const names = fileImports.map(i => i.name);
      expect(names).toContain("IOException");
      expect(names).toContain("Files");
      expect(names).toContain("Path");
    });
  });

  describe("unknown language", () => {
    test("falls back to line-based splitting", async () => {
      const code = "line1\nline2\nline3\nline4\nline5";
      const { chunks } = await chunk("file.xyz", code, { maxLines: 2 });

      expect(chunks.length).toBeGreaterThanOrEqual(2);
      for (const c of chunks) {
        expect(c.type).toBe("block");
      }
    });
  });

  describe("edge cases", () => {
    test("empty file", async () => {
      const { chunks } = await chunk("empty.ts", "");
      expect(chunks).toEqual([]);
    });

    test("single line", async () => {
      const { chunks } = await chunk("one.ts", "const x = 1;");
      expect(chunks.length).toBe(1);
    });

    test("handles BOM marker", async () => {
      const { chunks } = await chunk("bom.ts", "\uFEFFconst x = 1;");
      expect(chunks.length).toBe(1);
      expect(chunks[0].text).not.toContain("\uFEFF");
    });

    test("handles \\r\\n line endings", async () => {
      const { chunks } = await chunk("crlf.ts", "const x = 1;\r\nconst y = 2;\r\n");
      expect(chunks.length).toBeGreaterThanOrEqual(1);
      // No \r should remain
      for (const c of chunks) {
        expect(c.text).not.toContain("\r");
      }
    });

    test("handles \\r line endings", async () => {
      const { chunks } = await chunk("cr.ts", "const x = 1;\rconst y = 2;\r");
      expect(chunks.length).toBeGreaterThanOrEqual(1);
      for (const c of chunks) {
        expect(c.text).not.toContain("\r");
      }
    });

    test("file with only comments", async () => {
      const code = "// This is a comment\n// Another comment\n";
      const { chunks } = await chunk("comments.ts", code);
      // Should produce at least one chunk covering the comments
      expect(chunks.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe("comment attachment", () => {
    test("attaches leading JSDoc to function", async () => {
      const code = `/** Process data */\nfunction process() {\n  return 42;\n}`;
      const { chunks } = await chunk("doc.ts", code);

      const processChunk = chunks.find(c => c.name === "process");
      expect(processChunk).toBeDefined();
      expect(processChunk!.text).toContain("/** Process data */");
      expect(processChunk!.startLine).toBe(0);
    });

    test("attaches decorator to class in Python", async () => {
      const code = `@dataclass\nclass Config:\n    name: str\n    value: int\n`;
      const { chunks } = await chunk("deco.py", code);

      const configChunk = chunks.find(c => c.name === "Config");
      expect(configChunk).toBeDefined();
      expect(configChunk!.text).toContain("@dataclass");
    });

    test("blank line breaks comment attachment", async () => {
      const code = `// Unrelated comment\n\n/** Doc for process */\nfunction process() {\n  return 42;\n}`;
      const { chunks } = await chunk("gap.ts", code);

      const processChunk = chunks.find(c => c.name === "process");
      expect(processChunk).toBeDefined();
      expect(processChunk!.text).toContain("/** Doc for process */");
      expect(processChunk!.text).not.toContain("Unrelated comment");
    });
  });
});
