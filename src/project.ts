import { chunkFile } from "./stream";
import { chunkDirectory } from "./stream";
import { resolveImport, loadTsConfig, type TsConfig } from "./resolver";
import type { ChunkImport, ChunkExport, ChunkResult, ChunkOptions } from "./types";
import { EXTENSION_MAP } from "./types";
import { extname } from "path";
import { resolve } from "path";

/** File-level import/export summary */
export interface FileContext {
  /** File path */
  filePath: string;
  /** Chunk result for this file */
  result: ChunkResult;
  /** All imports with resolved paths */
  imports: ChunkImport[];
  /** All exports */
  exports: ChunkExport[];
}

/** Cross-file relationship data */
export interface ProjectGraph {
  /** Which files import each file path */
  importedBy: Map<string, Set<string>>;
  /** Which files each file imports from */
  importsFrom: Map<string, Set<string>>;
}

/** Result of chunking an entire project */
export interface ProjectResult {
  /** All file contexts keyed by file path */
  files: Map<string, FileContext>;
  /** Cross-file import/export graph */
  graph: ProjectGraph;
  /** Total chunks across all files */
  totalChunks: number;
  /** Total files processed */
  totalFiles: number;
}

export interface ProjectOptions extends ChunkOptions {
  /** Glob pattern to filter files */
  glob?: string;
  /** Additional directory names to ignore */
  ignore?: string[];
  /** Progress callback */
  onProgress?: (info: { filepath: string; chunkCount: number; fileIndex: number; totalFiles: number }) => void;
  /** Whether to resolve import paths (default: true) */
  resolveImports?: boolean;
}

/**
 * Chunk an entire project with cross-file context.
 * Resolves relative imports to file paths and builds an import/export graph.
 */
export async function chunkProject(
  dirpath: string,
  options: ProjectOptions = {},
): Promise<ProjectResult> {
  const { glob, ignore, onProgress, resolveImports: shouldResolve = true, ...chunkOptions } = options;
  const projectRoot = resolve(dirpath);

  // First, chunk all files
  const dirResult = await chunkDirectory(dirpath, {
    ...chunkOptions,
    glob,
    ignore,
    onProgress,
  });

  // Load tsconfig if available
  let tsConfig: TsConfig | undefined;
  if (shouldResolve) {
    tsConfig = loadTsConfig(projectRoot);
  }

  // Build file contexts with resolved imports
  const files = new Map<string, FileContext>();
  const importedBy = new Map<string, Set<string>>();
  const importsFrom = new Map<string, Set<string>>();

  for (const [filepath, result] of dirResult.files) {
    const language = EXTENSION_MAP[extname(filepath).toLowerCase()] ?? null;

    // Resolve import paths
    const resolvedImports = result.fileImports.map(imp => {
      if (!shouldResolve) return imp;

      const resolved = resolveImport(imp.source, filepath, projectRoot, language, tsConfig);
      if (resolved) {
        return { ...imp, resolvedPath: resolved };
      }
      return imp;
    });

    files.set(filepath, {
      filePath: filepath,
      result: { ...result, fileImports: resolvedImports },
      imports: resolvedImports,
      exports: result.fileExports,
    });

    // Build graph edges
    for (const imp of resolvedImports) {
      if (imp.resolvedPath) {
        // This file imports from resolvedPath
        if (!importsFrom.has(filepath)) importsFrom.set(filepath, new Set());
        importsFrom.get(filepath)!.add(imp.resolvedPath);

        // resolvedPath is imported by this file
        if (!importedBy.has(imp.resolvedPath)) importedBy.set(imp.resolvedPath, new Set());
        importedBy.get(imp.resolvedPath)!.add(filepath);
      }
    }
  }

  // Enrich chunks with cross-file data
  for (const [filepath, ctx] of files) {
    const usedByFiles = importedBy.get(filepath);
    if (usedByFiles && ctx.result.chunks.length > 0) {
      // Find export chunks and annotate with usedBy
      for (const chunk of ctx.result.chunks) {
        if (chunk.exports && chunk.exports.length > 0) {
          (chunk as any).usedBy = [...usedByFiles];
        }
      }
    }

    // For import chunks, annotate with definedIn
    for (const chunk of ctx.result.chunks) {
      if (chunk.imports) {
        for (const imp of chunk.imports) {
          if (imp.resolvedPath) {
            (chunk as any).definedIn = imp.resolvedPath;
          }
        }
      }
    }
  }

  return {
    files,
    graph: { importedBy, importsFrom },
    totalChunks: dirResult.totalChunks,
    totalFiles: dirResult.totalFiles,
  };
}
