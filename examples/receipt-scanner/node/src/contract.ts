import { z } from "zod";
import {
  createConsoleLogger,
  defineContract,
  type ContractLogger,
} from "@withboundary/contract";
import { createBoundaryLogger } from "@withboundary/sdk";

export const MODEL = process.env.OPENROUTER_MODEL ?? "openai/gpt-4o";

export const logger = createBoundaryLogger({
  apiKey: process.env.BOUNDARY_API_KEY,
  endpoint: process.env.BOUNDARY_API_URL,
  environment: "production",
  model: MODEL + " (node)",
  onError: (err) => console.error("[Boundary] Logger error:", err),
  capture: {
    inputs: false,
    outputs: false,
  },
});

if (logger) {
  console.log("[Boundary] SDK logger initialised - events will be sent to Boundary.");
} else {
  console.warn("[Boundary] BOUNDARY_API_KEY not set - remote logging disabled (console only).");
}

const consoleLogger = createConsoleLogger({
  prefix: "[Boundary]",
  showRepairs: true,
  showRawOutput: true,
  showCleanedOutput: true,
  showSuccessData: true,
});

function mergeLoggers<T>(...loggers: (ContractLogger<T> | null | undefined)[]): ContractLogger<T> {
  const valid = loggers.filter(Boolean) as ContractLogger<T>[];
  return {
    onRunStart: (ctx) => valid.forEach((l) => l.onRunStart?.(ctx)),
    onAttemptStart: (ctx) => valid.forEach((l) => l.onAttemptStart?.(ctx)),
    onRawOutput: (ctx) => valid.forEach((l) => l.onRawOutput?.(ctx)),
    onCleanedOutput: (ctx) => valid.forEach((l) => l.onCleanedOutput?.(ctx)),
    onVerifySuccess: (ctx) => valid.forEach((l) => l.onVerifySuccess?.(ctx)),
    onVerifyFailure: (ctx) => valid.forEach((l) => l.onVerifyFailure?.(ctx)),
    onRepairGenerated: (ctx) => valid.forEach((l) => l.onRepairGenerated?.(ctx)),
    onRetryScheduled: (ctx) => valid.forEach((l) => l.onRetryScheduled?.(ctx)),
    onRunSuccess: (ctx) => valid.forEach((l) => l.onRunSuccess?.(ctx)),
    onRunFailure: (ctx) => valid.forEach((l) => l.onRunFailure?.(ctx)),
  };
}

export const receiptScanSchema = z.object({
  vendor: z.string(),
  date: z.string(),
  amount: z.number(),
  currency: z.string().length(3),
  category: z.enum([
    "meals",
    "travel",
    "lodging",
    "software",
    "office",
    "other",
  ]),
  description: z.string(),
  tax: z.number().optional(),
  items: z
    .array(z.object({ name: z.string(), price: z.number() }))
    .optional(),
});

export type ReceiptScanResult = z.infer<typeof receiptScanSchema>;

export const receiptScanContract = defineContract({
  name: "receipt-scanner-node",
  logger: mergeLoggers(logger, consoleLogger),
  schema: receiptScanSchema,
  rules: [
    {
      name: "positive_amount",
      description: "Amount must be a positive number",
      check: (r) => r.amount > 0 || `amount must be positive, got ${r.amount}`,
    },
    {
      name: "valid_date",
      description: "Date must be a valid ISO 8601 date string (YYYY-MM-DD)",
      check: (r) =>
        /^\d{4}-\d{2}-\d{2}$/.test(r.date) ||
        `date "${r.date}" is not in YYYY-MM-DD format`,
    },
    {
      name: "non_empty_vendor",
      description: "Vendor name must not be empty",
      check: (r) => r.vendor.trim().length > 0 || "vendor name cannot be empty",
    },
    {
      name: "items_sum_equals_total",
      description: "If line items are present, their prices plus any tax must sum to the total amount",
      check: (r) => {
        if (!r.items || r.items.length === 0) return true;
        const itemsSum = r.items.reduce((acc, item) => acc + item.price, 0);
        const tax = r.tax ?? 0;
        const sum = itemsSum + tax;
        const diff = Math.abs(sum - r.amount);
        return (
          diff < 0.01 ||
          `item prices (${itemsSum.toFixed(2)}) + tax (${tax.toFixed(2)}) = ${sum.toFixed(2)} but amount is ${r.amount.toFixed(2)}`
        );
      },
    },
  ],
});
