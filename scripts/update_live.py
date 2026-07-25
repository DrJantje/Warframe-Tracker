from __future__ import annotations

import html
import json
from datetime import datetime, timezone
from pathlib import Path
from urllib.request import Request, urlopen

ROOT = Path(__file__).resolve().parents[1]
LIVE = ROOT / "data" / "live.json"
TRACKER = ROOT / "data" / "warframe.json"
HEADERS = {"User-Agent": "Warframe-Tracker/1.0"}


def fetch_json(url: str) -> object:
    request = Request(url, headers=HEADERS)
    with urlopen(request, timeout=20) as response:
        return json.loads(response.read().decode("utf-8"))


def fetch_text(url: str) -> str:
    request = Request(url, headers=HEADERS)
    with urlopen(request, timeout=20) as response:
        return response.read().decode("utf-8", errors="replace")


def reward_names(invasions: object) -> list[str]:
    names: set[str] = set()
    if not isinstance(invasions, list):
        return []
    for invasion in invasions:
        if not isinstance(invasion, dict) or invasion.get("completed"):
            continue
        for side in ("attacker", "defender"):
            reward = invasion.get(side, {}).get("reward", {})
            if isinstance(reward, dict):
                value = reward.get("asString") or reward.get("itemString")
                if isinstance(value, str) and value.strip():
                    names.add(value.strip())
    return sorted(names)


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
    now = datetime.now(timezone.utc).isoformat()
    output = {
        "checkedAt": now,
        "invasions": {"status": "unknown", "rewards": [], "source": "https://api.warframestat.us/pc/invasions"},
        "baro": {"status": "unknown", "active": False, "endsAt": None, "items": [], "source": "https://api.warframestat.us/pc/voidTrader"},
        "events": {"status": "unknown", "items": [], "source": "https://api.warframestat.us/pc/events"},
        "primeResurgence": {"status": "unknown", "items": [], "source": "https://www.warframe.com/en/prime-resurgence"},
    }

    try:
        invasions = fetch_json(output["invasions"]["source"])
        output["invasions"].update(status="verified", rewards=reward_names(invasions))
    except Exception as error:
        print(f"Live Invasions unavailable: {error}")

    try:
        trader = fetch_json(output["baro"]["source"])
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
        events = fetch_json(output["events"]["source"])
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
    print(json.dumps(output, indent=2, ensure_ascii=False))


if __name__ == "__main__":
    update()
