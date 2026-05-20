# Receipt Scanner

A CLI receipt scanner that extracts structured expense data from receipt images using AI. It demonstrates how the [Boundary](https://withboundary.com) contract library validates and auto-repairs LLM outputs.

The same application is implemented in both **Node.js/TypeScript** and **Python** to showcase the Boundary SDK in each language.

## How It Works

1. A receipt PNG from `fixtures/receipts/` is read and base64-encoded.
2. The image is sent to the OpenRouter vision API with instructions to return structured JSON.
3. The Boundary contract validates the response against a schema and business rules.
4. If validation fails, Boundary generates repair messages and retries the API call with that context.
5. On success, the validated expense is saved to a local `expenses.json` file, which is ignored by git.

## Validation Rules

| Rule | Check |
|---|---|
| `positive_amount` | `amount > 0` |
| `valid_date` | Date matches `YYYY-MM-DD` |
| `non_empty_vendor` | Vendor string is not blank |
| `items_sum_equals_total` | If line items exist, their prices plus tax equal the total within `$0.01` |

## Configuration

Create a local `.env` file in this example directory:

```bash
cp .env.example .env
```

| Variable | Required | Purpose |
|---|---|---|
| `OPENROUTER_API_KEY` | Yes | Authenticates with the OpenRouter vision API |
| `BOUNDARY_API_KEY` | No | Enables remote observability via the Boundary SDK |

## Node.js / TypeScript

```bash
cd node
npm install
npm run dev test
npm run dev add ../fixtures/receipts/
npm run dev list
```

Key files:

- `node/src/contract.ts` defines the Zod schema, Boundary rules, and loggers.
- `node/src/scan.ts` wraps the OpenRouter call in `receiptContract.accept()`.
- `node/src/store.ts` persists validated expenses locally.
- `node/src/index.ts` exposes the `test`, `add`, and `list` CLI commands.

## Python

```bash
cd python
pip install -e .
python -m src.main test
python -m src.main add ../fixtures/receipts/
python -m src.main list
```

Key files:

- `python/src/contract.py` defines the Pydantic model, Boundary rules, and loggers.
- `python/src/scan.py` wraps the OpenRouter call in `receipt_contract.accept()`.
- `python/src/store.py` persists validated expenses locally.
- `python/src/main.py` exposes the `test`, `add`, and `list` CLI commands.

## Project Structure

```text
receipt-scanner/
├── README.md
├── .env.example
├── fixtures/
│   ├── receipts/
│   └── expected/
├── node/
│   ├── package.json
│   ├── src/
│   └── tests/
└── python/
    ├── pyproject.toml
    ├── src/
    └── tests/
```
