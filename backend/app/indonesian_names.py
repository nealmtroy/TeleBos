"""Indonesian names used to sanitize marketplace account profiles."""

from __future__ import annotations

import random
import re
import unicodedata
from collections.abc import Iterator

MINIMUM_NAME_COMBINATIONS = 200
TELEGRAM_USERNAME_RE = re.compile(r"^[a-z][a-z0-9_]{4,31}$")

_FIRST_NAMES: tuple[str, ...] = (
    "Aditya",
    "Agus",
    "Ahmad",
    "Andika",
    "Bagas",
    "Bima",
    "Dimas",
    "Fajar",
    "Galang",
    "Gibran",
    "Hendra",
    "Irfan",
    "Joko",
    "Mahendra",
    "Nanda",
    "Pratama",
    "Raka",
    "Rizky",
    "Wahyu",
    "Yoga",
)

_LAST_NAMES: tuple[str, ...] = (
    "Anugrah",
    "Gunawan",
    "Hidayat",
    "Kurniawan",
    "Maulana",
    "Nugroho",
    "Permana",
    "Prasetyo",
    "Ramadhan",
    "Saputra",
    "Setiawan",
    "Wibowo",
)

# Keep a concrete, reviewed name pool in the repository instead of depending on
# an external data source during a sale. The cartesian set provides 240 unique
# Indonesian-style first/last-name combinations, plus the familiar example.
INDONESIAN_FULL_NAMES: tuple[tuple[str, str], ...] = (
    ("Gibran", "Rakabuming"),
    *((first_name, last_name) for first_name in _FIRST_NAMES for last_name in _LAST_NAMES),
)


def _normalized_username_part(value: str) -> str:
    normalized = unicodedata.normalize("NFKD", value)
    ascii_value = normalized.encode("ascii", "ignore").decode("ascii").lower()
    return re.sub(r"[^a-z]", "", ascii_value)


def validate_indonesian_name_pool() -> None:
    """Raise a clear error if the marketplace profile pool becomes invalid."""
    if len(INDONESIAN_FULL_NAMES) < MINIMUM_NAME_COMBINATIONS:
        raise RuntimeError(
            f"Marketplace name pool requires at least {MINIMUM_NAME_COMBINATIONS} combinations."
        )
    if len(set(INDONESIAN_FULL_NAMES)) != len(INDONESIAN_FULL_NAMES):
        raise RuntimeError("Marketplace name pool contains duplicate combinations.")
    for first_name, last_name in INDONESIAN_FULL_NAMES:
        if not first_name or not last_name:
            raise RuntimeError("Marketplace name pool contains an empty name.")
        if len(first_name) > 255 or len(last_name) > 255:
            raise RuntimeError("Marketplace name pool contains a name that is too long.")
        if any(char.isspace() and char not in {" "} for char in first_name + last_name):
            raise RuntimeError("Marketplace name pool contains invalid whitespace.")


def choose_indonesian_full_name(
    rng: random.Random | random.SystemRandom | None = None,
) -> tuple[str, str]:
    """Choose one Indonesian first/last-name combination for a sale profile."""
    return (rng or random.SystemRandom()).choice(INDONESIAN_FULL_NAMES)


def generate_username_candidates(
    first_name: str,
    last_name: str,
    *,
    rng: random.Random | random.SystemRandom | None = None,
    reserved: set[str] | None = None,
    limit: int = 12,
) -> Iterator[str]:
    """Yield unique, valid Telegram username candidates derived from a name."""
    first_part = _normalized_username_part(first_name)
    last_part = _normalized_username_part(last_name)
    if not first_part or not last_part:
        raise ValueError("A marketplace name must include usable first and last names.")

    random_source = rng or random.SystemRandom()
    seen = set(reserved or ())
    templates = (
        "{first}{last}{number}",
        "{first}_{last}",
        "{first}{number}{last}",
        "{first}_{number}_{last}",
        "{first}{last}_{number}",
    )

    attempts = 0
    while attempts < limit:
        templates_for_attempt = list(templates)
        random_source.shuffle(templates_for_attempt)
        for template in templates_for_attempt:
            if attempts >= limit:
                break
            number = str(random_source.randint(10, 99))
            username = template.format(first=first_part, last=last_part, number=number)
            if len(username) > 32:
                overflow = len(username) - 32
                if overflow >= len(last_part):
                    continue
                username = template.format(
                    first=first_part,
                    last=last_part[:-overflow],
                    number=number,
                )
            attempts += 1
            if username in seen or not TELEGRAM_USERNAME_RE.fullmatch(username):
                continue
            seen.add(username)
            yield username


validate_indonesian_name_pool()
