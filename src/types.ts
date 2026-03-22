/** Supported languages */
export type Language =
  | "typescript" | "javascript" | "python" | "rust" | "go" | "java"
  | "c" | "cpp" | "csharp" | "ruby" | "php" | "scala"
  | "html" | "css";

/** A structured import extracted from a chunk */
export interface ChunkImport {
  /** Imported name (e.g., "readFile", "Config") */
  name: string;
  /** Module specifier (e.g., "fs/promises", "./utils") */
  source: string;
  /** Whether this is a default import */
  isDefault: boolean;
  /** Whether this is a namespace import (import * as X) */
  isNamespace: boolean;
}

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
  | "heading"
  | "element"
  | "object"
  | "companion"
  | "protocol"
  | "extension"
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
};
