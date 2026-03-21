import type { Node as SyntaxNode, Tree } from "web-tree-sitter";
import { parse, loadQuery } from "./parser";
import { QUERIES } from "./queries";
import type { Chunk, ChunkOptions, ChunkType, Language } from "./types";
import { EXTENSION_MAP } from "./types";
import { extname } from "path";

/** Detect language from file path */
function detectLanguage(filepath: string): Language | null {
  const ext = extname(filepath).toLowerCase();
  return EXTENSION_MAP[ext] ?? null;
}

/** Map tree-sitter node type to our ChunkType */
function nodeTypeToChunkType(nodeType: string, language: Language): ChunkType {
  const map: Record<string, ChunkType> = {
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
  };
  return map[nodeType] ?? "block";
}

interface Entity {
  node: SyntaxNode;
  name: string | null;
  type: ChunkType;
  startLine: number;
  endLine: number;
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
      type: nodeTypeToChunkType(node.type, language),
      startLine: node.startPosition.row,
      endLine: node.endPosition.row,
    });
  }

  // Sort by start position
  entities.sort((a, b) => a.startLine - b.startLine);
  return entities;
}

/** Split a range of lines into chunks of at most maxLines */
function splitLines(
  lines: string[],
  startLine: number,
  endLine: number,
  maxLines: number,
  type: ChunkType,
  name: string | null,
): Chunk[] {
  const chunks: Chunk[] = [];
  for (let i = startLine; i <= endLine; i += maxLines) {
    const end = Math.min(i + maxLines - 1, endLine);
    const text = lines.slice(i, end + 1).join("\n");
    if (text.trim()) {
      chunks.push({ text, startLine: i, endLine: end, type, name });
    }
  }
  return chunks;
}

/**
 * Chunk source code into AST-aware segments.
 *
 * @param filepath - File path (used for language detection)
 * @param code - Source code string
 * @param options - Chunking options
 * @returns Array of chunks
 */
export async function chunk(
  filepath: string,
  code: string,
  options: ChunkOptions = {},
): Promise<Chunk[]> {
  const maxLines = options.maxLines ?? 60;
  const language = options.language ?? detectLanguage(filepath);

  if (!language) {
    // Unknown language — fall back to line-based splitting
    const lines = code.split("\n");
    return splitLines(lines, 0, lines.length - 1, maxLines, "block", null);
  }

  const tree = await parse(code, language);
  const entities = await extractEntities(tree, language);
  const lines = code.split("\n");
  const totalLines = lines.length;

  if (entities.length === 0) {
    return splitLines(lines, 0, totalLines - 1, maxLines, "block", null);
  }

  const chunks: Chunk[] = [];

  // Filter to only top-level entities (not contained within another entity)
  const topLevel = filterTopLevel(entities);

  let cursor = 0; // current line position

  for (const entity of topLevel) {
    // Gap before this entity
    if (entity.startLine > cursor) {
      const gapText = lines.slice(cursor, entity.startLine).join("\n");
      if (gapText.trim()) {
        chunks.push(...splitLines(lines, cursor, entity.startLine - 1, maxLines, "block", null));
      }
    }

    const entityLines = entity.endLine - entity.startLine + 1;

    if (entityLines <= maxLines) {
      // Entity fits in one chunk
      const text = lines.slice(entity.startLine, entity.endLine + 1).join("\n");
      chunks.push({
        text,
        startLine: entity.startLine,
        endLine: entity.endLine,
        type: entity.type,
        name: entity.name,
      });
    } else {
      // Entity too large — try to split by child entities
      const children = entities.filter(
        e => e !== entity &&
          e.startLine >= entity.startLine &&
          e.endLine <= entity.endLine
      );

      if (children.length > 0) {
        // Split large entity using its children as boundaries
        chunks.push(...splitByChildren(lines, entity, children, maxLines));
      } else {
        // No children — line-based split
        chunks.push(...splitLines(lines, entity.startLine, entity.endLine, maxLines, entity.type, entity.name));
      }
    }

    cursor = entity.endLine + 1;
  }

  // Trailing gap
  if (cursor < totalLines) {
    const gapText = lines.slice(cursor, totalLines).join("\n");
    if (gapText.trim()) {
      chunks.push(...splitLines(lines, cursor, totalLines - 1, maxLines, "block", null));
    }
  }

  return chunks;
}

/** Filter entities to only top-level (not nested inside another entity) */
function filterTopLevel(entities: Entity[]): Entity[] {
  const result: Entity[] = [];
  let lastEnd = -1;

  for (const entity of entities) {
    if (entity.startLine > lastEnd) {
      result.push(entity);
      lastEnd = entity.endLine;
    } else if (entity.endLine > lastEnd) {
      // Overlapping but extends further — take the larger one
      if (result.length > 0) {
        const prev = result[result.length - 1];
        if (entity.startLine === prev.startLine && entity.endLine > prev.endLine) {
          result[result.length - 1] = entity;
          lastEnd = entity.endLine;
        }
      }
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
          chunks.push(...splitLines(lines, cursor, gapEnd, maxLines, parent.type, parent.name));
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
      chunks.push(...splitLines(lines, child.startLine, child.endLine, maxLines, child.type, child.name));
    }

    cursor = child.endLine + 1;
  }

  // Trailing lines after last child
  if (cursor <= parent.endLine) {
    const text = lines.slice(cursor, parent.endLine + 1).join("\n");
    if (text.trim()) {
      chunks.push(...splitLines(lines, cursor, parent.endLine, maxLines, parent.type, parent.name));
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
      result[result.length - 1] = {
        text: prev.text + "\n" + curr.text,
        startLine: prev.startLine,
        endLine: curr.endLine,
        type: "block",
        name: null,
      };
    } else {
      result.push(curr);
    }
  }

  return result;
}
