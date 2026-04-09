from __future__ import annotations


def normalize_locale(value: str | None) -> str:
    normalized = (value or "").strip().lower()
    if normalized.startswith("zh"):
        return "zh"
    if normalized.startswith("en"):
        return "en"
    return "zh"


def is_zh_locale(value: str | None) -> bool:
    return normalize_locale(value) == "zh"


def text_for_locale(locale: str | None, zh: str, en: str) -> str:
    return zh if is_zh_locale(locale) else en
