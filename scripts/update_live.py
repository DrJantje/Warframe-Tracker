from __future__ import annotations

import json
import time
from datetime import datetime, timezone
from pathlib import Path
from urllib.request import Request, urlopen

from worldstate import (
    PRIMARY_WORLD_STATE_URL,
    direct_world_state,
)
from prime_resurgence import current_resurgence

ROOT = Path(__file__).resolve().parents[1]
LIVE = ROOT / "data" / "live.json"
TRACKER = ROOT / "data" / "warframe.json"
HEADERS = {
    "User-Agent": "Warframe-Tracker/2.0",
    "Cache-Control": "no-cache",
    "Pragma": "no-cache",
}


def fetch_json(url: str, attempts: int = 3) -> object:
    error = None
    for attempt in range(1, attempts + 1):
        try:
            request = Request(url, headers=HEADERS)
            with urlopen(request, timeout=20) as response:
                return json.loads(response.read().decode("utf-8"))
        except Exception as current_error:
            error = current_error
            if attempt < attempts:
                time.sleep(attempt * 2)
    assert error is not None
    raise error


def fetch_text(url: str) -> str:
    request = Request(url, headers=HEADERS)
    with urlopen(request, timeout=20) as response:
        return response.read().decode("utf-8", errors="replace")


def fetch_bytes(url: str) -> bytes:
    request = Request(url, headers=HEADERS)
    with urlopen(request, timeout=20) as response:
        return response.read()


def load_existing_live() -> dict:
    existing = json.loads(LIVE.read_text(encoding="utf-8"))
    required = ("worldState", "invasions", "cetusCycle", "cycles")
    if not isinstance(existing, dict) or any(not isinstance(existing.get(key), dict) for key in required):
        raise RuntimeError("The committed data/live.json is not a usable last-known-good snapshot")
    return existing


def update() -> bool:
    tracker = json.loads(TRACKER.read_text(encoding="utf-8"))
    checked_at = datetime.now(timezone.utc)
    checked_ms = int(checked_at.timestamp() * 1000)

    try:
        raw_world_state = fetch_json(PRIMARY_WORLD_STATE_URL)
        output = direct_world_state(raw_world_state, checked_ms)
        print("World state: Digital Extremes primary feed")
    except Exception as error:
        existing = load_existing_live()
        checked = (existing.get("worldState") or {}).get("source", {}).get("checkedAt")
        print(
            "::warning title=Digital Extremes world state unavailable::"
            f"{error}. Keeping the last valid live snapshot checked at {checked or 'an unknown time'}."
        )
        return False

    output.update({
        "schemaVersion": 2,
        "checkedAt": checked_at.isoformat(),
        "baro": {"status": "unknown", "active": False, "endsAt": None, "items": [], "source": PRIMARY_WORLD_STATE_URL},
        "events": {"status": "unknown", "items": [], "source": PRIMARY_WORLD_STATE_URL},
    })
    try:
        previous = json.loads(LIVE.read_text(encoding="utf-8")).get("primeResurgence", {})
    except (OSError, ValueError):
        previous = {}
    output["primeResurgence"] = current_resurgence(
        raw_world_state, tracker, checked_ms, previous, fetch_bytes, fetch_json, fetch_text,
    )

    LIVE.write_text(json.dumps(output, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    print(json.dumps({
        "checkedAt": output["checkedAt"],
        "source": output["worldState"]["source"],
        "invasions": output["invasions"]["activeCount"],
        "cetus": output["cetusCycle"]["state"],
        "cetusExpiry": output["cetusCycle"]["expiry"],
    }, indent=2, ensure_ascii=False))
    return True


if __name__ == "__main__":
    update()
