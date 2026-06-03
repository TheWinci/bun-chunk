/** Supported languages */
export type Language =
  | "typescript" | "javascript" | "python" | "rust" | "go" | "java"
  | "c" | "cpp" | "csharp" | "ruby" | "php" | "scala"
  | "html" | "css"
  | "kotlin" | "lua" | "zig" | "elixir"
  | "bash" | "toml" | "yaml" | "haskell" | "ocaml"
  | "dart";

/** A structured import extracted from a chunk */
export interface ChunkImport {
  /** Local binding name as referenced in code (e.g., "readFile", "Config").
   *  For an aliased import (`import { getDB as g }`) this is the alias ("g") —
   *  the original source name is in `imported`. */
  name: string;
  /** Original source name when the import is aliased — e.g. for
   *  `import { getDB as g }`, `name` is "g" and `imported` is "getDB". Omitted
   *  when there's no alias (the binding already equals the source name). Lets
   *  consumers map an aliased call site back to the real symbol. */
  imported?: string;
  /** Module specifier (e.g., "fs/promises", "./utils") */
  source: string;
  /** Whether this is a default import */
  isDefault: boolean;
  /** Whether this is a namespace import (import * as X) */
  isNamespace: boolean;
  /** Resolved file path (populated by cross-file resolution) */
  resolvedPath?: string;
}

/** Identifier references aggregated as `{ name -> sorted lines }`. Compact
 *  shape chosen over `Array<{ name, line }>` to cut JSON payload (measured
 *  126% → 19% growth on a 1347-file corpus after also dropping the
 *  file-level aggregate). Lines are 0-indexed within the file. Consumers
 *  needing a file-level view aggregate from `chunk.references` directly —
 *  chunks cover all non-blank source lines. */
export type ChunkReferences = Record<string, number[]>;

/** A structured export extracted from a chunk */
export interface ChunkExport {
  /** Exported symbol name */
  name: string;
  /** Entity type (function, class, interface, etc.) */
  type: ChunkType;
  /** Whether this is the default export */
  isDefault: boolean;
  /** Whether this is a re-export from another module */
  isReExport: boolean;
  /** Source module if this is a re-export */
  reExportSource?: string;
}

/** Result of chunking a file — includes chunks and file-level metadata */
export interface ChunkResult {
  /** The chunks extracted from the file */
  chunks: Chunk[];
  /** All imports aggregated across the file */
  fileImports: ChunkImport[];
  /** All exports aggregated across the file */
  fileExports: ChunkExport[];
}

/** A single chunk extracted from source code */
export interface Chunk {
  /** Raw chunk text */
  text: string;
  /** 0-indexed inclusive start line */
  startLine: number;
  /** 0-indexed inclusive end line */
  endLine: number;
  /** Entity type if this chunk is a single entity */
  type: ChunkType;
  /** Entity name if available */
  name: string | null;
  /** Structured imports (populated on import chunks) */
  imports?: ChunkImport[];
  /** Structured exports (populated on export/declaration chunks) */
  exports?: ChunkExport[];
  /** Identifier references inside this chunk (excludes self-declaration and imports/exports) */
  references?: ChunkReferences;
  /** Parent scope chain when context injection is enabled (e.g., ["JsonParser", "parse"]) */
  context?: string[];
  /** Name of the enclosing entity when this chunk is a child (e.g., class name for a method) */
  parentName?: string;
  /** Detected language */
  language?: string;
  /** Source file path */
  filePath?: string;
  /** Content hash for deduplication */
  hash?: string;
  /** Files that import this chunk's exports (populated by chunkProject) */
  usedBy?: string[];
  /** Resolved file paths where this chunk's imports are defined (populated by chunkProject) */
  definedIn?: string[];
}

export type ChunkType =
  | "function"
  | "class"
  | "interface"
  | "type"
  | "enum"
  | "import"
  | "export"
  | "module"
  | "struct"
  | "trait"
  | "impl"
  | "constant"
  | "variable"
  | "method"
  | "field"
  | "package"
  | "record"
  | "annotation_type"
  | "property"
  | "selector"
  | "rule"
  | "section"
  | "element"
  | "block"  // gap or merged block
  ;

/** Chunking strategy */
export type ChunkStrategy = "semantic" | "fixed" | "hybrid";

export interface ChunkOptions {
  /** Maximum chunk size in lines. Default: 60 */
  maxLines?: number;
  /** Override automatic language detection */
  language?: Language;
  /** Include parent scope context in child chunks. Default: false */
  includeContext?: boolean;
  /** Include metadata (language, filePath, hash) in chunks. Default: false */
  includeMetadata?: boolean;
  /** Number of lines to overlap between adjacent line-based chunks. Default: 0 */
  overlap?: number;
  /** Chunking strategy. Default: "semantic" */
  strategy?: ChunkStrategy;
  /** Emit identifier references on chunks. Default: true.
   *  Measured ~19% JSON payload overhead with the compact
   *  `Record<name, line[]>` shape (down from ~126% on the naive shape).
   *  Most consumers want this — call graphs, cross-symbol resolution,
   *  entry-point discovery. Pure embedding pipelines that need raw chunks
   *  only can pass `false` to opt out and skip the extra tree-sitter pass. */
  includeReferences?: boolean;
}

/** File extension to language mapping */
export const EXTENSION_MAP: Record<string, Language> = {
  ".ts": "typescript",
  ".tsx": "typescript",
  ".mts": "typescript",
  ".cts": "typescript",
  ".js": "javascript",
  ".jsx": "javascript",
  ".mjs": "javascript",
  ".cjs": "javascript",
  ".py": "python",
  ".pyi": "python",
  ".rs": "rust",
  ".go": "go",
  ".java": "java",
  ".c": "c",
  ".h": "c",
  ".cpp": "cpp",
  ".cc": "cpp",
  ".cxx": "cpp",
  ".hpp": "cpp",
  ".hh": "cpp",
  ".hxx": "cpp",
  ".cs": "csharp",
  ".rb": "ruby",
  ".php": "php",
  ".scala": "scala",
  ".sc": "scala",
  ".html": "html",
  ".htm": "html",
  ".css": "css",
  ".scss": "css",
  ".less": "css",
  ".kt": "kotlin",
  ".kts": "kotlin",
  ".lua": "lua",
  ".zig": "zig",
  ".zon": "zig",
  ".ex": "elixir",
  ".exs": "elixir",
  ".sh": "bash",
  ".bash": "bash",
  ".zsh": "bash",
  ".toml": "toml",
  ".yaml": "yaml",
  ".yml": "yaml",
  ".hs": "haskell",
  ".lhs": "haskell",
  ".ml": "ocaml",
  ".mli": "ocaml",
  ".dart": "dart",
};
