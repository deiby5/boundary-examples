import fs from "fs";
import path from "path";
import { scanReceipt } from "./scan.js";
import { addExpense, listExpenses } from "./store.js";
import { logger } from "./contract.js";

const [, , command, ...args] = process.argv;

function printTable(expenses: ReturnType<typeof listExpenses>) {
  if (expenses.length === 0) {
    console.log("No expenses recorded yet.");
    return;
  }
  console.log(
    "\n" +
    ["ID", "Date", "Vendor", "Amount", "Category", "Description"]
      .map((h) => h.padEnd(18))
      .join("  ")
  );
  console.log("-".repeat(110));
  for (const e of expenses) {
    console.log(
      [
        String(e.id).padEnd(18),
        e.date.padEnd(18),
        e.vendor.slice(0, 18).padEnd(18),
        `${e.currency} ${e.amount.toFixed(2)}`.padEnd(18),
        e.category.padEnd(18),
        e.description.slice(0, 40),
      ].join("  ")
    );
  }
  const total = expenses.reduce((sum, e) => sum + e.amount, 0);
  console.log("-".repeat(110));
  console.log(`Total: ${expenses[0]?.currency ?? ""} ${total.toFixed(2)}\n`);
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
      const input = args[0] ?? "../fixtures/receipts";
      const inputPath = path.resolve(input);
      const stat = fs.statSync(inputPath);

      const files: string[] = stat.isDirectory()
        ? fs.readdirSync(inputPath)
            .filter((f) => f.toLowerCase().endsWith(".png"))
            .sort()
            .map((f) => path.join(input, f))
        : [input];

      console.log(`Processing ${files.length} receipt(s)...`);
      for (const file of files) {
        console.log(`\nScanning ${file}...`);
        try {
          const receipt = await scanReceipt(file);
          const expense = addExpense(receipt, file);
          console.log(`  Added expense #${expense.id}: ${expense.vendor} — ${expense.currency} ${expense.amount.toFixed(2)}`);
        } catch (err) {
          console.error(`  Failed: ${err instanceof Error ? err.message : String(err)}`);
        }
      }
      break;
    }

    case "test": {
      const testFile = "../fixtures/receipts/receipt_0001.png";
      console.log(`Test run: scanning ${testFile}...`);

      console.log("\n[1/2] OpenRouter API call...");
      const receipt = await scanReceipt(testFile);
      console.log("  OK — extracted:");
      console.log(`    Vendor:   ${receipt.vendor}`);
      console.log(`    Date:     ${receipt.date}`);
      console.log(`    Amount:   ${receipt.currency} ${receipt.amount.toFixed(2)}`);
      console.log(`    Category: ${receipt.category}`);
      console.log(`    Note:     ${receipt.description}`);

      console.log("\n[2/2] Boundary logging (addExpense writes to store + logs via SDK)...");
      const expense = addExpense(receipt, testFile);
      console.log(`  OK — saved as expense #${expense.id}, scannedAt: ${expense.scannedAt}`);

      console.log("\nTest passed.");
      break;
    }

    case "list": {
      const expenses = listExpenses();
      printTable(expenses);
      break;
    }

    default: {
      console.log("Usage:");
      console.log("  npm run dev test                Scan receipt_0001.png and verify both APIs");
      console.log("  npm run dev add <receipt.png|folder>   Scan and record a receipt (or all PNGs in a folder)");
      console.log("  npm run dev list                List all recorded expenses");
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
