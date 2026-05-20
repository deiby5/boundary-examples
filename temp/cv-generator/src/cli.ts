import path from "node:path";
import { loadLocalEnv, getOpenRouterConfig } from "./env.js";
import { generateProfileBatch } from "./openrouter.js";
import { renderCv } from "./render.js";
import { parsePositiveInt, prepareOutputDir, writeJson } from "./utils.js";

type CliOptions = {
  count: number;
  out: string;
  seed: string;
  batchSize: number;
  force: boolean;
};

type ManifestEntry = {
  index: number;
  fileName: string;
  bytes: number;
  profileId: string;
  fullName: string;
  targetRole: string;
};

const DEFAULT_OPTIONS: CliOptions = {
  count: 100,
  out: path.resolve(process.cwd(), "output"),
  seed: "generic-tech-cv-v1",
  batchSize: 10,
  force: false,
};

function normaliseName(name: string): string {
  return name.trim().toLowerCase().replace(/\s+/g, " ");
}

function assertUniqueNames(profiles: { full_name: string }[], existingNames: Set<string>): void {
  const batchNames = new Set<string>();
  for (const profile of profiles) {
    const name = normaliseName(profile.full_name);
    if (existingNames.has(name)) {
      throw new Error(`Generated duplicate candidate name already used: ${profile.full_name}`);
    }
    if (batchNames.has(name)) {
      throw new Error(`Generated duplicate candidate name within batch: ${profile.full_name}`);
    }
    batchNames.add(name);
  }
}

function printUsage(): void {
  console.log("Usage:");
  console.log("  npm run generate -- --count 100");
  console.log("  npm run generate -- --count 25 --batch-size 5 --seed generic-tech-v1 --force");
  console.log("");
  console.log("Options:");
  console.log("  --count <number>       Number of valid PDF CVs to create (default: 100)");
  console.log("  --out <directory>      Output directory (default: ./output)");
  console.log("  --seed <value>         Prompt seed for variety (default: generic-tech-cv-v1)");
  console.log("  --batch-size <number>  Profiles requested per OpenRouter call (default: 10)");
  console.log("  --force                Replace generated PDFs and manifest in the output directory");
}

function parseArgs(args: string[]): CliOptions {
  const options = { ...DEFAULT_OPTIONS };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];

    if (arg === "--help" || arg === "-h") {
      printUsage();
      process.exit(0);
    }

    if (arg === "--force") {
      options.force = true;
      continue;
    }

    const readValue = (label: string): string => {
      const value = args[i + 1];
      if (!value || value.startsWith("--")) {
        throw new Error(`${label} requires a value.`);
      }
      i++;
      return value;
    };

    if (arg === "--count") {
      options.count = parsePositiveInt(readValue("--count"), "--count");
    } else if (arg.startsWith("--count=")) {
      options.count = parsePositiveInt(arg.slice("--count=".length), "--count");
    } else if (arg === "--out") {
      options.out = path.resolve(readValue("--out"));
    } else if (arg.startsWith("--out=")) {
      options.out = path.resolve(arg.slice("--out=".length));
    } else if (arg === "--seed") {
      options.seed = readValue("--seed");
    } else if (arg.startsWith("--seed=")) {
      options.seed = arg.slice("--seed=".length);
    } else if (arg === "--batch-size") {
      options.batchSize = parsePositiveInt(readValue("--batch-size"), "--batch-size");
    } else if (arg.startsWith("--batch-size=")) {
      options.batchSize = parsePositiveInt(arg.slice("--batch-size=".length), "--batch-size");
    } else {
      throw new Error(`Unknown option: ${arg}`);
    }
  }

  if (options.batchSize > 20) {
    throw new Error("--batch-size must be 20 or less to keep model responses reliable.");
  }

  return options;
}

async function main(): Promise<void> {
  loadLocalEnv();
  const options = parseArgs(process.argv.slice(2));
  const { apiKey, model } = getOpenRouterConfig();

  await prepareOutputDir(options.out, options.force);

  const manifest: ManifestEntry[] = [];
  const maxFailedBatches = Math.max(6, Math.ceil(options.count / options.batchSize) * 2);
  let failedBatches = 0;
  let batchNumber = 1;
  const usedNames = new Set<string>();

  console.log(`Generating ${options.count} synthetic technology CV PDF(s)...`);
  console.log(`Model: ${model}`);
  console.log(`Output: ${options.out}`);

  while (manifest.length < options.count) {
    const remaining = options.count - manifest.length;
    const batchCount = Math.min(options.batchSize, remaining);
    const startIndex = manifest.length + 1;

    try {
      console.log(`\n[Batch ${batchNumber}] Requesting ${batchCount} profile(s) from OpenRouter...`);
      const profiles = await generateProfileBatch({
        apiKey,
        model,
        count: batchCount,
        seed: options.seed,
        batchNumber,
        startIndex,
        avoidNames: manifest.map((entry) => entry.fullName),
      });
      assertUniqueNames(profiles, usedNames);

      for (const profile of profiles) {
        const index = manifest.length + 1;
        const rendered = await renderCv(profile, options.out, index);
        manifest.push({
          index,
          fileName: rendered.fileName,
          bytes: rendered.bytes,
          profileId: profile.profile_id,
          fullName: profile.full_name,
          targetRole: profile.target_role,
        });
        usedNames.add(normaliseName(profile.full_name));
        console.log(`  Wrote ${rendered.fileName}`);
      }

      batchNumber++;
    } catch (err) {
      failedBatches++;
      const message = err instanceof Error ? err.message : String(err);
      console.error(`  Batch failed: ${message}`);

      if (failedBatches >= maxFailedBatches) {
        throw new Error(`Stopped after ${failedBatches} failed batch attempt(s). Last error: ${message}`);
      }
    }
  }

  await writeJson(path.join(options.out, "manifest.json"), {
    generatedAt: new Date().toISOString(),
    count: manifest.length,
    model,
    seed: options.seed,
    files: manifest,
  });

  console.log(`\nDone. Created ${manifest.length} PDF CV(s) and manifest.json in ${options.out}`);
}

main().catch((err: unknown) => {
  console.error("Error:", err instanceof Error ? err.message : String(err));
  process.exit(1);
});
