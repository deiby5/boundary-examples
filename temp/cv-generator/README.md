# Temp CV Generator

Generates synthetic, generic technology CVs as PDF files. OpenRouter creates structured profile data, Zod validates it, and PDFKit renders consistent ATS-readable PDFs locally.

Generated PDFs are written to `output/`, which is ignored by git.

## Setup

```bash
cd temp/cv-generator
npm install
cp .env.example .env
```

Add your OpenRouter key to `.env`:

```bash
OPENROUTER_API_KEY=...
OPENROUTER_MODEL=openai/gpt-4o-mini
```

## Generate 100 CVs

```bash
npm run generate -- --count 100
```

Useful options:

```bash
npm run generate -- --count 100 --batch-size 10 --seed generic-tech-v1
npm run generate -- --count 25 --out ./output/smaller-run --force
```

| Option | Default | Purpose |
|---|---:|---|
| `--count` | `100` | Number of valid PDF CVs to create. |
| `--out` | `./output` | Output directory for PDFs and `manifest.json`. |
| `--seed` | `generic-tech-cv-v1` | Prompt seed used for variety/reproducibility. |
| `--batch-size` | `10` | Profiles requested per OpenRouter call. |
| `--force` | `false` | Remove generated PDFs and manifest in the output directory before writing. |

## Smoke Test

The smoke test does not call OpenRouter. It renders two fixed sample profiles and verifies the files look like real PDFs.

```bash
npm run smoke
```

## Output

The generator writes:

- `001_candidate_name_role.pdf`, etc.
- `manifest.json` with filenames, candidate names, roles, model, seed, and generation time.

All generated files under `output/` are ignored by git.
