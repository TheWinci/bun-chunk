import { Parser, Language as TSLanguage, Query } from "web-tree-sitter";
import type { Language } from "./types";
import { resolve, join } from "path";

let initialized = false;
const grammarCache = new Map<Language, TSLanguage>();
const queryCache = new Map<Language, Query>();

/** WASM file paths per language — prefer per-package WASM, fallback to tree-sitter-wasms */
function getGrammarPath(language: Language): string {
  // Languages with their own npm package containing WASM
  const packagePaths: Partial<Record<Language, string>> = {
    typescript: "tree-sitter-typescript/tree-sitter-typescript.wasm",
    javascript: "tree-sitter-javascript/tree-sitter-javascript.wasm",
    python: "tree-sitter-python/tree-sitter-python.wasm",
    rust: "tree-sitter-rust/tree-sitter-rust.wasm",
    go: "tree-sitter-go/tree-sitter-go.wasm",
    java: "tree-sitter-java/tree-sitter-java.wasm",
    c: "tree-sitter-c/tree-sitter-c.wasm",
    cpp: "tree-sitter-cpp/tree-sitter-cpp.wasm",
    ruby: "tree-sitter-ruby/tree-sitter-ruby.wasm",
    csharp: "tree-sitter-c-sharp/tree-sitter-c_sharp.wasm",
    php: "tree-sitter-php/tree-sitter-php.wasm",
    scala: "tree-sitter-scala/tree-sitter-scala.wasm",
    html: "tree-sitter-html/tree-sitter-html.wasm",
    css: "tree-sitter-css/tree-sitter-css.wasm",
  };

  if (packagePaths[language]) {
    return packagePaths[language]!;
  }

  throw new Error(`No grammar available for language: ${language}`);
}

async function ensureInit(): Promise<void> {
  if (!initialized) {
    await Parser.init();
    initialized = true;
  }
}

async function loadGrammar(language: Language): Promise<TSLanguage> {
  const cached = grammarCache.get(language);
  if (cached) return cached;

  await ensureInit();
  const wasmPath = require.resolve(getGrammarPath(language));
  const grammar = await TSLanguage.load(wasmPath);
  grammarCache.set(language, grammar);
  return grammar;
}

export async function parse(code: string, language: Language) {
  const grammar = await loadGrammar(language);
  await ensureInit();
  const parser = new Parser();
  parser.setLanguage(grammar);
  const tree = parser.parse(code);
  return tree;
}

export async function loadQuery(language: Language, queryString: string): Promise<Query> {
  const cached = queryCache.get(language);
  if (cached) return cached;

  const grammar = await loadGrammar(language);
  const query = new Query(grammar, queryString);
  queryCache.set(language, query);
  return query;
}
