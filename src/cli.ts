#!/usr/bin/env bun

import { parseArgs } from "util";
import { chunk } from "./chunker";
import { chunkFile, chunkDirectory } from "./stream";
import type { Chunk, ChunkImport, ChunkExport, ChunkOptions, ChunkStrategy, Language } from "./types";
import { EXTENSION_MAP } from "./types";
import { stat } from "fs/promises";
import { resolve } from "path";

const { values, positionals } = parseArgs({
  args: Bun.argv.slice(2),
  options: {
    format: { type: "string", short: "f", default: "json" },
    "max-lines": { type: "string", short: "m", default: "60" },
    language: { type: "string", short: "l" },
    strategy: { type: "string", short: "s", default: "semantic" },
    overlap: { type: "string", default: "0" },
    glob: { type: "string", short: "g" },
    "include-metadata": { type: "boolean", default: false },
    "include-context": { type: "boolean", default: false },
    help: { type: "boolean", short: "h", default: false },
    version: { type: "boolean", short: "v", default: false },
  },
  allowPositionals: true,
});

if (values.version) {
  const pkg = await Bun.file(new URL("../package.json", import.meta.url)).json();
  console.log(pkg.version);
  process.exit(0);
}

if (values.help || positionals.length === 0) {
  console.log(`bun-chunk — AST-aware code chunking for RAG pipelines

Usage:
  bun-chunk <file|directory> [options]

Options:
  -f, --format <json|jsonl|text>   Output format (default: json)
  -m, --max-lines <n>              Max chunk size in lines (default: 60)
  -l, --language <lang>            Override language detection
  -s, --strategy <semantic|fixed|hybrid>  Chunking strategy (default: semantic)
      --overlap <n>                Line overlap between chunks (default: 0)
  -g, --glob <pattern>             File filter for directory mode
      --include-metadata           Include language, filePath, hash
      --include-context            Include parent scope context
  -h, --help                       Show this help
  -v, --version                    Show version

Supported languages:
  ${Object.values(EXTENSION_MAP).filter((v, i, a) => a.indexOf(v) === i).join(", ")}

Examples:
  bun-chunk src/index.ts
  bun-chunk src/ --format jsonl --include-metadata
  bun-chunk src/ --glob "*.ts" --max-lines 40`);
  process.exit(0);
}

const target = resolve(positionals[0]);

const format = values.format as string;
if (!["json", "jsonl", "text"].includes(format)) {
  console.error(`Error: --format must be one of: json, jsonl, text (got "${format}")`);
  process.exit(1);
}

const maxLines = parseInt(values["max-lines"]!);
if (isNaN(maxLines) || maxLines <= 0) {
  console.error("Error: --max-lines must be a positive integer");
  process.exit(1);
}

const overlap = parseInt(values.overlap!);
if (isNaN(overlap) || overlap < 0) {
  console.error("Error: --overlap must be a non-negative integer");
  process.exit(1);
}

const strategy = values.strategy as string;
if (!["semantic", "fixed", "hybrid"].includes(strategy)) {
  console.error(`Error: --strategy must be one of: semantic, fixed, hybrid (got "${strategy}")`);
  process.exit(1);
}

const validLanguages = Object.values(EXTENSION_MAP);
if (values.language && !validLanguages.includes(values.language as Language)) {
  console.error(`Error: --language must be one of: ${[...new Set(validLanguages)].join(", ")} (got "${values.language}")`);
  process.exit(1);
}

const chunkOptions: ChunkOptions = {
  maxLines,
  strategy: strategy as ChunkStrategy,
  overlap,
  includeMetadata: values["include-metadata"],
  includeContext: values["include-context"],
  ...(values.language ? { language: values.language as Language } : {}),
};

async function outputChunks(filepath: string, result: Awaited<ReturnType<typeof chunk>>) {
  switch (format) {
    case "json":
      console.log(JSON.stringify({
        file: filepath,
        chunks: result.chunks,
        fileImports: result.fileImports,
        fileExports: result.fileExports,
      }, null, 2));
      break;

    case "jsonl":
      for (const c of result.chunks) {
        console.log(JSON.stringify({ file: filepath, ...c }));
      }
      break;

    case "text":
      for (const c of result.chunks) {
        const header = [
          `--- ${filepath}`,
          c.name ? `name: ${c.name}` : null,
          `type: ${c.type}`,
          `lines: ${c.startLine + 1}-${c.endLine + 1}`,
          c.parentName ? `parent: ${c.parentName}` : null,
        ].filter(Boolean).join(" | ");
        console.log(header);
        console.log(c.text);
        console.log();
      }
      break;
  }
}

try {
  const info = await stat(target);

  if (info.isFile()) {
    const result = await chunkFile(target, chunkOptions);
    await outputChunks(target, result);
  } else if (info.isDirectory()) {
    const dirResult = await chunkDirectory(target, {
      ...chunkOptions,
      glob: values.glob,
    });

    if (format === "json") {
      // For JSON, output as an array of file results
      const output: { file: string; chunks: Chunk[]; fileImports: ChunkImport[]; fileExports: ChunkExport[] }[] = [];
      for (const [filepath, result] of dirResult.files) {
        output.push({
          file: filepath,
          chunks: result.chunks,
          fileImports: result.fileImports,
          fileExports: result.fileExports,
        });
      }
      console.log(JSON.stringify(output, null, 2));
    } else {
      for (const [filepath, result] of dirResult.files) {
        await outputChunks(filepath, result);
      }
    }

    if (format !== "json") {
      console.error(`\nProcessed ${dirResult.totalFiles} files, ${dirResult.totalChunks} chunks`);
    }
  } else {
    console.error(`Error: ${target} is not a file or directory`);
    process.exit(1);
  }
} catch (err) {
  console.error(`Error: ${err instanceof Error ? err.message : String(err)}`);
  process.exit(1);
}
