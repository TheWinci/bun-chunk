# bun-chunk

AST-aware code chunking for RAG pipelines — fast, simple, Bun-native.

Uses [tree-sitter](https://tree-sitter.github.io/tree-sitter/) to parse source code into an AST, then splits it into semantically meaningful chunks (functions, classes, interfaces, etc.) instead of naive line-based splitting. This produces better embeddings and more relevant retrieval for code search and RAG.

## Supported languages

TypeScript, JavaScript, Python, Rust, Go, Java, C, C++, C#, Ruby, PHP, Scala, HTML, CSS, Kotlin, Lua, Zig, Elixir, Bash, TOML, YAML, Haskell, OCaml, Dart

### Future candidates

These languages need a compatible tree-sitter WASM binary before they can be added:

- **Swift** — no npm package ships a `.wasm`; requires self-compiling or the `tree-sitter-wasms` mega-bundle
- **SQL** — no npm package ships a `.wasm`; best grammar is `@derekstride/tree-sitter-sql` but needs manual WASM build

## Install

```sh
bun add @winci/bun-chunk
```

## Usage

```ts
import { chunk } from "@winci/bun-chunk";

const code = await Bun.file("src/app.ts").text();
const chunks = await chunk("src/app.ts", code);

for (const c of chunks) {
  console.log(`[${c.type}] ${c.name ?? "(anonymous)"} (lines ${c.startLine}-${c.endLine})`);
  console.log(c.text);
}
```

### Options

```ts
const chunks = await chunk("src/app.ts", code, {
  maxLines: 40,                // max chunk size in lines (default: 60)
  language: "typescript",      // override language detection
  strategy: "semantic",        // "semantic" (default) | "fixed" | "hybrid"
  overlap: 3,                  // lines of overlap between chunks (default: 0)
  includeMetadata: true,       // add language, filePath, hash to each chunk
  includeContext: true,        // add parent scope context to child chunks
});
```

Language is auto-detected from the file extension. Supported extensions: `.ts`, `.tsx`, `.mts`, `.cts`, `.js`, `.jsx`, `.mjs`, `.cjs`, `.py`, `.pyi`, `.rs`, `.go`, `.java`, `.c`, `.h`, `.cpp`, `.cc`, `.cxx`, `.hpp`, `.hh`, `.hxx`, `.cs`, `.rb`, `.php`, `.scala`, `.sc`, `.html`, `.htm`, `.css`, `.scss`, `.less`, `.kt`, `.kts`, `.lua`, `.zig`, `.zon`, `.ex`, `.exs`, `.sh`, `.bash`, `.zsh`, `.toml`, `.yaml`, `.yml`, `.hs`, `.lhs`, `.ml`, `.mli`, `.dart`.

**Strategies:**

- **`semantic`** (default) — AST-aware, extracts named entities
- **`fixed`** — Pure line-based splitting, no AST
- **`hybrid`** — AST for known languages, fallback to fixed for unknowns

### Merging small chunks

Adjacent small chunks (blocks, imports) can be merged to reduce total chunk count:

```ts
import { chunk, mergeSmallChunks } from "@winci/bun-chunk";

const chunks = await chunk("app.ts", code);
const merged = mergeSmallChunks(chunks, 60);
```

### File and directory chunking

Chunk a single file from disk:

```ts
import { chunkFile } from "@winci/bun-chunk";

const result = await chunkFile("src/app.ts", { maxLines: 40 });
// result.chunks, result.fileImports, result.fileExports
```

Chunk an entire directory:

```ts
import { chunkDirectory } from "@winci/bun-chunk";

const result = await chunkDirectory("src/", {
  glob: "**/*.ts",
  ignore: ["node_modules", "dist"],
  onProgress({ filePath, chunkCount, fileIndex, totalFiles }) {
    console.log(`[${fileIndex}/${totalFiles}] ${filePath}: ${chunkCount} chunks`);
  },
});

for (const [filePath, fileResult] of result.files) {
  console.log(filePath, fileResult.chunks.length);
}
```

### Streaming

All chunking functions have streaming counterparts that yield chunks one at a time:

```ts
import { chunkStream, chunkFileStream, chunkDirectoryStream } from "@winci/bun-chunk";

for await (const chunk of chunkFileStream("src/app.ts")) {
  console.log(chunk.name, chunk.type);
}
```

### Structured imports and exports

Every chunk result includes parsed imports and exports:

```ts
import { chunk } from "@winci/bun-chunk";

const result = await chunk("src/app.ts", code);

for (const imp of result.fileImports) {
  console.log(imp.name, imp.source, imp.isDefault, imp.isNamespace);
}

for (const exp of result.fileExports) {
  console.log(exp.name, exp.type, exp.isDefault, exp.isReExport);
}
```

You can also extract them directly:

```ts
import { extractImports, extractExports } from "@winci/bun-chunk";
```

### Project-level analysis

`chunkProject` resolves cross-file imports and builds a dependency graph:

```ts
import { chunkProject } from "@winci/bun-chunk";

const project = await chunkProject("src/", {
  glob: "**/*.ts",
  resolveImports: true, // default
});

// Dependency graph
for (const [file, deps] of project.graph.importsFrom) {
  console.log(`${file} imports from:`, [...deps]);
}

for (const [file, dependents] of project.graph.importedBy) {
  console.log(`${file} is imported by:`, [...dependents]);
}

// Chunks are enriched with cross-file info
for (const [filePath, ctx] of project.files) {
  for (const chunk of ctx.result.chunks) {
    if (chunk.usedBy) console.log(`${chunk.name} used by:`, chunk.usedBy);
    if (chunk.definedIn) console.log(`${chunk.name} defined in:`, chunk.definedIn);
  }
}
```

## CLI

```sh
bunx @winci/bun-chunk <file|directory> [options]
```

| Option | Description |
|--------|-------------|
| `-f, --format <json\|jsonl\|text>` | Output format (default: `json`) |
| `-m, --max-lines <n>` | Max chunk size in lines (default: `60`) |
| `-l, --language <lang>` | Override language detection |
| `-s, --strategy <semantic\|fixed\|hybrid>` | Chunking strategy (default: `semantic`) |
| `--overlap <n>` | Line overlap between chunks (default: `0`) |
| `-g, --glob <pattern>` | File filter for directory mode |
| `--include-metadata` | Include language, filePath, hash |
| `--include-context` | Include parent scope context |

## How it works

1. Parses source code into an AST using tree-sitter (WASM grammars)
2. Runs language-specific queries to extract top-level entities (functions, classes, types, imports, etc.)
3. Consecutive imports are collapsed into single chunks
4. Leading comments and decorators attach to their entity
5. Creates one chunk per entity that fits within `maxLines`
6. Splits oversized entities by their children (e.g., methods within a class)
7. Falls back to line-based splitting for very large blocks or unsupported languages

Each chunk includes:

| Field       | Type              | Description                          |
|-------------|-------------------|--------------------------------------|
| `text`      | `string`          | The chunk's source code              |
| `startLine` | `number`          | 0-indexed start line                 |
| `endLine`   | `number`          | 0-indexed end line (inclusive)       |
| `type`      | `ChunkType`       | Entity type (`function`, `class`, `interface`, `block`, etc.) |
| `name`      | `string \| null`  | Entity name if available             |
| `imports`   | `ChunkImport[]`   | Imports in this chunk                |
| `exports`   | `ChunkExport[]`   | Exports in this chunk                |
| `context`   | `string[]`        | Parent scope chain (with `includeContext`) |
| `parentName`| `string`          | Enclosing entity name                |
| `language`  | `string`          | Detected language (with `includeMetadata`) |
| `filePath`  | `string`          | Source file path (with `includeMetadata`) |
| `hash`      | `string`          | Content SHA256 hash (with `includeMetadata`) |
| `usedBy`    | `string[]`        | Files importing this export (via `chunkProject`) |
| `definedIn` | `string[]`        | Files defining this import (via `chunkProject`) |

## License

MIT
