import fs from "fs";
import path from "path";
import { logger } from "./contract.js";
import { scanCv } from "./scan.js";
import { addScan, listScans } from "./store.js";

const [, , command, ...args] = process.argv;

const TEST_FILE = "../fixtures/resumes/001_amara_ndong_cloud_platform_engineer.pdf";

function printTable(scans: ReturnType<typeof listScans>) {
  if (scans.length === 0) {
    console.log("No scans recorded yet.");
    return;
  }
  console.log(
    "\n" +
    ["ID", "Name", "Headline", "Quality", "Jobs", "Skills", "Summary"]
      .map((h) => h.padEnd(16))
      .join("  ")
  );
  console.log("-".repeat(110));
  for (const s of scans) {
    const summary = (s.summary ?? "").slice(0, 36);
    console.log(
      [
        String(s.id).padEnd(16),
        (s.full_name ?? "Unknown").slice(0, 16).padEnd(16),
        (s.headline ?? "—").slice(0, 16).padEnd(16),
        s.extraction_quality.padEnd(16),
        String(s.experience.length).padEnd(16),
        String(s.skills.length).padEnd(16),
        summary,
      ].join("  ")
    );
  }
  console.log();
}

async function main() {
  if (!process.env.OPENROUTER_API_KEY) {
    console.error("Error: OPENROUTER_API_KEY environment variable is not set.");
    process.exit(1);
  }
  if (!process.env.BOUNDARY_API_KEY) {
    console.warn("Warning: BOUNDARY_API_KEY not set — Boundary observability disabled.");
  }

  switch (command) {
    case "add": {
      const input = args[0] ?? "../fixtures/resumes";
      const inputPath = path.resolve(input);
      const stat = fs.statSync(inputPath);

      const files: string[] = stat.isDirectory()
        ? fs.readdirSync(inputPath)
            .filter((f) => f.toLowerCase().endsWith(".pdf"))
            .sort()
            .map((f) => path.join(input, f))
        : [input];

      console.log(`Processing ${files.length} resume(s)...`);
      for (const file of files) {
        console.log(`\nScanning ${file}...`);
        try {
          const scan = await scanCv(file);
          const stored = addScan(scan, file);
          console.log(
            `  Added scan #${stored.id}: ${stored.full_name ?? "Unknown"} — ` +
              `${stored.extraction_quality} (${stored.experience.length} job(s))`,
          );
        } catch (err) {
          console.error(`  Failed: ${err instanceof Error ? err.message : String(err)}`);
        }
      }
      break;
    }

    case "test": {
      console.log(`Test run: scanning ${TEST_FILE}...`);

      console.log("\n[1/2] OpenRouter API call...");
      const scan = await scanCv(TEST_FILE);
      console.log("  OK — extracted:");
      console.log(`    Name:     ${scan.full_name ?? "Unknown"}`);
      console.log(`    Headline: ${scan.headline ?? "—"}`);
      console.log(`    Quality:  ${scan.extraction_quality}`);
      console.log(`    Jobs:     ${scan.experience.length}`);
      console.log(`    Skills:   ${scan.skills.length}`);

      console.log("\n[2/2] Boundary logging (addScan writes to store + logs via SDK)...");
      const stored = addScan(scan, TEST_FILE);
      console.log(`  OK — saved as scan #${stored.id}, scannedAt: ${stored.scannedAt}`);

      console.log("\nTest passed.");
      break;
    }

    case "list": {
      printTable(listScans());
      break;
    }

    default: {
      console.log("Usage:");
      console.log("  npm run dev test                              Scan 001_amara_ndong_cloud_platform_engineer.pdf and verify both APIs");
      console.log("  npm run dev add <resume.pdf|folder>           Scan and record a resume (or all PDFs in a folder)");
      console.log("  npm run dev list                              List all recorded scans");
    }
  }
}

main()
  .catch((err: unknown) => {
    console.error("Error:", err instanceof Error ? err.message : String(err));
    process.exit(1);
  })
  .finally(async () => {
    if (logger) {
      console.log("[Boundary] Flushing pending log events...");
      await logger.flush(5000);
      console.log("[Boundary] Flush complete.");
    }
  });
