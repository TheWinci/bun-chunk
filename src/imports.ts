import type { Node as SyntaxNode, Tree } from "web-tree-sitter";
import type { ChunkImport, ChunkExport, ChunkType, Language } from "./types";

/**
 * Extract structured imports from a chunk's AST node or text.
 * Works across all supported languages.
 */
export function extractImports(text: string, language: Language): ChunkImport[] {
  switch (language) {
    case "typescript":
    case "javascript":
      return extractJSImports(text);
    case "python":
      return extractPythonImports(text);
    case "rust":
      return extractRustImports(text);
    case "go":
      return extractGoImports(text);
    case "java":
      return extractJavaImports(text);
    case "c":
    case "cpp":
      return extractCImports(text);
    case "csharp":
      return extractCSharpImports(text);
    case "ruby":
      return extractRubyImports(text);
    case "php":
      return extractPHPImports(text);
    case "scala":
      return extractScalaImports(text);
    case "css":
      return extractCSSImports(text);
    default:
      return [];
  }
}

/**
 * Extract structured exports from a chunk's text and entity info.
 */
export function extractExports(
  text: string,
  language: Language,
  entityType: ChunkType,
  entityName: string | null,
): ChunkExport[] {
  switch (language) {
    case "typescript":
    case "javascript":
      return extractJSExports(text, entityType, entityName);
    case "python":
      return extractPythonExports(text, entityType, entityName);
    case "rust":
      return extractRustExports(text, entityType, entityName);
    case "go":
      return extractGoExports(text, entityType, entityName);
    case "java":
      return extractJavaExports(text, entityType, entityName);
    case "c":
    case "cpp":
      return extractCExports(text, entityType, entityName);
    case "csharp":
      return extractCSharpExports(text, entityType, entityName);
    case "ruby":
      return extractRubyExports(text, entityType, entityName);
    case "php":
      return extractPHPExports(text, entityType, entityName);
    case "scala":
      return extractScalaExports(text, entityType, entityName);
    default:
      return [];
  }
}

// --- JavaScript / TypeScript ---

function extractJSImports(text: string): ChunkImport[] {
  const imports: ChunkImport[] = [];

  // import defaultExport from "source"
  // import { named1, named2 } from "source"
  // import * as namespace from "source"
  // import defaultExport, { named } from "source"
  const importRegex = /import\s+(?:(?:type\s+)?(?:(\w+)(?:\s*,\s*)?)?(?:\{([^}]*)\})?(?:(\*)\s+as\s+(\w+))?)\s+from\s+["']([^"']+)["']/g;

  let match: RegExpExecArray | null;
  while ((match = importRegex.exec(text)) !== null) {
    const [, defaultName, namedStr, star, namespaceName, source] = match;

    if (defaultName) {
      imports.push({ name: defaultName, source, isDefault: true, isNamespace: false });
    }

    if (star && namespaceName) {
      imports.push({ name: namespaceName, source, isDefault: false, isNamespace: true });
    }

    if (namedStr) {
      // Split named imports, handling inline type imports like "type Foo"
      const items = namedStr.split(",").map(s => s.trim()).filter(Boolean);
      for (const item of items) {
        // Skip type-only imports: "type Foo", "type Foo as Bar"
        if (/^type\s+\w/.test(item)) continue;
        const parts = item.split(/\s+as\s+/);
        const name = parts[parts.length - 1].trim();
        if (name) {
          imports.push({ name, source, isDefault: false, isNamespace: false });
        }
      }
    }
  }

  // Side-effect imports: import "source"
  const sideEffectRegex = /import\s+["']([^"']+)["']/g;
  while ((match = sideEffectRegex.exec(text)) !== null) {
    // Only match if not already captured above
    const source = match[1];
    if (!imports.some(i => i.source === source)) {
      imports.push({ name: "*", source, isDefault: false, isNamespace: false });
    }
  }

  // require() calls
  const requireRegex = /(?:const|let|var)\s+(?:(\w+)|\{([^}]*)\})\s*=\s*require\s*\(\s*["']([^"']+)["']\s*\)/g;
  while ((match = requireRegex.exec(text)) !== null) {
    const [, defaultName, namedStr, source] = match;
    if (defaultName) {
      imports.push({ name: defaultName, source, isDefault: true, isNamespace: false });
    }
    if (namedStr) {
      const names = namedStr.split(",").map(s => s.trim().split(/\s*:\s*/)[0].trim()).filter(Boolean);
      for (const name of names) {
        imports.push({ name, source, isDefault: false, isNamespace: false });
      }
    }
  }

  return imports;
}

function extractJSExports(text: string, entityType: ChunkType, entityName: string | null): ChunkExport[] {
  const exports: ChunkExport[] = [];

  // Direct declaration exports: export class Foo, export function bar, export const x
  if (/^\s*export\s+(default\s+)?/.test(text) && entityName) {
    const isDefault = /^\s*export\s+default\s+/.test(text);
    exports.push({
      name: entityName,
      type: entityType === "export" ? "variable" : entityType,
      isDefault,
      isReExport: false,
    });
  }

  // Re-exports: export { foo, bar } from "./source"
  const reExportRegex = /export\s+\{([^}]*)\}\s+from\s+["']([^"']+)["']/g;
  let match: RegExpExecArray | null;
  while ((match = reExportRegex.exec(text)) !== null) {
    const [, namedStr, source] = match;
    const names = namedStr.split(",").map(s => {
      const parts = s.trim().split(/\s+as\s+/);
      return parts[parts.length - 1].trim();
    }).filter(Boolean);
    for (const name of names) {
      if (name === "type") continue;
      exports.push({
        name,
        type: "variable",
        isDefault: name === "default",
        isReExport: true,
        reExportSource: source,
      });
    }
  }

  // Named export list: export { foo, bar }
  if (!exports.length) {
    const exportListRegex = /export\s+\{([^}]*)\}(?!\s+from)/g;
    while ((match = exportListRegex.exec(text)) !== null) {
      const names = match[1].split(",").map(s => {
        const parts = s.trim().split(/\s+as\s+/);
        return parts[parts.length - 1].trim();
      }).filter(Boolean);
      for (const name of names) {
        exports.push({
          name,
          type: "variable",
          isDefault: name === "default",
          isReExport: false,
        });
      }
    }
  }

  // export * from "./source"
  const starReExportRegex = /export\s+\*\s+(?:as\s+(\w+)\s+)?from\s+["']([^"']+)["']/g;
  while ((match = starReExportRegex.exec(text)) !== null) {
    const [, asName, source] = match;
    exports.push({
      name: asName ?? "*",
      type: "module",
      isDefault: false,
      isReExport: true,
      reExportSource: source,
    });
  }

  return exports;
}

// --- Python ---

function extractPythonImports(text: string): ChunkImport[] {
  const imports: ChunkImport[] = [];

  // from module import name1, name2
  const fromImportRegex = /from\s+([\w.]+)\s+import\s+(.+)/g;
  let match: RegExpExecArray | null;
  while ((match = fromImportRegex.exec(text)) !== null) {
    const [, source, namesStr] = match;
    // Handle parenthesized imports
    const cleanNames = namesStr.replace(/[()]/g, "");
    const names = cleanNames.split(",").map(s => {
      const parts = s.trim().split(/\s+as\s+/);
      return parts[parts.length - 1].trim();
    }).filter(n => n && n !== "\\");
    for (const name of names) {
      imports.push({ name, source, isDefault: false, isNamespace: false });
    }
  }

  // import module, import module as alias
  const importRegex = /^import\s+(.+)/gm;
  while ((match = importRegex.exec(text)) !== null) {
    const modules = match[1].split(",").map(s => s.trim());
    for (const mod of modules) {
      const parts = mod.split(/\s+as\s+/);
      const name = parts[parts.length - 1].trim();
      const source = parts[0].trim();
      if (name && source) {
        imports.push({ name, source, isDefault: false, isNamespace: parts.length > 1 });
      }
    }
  }

  return imports;
}

function extractPythonExports(text: string, entityType: ChunkType, entityName: string | null): ChunkExport[] {
  // Python doesn't have explicit exports — public symbols are those without _ prefix
  if (entityName && !entityName.startsWith("_") && entityType !== "import") {
    return [{
      name: entityName,
      type: entityType,
      isDefault: false,
      isReExport: false,
    }];
  }
  return [];
}

// --- Rust ---

function extractRustImports(text: string): ChunkImport[] {
  const imports: ChunkImport[] = [];

  // use std::fs; use std::path::Path; use crate::foo::{bar, baz};
  const useRegex = /use\s+([\w:]+)(?:::\{([^}]*)\})?(?:\s+as\s+(\w+))?/g;
  let match: RegExpExecArray | null;
  while ((match = useRegex.exec(text)) !== null) {
    const [, path, namedStr, alias] = match;
    const source = path;

    if (namedStr) {
      const names = namedStr.split(",").map(s => {
        const parts = s.trim().split(/\s+as\s+/);
        return parts[parts.length - 1].trim();
      }).filter(Boolean);
      for (const name of names) {
        imports.push({ name, source, isDefault: false, isNamespace: false });
      }
    } else {
      const name = alias ?? path.split("::").pop() ?? path;
      imports.push({ name, source, isDefault: false, isNamespace: false });
    }
  }

  return imports;
}

function extractRustExports(text: string, entityType: ChunkType, entityName: string | null): ChunkExport[] {
  if (entityName && /^pub\s/m.test(text) && entityType !== "import") {
    const isPubUse = /^pub\s+use\s/m.test(text);
    return [{
      name: entityName,
      type: entityType,
      isDefault: false,
      isReExport: isPubUse,
      reExportSource: isPubUse ? text.match(/pub\s+use\s+([\w:]+)/)?.[1] : undefined,
    }];
  }
  return [];
}

// --- Go ---

function extractGoImports(text: string): ChunkImport[] {
  const imports: ChunkImport[] = [];
  const seen = new Set<string>();

  function addImport(alias: string | undefined, source: string) {
    if (seen.has(source)) return;
    seen.add(source);
    const name = alias ?? source.split("/").pop() ?? source;
    imports.push({ name, source, isDefault: false, isNamespace: alias === "." });
  }

  // Grouped imports (check first to track which sources are in groups)
  const groupRegex = /import\s+\(([^)]*)\)/gs;
  let match: RegExpExecArray | null;
  while ((match = groupRegex.exec(text)) !== null) {
    const body = match[1];
    const lineRegex = /(?:(\w+)\s+)?"([^"]+)"/g;
    let lineMatch: RegExpExecArray | null;
    while ((lineMatch = lineRegex.exec(body)) !== null) {
      addImport(lineMatch[1], lineMatch[2]);
    }
  }

  // Single import: import "fmt" / import f "fmt"
  const singleRegex = /import\s+(?:(\w+)\s+)?"([^"]+)"/g;
  while ((match = singleRegex.exec(text)) !== null) {
    addImport(match[1], match[2]);
  }

  return imports;
}

function extractGoExports(text: string, entityType: ChunkType, entityName: string | null): ChunkExport[] {
  // Go exports are capitalized identifiers
  if (entityName && /^[A-Z]/.test(entityName) && entityType !== "import" && entityType !== "package") {
    return [{
      name: entityName,
      type: entityType,
      isDefault: false,
      isReExport: false,
    }];
  }
  return [];
}

// --- Java ---

function extractJavaImports(text: string): ChunkImport[] {
  const imports: ChunkImport[] = [];

  const importRegex = /import\s+(?:static\s+)?([\w.]+(?:\.\*)?)\s*;/g;
  let match: RegExpExecArray | null;
  while ((match = importRegex.exec(text)) !== null) {
    const fullPath = match[1];
    const isWildcard = fullPath.endsWith(".*");
    const name = isWildcard ? "*" : (fullPath.split(".").pop() ?? fullPath);
    const source = isWildcard ? fullPath.slice(0, -2) : fullPath.split(".").slice(0, -1).join(".");
    imports.push({
      name,
      source,
      isDefault: false,
      isNamespace: isWildcard,
    });
  }

  return imports;
}

function extractJavaExports(text: string, entityType: ChunkType, entityName: string | null): ChunkExport[] {
  if (entityName && /\bpublic\b/.test(text) && entityType !== "import" && entityType !== "package") {
    return [{
      name: entityName,
      type: entityType,
      isDefault: false,
      isReExport: false,
    }];
  }
  return [];
}

// --- C / C++ ---

function extractCImports(text: string): ChunkImport[] {
  const imports: ChunkImport[] = [];

  // #include <header.h> or #include "header.h"
  const includeRegex = /#include\s+[<"]([^>"]+)[>"]/g;
  let match: RegExpExecArray | null;
  while ((match = includeRegex.exec(text)) !== null) {
    const source = match[1];
    const name = source.split("/").pop()?.replace(/\.\w+$/, "") ?? source;
    imports.push({ name, source, isDefault: false, isNamespace: false });
  }

  return imports;
}

function extractCExports(text: string, entityType: ChunkType, entityName: string | null): ChunkExport[] {
  // C/C++ doesn't have explicit exports — all non-static top-level symbols are exported
  if (entityName && !/\bstatic\b/.test(text) && entityType !== "import") {
    return [{
      name: entityName,
      type: entityType,
      isDefault: false,
      isReExport: false,
    }];
  }
  return [];
}

// --- C# ---

function extractCSharpImports(text: string): ChunkImport[] {
  const imports: ChunkImport[] = [];

  const usingRegex = /using\s+(?:static\s+)?([\w.]+)\s*;/g;
  let match: RegExpExecArray | null;
  while ((match = usingRegex.exec(text)) !== null) {
    const source = match[1];
    const name = source.split(".").pop() ?? source;
    imports.push({ name, source, isDefault: false, isNamespace: false });
  }

  return imports;
}

function extractCSharpExports(text: string, entityType: ChunkType, entityName: string | null): ChunkExport[] {
  if (entityName && /\bpublic\b/.test(text) && entityType !== "import") {
    return [{
      name: entityName,
      type: entityType,
      isDefault: false,
      isReExport: false,
    }];
  }
  return [];
}

// --- Ruby ---

function extractRubyImports(text: string): ChunkImport[] {
  const imports: ChunkImport[] = [];

  const requireRegex = /require(?:_relative)?\s+["']([^"']+)["']/g;
  let match: RegExpExecArray | null;
  while ((match = requireRegex.exec(text)) !== null) {
    const source = match[1];
    const name = source.split("/").pop() ?? source;
    imports.push({ name, source, isDefault: false, isNamespace: false });
  }

  return imports;
}

function extractRubyExports(text: string, entityType: ChunkType, entityName: string | null): ChunkExport[] {
  // Ruby doesn't have explicit exports — all classes/modules are public by default
  if (entityName && entityType !== "import") {
    return [{
      name: entityName,
      type: entityType,
      isDefault: false,
      isReExport: false,
    }];
  }
  return [];
}

// --- PHP ---

function extractPHPImports(text: string): ChunkImport[] {
  const imports: ChunkImport[] = [];

  const useRegex = /use\s+([\w\\]+)(?:\s+as\s+(\w+))?\s*;/g;
  let match: RegExpExecArray | null;
  while ((match = useRegex.exec(text)) !== null) {
    const source = match[1];
    const alias = match[2];
    const name = alias ?? source.split("\\").pop() ?? source;
    imports.push({ name, source, isDefault: false, isNamespace: false });
  }

  return imports;
}

function extractPHPExports(text: string, entityType: ChunkType, entityName: string | null): ChunkExport[] {
  // PHP public classes/functions are exported by default
  if (entityName && entityType !== "import" && entityType !== "module") {
    return [{
      name: entityName,
      type: entityType,
      isDefault: false,
      isReExport: false,
    }];
  }
  return [];
}

// --- Scala ---

function extractScalaImports(text: string): ChunkImport[] {
  const imports: ChunkImport[] = [];

  const importRegex = /import\s+([\w.]+)(?:\.(\{[^}]+\}|_|\*))?/g;
  let match: RegExpExecArray | null;
  while ((match = importRegex.exec(text)) !== null) {
    const basePath = match[1];
    const selector = match[2];

    if (selector?.startsWith("{")) {
      const names = selector.slice(1, -1).split(",").map(s => {
        const parts = s.trim().split(/\s*=>\s*/);
        return parts[parts.length - 1].trim();
      }).filter(n => n && n !== "_");
      for (const name of names) {
        imports.push({ name, source: basePath, isDefault: false, isNamespace: false });
      }
    } else if (selector === "_" || selector === "*") {
      imports.push({ name: "*", source: basePath, isDefault: false, isNamespace: true });
    } else {
      const name = basePath.split(".").pop() ?? basePath;
      imports.push({ name, source: basePath, isDefault: false, isNamespace: false });
    }
  }

  return imports;
}

function extractScalaExports(text: string, entityType: ChunkType, entityName: string | null): ChunkExport[] {
  // Scala: public by default unless marked private/protected
  if (entityName && !/\b(private|protected)\b/.test(text) && entityType !== "import" && entityType !== "package") {
    return [{
      name: entityName,
      type: entityType,
      isDefault: false,
      isReExport: false,
    }];
  }
  return [];
}

// --- CSS ---

function extractCSSImports(text: string): ChunkImport[] {
  const imports: ChunkImport[] = [];

  const importRegex = /@import\s+(?:url\s*\(\s*)?["']([^"']+)["'](?:\s*\))?/g;
  let match: RegExpExecArray | null;
  while ((match = importRegex.exec(text)) !== null) {
    const source = match[1];
    const name = source.split("/").pop()?.replace(/\.\w+$/, "") ?? source;
    imports.push({ name, source, isDefault: false, isNamespace: false });
  }

  return imports;
}
