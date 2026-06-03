import { describe, test, expect } from "bun:test";
import { extractImports } from "../src/index";
import type { Language, ChunkImport } from "../src/types";

function find(imports: ChunkImport[], localName: string): ChunkImport | undefined {
  return imports.find((i) => i.name === localName);
}

// (language, source, local binding, expected original `imported`)
const aliasCases: Array<[Language, string, string, string]> = [
  ["typescript", `import { getDB as g } from "./db";`, "g", "getDB"],
  ["javascript", `const { parse: p } = require("path");`, "p", "parse"],
  ["python", `from models import User as U`, "U", "User"],
  ["python", `import numpy as np`, "np", "numpy"],
  ["rust", `use crate::db::{ get_db as g };`, "g", "get_db"],
  ["rust", `use std::path::Path as P;`, "P", "Path"],
  ["php", `use App\\Models\\User as U;`, "U", "User"],
  ["kotlin", `import com.example.Foo as Bar`, "Bar", "Foo"],
  ["scala", `import a.b.{Foo => Bar}`, "Bar", "Foo"],
  ["go", `import f "fmt"`, "f", "fmt"],
  ["csharp", `using IntList = System.Collections.Generic.List;`, "IntList", "List"],
  ["lua", `local json = require("cjson")`, "json", "cjson"],
  ["zig", `const myStd = @import("std");`, "myStd", "std"],
  ["ocaml", `module M = Core.Map`, "M", "Map"],
  ["elixir", `alias Foo.Bar, as: Baz`, "Baz", "Bar"],
  ["haskell", `import qualified Data.Map as M`, "M", "Map"],
  ["dart", `import 'package:foo/bar.dart' as b;`, "b", "bar"],
];

describe("aliased imports record the original name in `imported`", () => {
  for (const [lang, src, local, imported] of aliasCases) {
    test(`${lang}: ${src.trim()}`, () => {
      const imports = extractImports(src, lang);
      const imp = find(imports, local);
      expect(imp).toBeDefined();
      expect(imp!.name).toBe(local);
      expect(imp!.imported).toBe(imported);
    });
  }
});

describe("unaliased imports leave `imported` undefined", () => {
  const plainCases: Array<[Language, string, string]> = [
    ["typescript", `import { getDB } from "./db";`, "getDB"],
    ["python", `from models import User`, "User"],
    ["rust", `use std::path::Path;`, "Path"],
    ["go", `import "fmt"`, "fmt"],
    ["php", `use App\\Models\\User;`, "User"],
  ];
  for (const [lang, src, name] of plainCases) {
    test(`${lang}: ${src.trim()}`, () => {
      const imp = find(extractImports(src, lang), name);
      expect(imp).toBeDefined();
      expect(imp!.imported).toBeUndefined();
    });
  }
});

describe("edge cases surfaced in review", () => {
  test("zig: .zig file basename isn't mangled to 'zig'", () => {
    // Binding differs from the basename, so `imported` is set — and must be the
    // real basename "thing", not "zig" (the old split(/[./]/) bug).
    const imp = find(extractImports(`const myThing = @import("a/thing.zig");`, "zig"), "myThing");
    expect(imp!.imported).toBe("thing");
  });

  test("ocaml: `module M = struct … end` is not parsed as an import", () => {
    const imports = extractImports("module M = struct let x = 1 end", "ocaml");
    expect(imports.some((i) => i.source === "struct")).toBe(false);
  });

  test("ocaml: a real module alias is captured", () => {
    const imp = find(extractImports("module L = Core.List", "ocaml"), "L");
    expect(imp!.imported).toBe("List");
  });

  test("rust: explicit-root `use ::std::fmt;` still extracts", () => {
    const imp = find(extractImports("use ::std::fmt;", "rust"), "fmt");
    expect(imp).toBeDefined();
  });

  test("rust: braced import with rename still works", () => {
    const imps = extractImports("use crate::a::{b, c as d};", "rust");
    expect(find(imps, "b")).toBeDefined();
    expect(find(imps, "d")!.imported).toBe("c");
  });

  test("kotlin: wildcard import parses to '*'", () => {
    const imp = find(extractImports("import com.example.*", "kotlin"), "*");
    expect(imp).toBeDefined();
    expect(imp!.isNamespace).toBe(true);
  });
});
