import { describe, test, expect } from "bun:test";
import { resolveImport, chunkProject } from "../src";
import { join } from "path";

const FIXTURES = join(import.meta.dir, "fixtures");
const PROJECT = join(FIXTURES, "project");

describe("Phase 5: Cross-File Context", () => {
  describe("resolveImport", () => {
    test("resolves relative .ts imports", () => {
      const fromFile = join(PROJECT, "main.ts");
      const resolved = resolveImport("./utils", fromFile, PROJECT, "typescript");
      expect(resolved).toBe(join(PROJECT, "utils.ts"));
    });

    test("resolves relative import with extension", () => {
      const fromFile = join(PROJECT, "main.ts");
      const resolved = resolveImport("./types", fromFile, PROJECT, "typescript");
      expect(resolved).toBe(join(PROJECT, "types.ts"));
    });

    test("returns undefined for bare imports", () => {
      const fromFile = join(PROJECT, "main.ts");
      const resolved = resolveImport("react", fromFile, PROJECT, "typescript");
      expect(resolved).toBeUndefined();
    });

    test("returns undefined for node built-ins", () => {
      const fromFile = join(PROJECT, "main.ts");
      const resolved = resolveImport("fs/promises", fromFile, PROJECT, "typescript");
      expect(resolved).toBeUndefined();
    });
  });

  describe("chunkProject", () => {
    test("chunks all files in project directory", async () => {
      const result = await chunkProject(PROJECT);
      expect(result.totalFiles).toBe(3);
      expect(result.totalChunks).toBeGreaterThan(0);
    });

    test("resolves import paths", async () => {
      const result = await chunkProject(PROJECT);
      const mainCtx = result.files.get(join(PROJECT, "main.ts"));
      expect(mainCtx).toBeDefined();

      const resolvedImports = mainCtx!.imports.filter(i => i.resolvedPath);
      expect(resolvedImports.length).toBeGreaterThan(0);

      const resolvedPaths = resolvedImports.map(i => i.resolvedPath);
      expect(resolvedPaths).toContain(join(PROJECT, "utils.ts"));
      expect(resolvedPaths).toContain(join(PROJECT, "types.ts"));
    });

    test("builds importedBy graph", async () => {
      const result = await chunkProject(PROJECT);

      // utils.ts is imported by main.ts
      const utilsImportedBy = result.graph.importedBy.get(join(PROJECT, "utils.ts"));
      expect(utilsImportedBy).toBeDefined();
      expect(utilsImportedBy!.has(join(PROJECT, "main.ts"))).toBe(true);

      // types.ts is imported by main.ts
      const typesImportedBy = result.graph.importedBy.get(join(PROJECT, "types.ts"));
      expect(typesImportedBy).toBeDefined();
      expect(typesImportedBy!.has(join(PROJECT, "main.ts"))).toBe(true);
    });

    test("builds importsFrom graph", async () => {
      const result = await chunkProject(PROJECT);

      // main.ts imports from utils.ts and types.ts
      const mainImportsFrom = result.graph.importsFrom.get(join(PROJECT, "main.ts"));
      expect(mainImportsFrom).toBeDefined();
      expect(mainImportsFrom!.has(join(PROJECT, "utils.ts"))).toBe(true);
      expect(mainImportsFrom!.has(join(PROJECT, "types.ts"))).toBe(true);
    });

    test("respects resolveImports: false", async () => {
      const result = await chunkProject(PROJECT, { resolveImports: false });
      const mainCtx = result.files.get(join(PROJECT, "main.ts"));
      const resolvedImports = mainCtx!.imports.filter(i => i.resolvedPath);
      expect(resolvedImports.length).toBe(0);
    });

    test("includes file exports", async () => {
      const result = await chunkProject(PROJECT);
      const utilsCtx = result.files.get(join(PROJECT, "utils.ts"));
      expect(utilsCtx).toBeDefined();
      const exportNames = utilsCtx!.exports.map(e => e.name);
      expect(exportNames).toContain("formatDate");
      expect(exportNames).toContain("parseNumber");
      expect(exportNames).toContain("VERSION");
    });
  });
});
