import fs from "fs";
import path from "path";
import { type CvScanResult } from "./contract.js";

const DB_PATH = path.resolve("scans.json");

export interface StoredScan extends CvScanResult {
  id: number;
  scannedAt: string;
  file: string;
}

function load(): StoredScan[] {
  if (!fs.existsSync(DB_PATH)) return [];
  return JSON.parse(fs.readFileSync(DB_PATH, "utf-8")) as StoredScan[];
}

function save(scans: StoredScan[]): void {
  fs.writeFileSync(DB_PATH, JSON.stringify(scans, null, 2));
}

export function addScan(result: CvScanResult, file: string): StoredScan {
  const scans = load();
  const scan: StoredScan = {
    ...result,
    id: scans.length + 1,
    scannedAt: new Date().toISOString(),
    file,
  };

  console.log(
    `[Boundary] Saving scan #${scan.id}: ${scan.full_name ?? "Unknown"} — ` +
      `${scan.extraction_quality} (${scan.experience.length} job(s), ${scan.skills.length} skill(s))`,
  );
  scans.push(scan);
  save(scans);
  console.log(`[Boundary] Scan #${scan.id} written to store (total: ${scans.length} record(s))`);
  return scan;
}

export function listScans(): StoredScan[] {
  return load();
}
