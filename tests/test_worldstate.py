from __future__ import annotations

import sys
import unittest
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scripts"))

from worldstate import direct_world_state  # noqa: E402


def extended_date(value: str) -> dict:
    milliseconds = int(datetime.fromisoformat(value.replace("Z", "+00:00")).timestamp() * 1000)
    return {"$date": {"$numberLong": str(milliseconds)}}


class WorldStateTests(unittest.TestCase):
    def setUp(self) -> None:
        self.now_ms = int(datetime(2026, 8, 19, 3, 18, tzinfo=timezone.utc).timestamp() * 1000)
        self.raw = {
            "Time": self.now_ms // 1000,
            "BuildLabel": "test-build",
            "SyndicateMissions": [
                {"Tag": "CetusSyndicate", "Expiry": extended_date("2026-08-19T04:54:04.577Z")}
            ],
            "Invasions": [
                {
                    "_id": {"$oid": "active-invasion"},
                    "Activation": extended_date("2026-08-19T01:00:00Z"),
                    "Node": "SolNode20",
                    "LocTag": "/Lotus/Language/Menu/InvasionGeneric",
                    "Count": -1693,
                    "Goal": 34000,
                    "Completed": False,
                    "AttackerMissionInfo": {"faction": "FC_GRINEER"},
                    "DefenderMissionInfo": {"faction": "FC_CORPUS"},
                    "AttackerReward": {
                        "countedItems": [
                            {"ItemType": "/Lotus/Types/Recipes/Weapons/DeraVandalBlueprint", "ItemCount": 1}
                        ]
                    },
                    "DefenderReward": {
                        "countedItems": [
                            {"ItemType": "/Lotus/Types/Recipes/Weapons/WeaponParts/LatronWraithReceiver", "ItemCount": 1}
                        ]
                    },
                },
                {
                    "_id": {"$oid": "completed-invasion"},
                    "Activation": extended_date("2026-08-18T01:00:00Z"),
                    "Node": "SolNode104",
                    "Count": 32000,
                    "Goal": 32000,
                    "Completed": True,
                    "AttackerMissionInfo": {"faction": "FC_GRINEER"},
                    "DefenderMissionInfo": {"faction": "FC_CORPUS"},
                    "AttackerReward": {"countedItems": []},
                    "DefenderReward": {"countedItems": []},
                },
            ],
        }

    def test_direct_source_and_invasions(self) -> None:
        parsed = direct_world_state(self.raw, self.now_ms)
        self.assertEqual(parsed["worldState"]["source"]["provider"], "Digital Extremes")
        self.assertEqual(parsed["worldState"]["source"]["type"], "primary")
        self.assertEqual(parsed["invasions"]["activeCount"], 1)
        self.assertEqual(
            parsed["invasions"]["rewards"],
            ["Dera Vandal Blueprint", "Latron Wraith Receiver"],
        )
        self.assertEqual(parsed["invasions"]["items"][0]["node"], "Telesto (Saturn)")

    def test_cetus_matches_current_wfcd_boundary_logic(self) -> None:
        parsed = direct_world_state(self.raw, self.now_ms)
        cetus = parsed["cetusCycle"]
        self.assertEqual(cetus["state"], "day")
        self.assertTrue(cetus["isDay"])
        self.assertEqual(cetus["expiry"], "2026-08-19T04:04:00Z")
        self.assertEqual(cetus["activation"], "2026-08-19T02:24:00Z")
        self.assertEqual(parsed["cycles"]["cambion"]["state"], "fass")

    def test_no_dead_fallback_metadata(self) -> None:
        parsed = direct_world_state(self.raw, self.now_ms)
        self.assertNotIn("fallback", parsed["worldState"])


if __name__ == "__main__":
    unittest.main()
