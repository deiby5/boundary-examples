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

MODEL = os.environ.get("OPENROUTER_MODEL", "openai/gpt-4o")
MONTH_REGEX = re.compile(r"^\d{4}-(0[1-9]|1[0-2])$")


class Contact(BaseModel):
    email: str | None = None
    phone: str | None = None
    linkedin: str | None = None
    github: str | None = None
    website: str | None = None


class Experience(BaseModel):
    company: str
    role: str
    location: str | None = None
    start: str
    end: str
    highlights: list[str]


class Education(BaseModel):
    degree: str
    institution: str
    year: int | None = None


class CvScanResult(BaseModel):
    full_name: str | None
    headline: str | None
    location: str | None
    contact: Contact
    summary: str | None
    skills: list[str]
    experience: list[Experience]
    education: list[Education]
    certifications: list[str]
    languages: list[str]
    extraction_quality: Literal["complete", "partial", "insufficient"]


_boundary_logger = create_boundary_logger(
    api_key=os.environ.get("BOUNDARY_API_KEY"),
    endpoint=os.environ.get("BOUNDARY_API_URL"),
    environment="production",
    model=MODEL + " (python)",
    on_error=lambda err: print(f"[Boundary] Logger error: {err}"),
    capture=CapturePolicy(inputs=False, outputs=False),
    before_send=lambda event: event.model_copy(update={"schema_": None}),
)

if _boundary_logger:
    print("[Boundary] SDK logger initialised - events will be sent to Boundary.")
else:
    print("[Boundary] BOUNDARY_API_KEY not set - remote logging disabled (console only).")

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


def _is_valid_month(value: str) -> bool:
    return bool(MONTH_REGEX.match(value))


def _valid_experience_months(result: CvScanResult) -> bool | str:
    for exp in result.experience:
        if not _is_valid_month(exp.start):
            return f'experience start "{exp.start}" is not YYYY-MM'
        if exp.end != "Present" and not _is_valid_month(exp.end):
            return f'experience end "{exp.end}" is not YYYY-MM or Present'
    return True


def _experience_chronology(result: CvScanResult) -> bool | str:
    for exp in result.experience:
        if exp.end != "Present" and exp.start > exp.end:
            return f"experience at {exp.company}: start {exp.start} is after end {exp.end}"
    return True


def _non_empty_experience_fields(result: CvScanResult) -> bool | str:
    for exp in result.experience:
        if not exp.company.strip():
            return "experience company cannot be empty"
        if not exp.role.strip():
            return "experience role cannot be empty"
    return True


def _complete_requires_identity(result: CvScanResult) -> bool | str:
    if result.extraction_quality != "complete":
        return True
    if not (result.full_name or "").strip():
        return "extraction_quality is complete but full_name is missing"
    email = (result.contact.email or "").strip() if result.contact.email else ""
    phone = (result.contact.phone or "").strip()
    if not email and not phone:
        return "extraction_quality is complete but neither contact.email nor contact.phone is set"
    return True


def _complete_requires_experience(result: CvScanResult) -> bool | str:
    if result.extraction_quality != "complete":
        return True
    if not result.experience:
        return "extraction_quality is complete but experience is empty"
    for exp in result.experience:
        if not exp.highlights:
            return f"extraction_quality is complete but experience at {exp.company} has no highlights"
    return True


def _skills_are_non_empty_strings(result: CvScanResult) -> bool | str:
    for skill in result.skills:
        if not skill.strip():
            return "skills array contains an empty or whitespace-only entry"
    return True


def _email_format_when_present(result: CvScanResult) -> bool | str:
    email = result.contact.email
    if email is None:
        return True
    if re.match(r"^[^@\s]+@[^@\s]+\.[^@\s]+$", email.strip()):
        return True
    return f'contact.email "{email}" is not a valid email'


valid_experience_months: Rule[CvScanResult] = Rule(
    name="valid_experience_months",
    description="Experience start and end dates (when not Present) must be YYYY-MM",
    check=_valid_experience_months,
)

experience_chronology: Rule[CvScanResult] = Rule(
    name="experience_chronology",
    description="Experience end must be Present or not earlier than start",
    check=_experience_chronology,
)

non_empty_experience_fields: Rule[CvScanResult] = Rule(
    name="non_empty_experience_fields",
    description="Every experience entry must have non-empty company and role",
    check=_non_empty_experience_fields,
)

complete_requires_identity: Rule[CvScanResult] = Rule(
    name="complete_requires_identity",
    description="Complete extractions require full_name and email or phone",
    check=_complete_requires_identity,
)

complete_requires_experience: Rule[CvScanResult] = Rule(
    name="complete_requires_experience",
    description="Complete extractions require at least one job with highlights",
    check=_complete_requires_experience,
)

skills_are_non_empty_strings: Rule[CvScanResult] = Rule(
    name="skills_are_non_empty_strings",
    description="Each skill must be a non-empty trimmed string",
    check=_skills_are_non_empty_strings,
)

email_format_when_present: Rule[CvScanResult] = Rule(
    name="email_format_when_present",
    description="Contact email must be valid when provided",
    check=_email_format_when_present,
)

cv_scan_contract = define_contract(
    name="cv-scanner-python",
    schema=CvScanResult,
    logger=merge_loggers(_boundary_logger, _console_logger),
    rules=[
        valid_experience_months,
        experience_chronology,
        non_empty_experience_fields,
        complete_requires_identity,
        complete_requires_experience,
        email_format_when_present,
        skills_are_non_empty_strings,
    ],
)

boundary_logger = _boundary_logger
