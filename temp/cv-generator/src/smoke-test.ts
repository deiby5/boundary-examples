import fs from "node:fs/promises";
import path from "node:path";
import { renderCv } from "./render.js";
import { sampleProfiles } from "./samples.js";
import { ensureDir } from "./utils.js";

async function assertPdf(filePath: string): Promise<void> {
  const stat = await fs.stat(filePath);
  if (stat.size < 3_000) {
    throw new Error(`Expected ${filePath} to be a non-trivial PDF, got ${stat.size} bytes.`);
  }

  const handle = await fs.open(filePath, "r");
  try {
    const buffer = Buffer.alloc(5);
    await handle.read(buffer, 0, 5, 0);
    if (buffer.toString("utf8") !== "%PDF-") {
      throw new Error(`Expected ${filePath} to start with %PDF-.`);
    }
  } finally {
    await handle.close();
  }
}

async function main(): Promise<void> {
  const outDir = path.resolve(process.cwd(), "output", "smoke");
  await fs.rm(outDir, { recursive: true, force: true });
  await ensureDir(outDir);

  const results = [];
  for (let i = 0; i < sampleProfiles.length; i++) {
    results.push(await renderCv(sampleProfiles[i], outDir, i + 1));
  }

  for (const result of results) {
    await assertPdf(result.filePath);
  }

  console.log(`Smoke test passed. Rendered ${results.length} PDF files in ${outDir}`);
}

main().catch((err: unknown) => {
  console.error("Smoke test failed:", err instanceof Error ? err.message : String(err));
  process.exit(1);
});
