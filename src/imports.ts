import type { Node as SyntaxNode, Tree } from "web-tree-sitter";
import type { ChunkImport, ChunkExport, ChunkType, Language } from "./types";

/**
 * Push an import, recording `imported` (the original source name) only when it
 * differs from the local binding `imp.name` — i.e. the import is aliased. This
 * lets consumers map an aliased reference back to the real exported symbol.
 */
function pushImport(out: ChunkImport[], imp: ChunkImport, imported?: string): void {
  if (imported && imported !== imp.name) imp.imported = imported;
  out.push(imp);
}

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
    case "kotlin":
      return extractKotlinImports(text);
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
    case "lua":
      return extractLuaImports(text);
    case "zig":
      return extractZigImports(text);
    case "elixir":
      return extractElixirImports(text);
    case "bash":
      return extractBashImports(text);
    case "haskell":
      return extractHaskellImports(text);
    case "ocaml":
      return extractOCamlImports(text);
    case "dart":
      return extractDartImports(text);
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
    case "kotlin":
      return extractKotlinExports(text, entityType, entityName);
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
    case "elixir":
      return extractElixirExports(text, entityType, entityName);
    case "zig":
      return extractZigExports(text, entityType, entityName);
    case "lua":
      return extractLuaExports(text, entityType, entityName);
    case "haskell":
      return extractHaskellExports(text, entityType, entityName);
    case "ocaml":
      return extractOCamlExports(text, entityType, entityName);
    case "dart":
      return extractDartExports(text, entityType, entityName);
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
          pushImport(imports, { name, source, isDefault: false, isNamespace: false }, parts[0].trim());
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
      // `{ a }` or renamed `{ a: b }` (property `a` bound locally as `b`).
      const items = namedStr.split(",").map(s => s.trim()).filter(Boolean);
      for (const item of items) {
        const parts = item.split(/\s*:\s*/);
        const name = parts[parts.length - 1].trim();
        if (name) {
          pushImport(imports, { name, source, isDefault: false, isNamespace: false }, parts[0].trim());
        }
      }
    }
  }

  return imports;
}

/**
 * Strip leading whitespace, line comments (`//`), and block comments
 * (`/* ... *\/`, including JSDoc) so an `export` keyword sitting after a
 * JSDoc block on an entity chunk still anchors a leading-export check.
 *
 * Without this, an entity chunk whose text begins with `/** ... *\/\nexport
 * function foo()` fails the `^\s*export` regex below and the export is
 * silently dropped — every JSDoc'd top-level export disappears from the
 * file's export list. Loop because chunks can stack a license header,
 * blank line, and a JSDoc above the declaration.
 */
/**
 * Remove every C-style comment from `text`. Used by modifier-keyword
 * extractors (Rust `pub`, Java/C# `public`, Zig `pub`, Scala/Kotlin
 * negative `private`/`protected`, C `static`) so a doc comment containing
 * the keyword cannot trigger a false-positive export.
 *
 * Example failure mode without this: a Rust chunk
 * `// pub later — see RFC-1234\nfn helper() {}` with `entityName = "helper"`
 * falsely matches `\bpub\b` and emits `helper` as a public export.
 *
 * String-literal collisions (e.g. `"http://x"`) are tolerated — a literal
 * containing `//` may eat into the rest of the line, but modifier-keyword
 * detection doesn't care about string content. Languages whose comments
 * don't follow C-style (Python `#`, Lua `--`, Haskell `--`/`{- -}`,
 * OCaml `(* *)`, Elixir `#`) call language-specific strippers instead.
 */
function stripCStyleComments(text: string): string {
  return text
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/\/\/[^\n]*/g, "");
}

function stripLeadingComments(text: string): string {
  let s = text;
  for (;;) {
    const trimmed = s.replace(/^\s+/, "");
    if (trimmed.startsWith("//")) {
      const nl = trimmed.indexOf("\n");
      s = nl < 0 ? "" : trimmed.slice(nl + 1);
      continue;
    }
    if (trimmed.startsWith("/*")) {
      const end = trimmed.indexOf("*/");
      if (end < 0) return trimmed;
      s = trimmed.slice(end + 2);
      continue;
    }
    // Tree-sitter sometimes splits a JSDoc into a preceding "block" chunk and
    // leaves the trailing `*/` (and any continuation `* …` lines) on the
    // declaration chunk. Drop those orphan fragments before the export check.
    if (trimmed.startsWith("*/")) {
      s = trimmed.slice(2);
      continue;
    }
    if (trimmed.startsWith("*")) {
      const nl = trimmed.indexOf("\n");
      s = nl < 0 ? "" : trimmed.slice(nl + 1);
      continue;
    }
    return trimmed;
  }
}

function extractJSExports(text: string, entityType: ChunkType, entityName: string | null): ChunkExport[] {
  const exports: ChunkExport[] = [];

  // Direct declaration exports: export class Foo, export function bar, export const x.
  // Strip leading comments first so JSDoc'd declarations still match.
  const head = stripLeadingComments(text);
  if (/^export\s+(default\s+)?/.test(head) && entityName) {
    const isDefault = /^export\s+default\s+/.test(head);
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
    const items = cleanNames.split(",").map(s => s.trim()).filter(s => s && s !== "\\");
    for (const item of items) {
      const parts = item.split(/\s+as\s+/);
      const name = parts[parts.length - 1].trim();
      if (name && name !== "\\") {
        pushImport(imports, { name, source, isDefault: false, isNamespace: false }, parts[0].trim());
      }
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
        const aliased = parts.length > 1;
        pushImport(
          imports,
          { name, source, isDefault: false, isNamespace: aliased },
          aliased ? (source.split(".").pop() ?? source) : undefined,
        );
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

  // use std::fs; use ::std::fmt; use crate::foo::{bar, baz as qux};
  // The path is matched segment-by-segment so it doesn't swallow the trailing
  // `::` before a `{ ... }` group (which would drop braced imports entirely); an
  // optional leading `::` (explicit crate root) is allowed.
  const useRegex = /use\s+((?:::)?\w+(?:::\w+)*)(?:::\{([^}]*)\})?(?:\s+as\s+(\w+))?/g;
  let match: RegExpExecArray | null;
  while ((match = useRegex.exec(text)) !== null) {
    const [, path, namedStr, alias] = match;
    const source = path;

    if (namedStr) {
      const items = namedStr.split(",").map(s => s.trim()).filter(Boolean);
      for (const item of items) {
        const parts = item.split(/\s+as\s+/);
        const name = parts[parts.length - 1].trim();
        if (name) {
          pushImport(imports, { name, source, isDefault: false, isNamespace: false }, parts[0].trim());
        }
      }
    } else {
      const original = path.split("::").pop() ?? path;
      const name = alias ?? original;
      pushImport(imports, { name, source, isDefault: false, isNamespace: false }, original);
    }
  }

  return imports;
}

function extractRustExports(text: string, entityType: ChunkType, entityName: string | null): ChunkExport[] {
  const code = stripCStyleComments(text);
  if (entityName && /^pub\s/m.test(code) && entityType !== "import") {
    const isPubUse = /^pub\s+use\s/m.test(code);
    return [{
      name: entityName,
      type: entityType,
      isDefault: false,
      isReExport: isPubUse,
      reExportSource: isPubUse ? code.match(/pub\s+use\s+([\w:]+)/)?.[1] : undefined,
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
    const original = source.split("/").pop() ?? source;
    const name = alias ?? original;
    pushImport(imports, { name, source, isDefault: false, isNamespace: alias === "." }, original);
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
  if (entityName && /\bpublic\b/.test(stripCStyleComments(text)) && entityType !== "import" && entityType !== "package") {
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
  if (entityName && !/\bstatic\b/.test(stripCStyleComments(text)) && entityType !== "import") {
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

  // Alias form first: using Alias = Namespace.Type;  (the plain regex below
  // requires `;` right after the path, so it won't double-match these.)
  const aliasRegex = /using\s+(\w+)\s*=\s*([\w.]+)\s*;/g;
  let match: RegExpExecArray | null;
  while ((match = aliasRegex.exec(text)) !== null) {
    const name = match[1];
    const source = match[2];
    const original = source.split(".").pop() ?? source;
    pushImport(imports, { name, source, isDefault: false, isNamespace: false }, original);
  }

  const usingRegex = /using\s+(?:static\s+)?([\w.]+)\s*;/g;
  while ((match = usingRegex.exec(text)) !== null) {
    const source = match[1];
    const name = source.split(".").pop() ?? source;
    imports.push({ name, source, isDefault: false, isNamespace: false });
  }

  return imports;
}

function extractCSharpExports(text: string, entityType: ChunkType, entityName: string | null): ChunkExport[] {
  if (entityName && /\bpublic\b/.test(stripCStyleComments(text)) && entityType !== "import") {
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
    const original = source.split("\\").pop() ?? source;
    const name = alias ?? original;
    pushImport(imports, { name, source, isDefault: false, isNamespace: false }, original);
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

  // Match the path segment-by-segment so it doesn't swallow the trailing `.`
  // before a `{ ... }` selector (which would drop braced imports entirely).
  const importRegex = /import\s+(\w+(?:\.\w+)*)(?:\.(\{[^}]+\}|_|\*))?/g;
  let match: RegExpExecArray | null;
  while ((match = importRegex.exec(text)) !== null) {
    const basePath = match[1];
    const selector = match[2];

    if (selector?.startsWith("{")) {
      // Scala renames use `=>`: import a.{B => C}
      const items = selector.slice(1, -1).split(",").map(s => s.trim()).filter(Boolean);
      for (const item of items) {
        const parts = item.split(/\s*=>\s*/);
        const name = parts[parts.length - 1].trim();
        if (name && name !== "_") {
          pushImport(imports, { name, source: basePath, isDefault: false, isNamespace: false }, parts[0].trim());
        }
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
  if (entityName && !/\b(private|protected)\b/.test(stripCStyleComments(text)) && entityType !== "import" && entityType !== "package") {
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

// --- Kotlin ---

function extractKotlinImports(text: string): ChunkImport[] {
  const imports: ChunkImport[] = [];

  // import com.example.Foo, import com.example.*, import com.example.Foo as Bar.
  // Segment-by-segment so the trailing `.` before `*` isn't swallowed (which
  // left the wildcard unparsed and the name empty).
  const importRegex = /import\s+(\w+(?:\.\w+)*(?:\.\*)?)(?:\s+as\s+(\w+))?/g;
  let match: RegExpExecArray | null;
  while ((match = importRegex.exec(text)) !== null) {
    const fullPath = match[1];
    const alias = match[2];
    const isWildcard = fullPath.endsWith(".*");
    const original = isWildcard ? "*" : (fullPath.split(".").pop() ?? fullPath);
    const name = alias ?? original;
    const source = isWildcard ? fullPath.slice(0, -2) : fullPath.split(".").slice(0, -1).join(".");
    pushImport(
      imports,
      { name, source, isDefault: false, isNamespace: isWildcard },
      original,
    );
  }

  return imports;
}

function extractKotlinExports(text: string, entityType: ChunkType, entityName: string | null): ChunkExport[] {
  // Kotlin: public by default unless marked private/protected/internal
  if (entityName && !/\b(private|protected|internal)\b/.test(stripCStyleComments(text)) && entityType !== "import" && entityType !== "package") {
    return [{
      name: entityName,
      type: entityType,
      isDefault: false,
      isReExport: false,
    }];
  }
  return [];
}

// --- Lua ---

function extractLuaImports(text: string): ChunkImport[] {
  const imports: ChunkImport[] = [];

  // local m = require("module"); or bare require("module")
  const requireRegex = /(?:local\s+(\w+)\s*=\s*)?require\s*[\(]?\s*["']([^"']+)["']\s*[\)]?/g;
  let match: RegExpExecArray | null;
  while ((match = requireRegex.exec(text)) !== null) {
    const binding = match[1];
    const source = match[2];
    const original = source.split(/[./]/).pop() ?? source;
    const name = binding ?? original;
    pushImport(imports, { name, source, isDefault: false, isNamespace: false }, original);
  }

  return imports;
}

function extractLuaExports(text: string, entityType: ChunkType, entityName: string | null): ChunkExport[] {
  // Lua doesn't have explicit exports — all top-level names are accessible
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

// --- Zig ---

function extractZigImports(text: string): ChunkImport[] {
  const imports: ChunkImport[] = [];

  // const std = @import("std");  (the binding name is the local alias)
  const importRegex = /(?:const|var)\s+(\w+)\s*=\s*@import\s*\(\s*"([^"]+)"\s*\)/g;
  let match: RegExpExecArray | null;
  while ((match = importRegex.exec(text)) !== null) {
    const name = match[1];
    const source = match[2];
    // Split on "/" only (not "."), else "foo.zig" → "zig". Strip the extension after.
    const original = source.split("/").pop()?.replace(/\.zig$/, "") ?? source;
    pushImport(imports, { name, source, isDefault: false, isNamespace: true }, original);
  }

  return imports;
}

function extractZigExports(text: string, entityType: ChunkType, entityName: string | null): ChunkExport[] {
  // Zig: pub keyword marks public symbols
  if (entityName && /\bpub\b/.test(stripCStyleComments(text)) && entityType !== "import") {
    return [{
      name: entityName,
      type: entityType,
      isDefault: false,
      isReExport: false,
    }];
  }
  return [];
}

// --- Elixir ---

function extractElixirImports(text: string): ChunkImport[] {
  const imports: ChunkImport[] = [];

  // import Module, alias Module, use Module, require Module,
  // alias Foo.Bar, as: Baz
  const importRegex = /(?:import|alias|use|require)\s+([\w.]+)(?:\s*,\s*as:\s*([\w.]+))?/g;
  let match: RegExpExecArray | null;
  while ((match = importRegex.exec(text)) !== null) {
    const source = match[1];
    const aliasMod = match[2];
    const original = source.split(".").pop() ?? source;
    const name = aliasMod ? (aliasMod.split(".").pop() ?? aliasMod) : original;
    pushImport(imports, { name, source, isDefault: false, isNamespace: false }, original);
  }

  return imports;
}

function extractElixirExports(text: string, entityType: ChunkType, entityName: string | null): ChunkExport[] {
  // Elixir: def is public, defp is private. Strip `#` line comments first
  // so a `# defp later` note above a `def` doesn't falsely flag it private.
  if (entityName && entityType !== "import") {
    const code = text.replace(/#[^\n]*/g, "");
    const isPrivate = /\bdefp\b/.test(code) || /\bdefmacrop\b/.test(code) || /\bdefguardp\b/.test(code);
    if (!isPrivate) {
      return [{
        name: entityName,
        type: entityType,
        isDefault: false,
        isReExport: false,
      }];
    }
  }
  return [];
}

// --- Bash ---

function extractBashImports(text: string): ChunkImport[] {
  const imports: ChunkImport[] = [];

  // source file.sh or . file.sh
  const sourceRegex = /(?:source|\.\s)\s+["']?([^\s"']+)["']?/g;
  let match: RegExpExecArray | null;
  while ((match = sourceRegex.exec(text)) !== null) {
    const source = match[1];
    const name = source.split("/").pop()?.replace(/\.sh$/, "") ?? source;
    imports.push({ name, source, isDefault: false, isNamespace: false });
  }

  return imports;
}

// --- Haskell ---

function extractHaskellImports(text: string): ChunkImport[] {
  const imports: ChunkImport[] = [];

  // import Module, import qualified Module as Alias, import Module (name1, name2)
  const importRegex = /import\s+(?:qualified\s+)?([\w.]+)(?:\s+as\s+(\w+))?(?:\s+\(([^)]*)\))?/g;
  let match: RegExpExecArray | null;
  while ((match = importRegex.exec(text)) !== null) {
    const source = match[1];
    const alias = match[2];
    const namedStr = match[3];

    if (namedStr) {
      const names = namedStr.split(",").map(s => s.trim().replace(/[()]/g, "")).filter(Boolean);
      for (const name of names) {
        imports.push({ name, source, isDefault: false, isNamespace: false });
      }
    } else {
      const original = source.split(".").pop() ?? source;
      const name = alias ?? original;
      pushImport(imports, { name, source, isDefault: false, isNamespace: !!alias }, original);
    }
  }

  return imports;
}

function extractHaskellExports(text: string, entityType: ChunkType, entityName: string | null): ChunkExport[] {
  // Haskell: all top-level bindings are exported unless there's an explicit module export list
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

// --- OCaml ---

function extractOCamlImports(text: string): ChunkImport[] {
  const imports: ChunkImport[] = [];

  // open Module
  const openRegex = /open\s+([\w.]+)/g;
  let match: RegExpExecArray | null;
  while ((match = openRegex.exec(text)) !== null) {
    const source = match[1];
    const name = source.split(".").pop() ?? source;
    imports.push({ name, source, isDefault: false, isNamespace: true });
  }

  // module M = Long.Path  (module alias). The RHS must be a module PATH
  // (uppercase first char), so `module M = struct … end` / `sig … end` and
  // functor applications `module M = Make(X)` are excluded.
  const moduleAliasRegex = /module\s+(\w+)\s*=\s*([A-Z][\w.]*)\b(?!\s*\()/g;
  while ((match = moduleAliasRegex.exec(text)) !== null) {
    const name = match[1];
    const source = match[2];
    const original = source.split(".").pop() ?? source;
    pushImport(imports, { name, source, isDefault: false, isNamespace: true }, original);
  }

  return imports;
}

function extractOCamlExports(text: string, entityType: ChunkType, entityName: string | null): ChunkExport[] {
  // OCaml: all top-level definitions are exported unless the .mli restricts them
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

// --- Dart ---

function extractDartImports(text: string): ChunkImport[] {
  const imports: ChunkImport[] = [];

  // import 'package:foo/foo.dart'; import 'dart:io'; import 'dart:io' as io;
  const importRegex = /import\s+['"]([^'"]+)['"](?:\s+as\s+(\w+))?\s*;/g;
  let match: RegExpExecArray | null;
  while ((match = importRegex.exec(text)) !== null) {
    const source = match[1];
    const alias = match[2];
    const original = source.split("/").pop()?.replace(/\.dart$/, "") ?? source;
    const name = alias ?? original;
    pushImport(imports, { name, source, isDefault: false, isNamespace: !!alias }, original);
  }

  // export 'src/foo.dart';
  const exportRegex = /export\s+['"]([^'"]+)['"](?:\s+as\s+(\w+))?\s*;/g;
  while ((match = exportRegex.exec(text)) !== null) {
    const source = match[1];
    const name = source.split("/").pop()?.replace(/\.dart$/, "") ?? source;
    imports.push({ name, source, isDefault: false, isNamespace: false });
  }

  // part 'src/foo.dart'; part of 'package:foo/foo.dart';
  const partRegex = /part\s+(?:of\s+)?['"]([^'"]+)['"]\s*;/g;
  while ((match = partRegex.exec(text)) !== null) {
    const source = match[1];
    const name = source.split("/").pop()?.replace(/\.dart$/, "") ?? source;
    imports.push({ name, source, isDefault: false, isNamespace: false });
  }

  return imports;
}

function extractDartExports(text: string, entityType: ChunkType, entityName: string | null): ChunkExport[] {
  // Dart: all top-level declarations are public unless prefixed with _
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
