import type { Tree } from "web-tree-sitter";
import { loadQuery } from "./parser";
import { REFERENCE_QUERIES } from "./queries";
import type { ChunkReferences, Language } from "./types";

/**
 * Per-language ancestor node kinds that signal "this identifier is part of an
 * import/export/use/package statement" — references inside these should not
 * pollute the call graph. References in re-exports also fall out via these.
 */
// `export_statement` deliberately omitted for TS/JS: it wraps both
// re-exports (`export { foo } from "./x"`) and exported declarations
// (`export function foo() { ... }`). Listing it here would walk the
// entire ancestor chain and reject every identifier inside the body of
// an exported function/class/etc. Re-exports are already filtered via
// `export_clause` / `export_specifier`, which only sit on the re-export
// path — not on declaration exports.
const IMPORT_EXPORT_ANCESTORS: Partial<Record<Language, string[]>> = {
  typescript: ["import_statement", "export_clause", "export_specifier", "import_clause", "import_specifier", "namespace_import"],
  javascript: ["import_statement", "export_clause", "export_specifier", "import_clause", "import_specifier", "namespace_import"],
  python: ["import_statement", "import_from_statement", "future_import_statement"],
  rust: ["use_declaration"],
  go: ["import_declaration", "import_spec", "package_clause"],
  java: ["import_declaration", "package_declaration"],
  c: ["preproc_include"],
  cpp: ["preproc_include", "using_declaration"],
  csharp: ["using_directive"],
  ruby: [],
  php: ["namespace_use_declaration", "namespace_definition"],
  scala: ["import_declaration", "package_clause"],
  kotlin: ["import", "package_header"],
  lua: [],
  zig: [],
  elixir: [],
  bash: [],
  haskell: ["import"],
  ocaml: ["open_module"],
  dart: ["import_or_export"],
};

/** Extract references from a parsed tree as `{ name -> sorted unique lines }`. */
export async function extractReferences(tree: Tree, language: Language): Promise<ChunkReferences> {
  const queryString = REFERENCE_QUERIES[language];
  if (!queryString) return {};

  const skipAncestors = new Set(IMPORT_EXPORT_ANCESTORS[language] ?? []);

  const query = await loadQuery(language, queryString, "refs");
  const matches = query.matches(tree.rootNode);

  // Build name -> Set<line> to dedupe, then collapse to sorted arrays.
  const buckets = new Map<string, Set<number>>();

  for (const match of matches) {
    for (const cap of match.captures) {
      if (cap.name !== "ref") continue;
      const node = cap.node;

      if (skipAncestors.size > 0 && hasAncestor(node, skipAncestors)) continue;

      const name = node.text;
      if (!name) continue;

      const line = node.startPosition.row;
      let bucket = buckets.get(name);
      if (!bucket) {
        bucket = new Set();
        buckets.set(name, bucket);
      }
      bucket.add(line);
    }
  }

  const out: ChunkReferences = Object.create(null);
  for (const [name, lines] of buckets) {
    out[name] = [...lines].sort((a, b) => a - b);
  }
  return out;
}

function hasAncestor(node: { parent: any; type: string } | null, kinds: Set<string>): boolean {
  let cur: any = node?.parent;
  while (cur) {
    if (kinds.has(cur.type)) return true;
    cur = cur.parent;
  }
  return false;
}
