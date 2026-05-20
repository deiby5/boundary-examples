import os
import sys
from pathlib import Path

from dotenv import load_dotenv

# Load .env from the receipt-scanner example directory.
load_dotenv(Path(__file__).parent.parent.parent / ".env")

from .contract import boundary_logger  # noqa: E402 — must come after load_dotenv
from .scan import scan_receipt  # noqa: E402
from .store import add_scan, list_scans  # noqa: E402

TEST_FILE = (
    Path(__file__).parent.parent.parent
    / "fixtures"
    / "receipts"
    / "receipt_0001.png"
)


def print_table(scans: list[dict]) -> None:
    if not scans:
        print("No scans recorded yet.")
        return

    headers = ["ID", "Date", "Vendor", "Amount", "Category", "Description"]
    print("\n" + "  ".join(h.ljust(18) for h in headers))
    print("-" * 110)
    for s in scans:
        amount_str = f"{s.get('currency', '')} {s['amount']:.2f}"
        print(
            "  ".join([
                str(s["id"]).ljust(18),
                s["date"].ljust(18),
                s["vendor"][:18].ljust(18),
                amount_str.ljust(18),
                s["category"].ljust(18),
                s["description"][:40],
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
            input_path = Path(rest[0] if rest else "../fixtures/receipts").resolve()
            if not input_path.exists():
                print(f"Error: path not found: {input_path}")
                sys.exit(1)

            if input_path.is_dir():
                files = sorted(input_path.glob("*.png"))
            else:
                files = [input_path]

            print(f"Processing {len(files)} receipt(s)...")
            for file in files:
                print(f"\nScanning {file}...")
                try:
                    receipt = scan_receipt(str(file))
                    stored = add_scan(receipt, str(file))
                    print(
                        f"  Added scan #{stored['id']}: {stored['vendor']}"
                        f" — {stored['currency']} {stored['amount']:.2f}"
                    )
                except Exception as err:
                    print(f"  Failed: {err}")

        elif command == "test":
            test_file = str(TEST_FILE)
            print(f"Test run: scanning {test_file}...")

            print("\n[1/2] OpenRouter API call...")
            receipt = scan_receipt(test_file)
            print("  OK — extracted:")
            print(f"    Vendor:   {receipt.vendor}")
            print(f"    Date:     {receipt.date}")
            print(f"    Amount:   {receipt.currency} {receipt.amount:.2f}")
            print(f"    Category: {receipt.category}")
            print(f"    Note:     {receipt.description}")

            print("\n[2/2] Boundary logging (add_scan writes to store + logs via SDK)...")
            stored = add_scan(receipt, test_file)
            print(f"  OK — saved as scan #{stored['id']}, scanned_at: {stored['scanned_at']}")

            print("\nTest passed.")

        elif command == "list":
            print_table(list_scans())

        else:
            print("Usage:")
            print("  python -m src.main test                          Scan receipt_0001.png and verify both APIs")
            print("  python -m src.main add <receipt.png|folder>      Scan and record a receipt (or all PNGs in a folder)")
            print("  python -m src.main list                          List all recorded scans")

    finally:
        if boundary_logger is not None:
            print("[Boundary] Flushing pending log events...")
            boundary_logger.flush(5)
            print("[Boundary] Flush complete.")


if __name__ == "__main__":
    main()
