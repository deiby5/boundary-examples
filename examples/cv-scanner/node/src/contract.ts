import { z } from "zod";
import {
  createConsoleLogger,
  defineContract,
  type ContractLogger,
} from "@withboundary/contract";
import { createBoundaryLogger } from "@withboundary/sdk";

export const MODEL = process.env.OPENROUTER_MODEL ?? "openai/gpt-4o";

const MONTH_REGEX = /^\d{4}-(0[1-9]|1[0-2])$/;

const monthSchema = z.string().regex(MONTH_REGEX, "Expected YYYY-MM");
const endMonthSchema = z.union([monthSchema, z.literal("Present")]);

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

const contactSchema = z.object({
  email: z.string().email().nullable(),
  phone: z.string().nullable(),
  linkedin: z.string().nullable(),
  github: z.string().nullable(),
  website: z.string().nullable(),
});

const experienceSchema = z.object({
  company: z.string(),
  role: z.string(),
  location: z.string().nullable(),
  start: monthSchema,
  end: endMonthSchema,
  highlights: z.array(z.string()),
});

const educationSchema = z.object({
  degree: z.string(),
  institution: z.string(),
  year: z.number().int().min(1950).max(2030).nullable(),
});

export const cvScanSchema = z.object({
  full_name: z.string().nullable(),
  headline: z.string().nullable(),
  location: z.string().nullable(),
  contact: contactSchema,
  summary: z.string().nullable(),
  skills: z.array(z.string()),
  experience: z.array(experienceSchema),
  education: z.array(educationSchema),
  certifications: z.array(z.string()),
  languages: z.array(z.string()),
  extraction_quality: z.enum(["complete", "partial", "insufficient"]),
});

export type CvScanResult = z.infer<typeof cvScanSchema>;

function isValidMonth(value: string): boolean {
  return MONTH_REGEX.test(value);
}

function monthCompare(a: string, b: string): number {
  return a.localeCompare(b);
}

export const cvScanContract = defineContract({
  name: "cv-scanner-node",
  logger: mergeLoggers(logger, consoleLogger),
  schema: cvScanSchema,
  rules: [
    {
      name: "valid_experience_months",
      description: "Experience start and end dates (when not Present) must be YYYY-MM",
      check: (r) => {
        for (const exp of r.experience) {
          if (!isValidMonth(exp.start)) {
            return `experience start "${exp.start}" is not YYYY-MM`;
          }
          if (exp.end !== "Present" && !isValidMonth(exp.end)) {
            return `experience end "${exp.end}" is not YYYY-MM or Present`;
          }
        }
        return true;
      },
    },
    {
      name: "experience_chronology",
      description: "Experience end must be Present or not earlier than start",
      check: (r) => {
        for (const exp of r.experience) {
          if (exp.end !== "Present" && monthCompare(exp.start, exp.end) > 0) {
            return `experience at ${exp.company}: start ${exp.start} is after end ${exp.end}`;
          }
        }
        return true;
      },
    },
    {
      name: "non_empty_experience_fields",
      description: "Every experience entry must have non-empty company and role",
      check: (r) => {
        for (const exp of r.experience) {
          if (!exp.company.trim()) return "experience company cannot be empty";
          if (!exp.role.trim()) return "experience role cannot be empty";
        }
        return true;
      },
    },
    {
      name: "complete_requires_identity",
      description: "Complete extractions require full_name and email or phone",
      check: (r) => {
        if (r.extraction_quality !== "complete") return true;
        if (!r.full_name?.trim()) {
          return "extraction_quality is complete but full_name is missing";
        }
        const email = r.contact.email?.trim();
        const phone = r.contact.phone?.trim();
        if (!email && !phone) {
          return "extraction_quality is complete but neither contact.email nor contact.phone is set";
        }
        return true;
      },
    },
    {
      name: "complete_requires_experience",
      description: "Complete extractions require at least one job with highlights",
      check: (r) => {
        if (r.extraction_quality !== "complete") return true;
        if (r.experience.length === 0) {
          return "extraction_quality is complete but experience is empty";
        }
        for (const exp of r.experience) {
          if (exp.highlights.length === 0) {
            return `extraction_quality is complete but experience at ${exp.company} has no highlights`;
          }
        }
        return true;
      },
    },
    {
      name: "email_format_when_present",
      description: "Contact email must be valid when provided",
      check: (r) => {
        const email = r.contact.email;
        if (email === null || email === undefined) return true;
        const parsed = z.string().email().safeParse(email);
        return parsed.success || `contact.email "${email}" is not a valid email`;
      },
    },
    {
      name: "skills_are_non_empty_strings",
      description: "Each skill must be a non-empty trimmed string",
      check: (r) => {
        for (const skill of r.skills) {
          if (!skill.trim()) return "skills array contains an empty or whitespace-only entry";
        }
        return true;
      },
    },
  ],
});
