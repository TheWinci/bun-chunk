import { readFile } from "fs/promises";
import { fancy as renamed } from "./other";

interface Config {
  value: number;
}

function helper(x: number): number {
  return x * 2;
}

function recur(n: number): number {
  if (n <= 0) return 0;
  return recur(n - 1) + 1;
}

function callsHelper(c: Config): number {
  // helper(999) — this is a comment, must not match
  const s = "helper string literal";
  return helper(c.value);
}

function methodAndImport(): Promise<string> {
  return readFile("/tmp/x", "utf-8").then(s => s.trim());
}

function aliasUser(): void {
  renamed();
}

function withClosure(): () => number {
  return function inner() {
    return helper(7);
  };
}
