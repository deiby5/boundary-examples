import { cvBatchSchema, formatZodError, type CvProfile } from "./schema.js";
import { OPENROUTER_URL } from "./env.js";

type Message = {
  role: "system" | "user" | "assistant";
  content: string;
};

export type GenerateBatchOptions = {
  apiKey: string;
  model: string;
  count: number;
  seed: string;
  batchNumber: number;
  startIndex: number;
  avoidNames?: string[];
  maxAttempts?: number;
};

const SYSTEM_PROMPT = `You generate synthetic CV data for software and technology candidates.

Rules:
- Every person, company, school, link, phone number, and email address must be fictional.
- Do not use real famous people or real private individuals.
- Generate generic technology CVs across varied roles, seniority levels, stacks, industries, and locations.
- Make the content realistic, specific, and suitable for PDF CV rendering.
- Return only valid JSON. Do not wrap it in markdown code fences.`;

function buildUserPrompt(options: GenerateBatchOptions, repairFeedback?: string): string {
  const repairSection = repairFeedback
    ? `\n\nThe previous response failed validation. Fix these issues and return the complete JSON object again:\n${repairFeedback}`
    : "";
  const avoidNamesSection =
    options.avoidNames && options.avoidNames.length > 0
      ? `\n\nDo not use any of these exact full names because they have already been generated:\n${options.avoidNames.join(", ")}`
      : "";

  return `Generate exactly ${options.count} synthetic technology CV profiles.

Use this seed for variety: ${options.seed}
This is batch ${options.batchNumber}; candidate numbering starts at ${options.startIndex}.
Use globally distinct fictional full names. Prefer varied given names and surnames from different regions; do not default to Alice, Bob, Smith, Johnson, Brown, or Lee.${avoidNamesSection}

Return this JSON shape:
{
  "profiles": [
    {
      "profile_id": "candidate-${options.startIndex}",
      "full_name": "Fictional Name",
      "target_role": "Cloud Platform Engineer",
      "location": "City, Country",
      "email": "fictional.name@example.com",
      "phone": "+44 7000 000000",
      "links": {
        "linkedin": "linkedin.com/in/fictional-name",
        "github": "github.com/fictional-name",
        "portfolio": "fictional-name.dev"
      },
      "summary": "120-650 character professional summary.",
      "skills": {
        "languages": ["TypeScript", "Python", "Go"],
        "frameworks": ["React", "Node.js", "FastAPI"],
        "cloud_tools": ["AWS", "Docker", "Terraform"],
        "databases": ["PostgreSQL", "Redis"],
        "practices": ["CI/CD", "Observability", "Agile delivery"]
      },
      "experience": [
        {
          "company": "Fictional company",
          "role": "Role title",
          "location": "City, Country",
          "start": "2021-04",
          "end": "Present",
          "bullets": [
            "Achievement-focused bullet with clear technical detail and measurable business impact."
          ],
          "technologies": ["TypeScript", "AWS", "PostgreSQL"]
        }
      ],
      "projects": [
        {
          "name": "Project name",
          "description": "Specific project description with problem, action, and outcome.",
          "technologies": ["Python", "Docker"]
        }
      ],
      "education": [
        {
          "degree": "BSc Computer Science",
          "institution": "Fictional University",
          "year": 2018,
          "details": "Optional short detail"
        }
      ],
      "certifications": ["AWS Certified Solutions Architect - Associate"]
    }
  ]
}

Validation requirements:
- profiles length must be exactly ${options.count}.
- Each profile must have 2-4 experience entries, each with 3-5 substantial bullets.
- Each profile must have 2-3 projects.
- Each skills.languages array must contain at least 3 items.
- Each skills.frameworks array must contain at least 3 items.
- Each skills.cloud_tools array must contain at least 3 items.
- Each skills.databases array must contain at least 2 items.
- Each skills.practices array must contain at least 3 items.
- If a role does not naturally use one category, add adjacent credible technologies rather than leaving the array short.
- Use YYYY-MM dates, except current role end may be "Present".
- Keep bullets factual, concise, and ATS-friendly.
- Vary role families across frontend, backend, full-stack, data, cloud, DevOps, security, QA, mobile, ML, product engineering, and support engineering.${repairSection}`;
}

function extractJsonObject(raw: string): unknown {
  const trimmed = raw.trim();
  const fenced = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  const candidate = fenced ? fenced[1].trim() : trimmed;
  const start = candidate.indexOf("{");
  const end = candidate.lastIndexOf("}");

  if (start === -1 || end === -1 || end <= start) {
    throw new Error("Response did not contain a JSON object.");
  }

  return JSON.parse(candidate.slice(start, end + 1));
}

async function callOpenRouter(apiKey: string, model: string, messages: Message[]): Promise<string> {
  const response = await fetch(OPENROUTER_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      "X-Title": "Boundary Temp CV Generator",
    },
    body: JSON.stringify({
      model,
      messages,
      temperature: 0.8,
    }),
    signal: AbortSignal.timeout(120_000),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`OpenRouter request failed (${response.status}): ${body.slice(0, 500)}`);
  }

  const data = (await response.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };
  const content = data.choices?.[0]?.message?.content?.trim();

  if (!content) {
    throw new Error("OpenRouter response did not include message content.");
  }

  return content;
}

export async function generateProfileBatch(options: GenerateBatchOptions): Promise<CvProfile[]> {
  const maxAttempts = options.maxAttempts ?? 3;
  let repairFeedback = "";

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const messages: Message[] = [
      { role: "system", content: SYSTEM_PROMPT },
      { role: "user", content: buildUserPrompt(options, repairFeedback || undefined) },
    ];

    const raw = await callOpenRouter(options.apiKey, options.model, messages);

    try {
      const parsed = extractJsonObject(raw);
      const validated = cvBatchSchema.safeParse(parsed);
      if (!validated.success) {
        repairFeedback = formatZodError(validated.error);
        continue;
      }

      if (validated.data.profiles.length !== options.count) {
        repairFeedback = `profiles length was ${validated.data.profiles.length}; expected exactly ${options.count}.`;
        continue;
      }

      return validated.data.profiles;
    } catch (err) {
      repairFeedback = err instanceof Error ? err.message : String(err);
    }
  }

  throw new Error(`Could not generate a valid profile batch after ${maxAttempts} attempt(s): ${repairFeedback}`);
}
