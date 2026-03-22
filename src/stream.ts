import { chunk } from "./chunker";
import type { Chunk, ChunkOptions, ChunkResult } from "./types";
import { EXTENSION_MAP } from "./types";
import { extname } from "path";

/** Yield chunks one at a time as an async generator */
export async function* chunkStream(
  filepath: string,
  code: string,
  options: ChunkOptions = {},
): AsyncGenerator<Chunk> {
  const result = await chunk(filepath, code, options);
  for (const c of result.chunks) {
    yield c;
  }
}

/** Read a file from disk and chunk it. Uses Bun.file() for fast reading. */
export async function chunkFile(
  filepath: string,
  options: ChunkOptions = {},
): Promise<ChunkResult> {
  const file = Bun.file(filepath);
  const code = await file.text();
  return chunk(filepath, code, options);
}

/** Stream chunks from a file on disk */
export async function* chunkFileStream(
  filepath: string,
  options: ChunkOptions = {},
): AsyncGenerator<Chunk> {
  const file = Bun.file(filepath);
  const code = await file.text();
  yield* chunkStream(filepath, code, options);
}

/** Default directories and files to skip */
const DEFAULT_IGNORE = new Set([
  "node_modules",
  ".git",
  ".svn",
  ".hg",
  "dist",
  "build",
  "out",
  ".next",
  ".nuxt",
  ".cache",
  "__pycache__",
  ".tox",
  ".venv",
  "venv",
  "target",        // Rust/Java
  "vendor",        // Go
  ".DS_Store",
]);

/** Check if a file extension is supported */
function isSupportedFile(filepath: string): boolean {
  const ext = extname(filepath).toLowerCase();
  return ext in EXTENSION_MAP;
}

export interface DirectoryOptions extends ChunkOptions {
  /** Glob pattern to filter files */
  glob?: string;
  /** Additional directory names to ignore */
  ignore?: string[];
  /** Progress callback — called after each file is processed */
  onProgress?: (info: { filepath: string; chunkCount: number; fileIndex: number; totalFiles: number }) => void;
}

export interface DirectoryResult {
  /** All chunk results keyed by file path */
  files: Map<string, ChunkResult>;
  /** Total number of chunks across all files */
  totalChunks: number;
  /** Total number of files processed */
  totalFiles: number;
}

/** Recursively discover supported files in a directory */
async function discoverFiles(
  dirpath: string,
  ignoreSet: Set<string>,
  globPattern?: string,
): Promise<string[]> {
  const glob = new Bun.Glob(globPattern ?? "**/*");
  const files: string[] = [];

  for await (const entry of glob.scan({ cwd: dirpath, dot: false })) {
    // Check if any path segment is in the ignore set
    const segments = entry.split("/");
    if (segments.some(s => ignoreSet.has(s))) continue;

    const fullPath = `${dirpath}/${entry}`;
    if (isSupportedFile(entry)) {
      files.push(fullPath);
    }
  }

  return files.sort();
}

/**
 * Chunk all supported files in a directory.
 *
 * @param dirpath - Directory path to scan
 * @param options - Chunking and directory options
 * @returns DirectoryResult with all file results
 */
export async function chunkDirectory(
  dirpath: string,
  options: DirectoryOptions = {},
): Promise<DirectoryResult> {
  const { glob: globPattern, ignore, onProgress, ...chunkOptions } = options;

  const ignoreSet = new Set([...DEFAULT_IGNORE, ...(ignore ?? [])]);
  const filePaths = await discoverFiles(dirpath, ignoreSet, globPattern);

  const files = new Map<string, ChunkResult>();
  let totalChunks = 0;

  for (let i = 0; i < filePaths.length; i++) {
    const filepath = filePaths[i];
    try {
      const result = await chunkFile(filepath, chunkOptions);
      files.set(filepath, result);
      totalChunks += result.chunks.length;

      onProgress?.({
        filepath,
        chunkCount: result.chunks.length,
        fileIndex: i,
        totalFiles: filePaths.length,
      });
    } catch {
      // Skip files that fail to read/parse
    }
  }

  return { files, totalChunks, totalFiles: files.size };
}

/** Stream chunks from all supported files in a directory */
export async function* chunkDirectoryStream(
  dirpath: string,
  options: DirectoryOptions = {},
): AsyncGenerator<Chunk & { filePath: string }> {
  const { glob: globPattern, ignore, onProgress, ...chunkOptions } = options;

  const ignoreSet = new Set([...DEFAULT_IGNORE, ...(ignore ?? [])]);
  const filePaths = await discoverFiles(dirpath, ignoreSet, globPattern);

  for (let i = 0; i < filePaths.length; i++) {
    const filepath = filePaths[i];
    try {
      const result = await chunkFile(filepath, chunkOptions);
      for (const c of result.chunks) {
        yield { ...c, filePath: filepath };
      }

      onProgress?.({
        filepath,
        chunkCount: result.chunks.length,
        fileIndex: i,
        totalFiles: filePaths.length,
      });
    } catch {
      // Skip files that fail to read/parse
    }
  }
}
