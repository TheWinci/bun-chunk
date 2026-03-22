import { describe, test, expect } from "bun:test";
import { chunk, chunkStream, chunkFile, chunkFileStream, chunkDirectory } from "../src";
import { join } from "path";

const FIXTURES = join(import.meta.dir, "fixtures");

describe("Phase 4: Tooling & Integration", () => {
  describe("chunkStream", () => {
    test("yields chunks one at a time", async () => {
      const code = `function hello() {\n  return "world";\n}\n\nfunction bye() {\n  return "bye";\n}`;
      const chunks = [];
      for await (const c of chunkStream("test.ts", code)) {
        chunks.push(c);
      }
      expect(chunks.length).toBeGreaterThan(0);
      const names = chunks.map(c => c.name).filter(Boolean);
      expect(names).toContain("hello");
      expect(names).toContain("bye");
    });

    test("respects options", async () => {
      const code = `function hello() {\n  return "world";\n}`;
      const chunks = [];
      for await (const c of chunkStream("test.ts", code, { includeMetadata: true })) {
        chunks.push(c);
      }
      expect(chunks[0].language).toBe("typescript");
      expect(chunks[0].hash).toBeDefined();
    });
  });

  describe("chunkFile", () => {
    test("reads and chunks a file from disk", async () => {
      const filepath = join(FIXTURES, "sample.ts");
      const result = await chunkFile(filepath);
      expect(result.chunks.length).toBeGreaterThan(0);
      const names = result.chunks.map(c => c.name).filter(Boolean);
      expect(names).toContain("DataProcessor");
    });

    test("returns structured imports and exports", async () => {
      const filepath = join(FIXTURES, "sample.ts");
      const result = await chunkFile(filepath);
      expect(result.fileImports.length).toBeGreaterThan(0);
      expect(result.fileExports.length).toBeGreaterThan(0);
    });
  });

  describe("chunkFileStream", () => {
    test("streams chunks from a file on disk", async () => {
      const filepath = join(FIXTURES, "sample.ts");
      const chunks = [];
      for await (const c of chunkFileStream(filepath)) {
        chunks.push(c);
      }
      expect(chunks.length).toBeGreaterThan(0);
    });
  });

  describe("chunkDirectory", () => {
    test("chunks all supported files in fixtures dir", async () => {
      const result = await chunkDirectory(FIXTURES);
      expect(result.totalFiles).toBeGreaterThan(0);
      expect(result.totalChunks).toBeGreaterThan(0);
      expect(result.files.size).toBe(result.totalFiles);
    });

    test("calls onProgress for each file", async () => {
      const progress: string[] = [];
      await chunkDirectory(FIXTURES, {
        onProgress: (info) => progress.push(info.filepath),
      });
      expect(progress.length).toBeGreaterThan(0);
    });

    test("respects glob filter", async () => {
      const result = await chunkDirectory(FIXTURES, { glob: "*.ts" });
      for (const [filepath] of result.files) {
        expect(filepath).toEndWith(".ts");
      }
    });

    test("skips node_modules and .git by default", async () => {
      // The fixtures dir doesn't have these, but verify no crashes
      const result = await chunkDirectory(FIXTURES);
      for (const [filepath] of result.files) {
        expect(filepath).not.toContain("node_modules");
        expect(filepath).not.toContain(".git");
      }
    });
  });

  describe("CLI", () => {
    test("--help shows usage", async () => {
      const proc = Bun.spawn(["bun", "src/cli.ts", "--help"], {
        cwd: join(import.meta.dir, ".."),
        stdout: "pipe",
      });
      const output = await new Response(proc.stdout).text();
      expect(output).toContain("bun-chunk");
      expect(output).toContain("--format");
      expect(output).toContain("--max-lines");
    });

    test("--version shows version", async () => {
      const proc = Bun.spawn(["bun", "src/cli.ts", "--version"], {
        cwd: join(import.meta.dir, ".."),
        stdout: "pipe",
      });
      const output = await new Response(proc.stdout).text();
      expect(output.trim()).toMatch(/^\d+\.\d+\.\d+$/);
    });

    test("chunks a single file as JSON", async () => {
      const proc = Bun.spawn(["bun", "src/cli.ts", join(FIXTURES, "sample.ts")], {
        cwd: join(import.meta.dir, ".."),
        stdout: "pipe",
      });
      const output = await new Response(proc.stdout).text();
      const parsed = JSON.parse(output);
      expect(parsed.chunks.length).toBeGreaterThan(0);
      expect(parsed.fileImports).toBeDefined();
      expect(parsed.fileExports).toBeDefined();
    });

    test("chunks a file as JSONL", async () => {
      const proc = Bun.spawn(["bun", "src/cli.ts", join(FIXTURES, "sample.ts"), "--format", "jsonl"], {
        cwd: join(import.meta.dir, ".."),
        stdout: "pipe",
      });
      const output = await new Response(proc.stdout).text();
      const lines = output.trim().split("\n");
      expect(lines.length).toBeGreaterThan(0);
      // Each line should be valid JSON
      for (const line of lines) {
        const parsed = JSON.parse(line);
        expect(parsed.file).toBeDefined();
        expect(parsed.text).toBeDefined();
      }
    });

    test("chunks a file as text", async () => {
      const proc = Bun.spawn(["bun", "src/cli.ts", join(FIXTURES, "sample.ts"), "--format", "text"], {
        cwd: join(import.meta.dir, ".."),
        stdout: "pipe",
      });
      const output = await new Response(proc.stdout).text();
      expect(output).toContain("---");
      expect(output).toContain("type:");
      expect(output).toContain("lines:");
    });

    test("chunks a directory", async () => {
      const proc = Bun.spawn(["bun", "src/cli.ts", FIXTURES, "--format", "jsonl", "--glob", "*.ts"], {
        cwd: join(import.meta.dir, ".."),
        stdout: "pipe",
        stderr: "pipe",
      });
      const output = await new Response(proc.stdout).text();
      const lines = output.trim().split("\n");
      expect(lines.length).toBeGreaterThan(0);
    });
  });
});
