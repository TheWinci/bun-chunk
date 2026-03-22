import { describe, test, expect } from "bun:test";
import { chunk } from "../src";
import { readFile } from "fs/promises";
import { join } from "path";

const FIXTURES = join(import.meta.dir, "fixtures");

async function readFixture(name: string): Promise<string> {
  return readFile(join(FIXTURES, name), "utf-8");
}

/** Helper: verify all non-empty lines are covered */
function verifyCoverage(code: string, chunks: { startLine: number; endLine: number }[]) {
  const lines = code.split("\n");
  const covered = new Set<number>();
  for (const c of chunks) {
    for (let i = c.startLine; i <= c.endLine; i++) {
      covered.add(i);
    }
  }
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].trim()) {
      expect(covered.has(i)).toBe(true);
    }
  }
}

/** Helper: verify no chunks overlap */
function verifyNoOverlap(chunks: { startLine: number; endLine: number }[]) {
  for (let i = 1; i < chunks.length; i++) {
    expect(chunks[i].startLine).toBeGreaterThan(chunks[i - 1].endLine);
  }
}

describe("C", () => {
  test("extracts functions and structs", async () => {
    const code = await readFixture("sample.c");
    const { chunks } = await chunk("sample.c", code);

    const names = chunks.map(c => c.name).filter(Boolean);
    expect(names).toContain("create_config");
    expect(names).toContain("process");
    expect(names).toContain("helper");
    expect(names).toContain("MAX_SIZE");
  });

  test("covers all lines", async () => {
    const code = await readFixture("sample.c");
    const { chunks } = await chunk("sample.c", code);
    verifyCoverage(code, chunks);
  });

  test("no overlaps", async () => {
    const code = await readFixture("sample.c");
    const { chunks } = await chunk("sample.c", code);
    verifyNoOverlap(chunks);
  });

  test("extracts includes as imports", async () => {
    const code = await readFixture("sample.c");
    const { fileImports } = await chunk("sample.c", code);
    expect(fileImports.length).toBeGreaterThan(0);
    const sources = fileImports.map(i => i.source);
    expect(sources).toContain("stdio.h");
    expect(sources).toContain("stdlib.h");
  });
});

describe("C++", () => {
  test("extracts classes, namespaces, functions", async () => {
    const code = await readFixture("sample.cpp");
    const { chunks } = await chunk("sample.cpp", code);

    const names = chunks.map(c => c.name).filter(Boolean);
    expect(names).toContain("processing");
    expect(names).toContain("helper");
  });

  test("covers all lines", async () => {
    const code = await readFixture("sample.cpp");
    const { chunks } = await chunk("sample.cpp", code);
    verifyCoverage(code, chunks);
  });

  test("no overlaps", async () => {
    const code = await readFixture("sample.cpp");
    const { chunks } = await chunk("sample.cpp", code);
    verifyNoOverlap(chunks);
  });
});

describe("C#", () => {
  test("extracts classes, interfaces, enums", async () => {
    const code = await readFixture("sample.cs");
    const { chunks } = await chunk("sample.cs", code);

    const names = chunks.map(c => c.name).filter(Boolean);
    expect(names).toContain("Processing");
  });

  test("covers all lines", async () => {
    const code = await readFixture("sample.cs");
    const { chunks } = await chunk("sample.cs", code);
    verifyCoverage(code, chunks);
  });

  test("extracts using directives as imports", async () => {
    const code = await readFixture("sample.cs");
    const { fileImports } = await chunk("sample.cs", code);
    expect(fileImports.length).toBeGreaterThan(0);
    const names = fileImports.map(i => i.name);
    expect(names).toContain("IO");
  });
});

describe("Ruby", () => {
  test("extracts classes and methods", async () => {
    const code = await readFixture("sample.rb");
    const { chunks } = await chunk("sample.rb", code);

    const names = chunks.map(c => c.name).filter(Boolean);
    expect(names).toContain("DataProcessor");
    expect(names).toContain("Helpers");
  });

  test("covers all lines", async () => {
    const code = await readFixture("sample.rb");
    const { chunks } = await chunk("sample.rb", code);
    verifyCoverage(code, chunks);
  });

  test("no overlaps", async () => {
    const code = await readFixture("sample.rb");
    const { chunks } = await chunk("sample.rb", code);
    verifyNoOverlap(chunks);
  });
});

describe("Scala", () => {
  test("extracts classes, traits, objects", async () => {
    const code = await readFixture("sample.scala");
    const { chunks } = await chunk("sample.scala", code);

    const names = chunks.map(c => c.name).filter(Boolean);
    expect(names).toContain("Config");
    expect(names).toContain("DataProcessor");
  });

  test("covers all lines", async () => {
    const code = await readFixture("sample.scala");
    const { chunks } = await chunk("sample.scala", code);
    verifyCoverage(code, chunks);
  });

  test("no overlaps", async () => {
    const code = await readFixture("sample.scala");
    const { chunks } = await chunk("sample.scala", code);
    verifyNoOverlap(chunks);
  });
});

describe("PHP", () => {
  test("extracts classes, interfaces, functions", async () => {
    const code = await readFixture("sample.php");
    const { chunks } = await chunk("sample.php", code);

    const names = chunks.map(c => c.name).filter(Boolean);
    expect(names).toContain("DataProcessor");
    expect(names).toContain("Config");
    expect(names).toContain("createProcessor");
  });

  test("covers all lines", async () => {
    const code = await readFixture("sample.php");
    const { chunks } = await chunk("sample.php", code);
    verifyCoverage(code, chunks);
  });

  test("no overlaps", async () => {
    const code = await readFixture("sample.php");
    const { chunks } = await chunk("sample.php", code);
    verifyNoOverlap(chunks);
  });
});

describe("HTML", () => {
  test("extracts elements", async () => {
    const code = await readFixture("sample.html");
    const { chunks } = await chunk("sample.html", code);

    expect(chunks.length).toBeGreaterThan(0);
    const names = chunks.map(c => c.name).filter(Boolean);
    expect(names).toContain("html");
  });

  test("covers all lines", async () => {
    const code = await readFixture("sample.html");
    const { chunks } = await chunk("sample.html", code);
    verifyCoverage(code, chunks);
  });
});

describe("CSS", () => {
  test("extracts selectors and rules", async () => {
    const code = await readFixture("sample.css");
    const { chunks } = await chunk("sample.css", code);

    expect(chunks.length).toBeGreaterThan(0);
    // Should have some named chunks (selectors, keyframes)
    const names = chunks.map(c => c.name).filter(Boolean);
    expect(names.length).toBeGreaterThan(0);
  });

  test("covers all lines", async () => {
    const code = await readFixture("sample.css");
    const { chunks } = await chunk("sample.css", code);
    verifyCoverage(code, chunks);
  });

  test("extracts @import as import", async () => {
    const code = await readFixture("sample.css");
    const { fileImports } = await chunk("sample.css", code);
    expect(fileImports.length).toBeGreaterThan(0);
    expect(fileImports[0].source).toBe("reset.css");
  });
});

