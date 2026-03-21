/** Supported languages */
export type Language = "typescript" | "javascript" | "python" | "rust" | "go" | "java";

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
  | "block"  // gap or merged block
  ;

export interface ChunkOptions {
  /** Maximum chunk size in lines. Default: 60 */
  maxLines?: number;
  /** Override automatic language detection */
  language?: Language;
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
};
