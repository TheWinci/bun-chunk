# bun-chunk Roadmap

AST-aware code chunking for RAG pipelines — fast, simple, Bun-native.

**Guiding principle**: bun-chunk and [local-rag](https://github.com/TheWinci/local-rag) are companion projects under shared ownership. Each should be excellent standalone, but the integration surface is the priority lens for every decision. bun-chunk owns *parsing and chunking*. local-rag owns *indexing, search, and the dependency graph*. The boundary between them should be clean — bun-chunk provides rich, structured chunk data; local-rag consumes it without needing to regex-parse or post-process.

## Current State (v0.1.0)

Released with a complete, tested foundation:

- **6 languages**: TypeScript, JavaScript, Python, Rust, Go, Java
- **AST-aware chunking** via tree-sitter WASM grammars with language-specific query patterns
- **18 semantic entity types**: function, class, interface, type, enum, struct, trait, impl, etc.
- **Smart splitting**: oversized entities split by children (e.g., methods in a class), with line-based fallback
- **Chunk merging**: `mergeSmallChunks()` combines adjacent small blocks/imports
- **Full test suite**: entity extraction per language, line coverage, overlap detection, comparison benchmarks vs `code-chunk`

### Current integration with local-rag

local-rag imports `chunk` from bun-chunk for AST-supported languages and falls back to heuristic blank-line splitting for everything else. On top of bun-chunk's output, local-rag:

- Converts 0-indexed line numbers to 1-indexed
- Regex-parses import chunk text to extract specifiers and names (`file_imports` table)
- Aggregates exported symbol names and types into `file_exports` table
- Applies its own size-based fallback splitting with overlap for oversized chunks
- Maintains its own domain-specific chunkers for Markdown, YAML, JSON, CSS, SQL, Dockerfile, etc.

The roadmap below is ordered to systematically eliminate these workarounds and unlock new capabilities.

---

## Phase 1 — Structured Imports/Exports & Edge Cases

**Goal**: Eliminate local-rag's regex post-processing by returning structured import/export data natively. Fix real-world edge cases that affect chunk quality.

### 1.1 Structured Import/Export Extraction

local-rag currently regex-parses bun-chunk's import chunk text to populate its `file_imports` and `file_exports` tables. bun-chunk should return this data structured, since it already has the AST.

- [ ] Define `ChunkImport` type: `{ name: string; source: string; isDefault: boolean; isNamespace: boolean }`
- [ ] Define `ChunkExport` type: `{ name: string; type: ChunkType; isDefault: boolean; isReExport: boolean; reExportSource?: string }`
- [ ] Extract imports from AST for all 6 supported languages (ES modules, Python `import`/`from`, Rust `use`, Go `import`, Java `import`)
- [ ] Extract exports from AST: named exports, default exports, re-exports (`export { foo } from "./bar"`, `pub use`, `__all__`)
- [ ] Add `imports` and `exports` fields to `Chunk` type (populated only on import/export chunks, `undefined` otherwise)
- [ ] Add file-level `fileImports` and `fileExports` to chunk result (aggregated across all chunks) — matches local-rag's per-file storage model
- [ ] Handle barrel files (`index.ts` re-exporting everything) — flag re-exports with source paths
- [ ] Tests: verify structured output matches what local-rag's regex currently extracts

### 1.2 Comment & Decorator Attachment

Leading comments and decorators before an entity end up as gap chunks. They should be attached to the entity they document — this improves embedding quality because the docstring travels with the function.

- [ ] Attach leading doc comments (`/** */`, `///`, `#`, `""" """`) to the next entity
- [ ] Attach decorators (`@decorator` in Python/Java/TypeScript) to their target entity
- [ ] Preserve blank-line boundaries — a blank line between a comment and an entity means they're separate
- [ ] Add tests for comment attachment across all supported languages

### 1.3 Robustness

- [ ] Handle files with syntax errors gracefully (tree-sitter partial parsing)
- [ ] Handle mixed line endings (`\r\n`, `\r`, `\n`)
- [ ] Handle BOM markers at file start
- [ ] Add edge-case tests: files with only comments, single-expression files, deeply nested structures

**Implementation order**: 1.1 (imports/exports) → 1.2 (comment attachment) → 1.3 (robustness)

**local-rag impact**: After this phase, local-rag can drop `parseImportText()` regex logic and consume structured data directly. Comment attachment improves embedding quality for all indexed code.

---

## Phase 2 — Language Coverage

**Goal**: Eliminate local-rag's heuristic fallback for common languages. Every language local-rag encounters in the wild should get AST-quality chunks.

### 2.1 Languages local-rag Currently Falls Back On

These languages are already in local-rag's extension list but use blank-line heuristic splitting because bun-chunk doesn't support them. Prioritized by how often they appear in real codebases.

- [ ] C (`tree-sitter-c`) — `.c`, `.h`
- [ ] C++ (`tree-sitter-cpp`) — `.cpp`, `.cc`, `.cxx`, `.hpp`, `.hh`, `.hxx`
- [ ] Ruby (`tree-sitter-ruby`) — `.rb`
- [ ] Swift (`tree-sitter-swift`) — `.swift`

Each language requires: tree-sitter WASM grammar, query pattern in `queries.ts`, node-type mappings in `chunker.ts`, extension mappings in `types.ts`, a test fixture, and test cases.

### 2.2 High-Value Additions

Languages not yet in local-rag's fallback list but common enough to warrant first-class support.

- [ ] C# (`tree-sitter-c-sharp`) — `.cs`
- [ ] PHP (`tree-sitter-php`) — `.php`
- [ ] Kotlin (`tree-sitter-kotlin`) — `.kt`, `.kts`
- [ ] Scala (`tree-sitter-scala`) — `.scala`, `.sc`

### 2.3 Prose & Markup Languages

local-rag already has its own domain-specific chunkers for these (Markdown by headings, YAML by top-level keys, etc.). Adding tree-sitter-based support in bun-chunk lets local-rag consolidate onto a single chunking engine — but this is lower priority since the existing local-rag implementations work.

- [ ] Markdown — split by headings (`#`, `##`, etc.) using `tree-sitter-markdown`
- [ ] HTML — split by top-level elements using `tree-sitter-html`
- [ ] CSS / SCSS — split by top-level rules and `@media` blocks using `tree-sitter-css`
- [ ] YAML — split by top-level keys using `tree-sitter-yaml`
- [ ] TOML — split by `[section]` and `[[array-of-tables]]` using `tree-sitter-toml`

**Implementation order**: 2.1 (fallback languages, one at a time) → 2.2 (high-value additions) → 2.3 (prose/markup, coordinate with local-rag migration)

**local-rag impact**: Each language added here lets local-rag remove a heuristic fallback path. Phase 2.3 eventually lets local-rag consolidate all its domain-specific chunkers into bun-chunk calls.

---

## Phase 3 — Smarter Chunking

**Goal**: Produce higher-quality chunks that lead to better embeddings and more relevant retrieval in local-rag's hybrid search pipeline.

### 3.1 Context Injection

When local-rag splits a class by its methods, each method chunk loses its parent context. A method `parse()` inside `class JsonParser` produces a chunk that embeds poorly because the embedding model doesn't know what it belongs to.

- [ ] Add optional `context` field to `Chunk` type — parent scope chain (e.g., `["JsonParser", "parse"]`)
- [ ] When splitting a class/struct/impl by children, prepend a context header to each child chunk (e.g., `// class JsonParser`)
- [ ] Make context injection opt-in via `ChunkOptions.includeContext` (default `false` for backward compatibility)
- [ ] Add `parentName` field to `Chunk` for structured access to the enclosing entity name

### 3.2 Import Collapsing

Files often have 10-30 individual import lines that create noisy, low-value chunks. local-rag's `mergeSmallChunks` helps but doesn't understand import grouping conventions.

- [ ] Detect consecutive import/use statements and group them into a single chunk
- [ ] Respect blank-line separators between import groups (e.g., stdlib vs third-party vs local)
- [ ] Update `mergeSmallChunks` to handle import grouping by default

### 3.3 Chunk Metadata Enrichment

local-rag stores `entity_name` and `chunk_type` in its chunks table. Additional metadata enables better deduplication and re-indexing.

- [ ] Add `language` field to `Chunk`
- [ ] Add `filePath` field to `Chunk`
- [ ] Add `hash` field — content hash for deduplication across re-indexing runs (local-rag currently hashes whole files, not chunks)
- [ ] Make new fields opt-in via `ChunkOptions.includeMetadata` to keep output lean by default

### 3.4 Overlap / Sliding Window Mode

local-rag already applies character-based overlap (`chunkOverlap: 50`) in its size-based fallback. bun-chunk should support line-based overlap natively so this doesn't need to happen downstream.

- [ ] Add `ChunkOptions.overlap` — number of lines to overlap between adjacent chunks (default `0`)
- [ ] Apply overlap only to line-based splits, not to entity-boundary splits
- [ ] Ensure overlapping chunks still have correct `startLine` / `endLine`

### 3.5 Configurable Strategies

- [ ] `"semantic"` (default) — current AST-aware behavior
- [ ] `"fixed"` — pure line-based splitting with no AST parsing (fastest)
- [ ] `"hybrid"` — AST-aware for supported languages, fixed for everything else (current fallback behavior, made explicit)
- [ ] Add `ChunkOptions.strategy` to select the mode

**Implementation order**: 3.1 (context injection) → 3.2 (import collapsing) → 3.3 (metadata) → 3.4 (overlap) → 3.5 (strategies)

**local-rag impact**: Context injection directly improves embedding quality for class methods. Metadata enrichment enables chunk-level deduplication during re-indexing. Overlap support lets local-rag drop its own overlap logic.

---

## Phase 4 — Tooling & Integration

**Goal**: Make bun-chunk usable as a standalone tool and provide APIs that align with local-rag's indexing pipeline.

### 4.1 Streaming API

local-rag processes files in batches during indexing. A streaming API avoids buffering all chunks in memory for large files.

- [ ] Add `chunkStream(filepath, code, options)` — returns `AsyncGenerator<Chunk>`
- [ ] Emit chunks as they are extracted instead of collecting into an array
- [ ] Add `chunkFile(filepath, options)` — reads file from disk and streams chunks (uses `Bun.file()`)
- [ ] Add `chunkDirectory(dirpath, options)` — recursively walks and streams chunks for all files

### 4.2 CLI Tool

A standalone CLI for chunking files without writing code — useful for debugging, testing, and pipelines outside local-rag.

- [ ] `bunx @winci/bun-chunk <file|dir>` — chunk files and output JSON to stdout
- [ ] `--format json|jsonl|text` — output format (JSONL for streaming into pipelines)
- [ ] `--max-lines <n>` — configure max chunk size
- [ ] `--language <lang>` — override language detection
- [ ] `--glob <pattern>` — filter files when chunking a directory
- [ ] `--include-metadata` — include language, filePath, hash in output
- [ ] Add `bin` field to `package.json`
- [ ] Directory mode: recursively chunk all supported files, skip `node_modules`, `.git`, etc.

### 4.3 Watch Mode

Complements local-rag's file watching — bun-chunk can emit changed chunks as a stream that local-rag subscribes to for incremental re-indexing.

- [ ] `bun-chunk watch <dir>` — watch for file changes, re-chunk modified files
- [ ] Output changed chunks as JSONL to stdout (pipeable into local-rag's indexing)
- [ ] Debounce rapid file changes (e.g., save-on-type)
- [ ] Skip files matching `.gitignore` patterns

**Implementation order**: 4.1 (streaming) → 4.2 (CLI) → 4.3 (watch mode)

**local-rag impact**: Streaming API reduces memory pressure during large project indexing. Watch mode can feed local-rag's incremental re-indexing pipeline.

---

## Phase 5 — Cross-File Context

**Goal**: Give bun-chunk the ability to understand cross-file relationships at the *chunk level*, while respecting that local-rag owns the dependency graph and storage. bun-chunk provides the raw structured data; local-rag builds and queries the graph.

### 5.1 Richer Import/Export Data

Building on Phase 1.1's structured imports/exports, add resolution hints that help local-rag build a more accurate graph without needing its own path resolution logic.

- [ ] Resolve relative import specifiers to file paths (given a project root) — `"./utils"` → `"src/utils.ts"` or `"src/utils/index.ts"`
- [ ] Support TypeScript path aliases (`tsconfig.json` `paths` and `baseUrl`)
- [ ] Handle Go package paths, Rust `mod` declarations, Java package conventions
- [ ] Return unresolved specifiers (bare imports like `"react"`) as-is — local-rag can decide whether to resolve them via `node_modules`
- [ ] Add `resolvedPath` field to `ChunkImport` (populated when resolution succeeds, `undefined` otherwise)

### 5.2 Cross-File Chunk Enrichment

When chunking multiple files together, annotate each chunk with cross-file context so embeddings capture the full picture.

- [ ] `chunkProject(dir, options)` — chunk all supported files, return chunks + a flat import/export map
- [ ] For each export chunk, include `usedBy: string[]` — file paths that import this symbol (populated from the import map)
- [ ] For each import chunk, include `definedIn: string` — resolved file path where the symbol lives
- [ ] Optional context header injection — prepend imported type signatures to a function chunk so the embedding captures parameter types defined elsewhere
- [ ] Configurable depth via `ChunkOptions.crossFileDepth` (default `1`) — how many levels of transitive context to include
- [ ] Parallel file processing using Bun's concurrency primitives
- [ ] Respect `.gitignore` and configurable ignore patterns
- [ ] Progress callback for large projects (`options.onProgress`)

### 5.3 Coordination Protocol with local-rag

Define a clean contract so both tools evolve without breaking each other.

- [ ] Document the `ChunkImport` / `ChunkExport` schema as a shared contract
- [ ] Ensure bun-chunk's `resolvedPath` output matches what local-rag stores in `file_imports.resolved_file_id` (via path lookup)
- [ ] Provide a `chunkProjectJSON(dir)` CLI command that outputs the full project chunk map as JSONL — local-rag can ingest this directly
- [ ] Version the chunk output format — local-rag can check `bun-chunk` version and adapt

**Implementation order**: 5.1 (resolution hints) → 5.2 (chunk enrichment) → 5.3 (coordination protocol)

**local-rag impact**: local-rag can replace its own `resolveImports()` logic with bun-chunk's resolution. Cross-file enrichment improves embedding quality for symbols that are defined once but used everywhere. The coordination protocol ensures both projects can evolve independently.

---

## Phase 6 — Performance & Stability (v1.0.0)

**Goal**: Reach a stable, production-grade v1.0 with a locked API, fast incremental updates, and CI/CD.

### 6.1 Stable API

- [ ] Audit and finalize the public API surface (`chunk`, `mergeSmallChunks`, types)
- [ ] Document all public types and functions with JSDoc
- [ ] Add `@since` annotations to track API additions
- [ ] Write a migration guide for any breaking changes from v0.x
- [ ] Declare the `Chunk` interface shape as stable (new fields must be optional)

### 6.2 Incremental Re-chunking

Tree-sitter supports incremental parsing — apply edits to an existing tree instead of re-parsing from scratch. This directly benefits local-rag's re-indexing performance for frequently edited files.

- [ ] Cache parsed trees by file path
- [ ] Accept text edits (position + new text) and apply `tree.edit()` before re-parsing
- [ ] Only re-extract chunks in the affected range, reuse unchanged chunks
- [ ] Expose `IncrementalChunker` class that maintains state across edits
- [ ] Return a diff of changed chunks (added/removed/modified) so local-rag can update its index surgically

### 6.3 Performance

- [ ] Benchmark suite: chunk throughput (lines/sec) per language, memory usage, large-file handling
- [ ] Lazy grammar loading — only load WASM grammars when a language is first encountered (already partially done, verify)
- [ ] Pool tree-sitter `Parser` instances instead of creating new ones
- [ ] Profile and optimize `filterTopLevel` and `splitByChildren` for files with hundreds of entities

### 6.4 CI/CD & Publishing

- [ ] GitHub Actions: lint, type-check, test on every PR
- [ ] Automated npm publishing on version tags
- [ ] Changelog generation from conventional commits
- [ ] Bundle size tracking — alert on regressions
- [ ] Add `exports` field to `package.json` for proper ESM resolution
- [ ] Integration test: run local-rag's test suite against bun-chunk's latest build to catch regressions at the integration boundary

### 6.5 Custom Queries

Let advanced users define their own tree-sitter queries for domain-specific entity extraction.

- [ ] Accept custom query strings via `ChunkOptions.query`
- [ ] Document the query format and capture conventions (`@item`, `@name`, `@context`)
- [ ] Provide example queries for common customizations (e.g., extract test blocks, extract SQL strings)

**Implementation order**: 6.4 (CI/CD) → 6.1 (stable API) → 6.3 (performance) → 6.2 (incremental) → 6.5 (custom queries)

**local-rag impact**: Incremental re-chunking with chunk diffs lets local-rag do surgical index updates instead of re-indexing entire files. The integration test in CI prevents regressions at the boundary.

---

## Stretch Goals

These are ideas worth exploring but not committed to a timeline.

- [ ] **WASM build** — compile bun-chunk to run in browsers for client-side RAG demos and playgrounds
- [ ] **Language auto-detection** — detect language from file content (shebang, heuristics) when no extension is available
- [ ] **Deduplication** — identify near-duplicate chunks across files (re-exported types, copy-pasted utilities)
- [ ] **VS Code extension** — visualize chunk boundaries inline in the editor, preview chunk output
- [ ] **Tree-sitter query playground** — interactive tool for writing and testing custom queries against sample files
