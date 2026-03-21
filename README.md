# bun-chunk

AST-aware code chunking for RAG pipelines — fast, simple, Bun-native.

Uses [tree-sitter](https://tree-sitter.github.io/tree-sitter/) to parse source code into an AST, then splits it into semantically meaningful chunks (functions, classes, interfaces, etc.) instead of naive line-based splitting. This produces better embeddings and more relevant retrieval for code search and RAG.

## Supported languages

TypeScript, JavaScript, Python, Rust, Go, Java

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
  maxLines: 40,           // max chunk size in lines (default: 60)
  language: "typescript",  // override language detection
});
```

Language is auto-detected from the file extension. Supported extensions: `.ts`, `.tsx`, `.mts`, `.cts`, `.js`, `.jsx`, `.mjs`, `.cjs`, `.py`, `.pyi`, `.rs`, `.go`, `.java`.

### Merging small chunks

Adjacent small chunks (blocks, imports) can be merged to reduce total chunk count:

```ts
import { chunk, mergeSmallChunks } from "@winci/bun-chunk";

const chunks = await chunk("app.ts", code);
const merged = mergeSmallChunks(chunks, 60);
```

## How it works

1. Parses source code into an AST using tree-sitter (WASM grammars)
2. Runs language-specific queries to extract top-level entities (functions, classes, types, imports, etc.)
3. Creates one chunk per entity that fits within `maxLines`
4. Splits oversized entities by their children (e.g., methods within a class)
5. Falls back to line-based splitting for very large blocks or unsupported languages

Each chunk includes:

| Field       | Type              | Description                          |
|-------------|-------------------|--------------------------------------|
| `text`      | `string`          | The chunk's source code              |
| `startLine` | `number`          | 0-indexed start line                 |
| `endLine`   | `number`          | 0-indexed end line (inclusive)       |
| `type`      | `ChunkType`       | Entity type (`function`, `class`, `interface`, `block`, etc.) |
| `name`      | `string \| null`  | Entity name if available             |

## License

MIT
