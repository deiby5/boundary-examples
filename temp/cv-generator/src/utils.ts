import fs from "node:fs/promises";
import path from "node:path";

export function parsePositiveInt(value: string, label: string): number {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isInteger(parsed) || parsed < 1) {
    throw new Error(`${label} must be a positive integer.`);
  }
  return parsed;
}

export function slugify(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 80);
}

export function pdfFileName(index: number, fullName: string, targetRole: string): string {
  const prefix = String(index).padStart(3, "0");
  const name = slugify(fullName) || "candidate";
  const role = slugify(targetRole) || "tech_cv";
  return `${prefix}_${name}_${role}.pdf`;
}

export async function ensureDir(dir: string): Promise<void> {
  await fs.mkdir(dir, { recursive: true });
}

export async function readDirIfExists(dir: string): Promise<string[]> {
  try {
    return await fs.readdir(dir);
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw err;
  }
}

export async function prepareOutputDir(outDir: string, force: boolean): Promise<void> {
  await ensureDir(outDir);
  const entries = await readDirIfExists(outDir);
  const generatedEntries = entries.filter((entry) => entry.endsWith(".pdf") || entry === "manifest.json");

  if (generatedEntries.length > 0 && !force) {
    throw new Error(
      `Output directory already contains generated files. Use --force to replace them: ${path.resolve(outDir)}`,
    );
  }

  if (force) {
    await Promise.all(
      generatedEntries.map((entry) =>
        fs.rm(path.join(outDir, entry), {
          force: true,
          recursive: false,
        }),
      ),
    );
  }
}

export async function writeJson(filePath: string, data: unknown): Promise<void> {
  await fs.writeFile(filePath, `${JSON.stringify(data, null, 2)}\n`, "utf8");
}
