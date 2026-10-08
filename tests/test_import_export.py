from __future__ import annotations

import io
import json
import os
import subprocess
import sys
import tempfile
import unittest
from contextlib import redirect_stdout
from pathlib import Path
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scripts"))
import import_export  # noqa: E402


class ImportExportTests(unittest.TestCase):
    def run_import(self, components: list[dict], old_missing: str, *, item: str = "Thalys") -> dict:
        """Exercise the real import and cleanup; isolate only their file destinations."""
        with tempfile.TemporaryDirectory() as directory:
            folder = Path(directory)
            row = {
                "item": item, "type": "melee", "owned": "No", "mastered": "No",
                "pendingFoundry": "No", "complete": "No", "state": "Missing",
                "targetRank": "30", "rankRule": "", "missing": old_missing,
                "ease": "4 — Farm", "route": "Isleweaver", "vaulted": "No",
                "source": "https://wiki.warframe.com/w/Thalys",
            }
            arsenal = [row] + [
                {**row, "item": f"Fixture {index}", "owned": "Yes", "mastered": "Yes"}
                for index in range(799)
            ]
            payload = {"meta": {}, "arsenal": arsenal, "queue": [], "vaulted": [], "owned": [], "rank40": []}
            source = [
                {"name": entry["item"], "owned": entry["owned"] == "Yes", "mastered": entry["mastered"] == "Yes", "pendingInFoundry": False, "components": components if index == 0 else []}
                for index, entry in enumerate(arsenal)
            ]
            for name in import_export.EXPECTED_FILES:
                (folder / name).write_text(json.dumps(source if name == "foundry.json" else []), encoding="utf-8")
            tracker_path = folder / "tracker.json"
            overrides_path = folder / "overrides.json"
            tracker_path.write_text(json.dumps(payload), encoding="utf-8")
            overrides_path.write_text("{}", encoding="utf-8")
            with patch.object(import_export, "DATA", tracker_path), patch.object(import_export, "OVERRIDES", overrides_path), redirect_stdout(io.StringIO()):
                import_export.update(folder)
            subprocess.run(
                ["node", "scripts/clean_recommendations.js"], cwd=ROOT,
                env={**os.environ, "WARFRAME_DATA_FILE": str(tracker_path)},
                check=True, capture_output=True, text=True,
            )
            return json.loads(tracker_path.read_text(encoding="utf-8"))

    def test_acquired_blueprint_and_all_materials_stop_stale_vendor_recommendation(self) -> None:
        result = self.run_import([
            {"name": "Thalys Blueprint", "quantityOwned": 1, "neccessaryAmount": 1},
            {"name": "Temporal Dust", "quantityOwned": 540, "neccessaryAmount": 100},
        ], "Thalys Blueprint")
        row = result["arsenal"][0]
        self.assertEqual(row["state"], "Ready to build")
        self.assertEqual(row["missing"], "")
        self.assertEqual(row["owned"], "No")
        self.assertEqual(row["complete"], "No")
        self.assertEqual(row["pendingFoundry"], "No")
        self.assertFalse(any(card["item"] == "Thalys" for card in result["queue"]))
        card = next(card for card in result["owned"] if card["item"] == "Thalys")
        self.assertEqual(card["state"], "Ready to build")
        self.assertIn("Start crafting", card["steps"])
        self.assertNotIn("Buy", card["steps"])

    def test_missing_blueprint_or_second_component_does_not_become_ready(self) -> None:
        cases = [
            ([{"name": "Thalys Blueprint", "quantityOwned": 0, "neccessaryAmount": 1}], "Thalys Blueprint"),
            ([{"name": "Thalys Blueprint", "quantityOwned": 1, "neccessaryAmount": 1}, {"name": "Temporal Dust", "quantityOwned": 99, "neccessaryAmount": 100}], "Temporal Dust (99/100)"),
            ([{"name": "Thalys Blade", "quantityOwned": 1, "neccessaryAmount": 2}], "Thalys Blade (1/2)"),
            ([{"name": "Thalys Blueprint", "neccessaryAmount": 1}], "Thalys Blueprint"),
            ([{"name": "Thalys Blueprint", "quantityOwned": 1, "neccessaryAmount": 0}], "Thalys Blueprint"),
        ]
        for components, expected in cases:
            with self.subTest(expected=expected):
                result = self.run_import(components, "Thalys Blueprint")
                self.assertEqual(result["arsenal"][0]["state"], "Missing")
                self.assertEqual(result["arsenal"][0]["missing"], expected)
                self.assertFalse(any(card["item"] == "Thalys" for card in result["owned"]))

    def test_absent_recipe_metadata_keeps_noncrafting_acquisition_gap(self) -> None:
        result = self.run_import([], "Completed weapon from Eleanor", item="Coda Pox")
        self.assertEqual(result["arsenal"][0]["state"], "Missing")
        self.assertEqual(result["arsenal"][0]["missing"], "Completed weapon from Eleanor")
        self.assertFalse(any(card["item"] == "Coda Pox" for card in result["owned"]))


if __name__ == "__main__":
    unittest.main()
