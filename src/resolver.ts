import { existsSync, statSync } from "fs";
import { resolve, dirname, join, extname } from "path";
import type { Language } from "./types";

/**
 * Resolve a relative import specifier to a file path.
 * Returns undefined for bare/package imports (e.g., "react", "fs").
 */
export function resolveImport(
  specifier: string,
  fromFile: string,
  projectRoot: string,
  language: Language | null,
  tsConfig?: TsConfig,
): string | undefined {
  // Skip bare/package imports
  if (!isRelativeImport(specifier, language)) {
    return undefined;
  }

  const fromDir = dirname(fromFile);

  // Language-specific resolution
  switch (language) {
    case "typescript":
    case "javascript":
      return resolveJsTs(specifier, fromDir, projectRoot, tsConfig);
    case "python":
      return resolvePython(specifier, fromDir, projectRoot);
    case "go":
      // Go uses package paths, not relative imports in the same way
      return undefined;
    case "rust":
      return resolveRust(specifier, fromDir, projectRoot);
    default:
      return resolveGeneric(specifier, fromDir);
  }
}

/** Minimal tsconfig.json paths support */
export interface TsConfig {
  baseUrl?: string;
  paths?: Record<string, string[]>;
}

/** Load tsconfig.json from a project root */
export function loadTsConfig(projectRoot: string): TsConfig | undefined {
  const configPath = join(projectRoot, "tsconfig.json");
  if (!existsSync(configPath)) return undefined;

  try {
    const raw = require(configPath);
    const compilerOptions = raw.compilerOptions ?? {};
    return {
      baseUrl: compilerOptions.baseUrl,
      paths: compilerOptions.paths,
    };
  } catch {
    return undefined;
  }
}

function isRelativeImport(specifier: string, language: Language | null): boolean {
  if (specifier.startsWith("./") || specifier.startsWith("../")) return true;

  // Python relative imports (from . import X, from ..pkg import Y)
  if (language === "python" && specifier.startsWith(".")) return true;

  // Rust mod/crate/self/super
  if (language === "rust") {
    if (specifier.startsWith("crate::") || specifier.startsWith("self::") || specifier.startsWith("super::")) {
      return true;
    }
  }

  return false;
}

/** Try candidate paths with various extensions */
function tryResolve(base: string, extensions: string[]): string | undefined {
  // Try exact path first — single stat call
  try {
    const s = statSync(base);
    if (s.isFile()) return base;
    if (s.isDirectory()) {
      for (const ext of extensions) {
        const indexPath = join(base, `index${ext}`);
        if (existsSync(indexPath)) return indexPath;
      }
    }
  } catch {
    // path doesn't exist — try with extensions
  }

  for (const ext of extensions) {
    const withExt = base + ext;
    if (existsSync(withExt)) return withExt;
  }

  return undefined;
}

function resolveJsTs(
  specifier: string,
  fromDir: string,
  projectRoot: string,
  tsConfig?: TsConfig,
): string | undefined {
  const jsExtensions = [".ts", ".tsx", ".js", ".jsx", ".mts", ".mjs", ".cts", ".cjs"];

  // Try relative path resolution
  if (specifier.startsWith("./") || specifier.startsWith("../")) {
    const absPath = resolve(fromDir, specifier);
    return tryResolve(absPath, jsExtensions);
  }

  // Try tsconfig paths
  if (tsConfig?.paths) {
    const baseDir = tsConfig.baseUrl ? resolve(projectRoot, tsConfig.baseUrl) : projectRoot;

    for (const [pattern, targets] of Object.entries(tsConfig.paths)) {
      const escaped = pattern.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const regex = new RegExp("^" + escaped.replace("\\*", "(.*)") + "$");
      const match = specifier.match(regex);
      if (match) {
        for (const target of targets) {
          const resolved = resolve(baseDir, target.replace("*", match[1] ?? ""));
          const result = tryResolve(resolved, jsExtensions);
          if (result) return result;
        }
      }
    }
  }

  // Try baseUrl
  if (tsConfig?.baseUrl) {
    const absPath = resolve(projectRoot, tsConfig.baseUrl, specifier);
    const result = tryResolve(absPath, jsExtensions);
    if (result) return result;
  }

  return undefined;
}

function resolvePython(
  specifier: string,
  fromDir: string,
  projectRoot: string,
): string | undefined {
  // Python relative imports: from .module import X → ./module.py
  if (specifier.startsWith(".")) {
    let dots = 0;
    while (dots < specifier.length && specifier[dots] === ".") dots++;
    const rest = specifier.slice(dots);

    let baseDir = fromDir;
    for (let i = 1; i < dots; i++) {
      baseDir = dirname(baseDir);
    }

    if (rest) {
      // from .module import X
      const modulePath = join(baseDir, rest.replace(/\./g, "/"));
      return tryResolve(modulePath, [".py", ".pyi"]) ??
        tryResolve(join(modulePath, "__init__"), [".py", ".pyi"]);
    } else {
      // from . import X
      return tryResolve(join(baseDir, "__init__"), [".py", ".pyi"]);
    }
  }

  return undefined;
}

function resolveRust(
  specifier: string,
  fromDir: string,
  projectRoot: string,
): string | undefined {
  // crate:: → project src/
  // self:: → current directory
  // super:: → parent directory
  let basePath: string;
  let rest: string;

  if (specifier.startsWith("crate::")) {
    basePath = join(projectRoot, "src");
    rest = specifier.slice("crate::".length);
  } else if (specifier.startsWith("self::")) {
    basePath = fromDir;
    rest = specifier.slice("self::".length);
  } else if (specifier.startsWith("super::")) {
    basePath = dirname(fromDir);
    rest = specifier.slice("super::".length);
  } else {
    return undefined;
  }

  // Convert path segments: foo::bar → foo/bar
  const segments = rest.split("::");
  // The last segment might be a symbol, not a file
  // Try full path first, then without last segment
  const fullPath = join(basePath, ...segments);
  const result = tryResolve(fullPath, [".rs"]);
  if (result) return result;

  // Try without last segment (it's likely a symbol name)
  if (segments.length > 1) {
    const dirPath = join(basePath, ...segments.slice(0, -1));
    return tryResolve(dirPath, [".rs"]) ??
      tryResolve(join(dirPath, "mod"), [".rs"]);
  }

  return undefined;
}

function resolveGeneric(specifier: string, fromDir: string): string | undefined {
  if (!specifier.startsWith("./") && !specifier.startsWith("../")) return undefined;
  const absPath = resolve(fromDir, specifier);
  if (existsSync(absPath)) return absPath;
  return undefined;
}
