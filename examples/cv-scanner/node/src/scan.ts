import fs from "fs";
import path from "path";
import { cvScanContract, MODEL, type CvScanResult } from "./contract.js";

const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";

const PDF_PROCESSING_PLUGINS = [
  {
    id: "file-parser",
    pdf: {
      engine: "native",
    },
  },
];

const SYSTEM_PROMPT = `You are a structured CV data extractor. Read the attached resume PDF and return a JSON object with extracted fields.

Rules:
- Extract ONLY information explicitly stated in the resume. Do NOT invent employers, dates, skills, or credentials.
- Use null for missing scalar fields. Use empty arrays when a section is absent.
- Dates must use YYYY-MM (e.g. "2021-03"). Use "Present" for current roles.
- Deduplicate skills. Each highlight must be a concise bullet from the CV.
- Set extraction_quality to:
  - "complete" when name, contact (email or phone), and at least one job with highlights are clearly present
  - "partial" when some sections are readable but key fields are missing
  - "insufficient" when the text is too sparse or garbled to extract reliably
- If extraction_quality is "complete", you MUST provide full_name, contact.email or contact.phone, and at least one experience entry with highlights.

Return ONLY valid JSON with this exact structure, no markdown code fences and no extra text:

{
  "full_name": "string or null",
  "headline": "string or null",
  "location": "string or null",
  "contact": {
    "email": "string or null",
    "phone": "string or null",
    "linkedin": "string or null",
    "github": "string or null",
    "website": "string or null"
  },
  "summary": "string or null",
  "skills": ["string"],
  "experience": [
    {
      "company": "string",
      "role": "string",
      "location": "string or null",
      "start": "YYYY-MM",
      "end": "YYYY-MM or Present",
      "highlights": ["string"]
    }
  ],
  "education": [
    {
      "degree": "string",
      "institution": "string",
      "year": "number or null"
    }
  ],
  "certifications": ["string"],
  "languages": ["string"],
  "extraction_quality": "complete" | "partial" | "insufficient"
}`;

function encodePdfDataUrl(filePath: string): string {
  const buffer = fs.readFileSync(filePath);
  return `data:application/pdf;base64,${buffer.toString("base64")}`;
}

export async function scanCv(filePath: string): Promise<CvScanResult> {
  const absPath = path.resolve(filePath);
  if (!fs.existsSync(absPath)) {
    throw new Error(`File not found: ${absPath}`);
  }
  if (path.extname(absPath).toLowerCase() !== ".pdf") {
    throw new Error(`Unsupported resume format: ${absPath} (expected .pdf)`);
  }

  const label = path.basename(absPath);
  const pdfDataUrl = encodePdfDataUrl(absPath);
  const apiKey = process.env.OPENROUTER_API_KEY;
  const userContent = [
    {
      type: "text",
      text: "Extract structured CV data from the attached resume PDF.",
    },
    {
      type: "file",
      file: {
        filename: label,
        file_data: pdfDataUrl,
      },
    },
  ];

  console.log(`[Boundary] Starting contract run for "${label}"...`);

  const result = await cvScanContract.accept(async (attempt) => {
    const isRetry = attempt.repairs.length > 0;
    if (isRetry) {
      console.log(`[Boundary] Attempt ${attempt.attempt}/${attempt.maxAttempts} — retrying with ${attempt.repairs.length} repair message(s)`);
    } else {
      console.log(`[Boundary] Attempt ${attempt.attempt}/${attempt.maxAttempts} — sending to model...`);
    }

    const systemContent = [
      SYSTEM_PROMPT,
      attempt.instructions,
    ].filter(Boolean).join("\n\n");

    const body = {
      model: MODEL,
      messages: [
        { role: "system", content: systemContent },
        { role: "user", content: userContent },
        ...attempt.repairs,
      ],
      plugins: PDF_PROCESSING_PLUGINS,
      temperature: 0,
    };

    let response: Response;
    try {
      response = await fetch(OPENROUTER_URL, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(120_000),
      });
    } catch (err) {
      console.error("[OpenRouter] Request error:", err instanceof Error ? err.message : String(err));
      throw err;
    }

    if (!response.ok) {
      const text = await response.text();
      console.error("[OpenRouter] Error status:", response.status);
      console.error("[OpenRouter] Error body:", text.slice(0, 500));
      throw new Error(`OpenRouter request failed: ${response.status} ${text.slice(0, 200)}`);
    }

    const data = await response.json();
    const content: string = data.choices?.[0]?.message?.content?.trim() ?? "";
    console.log(`[Boundary] Model responded (${content.length} chars)`);
    return content;
  });

  if (!result.ok) {
    console.error("[Boundary] Contract failed after all attempts:", result.error.attempts.map((a) => a.issues).flat());
    throw new Error(`CV scan output failed validation: ${result.error.message}`);
  }

  console.log(`[Boundary] Contract succeeded in ${result.attempts} attempt(s) (${result.durationMS}ms)`);
  return result.data;
}
