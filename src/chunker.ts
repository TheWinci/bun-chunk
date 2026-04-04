import type { Node as SyntaxNode, Tree } from "web-tree-sitter";
import { parse, loadQuery } from "./parser";
import { QUERIES } from "./queries";
import { extractImports, extractExports } from "./imports";
import type { Chunk, ChunkImport, ChunkExport, ChunkOptions, ChunkResult, ChunkType, Language } from "./types";
import { EXTENSION_MAP } from "./types";
import { extname } from "path";
import { createHash } from "crypto";

/** Detect language from file path */
function detectLanguage(filepath: string): Language | null {
  const ext = extname(filepath).toLowerCase();
  return EXTENSION_MAP[ext] ?? null;
}

/** Normalize line endings to \n */
function normalizeLineEndings(code: string): string {
  return code.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
}

/** Strip BOM marker from start of file */
function stripBOM(code: string): string {
  if (code.charCodeAt(0) === 0xFEFF) {
    return code.slice(1);
  }
  return code;
}

/** Compute a content hash for deduplication */
function hashContent(text: string): string {
  return createHash("sha256").update(text).digest("hex").slice(0, 16);
}

/** Map tree-sitter node type to our ChunkType */
const NODE_TYPE_MAP: Record<string, ChunkType> = {
  // TypeScript / JavaScript
  function_declaration: "function",
  generator_function_declaration: "function",
  arrow_function: "function",
  class_declaration: "class",
  abstract_class_declaration: "class",
  method_definition: "method",
  interface_declaration: "interface",
  type_alias_declaration: "type",
  enum_declaration: "enum",
  import_statement: "import",
  export_statement: "export",
  internal_module: "module",
  variable_declarator: "variable",
  public_field_definition: "field",
  lexical_declaration: "variable",
  // Python
  class_definition: "class",
  function_definition: "function",
  import_from_statement: "import",
  // Rust
  struct_item: "struct",
  enum_item: "enum",
  trait_item: "trait",
  impl_item: "impl",
  function_item: "function",
  mod_item: "module",
  type_item: "type",
  const_item: "constant",
  use_declaration: "import",
  // Go
  type_declaration: "type",
  type_spec: "type",
  method_declaration: "method",
  const_declaration: "constant",
  const_spec: "constant",
  var_declaration: "variable",
  var_spec: "variable",
  method_elem: "method",
  field_declaration: "field",
  import_declaration: "import",
  package_clause: "package",
  // Java
  package_declaration: "package",
  import_declaration_java: "import",
  record_declaration: "record",
  annotation_type_declaration: "annotation_type",
  method_declaration: "method",
  constructor_declaration: "method",
  field_declaration_java: "field",
  static_initializer: "block",
  annotation_type_element_declaration: "method",
  enum_constant: "constant",
  // C
  preproc_include: "import",
  preproc_def: "constant",
  preproc_function_def: "function",
  struct_specifier: "struct",
  enum_specifier: "enum",
  union_specifier: "struct",
  type_definition: "type",
  // C++
  class_specifier: "class",
  namespace_definition: "module",
  template_declaration: "type",
  // C#
  struct_declaration: "struct",
  namespace_declaration: "module",
  property_declaration: "property",
  event_declaration: "variable",
  delegate_declaration: "type",
  using_directive: "import",
  // Ruby
  module: "module",
  class: "class",
  method: "method",
  singleton_method: "method",
  // PHP
  trait_declaration: "trait",
  namespace_use_declaration: "import",
  namespace_definition_php: "module",
  // Scala
  object_definition: "class",
  trait_definition: "trait",
  val_definition: "variable",
  var_definition: "variable",
  // HTML
  element: "element",
  // CSS
  rule_set: "selector",
  media_statement: "rule",
  keyframes_statement: "rule",
  // YAML
  block_mapping_pair: "property",
  // TOML
  table: "section",
  table_array_element: "section",
  pair: "property",
  // Kotlin
  object_declaration: "class",
  import: "import",
  package_header: "package",
  // Lua
  function_declaration_lua: "function",
  variable_declaration: "variable",
  assignment_statement: "variable",
  // Zig
  function_declaration_zig: "function",
  variable_declaration_zig: "variable",
  test_declaration: "function",
  // Elixir
  call: "function",
  // Bash
  function_definition_bash: "function",
  variable_assignment: "variable",
  // Haskell
  function: "function",
  signature: "type",
  data_type: "type",
  newtype: "type",
  type_synomym: "type",
  class: "class",
  instance: "impl",
  // OCaml
  value_definition: "function",
  type_definition: "type",
  module_definition: "module",
  module_type_definition: "type",
  open_module: "import",
  external: "function",
  exception_definition: "type",
  // Dart
  mixin_declaration: "trait",
  extension_declaration: "class",
  import_or_export: "import",
  function_signature: "function",
};

function nodeTypeToChunkType(nodeType: string): ChunkType {
  return NODE_TYPE_MAP[nodeType] ?? "block";
}

interface Entity {
  node: SyntaxNode;
  name: string | null;
  type: ChunkType;
  startLine: number;
  endLine: number;
}

/** Check if a line is a comment */
function isCommentLine(line: string, language: Language): boolean {
  const trimmed = line.trim();
  switch (language) {
    case "typescript":
    case "javascript":
    case "rust":
    case "go":
    case "java":
    case "c":
    case "cpp":
    case "csharp":
    case "php":
    case "scala":
    case "kotlin":
    case "zig":
      return trimmed.startsWith("//") || trimmed.startsWith("/*") || trimmed.startsWith(" *") || trimmed === "*" || trimmed.startsWith("*/");
    case "python":
    case "ruby":
      return trimmed.startsWith("#") || trimmed.startsWith('"""') || trimmed.startsWith("'''");
    case "elixir":
      return trimmed.startsWith("#");
    case "lua":
      return trimmed.startsWith("--");
    case "bash":
      return trimmed.startsWith("#") && !trimmed.startsWith("#!");
    case "haskell":
      return trimmed.startsWith("--") || trimmed.startsWith("{-") || trimmed.startsWith("-}");
    case "ocaml":
      return trimmed.startsWith("(*") || trimmed.startsWith("*)") || trimmed.startsWith(" *");
    case "html":
      return trimmed.startsWith("<!--") || trimmed.startsWith("-->");
    case "css":
      return trimmed.startsWith("/*") || trimmed.startsWith(" *") || trimmed === "*" || trimmed.startsWith("*/");
    case "toml":
    case "yaml":
      return trimmed.startsWith("#");
    default:
      return false;
  }
}

/** Check if a line is a decorator */
function isDecoratorLine(line: string, language: Language): boolean {
  const trimmed = line.trim();
  switch (language) {
    case "python":
      return trimmed.startsWith("@");
    case "typescript":
    case "javascript":
    case "java":
    case "kotlin":
      return trimmed.startsWith("@") && !trimmed.startsWith("@interface");
    case "php":
      return trimmed.startsWith("#["); // PHP 8 attributes
    case "rust":
    case "zig":
      return trimmed.startsWith("#[") || trimmed.startsWith("#![");
    case "csharp":
      return trimmed.startsWith("[") && trimmed.endsWith("]");
    case "elixir":
      return trimmed.startsWith("@") && !trimmed.startsWith("@doc") && !trimmed.startsWith("@moduledoc");
    default:
      return false;
  }
}

/**
 * Find leading comments and decorators for an entity.
 * Returns the adjusted start line that includes the leading context.
 */
function findLeadingContext(
  lines: string[],
  entityStartLine: number,
  prevEndLine: number,
  language: Language,
): number {
  let start = entityStartLine;

  // Walk backwards from the entity to find attached comments/decorators
  for (let i = entityStartLine - 1; i > prevEndLine; i--) {
    const line = lines[i];
    if (!line.trim()) {
      // Blank line breaks the attachment
      break;
    }
    if (isCommentLine(line, language) || isDecoratorLine(line, language)) {
      start = i;
    } else {
      break;
    }
  }

  return start;
}

/** Extract entities from AST using tree-sitter queries */
async function extractEntities(tree: Tree, language: Language): Promise<Entity[]> {
  const queryString = QUERIES[language];
  if (!queryString) return [];

  const query = await loadQuery(language, queryString);
  const matches = query.matches(tree.rootNode);

  const entities: Entity[] = [];
  const seen = new Set<number>(); // dedupe by start byte

  for (const match of matches) {
    const itemCapture = match.captures.find(c => c.name === "item");
    if (!itemCapture) continue;

    const node = itemCapture.node;
    if (seen.has(node.startIndex)) continue;
    seen.add(node.startIndex);

    const nameCapture = match.captures.find(c => c.name === "name");

    entities.push({
      node,
      name: nameCapture?.node.text ?? null,
      type: nodeTypeToChunkType(node.type),
      startLine: node.startPosition.row,
      endLine: node.endPosition.row,
    });
  }

  // Sort by start position
  entities.sort((a, b) => a.startLine - b.startLine);
  return entities;
}

/** Split a range of lines into chunks of at most maxLines, with optional overlap */
function splitLines(
  lines: string[],
  startLine: number,
  endLine: number,
  maxLines: number,
  type: ChunkType,
  name: string | null,
  overlap: number = 0,
): Chunk[] {
  const chunks: Chunk[] = [];
  const step = Math.max(1, maxLines - overlap);
  for (let i = startLine; i <= endLine; i += step) {
    const end = Math.min(i + maxLines - 1, endLine);
    const text = lines.slice(i, end + 1).join("\n");
    if (text.trim()) {
      chunks.push({ text, startLine: i, endLine: end, type, name });
    }
    // If we reached the end, stop
    if (end >= endLine) break;
  }
  return chunks;
}

/** Collapse consecutive import chunks into a single chunk, respecting blank-line separators */
function collapseImports(chunks: Chunk[], lines: string[], maxLines: number): Chunk[] {
  if (chunks.length <= 1) return chunks;

  const result: Chunk[] = [];
  let importGroup: Chunk[] = [];

  function flushImportGroup() {
    if (importGroup.length === 0) return;

    if (importGroup.length === 1) {
      result.push(importGroup[0]);
    } else {
      // Merge the group
      const first = importGroup[0];
      const last = importGroup[importGroup.length - 1];
      const totalLines = last.endLine - first.startLine + 1;

      if (totalLines <= maxLines) {
        const mergedImports = importGroup.flatMap(c => c.imports ?? []);
        result.push({
          text: lines.slice(first.startLine, last.endLine + 1).join("\n"),
          startLine: first.startLine,
          endLine: last.endLine,
          type: "import",
          name: null,
          ...(mergedImports.length > 0 ? { imports: mergedImports } : {}),
        });
      } else {
        // Too large to merge — keep separate
        result.push(...importGroup);
      }
    }
    importGroup = [];
  }

  for (const chunk of chunks) {
    if (chunk.type === "import") {
      if (importGroup.length > 0) {
        const prevEnd = importGroup[importGroup.length - 1].endLine;
        // Check for blank line between this import and the previous one
        const hasBlankLine = lines.slice(prevEnd + 1, chunk.startLine).some(l => !l.trim());
        if (hasBlankLine) {
          flushImportGroup();
        }
      }
      importGroup.push(chunk);
    } else {
      flushImportGroup();
      result.push(chunk);
    }
  }
  flushImportGroup();

  return result;
}

/** Add metadata to chunks */
function addMetadata(
  chunks: Chunk[],
  filepath: string,
  language: string | null,
): Chunk[] {
  return chunks.map(c => ({
    ...c,
    language: language ?? undefined,
    filePath: filepath,
    hash: hashContent(c.text),
  }));
}

/** Add context information to child chunks */
function addContext(
  chunks: Chunk[],
  parentName: string | null,
  parentType: ChunkType,
): Chunk[] {
  return chunks.map(c => {
    const context: string[] = [];
    if (parentName) context.push(parentName);
    if (c.name && c.name !== parentName) context.push(c.name);
    return {
      ...c,
      context: context.length > 0 ? context : undefined,
      parentName: parentName ?? undefined,
    };
  });
}

/** Build a fallback line-based result when AST parsing isn't available */
function fallbackResult(
  lines: string[],
  maxLines: number,
  overlap: number,
  filepath: string,
  language: Language | null,
  includeMetadata: boolean,
): ChunkResult {
  let chunks = splitLines(lines, 0, lines.length - 1, maxLines, "block", null, overlap);
  if (includeMetadata) chunks = addMetadata(chunks, filepath, language);
  return { chunks, fileImports: [], fileExports: [] };
}

/**
 * Chunk source code into AST-aware segments.
 *
 * @param filepath - File path (used for language detection)
 * @param code - Source code string
 * @param options - Chunking options
 * @returns ChunkResult with chunks and file-level import/export metadata
 */
export async function chunk(
  filepath: string,
  code: string,
  options: ChunkOptions = {},
): Promise<ChunkResult> {
  // Robustness: normalize input
  code = stripBOM(normalizeLineEndings(code));

  const maxLines = options.maxLines ?? 60;
  const language = options.language ?? detectLanguage(filepath);
  const strategy = options.strategy ?? "semantic";
  const overlap = options.overlap ?? 0;
  const includeContext = options.includeContext ?? false;
  const includeMetadata = options.includeMetadata ?? false;

  const lines = code.split("\n");

  // Fixed strategy: pure line-based splitting, no AST
  if (strategy === "fixed") {
    return fallbackResult(lines, maxLines, overlap, filepath, language, includeMetadata);
  }

  // Semantic and hybrid: try AST parsing
  if (!language || (strategy === "hybrid" && !QUERIES[language])) {
    return fallbackResult(lines, maxLines, overlap, filepath, language, includeMetadata);
  }

  let tree;
  try {
    tree = await parse(code, language);
  } catch {
    return fallbackResult(lines, maxLines, overlap, filepath, language, includeMetadata);
  }

  const entities = await extractEntities(tree, language);
  const totalLines = lines.length;

  if (entities.length === 0) {
    return fallbackResult(lines, maxLines, overlap, filepath, language, includeMetadata);
  }

  let chunks: Chunk[] = [];

  // Filter to only top-level entities (not contained within another entity)
  const topLevel = filterTopLevel(entities);

  let cursor = 0; // current line position
  const allImports: ChunkImport[] = [];
  const allExports: ChunkExport[] = [];

  for (let idx = 0; idx < topLevel.length; idx++) {
    const entity = topLevel[idx];

    // Find leading comments/decorators that should attach to this entity
    const prevEnd = cursor - 1;
    const adjustedStart = findLeadingContext(lines, entity.startLine, prevEnd, language);

    // Gap before this entity (excluding attached comments)
    if (adjustedStart > cursor) {
      const gapText = lines.slice(cursor, adjustedStart).join("\n");
      if (gapText.trim()) {
        chunks.push(...splitLines(lines, cursor, adjustedStart - 1, maxLines, "block", null, overlap));
      }
    }

    const effectiveStart = Math.min(adjustedStart, entity.startLine);
    const entityLineCount = entity.endLine - effectiveStart + 1;

    if (entityLineCount <= maxLines) {
      // Entity fits in one chunk (including leading comments)
      const text = lines.slice(effectiveStart, entity.endLine + 1).join("\n");
      const chk: Chunk = {
        text,
        startLine: effectiveStart,
        endLine: entity.endLine,
        type: entity.type,
        name: entity.name,
      };

      // Extract structured imports/exports
      if (entity.type === "import") {
        const imports = extractImports(text, language);
        if (imports.length > 0) {
          chk.imports = imports;
          allImports.push(...imports);
        }
      }

      const entityExports = extractExports(text, language, entity.type, entity.name);
      if (entityExports.length > 0) {
        chk.exports = entityExports;
        allExports.push(...entityExports);
      }

      chunks.push(chk);
    } else {
      // Entity too large — try to split by child entities
      const children = entities.filter(
        e => e !== entity &&
          e.startLine >= entity.startLine &&
          e.endLine <= entity.endLine
      );

      if (children.length > 0) {
        // Filter to direct children only (exclude grandchildren nested inside another child)
        const directChildren = filterTopLevel(children);
        // Split large entity using its children as boundaries
        let childChunks = splitByChildren(lines, entity, directChildren, maxLines, overlap);

        // Add context to child chunks if enabled
        if (includeContext) {
          childChunks = addContext(childChunks, entity.name, entity.type);
        }

        // Extract exports for the parent entity
        const entityExports = extractExports(
          lines.slice(effectiveStart, entity.endLine + 1).join("\n"),
          language,
          entity.type,
          entity.name,
        );
        if (entityExports.length > 0) {
          allExports.push(...entityExports);
          // Attach exports to the first child chunk
          if (childChunks.length > 0) {
            childChunks[0].exports = entityExports;
          }
        }
        chunks.push(...childChunks);
      } else {
        // No children — line-based split
        chunks.push(...splitLines(lines, effectiveStart, entity.endLine, maxLines, entity.type, entity.name, overlap));
      }
    }

    cursor = entity.endLine + 1;
  }

  // Trailing gap
  if (cursor < totalLines) {
    const gapText = lines.slice(cursor, totalLines).join("\n");
    if (gapText.trim()) {
      chunks.push(...splitLines(lines, cursor, totalLines - 1, maxLines, "block", null, overlap));
    }
  }

  // Collapse consecutive imports
  chunks = collapseImports(chunks, lines, maxLines);

  // Add metadata if requested
  if (includeMetadata) {
    chunks = addMetadata(chunks, filepath, language);
  }

  return { chunks, fileImports: allImports, fileExports: allExports };
}

/** Filter entities to only top-level (not nested inside another entity).
 *  When two entities overlap, the one spanning more lines is kept. */
function filterTopLevel(entities: Entity[]): Entity[] {
  const result: Entity[] = [];
  let lastEnd = -1;

  for (const entity of entities) {
    if (entity.startLine > lastEnd) {
      result.push(entity);
      lastEnd = entity.endLine;
    } else if (entity.endLine > lastEnd && result.length > 0) {
      // Overlapping but extends further — replace with the larger entity
      const prev = result[result.length - 1];
      const prevSize = prev.endLine - prev.startLine;
      const currSize = entity.endLine - entity.startLine;
      if (currSize > prevSize) {
        result[result.length - 1] = entity;
      }
      lastEnd = Math.max(lastEnd, entity.endLine);
    }
  }

  return result;
}

/** Split a large entity by its child entities */
function splitByChildren(
  lines: string[],
  parent: Entity,
  children: Entity[],
  maxLines: number,
  overlap: number = 0,
): Chunk[] {
  const chunks: Chunk[] = [];
  let cursor = parent.startLine;

  for (const child of children) {
    // Lines between cursor and child
    if (child.startLine > cursor) {
      const gapEnd = child.startLine - 1;
      const gapSize = gapEnd - cursor + 1;
      if (gapSize > 0) {
        const text = lines.slice(cursor, child.startLine).join("\n");
        if (text.trim()) {
          chunks.push(...splitLines(lines, cursor, gapEnd, maxLines, parent.type, parent.name, overlap));
        }
      }
    }

    const childLines = child.endLine - child.startLine + 1;
    if (childLines <= maxLines) {
      const text = lines.slice(child.startLine, child.endLine + 1).join("\n");
      chunks.push({
        text,
        startLine: child.startLine,
        endLine: child.endLine,
        type: child.type,
        name: child.name,
      });
    } else {
      chunks.push(...splitLines(lines, child.startLine, child.endLine, maxLines, child.type, child.name, overlap));
    }

    cursor = child.endLine + 1;
  }

  // Trailing lines after last child
  if (cursor <= parent.endLine) {
    const text = lines.slice(cursor, parent.endLine + 1).join("\n");
    if (text.trim()) {
      chunks.push(...splitLines(lines, cursor, parent.endLine, maxLines, parent.type, parent.name, overlap));
    }
  }

  return chunks;
}

/** Merge adjacent small chunks that fit within maxLines */
export function mergeSmallChunks(chunks: Chunk[], maxLines: number): Chunk[] {
  if (chunks.length <= 1) return chunks;

  const result: Chunk[] = [chunks[0]];

  for (let i = 1; i < chunks.length; i++) {
    const prev = result[result.length - 1];
    const curr = chunks[i];

    const prevSize = prev.endLine - prev.startLine + 1;
    const currSize = curr.endLine - curr.startLine + 1;

    // Merge if both are blocks/imports and combined fits
    const mergeable =
      (prev.type === "block" || prev.type === "import") &&
      (curr.type === "block" || curr.type === "import");

    if (mergeable && prevSize + currSize <= maxLines && curr.startLine === prev.endLine + 1) {
      // Merge imports from both chunks
      const mergedImports = [...(prev.imports ?? []), ...(curr.imports ?? [])];

      result[result.length - 1] = {
        text: prev.text + "\n" + curr.text,
        startLine: prev.startLine,
        endLine: curr.endLine,
        type: "block",
        name: null,
        ...(mergedImports.length > 0 ? { imports: mergedImports } : {}),
      };
    } else {
      result.push(curr);
    }
  }

  return result;
}
