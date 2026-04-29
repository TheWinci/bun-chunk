import { describe, test, expect } from "bun:test";
import { chunk } from "../src";
import { readFile } from "fs/promises";
import { join } from "path";

const FIXTURES = join(import.meta.dir, "fixtures", "refs");

async function readFixture(name: string): Promise<string> {
  return readFile(join(FIXTURES, name), "utf-8");
}

/** Languages whose REFERENCE_QUERIES are intentionally empty. */
const NO_REF_LANGS = new Set(["html", "css", "toml", "yaml"]);

const SAMPLE_FILES: Record<string, string> = {
  typescript: "sample.ts",
  javascript: "sample.js",
  python: "sample.py",
  rust: "sample.rs",
  go: "sample.go",
  java: "Sample.java",
  c: "sample.c",
  cpp: "sample.cpp",
  csharp: "sample.cs",
  ruby: "sample.rb",
  php: "sample.php",
  scala: "sample.scala",
  kotlin: "sample.kt",
  lua: "sample.lua",
  zig: "sample.zig",
  elixir: "sample.ex",
  bash: "sample.sh",
  haskell: "sample.hs",
  ocaml: "sample.ml",
  dart: "sample.dart",
  html: "sample.html",
  css: "sample.css",
  toml: "sample.toml",
  yaml: "sample.yaml",
};

describe("references", () => {
  /** Aggregate per-chunk references into a file-level Record (chunks cover
   *  all non-blank lines, so no information is lost vs the dropped
   *  fileReferences field). */
  function aggregateRefs(chunks: { references?: Record<string, number[]> }[]): Record<string, number[]> {
    const out: Record<string, number[]> = Object.create(null);
    for (const c of chunks) {
      if (!c.references) continue;
      for (const [name, lines] of Object.entries(c.references)) {
        (out[name] ??= []).push(...lines);
      }
    }
    return out;
  }

  describe("opt-out flag", () => {
    test("default (no flag): references emitted", async () => {
      const code = await readFile(join(import.meta.dir, "fixtures", "sample.ts"), "utf-8");
      const result = await chunk("sample.ts", code);

      const aggregated = aggregateRefs(result.chunks);
      expect(Object.keys(aggregated).length).toBeGreaterThan(0);
    });

    test("includeReferences: false explicit: no references emitted", async () => {
      const code = await readFile(join(import.meta.dir, "fixtures", "sample.ts"), "utf-8");
      const result = await chunk("sample.ts", code, { includeReferences: false });
      const anyChunkHasRefs = result.chunks.some(c => c.references && Object.keys(c.references).length > 0);
      expect(anyChunkHasRefs).toBe(false);
    });

    test("includeReferences: true explicit: references emitted on chunks", async () => {
      const code = await readFile(join(import.meta.dir, "fixtures", "sample.ts"), "utf-8");
      const result = await chunk("sample.ts", code, { includeReferences: true });
      const aggregated = aggregateRefs(result.chunks);
      expect(Object.keys(aggregated).length).toBeGreaterThan(0);
    });
  });

  describe("smoke (all languages)", () => {
    for (const [lang, file] of Object.entries(SAMPLE_FILES)) {
      test(`${lang}: reference query loads and produces expected output`, async () => {
        const code = await readFile(join(import.meta.dir, "fixtures", file), "utf-8");
        const result = await chunk(file, code, { includeReferences: true });

        const aggregated = aggregateRefs(result.chunks);
        const nameCount = Object.keys(aggregated).length;
        if (NO_REF_LANGS.has(lang)) {
          expect(nameCount).toBe(0);
        } else {
          expect(nameCount).toBeGreaterThan(0);
        }
      });
    }
  });

  describe("TypeScript", () => {
    test("emits per-chunk references", async () => {
      const code = await readFixture("sample.ts");
      const result = await chunk("sample.ts", code, { includeReferences: true });

      const chunksWithRefs = result.chunks.filter(c => c.references && Object.keys(c.references).length > 0);
      expect(chunksWithRefs.length).toBeGreaterThan(0);
    });

    test("captures free function call", async () => {
      const code = await readFixture("sample.ts");
      const { chunks } = await chunk("sample.ts", code, { includeReferences: true });

      const callsHelper = chunks.find(c => c.name === "callsHelper");
      expect(callsHelper).toBeDefined();
      expect(callsHelper!.references).toBeDefined();
      expect(callsHelper!.references!.helper).toBeDefined();
      expect(callsHelper!.references!.helper.length).toBeGreaterThan(0);
    });

    test("captures recursive self-call (separate line from declaration)", async () => {
      const code = await readFixture("sample.ts");
      const { chunks } = await chunk("sample.ts", code, { includeReferences: true });

      const recur = chunks.find(c => c.name === "recur");
      expect(recur).toBeDefined();
      expect(recur!.references?.recur).toBeDefined();
      expect(recur!.references!.recur.length).toBeGreaterThan(0);
    });

    test("excludes chunk's own declaration name on declaration line", async () => {
      const code = await readFixture("sample.ts");
      const { chunks } = await chunk("sample.ts", code, { includeReferences: true });

      const helper = chunks.find(c => c.name === "helper");
      expect(helper).toBeDefined();
      // helper has no body content that references itself, so the `helper` key
      // should not appear at all in its references map.
      expect(helper!.references?.helper).toBeUndefined();
    });

    test("excludes references inside import statements", async () => {
      const code = await readFixture("sample.ts");
      const { chunks } = await chunk("sample.ts", code, { includeReferences: true });

      const aggregated = aggregateRefs(chunks);
      // readFile/fancy are imported. They should not appear as references on
      // the import lines (lines 0–1). The function bodies that USE them
      // (methodAndImport, aliasUser) are on later lines and should still
      // capture them (renamed alias).
      const readFileLines = aggregated.readFile ?? [];
      expect(readFileLines).not.toContain(0);
      const fancyLines = aggregated.fancy ?? [];
      expect(fancyLines.length).toBe(0);
    });

    test("excludes identifiers inside comments and strings", async () => {
      const code = await readFixture("sample.ts");
      const { chunks } = await chunk("sample.ts", code, { includeReferences: true });

      const callsHelper = chunks.find(c => c.name === "callsHelper");
      expect(callsHelper).toBeDefined();
      // helper appears once in the callsHelper body as a real call. The
      // comment "helper(999)" and string "helper string literal" do not
      // contribute; tree-sitter does not match identifier inside comments
      // or string contents.
      expect(callsHelper!.references!.helper.length).toBe(1);
    });

    test("alias is captured as written, not original", async () => {
      const code = await readFixture("sample.ts");
      const { chunks } = await chunk("sample.ts", code, { includeReferences: true });

      const aliasUser = chunks.find(c => c.name === "aliasUser");
      expect(aliasUser).toBeDefined();
      expect(aliasUser!.references?.renamed).toBeDefined();
      expect(aliasUser!.references?.fancy).toBeUndefined();
    });

    test("type identifiers captured (Approach A)", async () => {
      const code = await readFixture("sample.ts");
      const { chunks } = await chunk("sample.ts", code, { includeReferences: true });

      const callsHelper = chunks.find(c => c.name === "callsHelper");
      expect(callsHelper).toBeDefined();
      // Config used as parameter type — Approach A captures it
      expect(callsHelper!.references?.Config).toBeDefined();
    });

    test("nested closure references parent scope", async () => {
      const code = await readFixture("sample.ts");
      const { chunks } = await chunk("sample.ts", code, { includeReferences: true });

      const withClosure = chunks.find(c => c.name === "withClosure");
      expect(withClosure).toBeDefined();
      expect(withClosure!.references?.helper).toBeDefined();
    });

    test("per-chunk reference lines are sorted", async () => {
      const code = await readFixture("sample.ts");
      const { chunks } = await chunk("sample.ts", code, { includeReferences: true });

      for (const c of chunks) {
        if (!c.references) continue;
        for (const [, lines] of Object.entries(c.references)) {
          for (let i = 1; i < lines.length; i++) {
            expect(lines[i]).toBeGreaterThanOrEqual(lines[i - 1]);
          }
        }
      }
    });
  });
});
