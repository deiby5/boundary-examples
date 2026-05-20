from __future__ import annotations

import os
import re
from typing import Literal

from pydantic import BaseModel

from withboundary.contract import (
    ContractLogger,
    Rule,
    create_console_logger,
    define_contract,
)
from withboundary.sdk import CapturePolicy, create_boundary_logger

MODEL = "mistralai/mistral-small-3.2-24b-instruct"


class ReceiptItem(BaseModel):
    name: str
    price: float


class Receipt(BaseModel):
    vendor: str
    date: str
    amount: float
    currency: str
    category: Literal["meals", "travel", "lodging", "software", "office", "other"]
    description: str
    tax: float | None = None
    items: list[ReceiptItem] | None = None


# --- Boundary SDK logger (remote observability) ---

_boundary_logger = create_boundary_logger(
    api_key=os.environ.get("BOUNDARY_API_KEY"),
    environment="production",
    model=MODEL + " (python)",
    on_error=lambda err: print(f"[Boundary] Logger error: {err}"),
    capture=CapturePolicy(inputs=True, outputs=True),
    before_send=lambda event: event.model_copy(update={"schema_": None}),
)

if _boundary_logger:
    print("[Boundary] SDK logger initialised — events will be sent to Boundary.")
else:
    print("[Boundary] BOUNDARY_API_KEY not set — remote logging disabled (console only).")

# --- Console logger (local debug output) ---

_console_logger = create_console_logger(
    prefix="[Boundary]",
    show_repairs=True,
    show_raw_output=True,
    show_cleaned_output=True,
    show_success_data=True,
)


def merge_loggers(*loggers: ContractLogger | None) -> ContractLogger:
    valid = [lg for lg in loggers if lg is not None]

    class Merged:
        def __getattr__(self, name: str):
            def handler(ctx):
                for lg in valid:
                    if hasattr(lg, name):
                        getattr(lg, name)(ctx)
            return handler

    return Merged()  # type: ignore[return-value]


_merged_logger = merge_loggers(_boundary_logger, _console_logger)

# --- Business rules ---

positive_amount: Rule[Receipt] = Rule(
    name="positive_amount",
    description="Amount must be a positive number",
    check=lambda r: r.amount > 0 or f"amount must be positive, got {r.amount}",
)

valid_date: Rule[Receipt] = Rule(
    name="valid_date",
    description="Date must be a valid ISO 8601 date string (YYYY-MM-DD)",
    check=lambda r: (
        bool(re.match(r"^\d{4}-\d{2}-\d{2}$", r.date))
        or f'date "{r.date}" is not in YYYY-MM-DD format'
    ),
)

non_empty_vendor: Rule[Receipt] = Rule(
    name="non_empty_vendor",
    description="Vendor name must not be empty",
    check=lambda r: r.vendor.strip() != "" or "vendor name cannot be empty",
)


def _items_sum_check(r: Receipt) -> bool | str:
    if not r.items:
        return True
    items_sum = sum(item.price for item in r.items)
    tax = r.tax or 0.0
    total = items_sum + tax
    diff = abs(total - r.amount)
    if diff < 0.01:
        return True
    return (
        f"item prices ({items_sum:.2f}) + tax ({tax:.2f}) = {total:.2f} "
        f"but amount is {r.amount:.2f}"
    )


items_sum_equals_total: Rule[Receipt] = Rule(
    name="items_sum_equals_total",
    description=(
        "If line items are present, their prices plus any tax must sum to the total amount"
    ),
    check=_items_sum_check,
)

# --- Contract ---

receipt_contract = define_contract(
    name="receipt-extraction-python",
    schema=Receipt,
    logger=_merged_logger,
    rules=[positive_amount, valid_date, non_empty_vendor, items_sum_equals_total],
)

# Expose the SDK logger for flushing on exit
boundary_logger = _boundary_logger
