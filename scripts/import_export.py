from __future__ import annotations

import argparse
import hashlib
import json
from datetime import datetime
from pathlib import Path
from zoneinfo import ZoneInfo

ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / "data" / "warframe.json"
OVERRIDES = ROOT / "data" / "overrides.json"
EXPECTED_FILES = (
    "foundry.json",
    "inventoryArcanes.json",
    "inventoryMisc.json",
    "inventoryMods.json",
    "inventoryParts.json",
    "inventoryRelics.json",
    "inventorySets.json",
    "rivens.json",
)


def yes(value: object) -> str:
    return "Yes" if bool(value) else "No"


def load_complete_export(folder: Path) -> tuple[dict[str, dict], dict[str, dict], dict[str, object]]:
    manifest: dict[str, dict] = {}
    parsed: dict[str, object] = {}
    for name in EXPECTED_FILES:
        path = folder / name
        if not path.is_file():
            raise SystemExit(f"Incomplete export: missing {name}")
        raw = path.read_bytes()
        parsed[name] = json.loads(raw.decode("utf-8-sig"))
        stat = path.stat()
        manifest[name] = {
            "bytes": stat.st_size,
            "modified": datetime.fromtimestamp(stat.st_mtime, ZoneInfo("America/Los_Angeles")).isoformat(),
            "sha256": hashlib.sha256(raw).hexdigest(),
        }
    foundry = parsed["foundry.json"]
    if not isinstance(foundry, list) or len(foundry) < 800:
        raise SystemExit("Incomplete export: foundry.json is not a complete item list")
    by_name = {row["name"]: row for row in foundry}
    if len(by_name) != len(foundry):
        raise SystemExit("Invalid export: duplicate item names in foundry.json")
    return by_name, manifest, parsed


def inventory_counts(payload: object) -> dict[str, int]:
    counts: dict[str, int] = {}

    def visit(value: object) -> None:
        if isinstance(value, list):
            for child in value:
                visit(child)
            return
        if not isinstance(value, dict):
            return
        name = next((value.get(key) for key in ("name", "itemName", "displayName") if isinstance(value.get(key), str)), None)
        count = next((value.get(key) for key in ("count", "quantity", "amount", "itemCount") if isinstance(value.get(key), (int, float))), None)
        if name and count is not None:
            counts[name] = counts.get(name, 0) + int(count)
        for child in value.values():
            if isinstance(child, (list, dict)):
                visit(child)

    visit(payload)
    return counts


def base_prime_assemblies(parsed: dict[str, object]) -> dict[str, int]:
    counts: dict[str, int] = {}
    for file_name in ("inventoryParts.json", "inventorySets.json", "inventoryMisc.json"):
        for name, count in inventory_counts(parsed[file_name]).items():
            counts[name] = counts.get(name, 0) + count
    recipes = {
        "Bronco Prime": ("Bronco Prime Blueprint", "Bronco Prime Barrel", "Bronco Prime Receiver"),
        "Lex Prime": ("Lex Prime Blueprint", "Lex Prime Barrel", "Lex Prime Receiver"),
        "Magnus Prime": ("Magnus Prime Blueprint", "Magnus Prime Barrel", "Magnus Prime Receiver"),
        "Vasto Prime": ("Vasto Prime Blueprint", "Vasto Prime Barrel", "Vasto Prime Receiver"),
    }
    return {
        item: min((counts.get(component, 0) for component in components), default=0)
        for item, components in recipes.items()
    }


def followup_row(row: dict) -> dict:
    pending = row["pendingFoundry"] == "Yes"
    return {
        "item": row["item"],
        "type": row["type"],
        "state": "Ready in Foundry" if pending else "Rank unknown — verify in Arsenal",
        "targetRank": row["targetRank"],
        "steps": "Claim from Foundry; equip and level to 30." if pending else "Check Arsenal; level to 30 if needed.",
        "tip": (
            "Claim finished gear together; level one companion weapon at a time in high-affinity missions."
            if pending
            else "Use Sanctuary Onslaught, Helene, or Hydron; unequip extra weapons to focus affinity."
        ),
        "source": row["source"],
    }


def queue_row(row: dict) -> dict:
    return {
        "ease": row["ease"], "item": row["item"], "type": row["type"],
        "targetRank": row["targetRank"], "missing": row["missing"], "route": row["route"],
        "steps": "Acquire the listed missing parts, build, then level to 30.",
        "tip": "Farm the rarest missing part first; trade only for the final stubborn drop.",
        "source": row["source"],
    }


def update(folder: Path) -> None:
    export, manifest, parsed = load_complete_export(folder)
    payload = json.loads(DATA.read_text(encoding="utf-8"))
    overrides = json.loads(OVERRIDES.read_text(encoding="utf-8"))
    settled_at_40 = set(overrides.get("confirmedAt40", []))
    rank40_by_name = {row["item"]: row for row in payload["rank40"]}
    rank40_names = set(rank40_by_name)
    arsenal = {row["item"]: row for row in payload["arsenal"]}
    if set(arsenal) != set(export):
        missing = sorted(set(arsenal) - set(export))
        extra = sorted(set(export) - set(arsenal))
        raise SystemExit(f"Item catalog mismatch; missing={missing[:5]}, extra={extra[:5]}")

    old_queue = {row["item"]: row for row in payload["queue"]}
    old_vaulted = {row["item"]: row for row in payload["vaulted"]}
    old_owned = {row["item"]: row for row in payload["owned"]}
    changes = []

    for name, row in arsenal.items():
        source = export[name]
        before = (row["owned"], row["mastered"], row["pendingFoundry"])
        owned = bool(source.get("owned"))
        mastered = bool(source.get("mastered"))
        pending = bool(source.get("pendingInFoundry"))
        row["owned"], row["mastered"], row["pendingFoundry"] = yes(owned), yes(mastered), yes(pending)
        row["complete"] = yes(owned or mastered)
        if name in settled_at_40:
            row.update(state="Confirmed at 40", targetRank="40", rankRule="Rank 40 and five total Forma explicitly confirmed.", missing="", ease="1 — Complete", route="Confirmed at 40")
            if name in rank40_by_name:
                rank40_by_name[name].update(status="Confirmed at 40", rankRule="Rank 40 and five total Forma explicitly confirmed.", action="Complete — no action needed.", formaPlan="Five total Forma complete")
        elif name in rank40_by_name:
            project = rank40_by_name[name]
            project["owned"], project["mastered"] = yes(owned), yes(mastered)
            if project["status"].startswith("Active"):
                project["status"] = "Active to 40"
                row.update(state="Active to 40", targetRank="40", rankRule=project["rankRule"], missing="", ease="1 — Active project", route="Active to 40")
            elif project["status"].startswith("Parked"):
                project["status"] = "Parked at 30"
                row.update(state="Parked at 30", targetRank="30", rankRule=project["rankRule"], missing="", ease="6 — Parked", route="Parked at 30")
            else:
                project.update(status="Current rank unknown", rankRule="Weapon is acquired, but rank 40 and five Forma are not explicitly confirmed.", action="Verify current rank and Forma count before scheduling more Forma.", formaPlan="Unknown until verified")
                row.update(state="Current rank unknown", targetRank="Unknown", rankRule=project["rankRule"], missing="", ease="6 — Verify rank", route="Current rank unknown")
        elif pending:
            row.update(state="Owned / in foundry; rank unknown", rankRule="Claim from Foundry, then level to 30.", missing="", ease="1 — Now / no farming", route="Foundry")
        elif mastered:
            row.update(state="Owned + mastered" if owned else "Mastered; not currently owned", rankRule="", missing="", ease="1 — Complete", route="Mastery complete")
        elif owned:
            row.update(state="Owned; rank unknown", rankRule="Export has no current rank/Forma; verify Arsenal rank and finish to 30 only if needed.", missing="", ease="1 — Now / no farming", route="Already owned")
        else:
            row.update(state="Missing", rankRule="")
        after = (row["owned"], row["mastered"], row["pendingFoundry"])
        if before != after:
            changes.append({"item": name, "before": before, "after": after})

    def missing_item(row: dict) -> bool:
        return row["owned"] == "No" and row["mastered"] == "No"

    payload["queue"] = [
        old_queue.get(row["item"], queue_row(row))
        for row in payload["arsenal"]
        if missing_item(row) and row["vaulted"] == "No" and row["item"] not in rank40_names
    ]
    payload["queue"].sort(key=lambda row: (row["ease"], row["item"]))
    payload["vaulted"] = [
        old_vaulted.get(row["item"], queue_row(row))
        for row in payload["arsenal"]
        if (
            missing_item(row)
            and row["vaulted"] == "Yes"
            and row["item"] not in rank40_names
            and str(row.get("missing", "")).strip()
        )
    ]
    payload["vaulted"].sort(key=lambda row: row["item"])
    refreshed_owned = []
    for row in payload["arsenal"]:
        if row["item"] in rank40_names or not (
            row["pendingFoundry"] == "Yes" or (row["owned"] == "Yes" and row["mastered"] == "No")
        ):
            continue
        fresh = followup_row(row)
        existing = old_owned.get(row["item"])
        refreshed_owned.append(existing if existing and existing["state"] == fresh["state"] else fresh)
    payload["owned"] = refreshed_owned
    payload["owned"].sort(key=lambda row: (row["state"], row["item"]))

    now = datetime.now(ZoneInfo("America/Los_Angeles"))
    payload["meta"]["snapshotDate"] = now.date().isoformat()
    payload["meta"]["exportVerifiedAt"] = now.strftime("%Y-%m-%d %H:%M:%S PDT")
    # Keep machine-specific paths out of the public tracker data.
    payload["meta"].pop("exportFolder", None)
    payload["meta"]["exportSource"] = "Local AlecaFrame export"
    payload["meta"]["exportManifest"] = manifest
    payload["meta"]["importChanges"] = changes
    payload["meta"]["relicInventory"] = inventory_counts(parsed["inventoryRelics.json"])
    payload["meta"]["basePrimeAssemblies"] = base_prime_assemblies(parsed)
    payload["meta"]["summary"] = {
        "activeTo40": sum(row["status"] == "Active to 40" for row in payload["rank40"]),
        "confirmedAt40": sum(row["status"] == "Confirmed at 40" for row in payload["rank40"]),
        "parkedAt30": sum(row["status"] == "Parked at 30" for row in payload["rank40"]),
        "currentRankUnknown": sum(row["status"] == "Current rank unknown" for row in payload["rank40"]),
        "missing": sum(missing_item(row) for row in payload["arsenal"]),
    }
    DATA.write_text(json.dumps(payload, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    print(json.dumps({
        "items": len(payload["arsenal"]), "queue": len(payload["queue"]),
        "vaulted": len(payload["vaulted"]), "owned_followups": len(payload["owned"]),
        "owned": sum(r["owned"] == "Yes" for r in payload["arsenal"]),
        "mastered": sum(r["mastered"] == "Yes" for r in payload["arsenal"]),
        "missing": sum(missing_item(r) for r in payload["arsenal"]),
        "changes": changes,
    }, indent=2, ensure_ascii=False))


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("folder", type=Path)
    update(parser.parse_args().folder)
