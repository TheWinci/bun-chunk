import { describe, test, expect } from "bun:test";
import { chunk } from "../src";

describe("Phase 3: Smarter Chunking", () => {
  describe("import collapsing", () => {
    test("collapses consecutive imports into one chunk", async () => {
      const code = `import { readFile } from "fs/promises";
import { join } from "path";
import { parse } from "url";

function main() {
  return 42;
}`;
      const { chunks } = await chunk("imports.ts", code);

      // All three imports should be in one chunk
      const importChunks = chunks.filter(c => c.type === "import");
      expect(importChunks.length).toBe(1);
      expect(importChunks[0].text).toContain("readFile");
      expect(importChunks[0].text).toContain("join");
      expect(importChunks[0].text).toContain("parse");
      expect(importChunks[0].imports?.length).toBe(3);
    });

    test("blank line separates import groups", async () => {
      const code = `import { readFile } from "fs/promises";
import { join } from "path";

import { parse } from "url";

function main() {
  return 42;
}`;
      const { chunks } = await chunk("imports.ts", code);

      const importChunks = chunks.filter(c => c.type === "import");
      expect(importChunks.length).toBe(2);
    });
  });

  describe("metadata enrichment", () => {
    test("adds language, filePath, hash when includeMetadata is true", async () => {
      const code = `function hello() {\n  return "world";\n}`;
      const { chunks } = await chunk("meta.ts", code, { includeMetadata: true });

      expect(chunks.length).toBeGreaterThan(0);
      for (const c of chunks) {
        expect(c.language).toBe("typescript");
        expect(c.filePath).toBe("meta.ts");
        expect(c.hash).toBeDefined();
        expect(c.hash!.length).toBe(16);
      }
    });

    test("does not add metadata by default", async () => {
      const code = `function hello() {\n  return "world";\n}`;
      const { chunks } = await chunk("meta.ts", code);

      for (const c of chunks) {
        expect(c.language).toBeUndefined();
        expect(c.filePath).toBeUndefined();
        expect(c.hash).toBeUndefined();
      }
    });

    test("same content produces same hash", async () => {
      const code = `function hello() {\n  return "world";\n}`;
      const r1 = await chunk("a.ts", code, { includeMetadata: true });
      const r2 = await chunk("b.ts", code, { includeMetadata: true });

      expect(r1.chunks[0].hash).toBe(r2.chunks[0].hash);
    });
  });

  describe("context injection", () => {
    test("adds parent context when includeContext is true", async () => {
      // Create a class large enough to be split into child chunks
      const methods = Array.from({ length: 10 }, (_, i) =>
        `  method${i}() {\n    return ${i};\n  }`
      ).join("\n\n");
      const code = `class BigClass {\n${methods}\n}`;

      const { chunks } = await chunk("ctx.ts", code, {
        maxLines: 8,
        includeContext: true,
      });

      const methodChunks = chunks.filter(c => c.type === "method");
      for (const c of methodChunks) {
        expect(c.parentName).toBe("BigClass");
        expect(c.context).toBeDefined();
        expect(c.context).toContain("BigClass");
      }
    });

    test("does not add context by default", async () => {
      const methods = Array.from({ length: 10 }, (_, i) =>
        `  method${i}() {\n    return ${i};\n  }`
      ).join("\n\n");
      const code = `class BigClass {\n${methods}\n}`;

      const { chunks } = await chunk("ctx.ts", code, { maxLines: 8 });

      for (const c of chunks) {
        expect(c.parentName).toBeUndefined();
        expect(c.context).toBeUndefined();
      }
    });
  });

  describe("overlap", () => {
    test("fixed strategy with overlap produces overlapping chunks", async () => {
      const lines = Array.from({ length: 20 }, (_, i) => `line ${i + 1}`).join("\n");
      const { chunks } = await chunk("overlap.txt", lines, {
        strategy: "fixed",
        maxLines: 10,
        overlap: 3,
      });

      expect(chunks.length).toBeGreaterThan(1);
      // Second chunk should start before first chunk ends + 1
      if (chunks.length >= 2) {
        expect(chunks[1].startLine).toBeLessThan(chunks[0].endLine + 1);
      }
    });

    test("overlap of 0 produces non-overlapping chunks", async () => {
      const lines = Array.from({ length: 20 }, (_, i) => `line ${i + 1}`).join("\n");
      const { chunks } = await chunk("no-overlap.txt", lines, {
        strategy: "fixed",
        maxLines: 10,
        overlap: 0,
      });

      for (let i = 1; i < chunks.length; i++) {
        expect(chunks[i].startLine).toBeGreaterThan(chunks[i - 1].endLine);
      }
    });
  });

  describe("strategy selection", () => {
    test("fixed strategy uses line-based splitting only", async () => {
      const code = `function hello() {\n  return "world";\n}\n\nfunction bye() {\n  return "bye";\n}`;
      const { chunks } = await chunk("fixed.ts", code, { strategy: "fixed" });

      // All chunks should be "block" type since no AST is used
      for (const c of chunks) {
        expect(c.type).toBe("block");
      }
    });

    test("fixed strategy returns no imports/exports", async () => {
      const code = `import { readFile } from "fs";\n\nfunction hello() {\n  return "world";\n}`;
      const { chunks, fileImports, fileExports } = await chunk("fixed.ts", code, {
        strategy: "fixed",
      });

      expect(fileImports).toEqual([]);
      expect(fileExports).toEqual([]);
    });

    test("semantic strategy uses AST parsing", async () => {
      const code = `function hello() {\n  return "world";\n}\n\nfunction bye() {\n  return "bye";\n}`;
      const { chunks } = await chunk("semantic.ts", code, { strategy: "semantic" });

      const funcChunks = chunks.filter(c => c.type === "function");
      expect(funcChunks.length).toBe(2);
    });

    test("hybrid strategy falls back to fixed for unknown languages", async () => {
      const code = "line1\nline2\nline3";
      const { chunks } = await chunk("file.xyz", code, { strategy: "hybrid" });

      for (const c of chunks) {
        expect(c.type).toBe("block");
      }
    });

    test("hybrid strategy uses AST for known languages", async () => {
      const code = `function hello() {\n  return "world";\n}\n\nfunction bye() {\n  return "bye";\n}`;
      const { chunks } = await chunk("hybrid.ts", code, { strategy: "hybrid" });

      const funcChunks = chunks.filter(c => c.type === "function");
      expect(funcChunks.length).toBe(2);
    });
  });
});
