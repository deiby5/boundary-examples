import { z } from "zod";

const monthSchema = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, {
  message: "Expected YYYY-MM",
});

const endMonthSchema = z.union([monthSchema, z.literal("Present")]);

const nonEmptyString = z.string().trim().min(1);
const bulletSchema = z.string().trim().min(35).max(220);

export const cvProfileSchema = z.object({
  profile_id: z.string().trim().min(3).max(80),
  full_name: z.string().trim().min(2).max(80),
  target_role: z.string().trim().min(3).max(90),
  location: z.string().trim().min(2).max(90),
  email: z.string().email(),
  phone: z.string().trim().min(7).max(30),
  links: z
    .object({
      linkedin: z.string().trim().max(120).optional(),
      github: z.string().trim().max(120).optional(),
      portfolio: z.string().trim().max(120).optional(),
    })
    .default({}),
  summary: z.string().trim().min(120).max(650),
  skills: z.object({
    languages: z.array(nonEmptyString).min(3).max(10),
    frameworks: z.array(nonEmptyString).min(3).max(12),
    cloud_tools: z.array(nonEmptyString).min(3).max(12),
    databases: z.array(nonEmptyString).min(2).max(8),
    practices: z.array(nonEmptyString).min(3).max(10),
  }),
  experience: z
    .array(
      z
        .object({
          company: z.string().trim().min(2).max(90),
          role: z.string().trim().min(2).max(90),
          location: z.string().trim().min(2).max(90),
          start: monthSchema,
          end: endMonthSchema,
          bullets: z.array(bulletSchema).min(3).max(5),
          technologies: z.array(nonEmptyString).min(3).max(10),
        })
        .refine((item) => item.end === "Present" || item.start <= item.end, {
          message: "Experience end date must be Present or not earlier than start date",
          path: ["end"],
        }),
    )
    .min(2)
    .max(4),
  projects: z
    .array(
      z.object({
        name: z.string().trim().min(2).max(90),
        description: z.string().trim().min(60).max(260),
        technologies: z.array(nonEmptyString).min(2).max(8),
      }),
    )
    .min(2)
    .max(3),
  education: z
    .array(
      z.object({
        degree: z.string().trim().min(2).max(120),
        institution: z.string().trim().min(2).max(120),
        year: z.number().int().min(1990).max(2026),
        details: z.string().trim().max(180).optional(),
      }),
    )
    .min(1)
    .max(3),
  certifications: z.array(nonEmptyString).max(5).default([]),
});

export const cvBatchSchema = z.object({
  profiles: z.array(cvProfileSchema).min(1),
});

export type CvProfile = z.infer<typeof cvProfileSchema>;
export type CvBatch = z.infer<typeof cvBatchSchema>;

export function formatZodError(error: z.ZodError): string {
  return error.issues
    .slice(0, 25)
    .map((issue) => {
      const path = issue.path.length > 0 ? issue.path.join(".") : "root";
      return `${path}: ${issue.message}`;
    })
    .join("\n");
}
