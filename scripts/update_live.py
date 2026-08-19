from __future__ import annotations

import html
import json
from datetime import datetime, timezone
from pathlib import Path
from urllib.request import Request, urlopen

from worldstate import (
    FALLBACK_WORLD_STATE_URL,
    PRIMARY_WORLD_STATE_URL,
    direct_world_state,
    fallback_world_state,
)

ROOT = Path(__file__).resolve().parents[1]
LIVE = ROOT / "data" / "live.json"
TRACKER = ROOT / "data" / "warframe.json"
HEADERS = {
    "User-Agent": "Warframe-Tracker/2.0",
    "Cache-Control": "no-cache",
    "Pragma": "no-cache",
}


def fetch_json(url: str) -> object:
    request = Request(url, headers=HEADERS)
    with urlopen(request, timeout=20) as response:
        return json.loads(response.read().decode("utf-8"))


def fetch_text(url: str) -> str:
    request = Request(url, headers=HEADERS)
    with urlopen(request, timeout=20) as response:
        return response.read().decode("utf-8", errors="replace")


def event_names(events: object) -> list[str]:
    if not isinstance(events, list):
        return []
    return sorted({
        str(event.get("description") or event.get("tooltip") or "").strip()
        for event in events
        if isinstance(event, dict) and not event.get("expired") and (event.get("description") or event.get("tooltip"))
    })


def update() -> None:
    tracker = json.loads(TRACKER.read_text(encoding="utf-8"))
    checked_at = datetime.now(timezone.utc)
    checked_ms = int(checked_at.timestamp() * 1000)
    fallback = None
    primary_error = None

    try:
        output = direct_world_state(fetch_json(PRIMARY_WORLD_STATE_URL), checked_ms)
        print("World state: Digital Extremes primary feed")
    except Exception as error:
        primary_error = error
        print(f"Digital Extremes world state unavailable: {error}")
        try:
            fallback = fetch_json(FALLBACK_WORLD_STATE_URL)
            output = fallback_world_state(fallback, checked_ms)
            print("World state: WarframeStat.us fallback")
        except Exception as fallback_error:
            raise RuntimeError(
                f"No usable world state. Digital Extremes: {primary_error}; "
                f"WarframeStat.us fallback: {fallback_error}"
            ) from fallback_error

    output.update({
        "schemaVersion": 2,
        "checkedAt": checked_at.isoformat(),
        "baro": {"status": "unknown", "active": False, "endsAt": None, "items": [], "source": "https://api.warframestat.us/pc/voidTrader"},
        "events": {"status": "unknown", "items": [], "source": "https://api.warframestat.us/pc/events"},
        "primeResurgence": {"status": "unknown", "items": [], "source": "https://www.warframe.com/en/prime-resurgence"},
    })

    try:
        if fallback is None:
            fallback = fetch_json(FALLBACK_WORLD_STATE_URL)
        trader = fallback.get("voidTrader", {}) if isinstance(fallback, dict) else {}
        inventory = trader.get("inventory", []) if isinstance(trader, dict) else []
        items = sorted({
            str(entry.get("item") or "").strip()
            for entry in inventory
            if isinstance(entry, dict) and entry.get("item")
        })
        output["baro"].update(
            status="verified",
            active=bool(trader.get("active")) if isinstance(trader, dict) else False,
            endsAt=trader.get("expiry") if isinstance(trader, dict) else None,
            items=items,
        )
    except Exception as error:
        print(f"Live Baro inventory unavailable: {error}")

    try:
        if fallback is None:
            fallback = fetch_json(FALLBACK_WORLD_STATE_URL)
        events = fallback.get("events", []) if isinstance(fallback, dict) else []
        output["events"].update(status="verified", items=event_names(events))
    except Exception as error:
        print(f"Live events unavailable: {error}")

    try:
        page = html.unescape(fetch_text(output["primeResurgence"]["source"]))
        prime_names = sorted({
            row["item"]
            for row in tracker["arsenal"]
            if row["item"].endswith(" Prime") and row["item"] in page
        })
        output["primeResurgence"].update(status="verified", items=prime_names)
    except Exception as error:
        print(f"Prime Resurgence inventory unavailable: {error}")

    LIVE.write_text(json.dumps(output, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    print(json.dumps({
        "checkedAt": output["checkedAt"],
        "source": output["worldState"]["source"],
        "invasions": output["invasions"]["activeCount"],
        "cetus": output["cetusCycle"]["state"],
        "cetusExpiry": output["cetusCycle"]["expiry"],
    }, indent=2, ensure_ascii=False))


if __name__ == "__main__":
    update()
