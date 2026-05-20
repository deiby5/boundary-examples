import fs from "fs";
import path from "path";
import { receiptScanContract, MODEL, type ReceiptScanResult } from "./contract.js";

const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";

const SYSTEM_PROMPT = `You are a structured receipt data extractor. Read the attached receipt image and return a JSON object with extracted fields.

- vendor (string, required): the merchant or business name — must not be empty
- date (string, required): date of the transaction in strict YYYY-MM-DD format
- amount (number, required): the final total charged, as a plain number with no currency symbol — must be positive
- currency (string, required): 3-letter ISO 4217 currency code (e.g. USD, EUR, GBP, MXN)
- category (string, required): classify as exactly one of: meals, travel, lodging, software, office, other
- description (string, required): one concise sentence describing what was purchased
- tax (number, optional): the tax amount shown on the receipt, as a plain number; omit if not visible
- items (array, optional): line items if visible on the receipt, each as { "name": string, "price": number }; omit if no line items are shown

Critical constraints:
1. amount must be strictly positive.
2. date must match exactly YYYY-MM-DD (e.g. "2024-03-15").
3. If items are included, the sum of all item prices plus tax (or 0 if tax is omitted) must equal amount within $0.01. Do not include items unless you are confident the prices sum correctly to the total.

Return ONLY the raw JSON object — no markdown code fences, no \`\`\`json, no explanations, no trailing text.`;

export async function scanReceipt(imagePath: string): Promise<ReceiptScanResult> {
  const absPath = path.resolve(imagePath);
  if (!fs.existsSync(absPath)) {
    throw new Error(`File not found: ${absPath}`);
  }
  if (path.extname(absPath).toLowerCase() !== ".png") {
    throw new Error(`Unsupported receipt format: ${absPath} (expected .png)`);
  }

  const imageData = fs.readFileSync(absPath);
  const base64 = imageData.toString("base64");
  const mimeType = "image/png";
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) {
    throw new Error("OPENROUTER_API_KEY environment variable is not set.");
  }

  const label = path.basename(absPath);
  const userContent = [
    {
      type: "text",
      text: "Extract structured receipt data from the attached receipt image.",
    },
    {
      type: "image_url",
      image_url: { url: `data:${mimeType};base64,${base64}` },
    },
  ];

  console.log(`[Boundary] Starting contract run for "${label}"...`);

  const result = await receiptScanContract.accept(async (attempt) => {
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
    const repairMessages = attempt.repairs.map((repair) =>
      typeof repair === "string" ? { role: "user", content: repair } : repair
    );

    const body = {
      model: MODEL,
      messages: [
        { role: "system", content: systemContent },
        { role: "user", content: userContent },
        ...repairMessages,
      ],
      temperature: 0,
    };

    let response: Response;
    try {
      response = await fetch(OPENROUTER_URL, {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${apiKey}`,
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
    throw new Error(`Receipt scan output failed validation: ${result.error.message}`);
  }

  console.log(`[Boundary] Contract succeeded in ${result.attempts} attempt(s) (${result.durationMS}ms)`);
  return result.data;
}
