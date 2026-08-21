from __future__ import annotations

import json
import io
import sys
import tempfile
import unittest
from contextlib import redirect_stdout
from pathlib import Path
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scripts"))

import update_live  # noqa: E402


class UpdateLiveTests(unittest.TestCase):
    def test_primary_failure_keeps_last_valid_snapshot(self) -> None:
        snapshot = {
            "worldState": {"source": {"checkedAt": "2026-08-20T08:44:45Z"}},
            "invasions": {},
            "cetusCycle": {},
            "cycles": {},
        }
        tracker = {"arsenal": []}
        with tempfile.TemporaryDirectory() as directory:
            live_path = Path(directory) / "live.json"
            tracker_path = Path(directory) / "warframe.json"
            live_path.write_text(json.dumps(snapshot), encoding="utf-8")
            tracker_path.write_text(json.dumps(tracker), encoding="utf-8")
            before = live_path.read_bytes()
            with (
                patch.object(update_live, "LIVE", live_path),
                patch.object(update_live, "TRACKER", tracker_path),
                patch.object(update_live, "fetch_json", side_effect=RuntimeError("HTTP 403")),
            ):
                with redirect_stdout(io.StringIO()):
                    self.assertFalse(update_live.update())
            self.assertEqual(live_path.read_bytes(), before)

    def test_primary_failure_rejects_invalid_snapshot(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            live_path = Path(directory) / "live.json"
            tracker_path = Path(directory) / "warframe.json"
            live_path.write_text("{}", encoding="utf-8")
            tracker_path.write_text('{"arsenal": []}', encoding="utf-8")
            with (
                patch.object(update_live, "LIVE", live_path),
                patch.object(update_live, "TRACKER", tracker_path),
                patch.object(update_live, "fetch_json", side_effect=RuntimeError("HTTP 403")),
            ):
                with redirect_stdout(io.StringIO()):
                    with self.assertRaisesRegex(RuntimeError, "last-known-good"):
                        update_live.update()


if __name__ == "__main__":
    unittest.main()
