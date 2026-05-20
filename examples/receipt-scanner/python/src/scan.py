import base64
import json
import os
from pathlib import Path

import httpx

from withboundary.contract import ContractAttempt, Failure, Success

from .contract import MODEL, Receipt, receipt_contract

OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions"

PROMPT = """You are an expense-tracking assistant. Extract the expense details from this receipt image and return a single JSON object with exactly these fields:

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

Return ONLY the raw JSON object — no markdown code fences, no ```json, no explanations, no trailing text."""


def scan_receipt(image_path: str) -> Receipt:
    abs_path = Path(image_path).resolve()
    if not abs_path.exists():
        raise FileNotFoundError(f"File not found: {abs_path}")

    image_data = abs_path.read_bytes()
    base64_image = base64.b64encode(image_data).decode("utf-8")
    mime_type = "image/png"
    api_key = os.environ.get("OPENROUTER_API_KEY", "")

    print(f'[Boundary] Starting contract run for "{abs_path.name}"...')

    def run_fn(ctx: ContractAttempt) -> str:
        is_retry = bool(ctx.repairs)
        if is_retry:
            print(
                f"[Boundary] Attempt {ctx.attempt}/{ctx.max_attempts}"
                f" — retrying with {len(ctx.repairs)} repair message(s)"
            )
        else:
            print(
                f"[Boundary] Attempt {ctx.attempt}/{ctx.max_attempts}"
                " — sending to model..."
            )

        if is_retry:
            repair_texts = [
                r["content"] if isinstance(r, dict) else str(r)
                for r in ctx.repairs
            ]
            prompt_text = "\n\n".join([PROMPT] + repair_texts)
        else:
            prompt_text = PROMPT

        body = {
            "model": MODEL,
            "messages": [
                {
                    "role": "user",
                    "content": [
                        {"type": "text", "text": prompt_text},
                        {
                            "type": "image_url",
                            "image_url": {
                                "url": f"data:{mime_type};base64,{base64_image}"
                            },
                        },
                    ],
                }
            ],
        }

        def _sanitize_log(obj: object) -> object:
            """Replace base64 data URIs with a placeholder for readable logs."""
            if isinstance(obj, dict):
                return {k: _sanitize_log(v) for k, v in obj.items()}
            if isinstance(obj, list):
                return [_sanitize_log(v) for v in obj]
            if isinstance(obj, str) and obj.startswith("data:image/"):
                return f"data:{mime_type};base64,<base64_omitted>"
            return obj

        print(f"[OpenRouter] Request: {json.dumps(_sanitize_log(body), indent=2)}")

        try:
            response = httpx.post(
                OPENROUTER_URL,
                headers={
                    "Authorization": f"Bearer {api_key}",
                    "Content-Type": "application/json",
                },
                json=body,
                timeout=120,
            )
            response.raise_for_status()
        except httpx.HTTPStatusError as err:
            print(f"[OpenRouter] Error status: {err.response.status_code}")
            print(f"[OpenRouter] Error body: {err.response.text}")
            raise
        except httpx.RequestError as err:
            print(f"[OpenRouter] Request error: {err}")
            raise

        data = response.json()
        print(f"[OpenRouter] Response: {json.dumps(data, indent=2)}")

        content = data["choices"][0]["message"]["content"] or ""
        print(f"[Boundary] Model responded ({len(content)} chars)")
        return content

    result = receipt_contract.accept(run_fn)

    match result:
        case Success(data=receipt, attempts=attempts, duration_ms=duration_ms):
            print(
                f"[Boundary] Contract succeeded in {attempts} attempt(s)"
                f" ({duration_ms}ms)"
            )
            return receipt
        case Failure(error=error):
            issues = [
                issue
                for attempt in error.attempts
                for issue in getattr(attempt, "issues", [])
            ]
            print(f"[Boundary] Contract failed after all attempts: {issues}")
            raise RuntimeError(f"Failed to extract receipt data: {error}")
