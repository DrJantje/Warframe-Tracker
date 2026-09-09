from __future__ import annotations

import json
import lzma
import shutil
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import Mock

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scripts"))
from prime_resurgence import current_resurgence, parse_relic_rewards, relic_manifest_url


def table(name="Lith K5", rare="Kogake Prime Gauntlet"):
    rewards = [(rare, 2), ("Akbolto Prime Barrel", 11),
               ("Banshee Prime Systems Blueprint", 11),
               ("Mirage Prime Chassis Blueprint", 25.33),
               ("Forma Blueprint", 25.33), ("Helios Prime Carapace", 25.33)]
    return '<tr><th colspan="2">' + name + ' Relic (Intact)</th></tr>' + ''.join(
        f'<tr><td>{part}</td><td>Uncommon ({chance:.2f}%)</td></tr>'
        for part, chance in rewards)


class ResurgenceTests(unittest.TestCase):
    def setUp(self):
        self.raw = {"PrimeVaultTraders": [{"Activation": 1000, "Expiry": 100000,
            "Manifest": [{"ItemType": "/Lotus/StoreItems/Types/Game/Projections/TestBronze", "RegularPrice": 1}],
            "EvergreenManifest": [{"ItemType": "/Lotus/StoreItems/Types/Game/Projections/NotRotation", "RegularPrice": 1}]}]}
        self.tracker = {"arsenal": [{"item": "Kogake Prime"}, {"item": "Banshee Prime"}, {"item": "Revenant Prime"}]}
        self.index = lzma.compress(b"ExportRelicArcane_en.json!00_test\r\n", format=lzma.FORMAT_ALONE)
        self.fetch_bytes = Mock(return_value=self.index)
        self.fetch_json = Mock(return_value={"ExportRelicArcane": [{
            "uniqueName": "/Lotus/Types/Game/Projections/TestBronze", "name": "Lith K5 Relic"}]})
        self.fetch_text = Mock(return_value=table())

    def build(self, previous=None, now=2000):
        return current_resurgence(self.raw, self.tracker, now, previous or {},
                                  self.fetch_bytes, self.fetch_json, self.fetch_text)

    def test_current_manifest_replaces_previous_rotation(self):
        result = self.build({"items": ["Revenant Prime"], "relics": {"Lith A9": {}}})
        self.assertEqual(result["status"], "verified")
        self.assertEqual(result["items"], ["Banshee Prime", "Kogake Prime"])
        self.assertEqual(set(result["relics"]), {"Lith K5"})
        self.assertEqual(result["relics"]["Lith K5"]["rewards"]["Mirage Prime Chassis Blueprint"], "Common")

    def test_same_manifest_uses_verified_daily_cache(self):
        first = self.build()
        self.fetch_bytes.reset_mock()
        second = self.build(first, now=3000)
        self.assertEqual(first["relics"], second["relics"])
        self.fetch_bytes.assert_not_called()

    def test_rotation_change_does_not_reuse_old_relics_on_outage(self):
        first = self.build()
        self.raw["PrimeVaultTraders"][0]["Manifest"][0]["ItemType"] = "/Lotus/StoreItems/Types/Game/Projections/NewBronze"
        self.fetch_bytes.side_effect = OSError("offline")
        second = self.build(first)
        self.assertEqual(second["status"], "unknown")
        self.assertEqual(second["relics"], {})
        self.assertEqual(second["items"], [])
        self.assertIn("offline", second["detail"])

    def test_expired_rotation_is_not_active(self):
        result = self.build(now=100001)
        self.assertEqual(result["items"], [])
        self.fetch_bytes.assert_not_called()

    def test_missing_relic_and_incomplete_tables_are_rejected(self):
        with self.assertRaisesRegex(ValueError, "missing"):
            parse_relic_rewards(table(), {"Axi A12"})
        with self.assertRaisesRegex(ValueError, "Incomplete"):
            parse_relic_rewards(table().replace('<tr><td>Forma Blueprint</td><td>Uncommon (25.33%)</td></tr>', ''), {"Lith K5"})

    def test_index_requires_complete_manifest_line(self):
        self.assertTrue(relic_manifest_url(self.index).endswith("00_test"))
        partial = lzma.compress(b"ExportRelicArcane_en.json!partial", format=lzma.FORMAT_ALONE)
        with self.assertRaisesRegex(ValueError, "complete"):
            relic_manifest_url(partial)

    def test_unknown_export_identifier_is_not_guessed(self):
        self.fetch_json.return_value = {"ExportRelicArcane": []}
        self.assertEqual(self.build()["relicCatalogStatus"], "unavailable")

    def test_unmapped_rotation_does_not_block_account_validation(self):
        # Reproduce the production failure: live Banshee, with the previous
        # rotation's mapping absent. Validate the actual recommendation pipeline.
        with tempfile.TemporaryDirectory() as directory:
            target = Path(directory)
            (target / "data").mkdir()
            shutil.copytree(ROOT / "scripts", target / "scripts")
            shutil.copyfile(ROOT / "app.js", target / "app.js")
            for name in ("warframe.json", "overrides.json", "prime-rules.json", "nightwave-items.json", "live.json"):
                shutil.copyfile(ROOT / "data" / name, target / "data" / name)
            tracker_path = target / "data" / "warframe.json"
            tracker = json.loads(tracker_path.read_text(encoding="utf-8"))
            banshee = next(row for row in tracker["arsenal"] if row["item"] == "Banshee Prime")
            banshee.update(state="Missing", owned="No", mastered="No", pendingFoundry="No",
                           missing="Banshee Prime Blueprint", vaulted="Yes")
            tracker_path.write_text(json.dumps(tracker), encoding="utf-8")
            live_path = target / "data" / "live.json"
            live = json.loads(live_path.read_text(encoding="utf-8"))
            live["primeResurgence"] = {"status": "verified", "items": ["Banshee Prime"], "relics": {}, "relicCatalogStatus": "unavailable"}
            live_path.write_text(json.dumps(live), encoding="utf-8")
            for script in ("clean_recommendations.js", "fix_consistency.js", "validate_tracker.js"):
                result = subprocess.run(["node", "scripts/" + script], cwd=target, capture_output=True, text=True)
                self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
            data = json.loads((target / "data" / "warframe.json").read_text(encoding="utf-8"))
            banshee = next(row for row in data["vaulted"] if row["item"] == "Banshee Prime")
            self.assertEqual(banshee["primeStatus"], "DATA INCOMPLETE")
            self.assertEqual(banshee["primeDetails"], [])


if __name__ == "__main__":
    unittest.main()
