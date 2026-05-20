import path from "node:path";
import { config } from "dotenv";

export const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";
export const DEFAULT_MODEL = "openai/gpt-4o";

export function loadLocalEnv(): void {
  config({ path: path.resolve(process.cwd(), ".env") });
}

export function getOpenRouterConfig(): { apiKey: string; model: string } {
  const apiKey = process.env.OPENROUTER_API_KEY?.trim();
  if (!apiKey) {
    throw new Error("OPENROUTER_API_KEY is not set. Create temp/cv-generator/.env from .env.example.");
  }

  return {
    apiKey,
    model: process.env.OPENROUTER_MODEL?.trim() || DEFAULT_MODEL,
  };
}
