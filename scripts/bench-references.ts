/**
 * Phase A payload-size gate.
 *
 * Walks a corpus, chunks every supported file, compares JSON byte size of
 * the result with `references` vs without. Used as the merge gate for the
 * always-on references emission decision.
 */
import { chunk } from "../src";
import { readFile, readdir } from "fs/promises";
import { join, extname } from "path";
import { EXTENSION_MAP } from "../src/types";
import type { Chunk, ChunkResult } from "../src/types";

const SUPPORTED_EXTS = new Set(Object.keys(EXTENSION_MAP));

const SKIP_DIRS = new Set([
  "node_modules", ".git", "dist", "build", ".next", "out",
  "coverage", ".cache", "__pycache__", ".venv", "venv",
]);

async function* walk(dir: string): AsyncGenerator<string> {
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const entry of entries) {
    if (SKIP_DIRS.has(entry.name)) continue;
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      yield* walk(full);
    } else if (entry.isFile()) {
      const ext = extname(entry.name).toLowerCase();
      if (SUPPORTED_EXTS.has(ext)) yield full;
    }
  }
}

function stripReferences(result: ChunkResult): { chunks: Chunk[]; fileImports: any; fileExports: any } {
  return {
    chunks: result.chunks.map(c => {
      const { references, ...rest } = c;
      return rest as Chunk;
    }),
    fileImports: result.fileImports,
    fileExports: result.fileExports,
  };
}

function countRefs(result: ChunkResult): number {
  let n = 0;
  for (const c of result.chunks) {
    if (!c.references) continue;
    for (const lines of Object.values(c.references)) n += lines.length;
  }
  return n;
}

async function bench(root: string, label: string, fileCap: number) {
  let files = 0;
  let withRefBytes = 0;
  let withoutRefBytes = 0;
  let totalRefs = 0;
  let parseErrors = 0;

  const start = performance.now();

  for await (const path of walk(root)) {
    if (files >= fileCap) break;
    let code: string;
    try {
      code = await readFile(path, "utf-8");
    } catch {
      continue;
    }
    let result: ChunkResult;
    try {
      result = await chunk(path, code, { includeReferences: true });
    } catch {
      parseErrors++;
      continue;
    }
    files++;
    const withRef = JSON.stringify(result);
    const withoutRef = JSON.stringify(stripReferences(result));
    withRefBytes += Buffer.byteLength(withRef);
    withoutRefBytes += Buffer.byteLength(withoutRef);
    totalRefs += countRefs(result);
  }

  const elapsed = performance.now() - start;
  const growth = ((withRefBytes - withoutRefBytes) / withoutRefBytes) * 100;

  console.log(`\n=== ${label} (cap ${fileCap}) ===`);
  console.log(`files chunked:       ${files}`);
  console.log(`parse errors:        ${parseErrors}`);
  console.log(`elapsed:             ${(elapsed / 1000).toFixed(2)}s`);
  console.log(`payload w/ refs:     ${(withRefBytes / 1024).toFixed(1)} KiB`);
  console.log(`payload w/o refs:    ${(withoutRefBytes / 1024).toFixed(1)} KiB`);
  console.log(`growth:              ${growth.toFixed(2)}%`);
  console.log(`total references:    ${totalRefs}`);
  console.log(`avg refs/file:       ${(totalRefs / Math.max(files, 1)).toFixed(1)}`);

  return { growth, files, withRefBytes, withoutRefBytes };
}

async function main() {
  const corpora: Array<{ path: string; label: string; cap: number }> = [
    { path: "/Users/winci/repos/excalidraw", label: "excalidraw (TS/TSX)", cap: 600 },
    { path: "/Users/winci/repos/mimirs", label: "mimirs (TS)", cap: 200 },
    { path: "/Users/winci/repos/django/django", label: "django (py)", cap: 600 },
  ];

  const results = [];
  for (const { path, label, cap } of corpora) {
    results.push(await bench(path, label, cap));
  }

  const totalWith = results.reduce((s, r) => s + r.withRefBytes, 0);
  const totalWithout = results.reduce((s, r) => s + r.withoutRefBytes, 0);
  const totalFiles = results.reduce((s, r) => s + r.files, 0);
  const aggGrowth = ((totalWith - totalWithout) / totalWithout) * 100;

  console.log(`\n=== AGGREGATE ===`);
  console.log(`total files:         ${totalFiles}`);
  console.log(`aggregate growth:    ${aggGrowth.toFixed(2)}%`);
  console.log(`gate threshold:      <10%`);
  console.log(`verdict:             ${aggGrowth < 10 ? "PASS — ship always-on" : "FAIL — reintroduce opt-in flag"}`);
}

main();
