# CV Scanner

A CLI resume scanner that extracts structured candidate data from PDF resumes using AI. It demonstrates how the [Boundary](https://withboundary.com) contract library validates and auto-repairs LLM outputs.

The same application is implemented in both **Node.js/TypeScript** and **Python** to showcase the Boundary SDK in each language.

## How It Works

1. A resume PDF from `fixtures/resumes/` is read and text is extracted locally.
2. The resume text is sent to OpenRouter for structured extraction.
3. The Boundary contract validates the response against a schema and extraction rules.
4. If validation fails, Boundary generates repair messages and retries the API call with that context.
5. On success, the validated scan is saved to a local `scans.json` file, which is ignored by git.

## Validation Rules

| Rule | Check |
|---|---|
| `valid_experience_months` | Experience `start` and `end` (when not `Present`) must be `YYYY-MM`. |
| `experience_chronology` | Each job's `end` is `Present` or not earlier than `start`. |
| `non_empty_experience_fields` | Every experience row has non-empty `company` and `role`. |
| `complete_requires_identity` | When `extraction_quality` is `complete`, `full_name` and email or phone are required. |
| `complete_requires_experience` | When `complete`, at least one job with at least one highlight is required. |
| `email_format_when_present` | `contact.email` must be a valid email when provided. |
| `skills_are_non_empty_strings` | Each skill is a non-empty trimmed string. |

## Configuration

Create a local `.env` file in this example directory:

```bash
cp .env.example .env
```

| Variable | Required | Purpose |
|---|---|---|
| `OPENROUTER_API_KEY` | Yes | Authenticates with the OpenRouter API |
| `BOUNDARY_API_KEY` | No | Enables remote observability via the Boundary SDK |

## Node.js / TypeScript

```bash
cd node
npm install
npm run dev test
npm run dev add ../fixtures/resumes/
npm run dev list
```

Key files:

- `node/src/contract.ts` defines the Zod schema, Boundary rules, and loggers.
- `node/src/scan.ts` extracts PDF text and wraps the OpenRouter call in `cvScanContract.accept()`.
- `node/src/store.ts` persists validated scans locally.
- `node/src/index.ts` exposes the `test`, `add`, and `list` CLI commands.

## Python

```bash
cd python
pip install -e .
python -m src.main test
python -m src.main add ../fixtures/resumes/
python -m src.main list
```

Key files:

- `python/src/contract.py` defines the Pydantic model, Boundary rules, and loggers.
- `python/src/scan.py` extracts PDF text and wraps the OpenRouter call in `cv_scan_contract.accept()`.
- `python/src/store.py` persists validated scans locally.
- `python/src/main.py` exposes the `test`, `add`, and `list` CLI commands.

## Project Structure

```text
cv-scanner/
├── README.md
├── .env.example
├── fixtures/
│   └── resumes/
├── node/
│   ├── package.json
│   ├── src/
│   └── tests/
└── python/
    ├── pyproject.toml
    ├── src/
    └── tests/
```
