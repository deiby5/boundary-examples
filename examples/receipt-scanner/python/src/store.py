import json
from datetime import datetime, timezone
from pathlib import Path

from .contract import Receipt

DB_PATH = Path(__file__).parent.parent / "expenses.json"


def _load() -> list[dict]:
    if not DB_PATH.exists():
        return []
    return json.loads(DB_PATH.read_text())


def _save(expenses: list[dict]) -> None:
    DB_PATH.write_text(json.dumps(expenses, indent=2))


def add_expense(receipt: Receipt, file: str) -> dict:
    expenses = _load()
    expense = {
        **receipt.model_dump(),
        "id": len(expenses) + 1,
        "scanned_at": datetime.now(timezone.utc).isoformat(),
        "file": file,
    }
    print(
        f"[Boundary] Saving expense #{expense['id']}: {expense['vendor']}"
        f" — {expense['currency']} {expense['amount']:.2f} ({expense['category']})"
    )
    expenses.append(expense)
    _save(expenses)
    print(
        f"[Boundary] Expense #{expense['id']} written to store"
        f" (total: {len(expenses)} record(s))"
    )
    return expense


def list_expenses() -> list[dict]:
    return _load()
