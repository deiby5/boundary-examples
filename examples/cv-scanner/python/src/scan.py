from __future__ import annotations

import base64
import os
from pathlib import Path

import httpx

from withboundary.contract import ContractAttempt, Failure, Success

from .contract import MODEL, CvScanResult, cv_scan_contract

OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions"

PDF_PROCESSING_PLUGINS = [
    {
        "id": "file-parser",
        "pdf": {
            "engine": "native",
        },
    },
]

SYSTEM_PROMPT = """You are a structured CV data extractor. Read the attached resume PDF and return a JSON object with extracted fields.

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
}"""


def encode_pdf_data_url(file_path: Path) -> str:
    encoded = base64.b64encode(file_path.read_bytes()).decode("ascii")
    return f"data:application/pdf;base64,{encoded}"


def scan_cv(file_path: str) -> CvScanResult:
    path = Path(file_path).resolve()
    if not path.exists():
        raise FileNotFoundError(f"File not found: {path}")
    if path.suffix.lower() != ".pdf":
        raise ValueError(f"Unsupported resume format: {path} (expected .pdf)")

    api_key = os.environ.get("OPENROUTER_API_KEY", "")
    if not api_key:
        raise RuntimeError("OPENROUTER_API_KEY environment variable is not set.")

    label = path.name
    pdf_data_url = encode_pdf_data_url(path)
    user_content = [
        {
            "type": "text",
            "text": "Extract structured CV data from the attached resume PDF.",
        },
        {
            "type": "file",
            "file": {
                "filename": label,
                "file_data": pdf_data_url,
            },
        },
    ]
    print(f'[Boundary] Starting contract run for "{label}"...')

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
            "plugins": PDF_PROCESSING_PLUGINS,
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

    result = cv_scan_contract.accept(run_fn)

    match result:
        case Success(data=scan, attempts=attempts, duration_ms=duration_ms):
            print(
                f"[Boundary] Contract succeeded in {attempts} attempt(s)"
                f" ({duration_ms}ms)"
            )
            return scan
        case Failure(error=error):
            issues = [
                issue
                for attempt in error.attempts
                for issue in getattr(attempt, "issues", [])
            ]
            print(f"[Boundary] Contract failed after all attempts: {issues}")
            raise RuntimeError(f"CV scan output failed validation: {error}")

    raise RuntimeError("Unexpected Boundary result")
