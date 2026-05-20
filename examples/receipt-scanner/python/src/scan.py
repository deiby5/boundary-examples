import base64
import os
from pathlib import Path

import httpx

from withboundary.contract import ContractAttempt, Failure, Success

from .contract import MODEL, ReceiptScanResult, receipt_scan_contract

OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions"

SYSTEM_PROMPT = """You are a structured receipt data extractor. Read the attached receipt image and return a JSON object with extracted fields.

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


def scan_receipt(image_path: str) -> ReceiptScanResult:
    abs_path = Path(image_path).resolve()
    if not abs_path.exists():
        raise FileNotFoundError(f"File not found: {abs_path}")
    if abs_path.suffix.lower() != ".png":
        raise ValueError(f"Unsupported receipt format: {abs_path} (expected .png)")

    image_data = abs_path.read_bytes()
    base64_image = base64.b64encode(image_data).decode("utf-8")
    mime_type = "image/png"
    api_key = os.environ.get("OPENROUTER_API_KEY", "")
    if not api_key:
        raise RuntimeError("OPENROUTER_API_KEY environment variable is not set.")

    user_content = [
        {
            "type": "text",
            "text": "Extract structured receipt data from the attached receipt image.",
        },
        {
            "type": "image_url",
            "image_url": {
                "url": f"data:{mime_type};base64,{base64_image}",
            },
        },
    ]

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

        system_content = "\n\n".join(
            item for item in [SYSTEM_PROMPT, getattr(ctx, "instructions", "")] if item
        )

        messages: list[dict[str, object]] = [
            {"role": "system", "content": system_content},
            {"role": "user", "content": user_content},
        ]
        for repair in ctx.repairs:
            content = repair["content"] if isinstance(repair, dict) else str(repair)
            messages.append({"role": "user", "content": content})

        body = {
            "model": MODEL,
            "messages": messages,
            "temperature": 0,
        }

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
            print(f"[OpenRouter] Error body: {err.response.text[:500]}")
            raise
        except httpx.RequestError as err:
            print(f"[OpenRouter] Request error: {err}")
            raise

        data = response.json()
        content = (data.get("choices", [{}])[0].get("message", {}).get("content") or "").strip()
        print(f"[Boundary] Model responded ({len(content)} chars)")
        return content

    result = receipt_scan_contract.accept(run_fn)

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
            raise RuntimeError(f"Receipt scan output failed validation: {error}")

    raise RuntimeError("Unexpected Boundary result")
