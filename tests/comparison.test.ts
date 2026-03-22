import { describe, test, expect } from "bun:test";
import { chunk as bunChunkFn } from "../src";
import { chunk as codeChunk } from "code-chunk";
import { readFile } from "fs/promises";
import { join } from "path";

const FIXTURES = join(import.meta.dir, "fixtures");

async function readFixture(name: string): Promise<string> {
  return readFile(join(FIXTURES, name), "utf-8");
}

/** Wrapper to get just chunks array for comparison */
async function bunChunk(file: string, code: string, options?: any) {
  const result = await bunChunkFn(file, code, options);
  return result.chunks;
}

/**
 * Comparison tests: bun-chunk vs code-chunk
 *
 * We don't require identical output — the algorithms differ.
 * bun-chunk is more granular (one entity per chunk), while code-chunk
 * uses NWS-based sizing and may put multiple entities in one chunk.
 *
 * We check:
 * 1. bun-chunk covers all non-empty source lines
 * 2. bun-chunk finds all the same entity names (via chunk names)
 * 3. Both produce non-zero output for all languages
 */
describe("bun-chunk vs code-chunk", () => {
  const files: [string, string][] = [
    ["sample.ts", "TypeScript"],
    ["sample.js", "JavaScript"],
    ["sample.py", "Python"],
    ["sample.rs", "Rust"],
    ["sample.go", "Go"],
    ["Sample.java", "Java"],
  ];

  for (const [file, lang] of files) {
    describe(lang, () => {
      test("both produce chunks", async () => {
        const code = await readFixture(file);

        const bunResult = await bunChunk(file, code);
        const ccResult = await codeChunk(file, code);

        console.log(`  ${lang}: bun-chunk=${bunResult.length} chunks, code-chunk=${ccResult.length} chunks`);

        expect(bunResult.length).toBeGreaterThan(0);
        expect(ccResult.length).toBeGreaterThan(0);
      });

      test("bun-chunk covers all lines that code-chunk covers", async () => {
        const code = await readFixture(file);
        const lines = code.split("\n");

        const bunResult = await bunChunk(file, code);
        const ccResult = await codeChunk(file, code);

        const bunLines = new Set<number>();
        for (const c of bunResult) {
          for (let i = c.startLine; i <= c.endLine; i++) bunLines.add(i);
        }

        const ccLines = new Set<number>();
        for (const c of ccResult) {
          for (let i = c.lineRange.start; i <= c.lineRange.end; i++) ccLines.add(i);
        }

        let missed = 0;
        for (const line of ccLines) {
          if (lines[line]?.trim() && !bunLines.has(line)) missed++;
        }

        console.log(`  ${lang}: bun=${bunLines.size} lines, cc=${ccLines.size} lines, missed=${missed}`);
        expect(missed).toBe(0);
      });

      test("bun-chunk text contains all code-chunk entity names", async () => {
        const code = await readFixture(file);

        const bunResult = await bunChunk(file, code);
        const ccResult = await codeChunk(file, code);

        const bunNames = new Set(bunResult.map(c => c.name).filter(Boolean));
        const bunFullText = bunResult.map(c => c.text).join("\n");

        // code-chunk reports nested entities (methods, fields) individually.
        // bun-chunk groups them under parent chunks. So rather than matching
        // names 1:1, verify that every entity name code-chunk finds appears
        // somewhere in bun-chunk's output text.
        const ccNames = new Set<string>();
        for (const c of ccResult) {
          for (const e of c.context.entities) {
            if (e.name && !e.name.startsWith("<")) ccNames.add(e.name);
          }
        }

        console.log(`  ${lang}: bun names: [${[...bunNames].join(", ")}]`);
        console.log(`  ${lang}: cc names:  [${[...ccNames].join(", ")}]`);

        // Every entity name found by code-chunk should appear in bun-chunk text
        let missing = 0;
        for (const name of ccNames) {
          if (!bunFullText.includes(name)) {
            console.log(`  ${lang}: text missing: ${name}`);
            missing++;
          }
        }

        expect(missing).toBe(0);
      });

      test("bun-chunk is more granular (more chunks for small files)", async () => {
        const code = await readFixture(file);

        const bunResult = await bunChunk(file, code, { maxLines: 60 });
        const ccResult = await codeChunk(file, code, { maxChunkSize: 1500 });

        // For these small test files, bun-chunk should produce at least
        // as many chunks as code-chunk (it's entity-per-chunk vs size-based)
        expect(bunResult.length).toBeGreaterThanOrEqual(ccResult.length);
      });
    });
  }
});
