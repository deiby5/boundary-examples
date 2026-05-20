import json
from datetime import datetime, timezone
from pathlib import Path

from .contract import ReceiptScanResult

DB_PATH = Path(__file__).parent.parent / "scans.json"


def _load() -> list[dict]:
    if not DB_PATH.exists():
        return []
    return json.loads(DB_PATH.read_text())


def _save(scans: list[dict]) -> None:
    DB_PATH.write_text(json.dumps(scans, indent=2))


def add_scan(scan: ReceiptScanResult, file: str) -> dict:
    scans = _load()
    record = {
        **scan.model_dump(),
        "id": len(scans) + 1,
        "scanned_at": datetime.now(timezone.utc).isoformat(),
        "file": file,
    }
    print(
        f"[Boundary] Saving scan #{record['id']}: {record['vendor']}"
        f" — {record['currency']} {record['amount']:.2f} ({record['category']})"
    )
    scans.append(record)
    _save(scans)
    print(
        f"[Boundary] Scan #{record['id']} written to store"
        f" (total: {len(scans)} record(s))"
    )
    return record


def list_scans() -> list[dict]:
    return _load()
