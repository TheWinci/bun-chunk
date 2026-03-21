import { Parser, Language as TSLanguage, Query } from "web-tree-sitter";
import type { Language } from "./types";

let initialized = false;
const grammarCache = new Map<Language, TSLanguage>();
const queryCache = new Map<Language, Query>();

/** WASM file paths per language */
const GRAMMAR_PATHS: Record<Language, string> = {
  typescript: "tree-sitter-typescript/tree-sitter-typescript.wasm",
  javascript: "tree-sitter-javascript/tree-sitter-javascript.wasm",
  python: "tree-sitter-python/tree-sitter-python.wasm",
  rust: "tree-sitter-rust/tree-sitter-rust.wasm",
  go: "tree-sitter-go/tree-sitter-go.wasm",
  java: "tree-sitter-java/tree-sitter-java.wasm",
};

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
  const wasmPath = require.resolve(GRAMMAR_PATHS[language]);
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
