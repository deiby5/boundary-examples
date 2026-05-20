import os
import sys
from pathlib import Path

from dotenv import load_dotenv

# Load .env from the cv-scanner example directory.
load_dotenv(Path(__file__).parent.parent.parent / ".env")

from .contract import boundary_logger  # noqa: E402 — must come after load_dotenv
from .scan import scan_cv  # noqa: E402
from .store import add_scan, list_scans  # noqa: E402

TEST_FILE = (
    Path(__file__).parent.parent.parent
    / "fixtures"
    / "resumes"
    / "001_amara_ndong_cloud_platform_engineer.pdf"
)


def print_table(scans: list[dict]) -> None:
    if not scans:
        print("No scans recorded yet.")
        return

    headers = ["ID", "Name", "Headline", "Quality", "Jobs", "Skills", "Summary"]
    print("\n" + "  ".join(h.ljust(16) for h in headers))
    print("-" * 110)
    for s in scans:
        summary = (s.get("summary") or "")[:36]
        print(
            "  ".join([
                str(s["id"]).ljust(16),
                (s.get("full_name") or "Unknown")[:16].ljust(16),
                (s.get("headline") or "—")[:16].ljust(16),
                s["extraction_quality"].ljust(16),
                str(len(s.get("experience") or [])).ljust(16),
                str(len(s.get("skills") or [])).ljust(16),
                summary,
            ])
        )
    print()


def main() -> None:
    args = sys.argv[1:]
    command = args[0] if args else None
    rest = args[1:]

    if not os.environ.get("OPENROUTER_API_KEY"):
        print("Error: OPENROUTER_API_KEY environment variable is not set.")
        sys.exit(1)
    if not os.environ.get("BOUNDARY_API_KEY"):
        print("Warning: BOUNDARY_API_KEY not set — Boundary observability disabled.")

    try:
        if command == "add":
            input_path = Path(rest[0] if rest else "../fixtures/resumes").resolve()
            if not input_path.exists():
                print(f"Error: path not found: {input_path}")
                sys.exit(1)

            if input_path.is_dir():
                files = sorted(input_path.glob("*.pdf"))
            else:
                files = [input_path]

            print(f"Processing {len(files)} resume(s)...")
            for file in files:
                print(f"\nScanning {file}...")
                try:
                    scan = scan_cv(str(file))
                    stored = add_scan(scan, str(file))
                    print(
                        f"  Added scan #{stored['id']}: "
                        f"{stored.get('full_name') or 'Unknown'} — "
                        f"{stored['extraction_quality']} "
                        f"({len(stored.get('experience') or [])} job(s))"
                    )
                except Exception as err:
                    print(f"  Failed: {err}")

        elif command == "test":
            test_file = str(TEST_FILE)
            print(f"Test run: scanning {test_file}...")

            print("\n[1/2] OpenRouter API call...")
            scan = scan_cv(test_file)
            print("  OK — extracted:")
            print(f"    Name:     {scan.full_name or 'Unknown'}")
            print(f"    Headline: {scan.headline or '—'}")
            print(f"    Quality:  {scan.extraction_quality}")
            print(f"    Jobs:     {len(scan.experience)}")
            print(f"    Skills:   {len(scan.skills)}")

            if (
                scan.extraction_quality == "insufficient"
                or not (scan.full_name or "").strip()
                or not scan.experience
                or not scan.skills
            ):
                raise RuntimeError(
                    "CV smoke test did not extract enough structured data "
                    "from the sample resume."
                )

            print("\n[2/2] Boundary logging (add_scan writes to store + logs via SDK)...")
            stored = add_scan(scan, test_file)
            print(f"  OK — saved as scan #{stored['id']}, scanned_at: {stored['scanned_at']}")

            print("\nTest passed.")

        elif command == "list":
            print_table(list_scans())

        else:
            print("Usage:")
            print("  python -m src.main test                          Scan 001_amara_ndong_cloud_platform_engineer.pdf and verify both APIs")
            print("  python -m src.main add <resume.pdf|folder>       Scan and record a resume (or all PDFs in a folder)")
            print("  python -m src.main list                          List all recorded scans")

    finally:
        if boundary_logger is not None:
            print("[Boundary] Flushing pending log events...")
            boundary_logger.flush(5)
            print("[Boundary] Flush complete.")


if __name__ == "__main__":
    main()
