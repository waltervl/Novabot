import os
import sys
import unittest
from pathlib import Path
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parent))

import extended_commands as ext


class ExtendedCommandsTuningTest(unittest.TestCase):
    def test_telemetry_defaults_keep_only_the_cheap_rtk_indicator(self):
        with patch.dict(os.environ, {}, clear=True):
            # 40Hz blade telemetry off + heavy 10Hz heading/bestvel off, but the
            # cheap ~5Hz RTK fix-quality indicator stays on.
            self.assertFalse(ext.enable_blade_telemetry())
            self.assertFalse(ext.enable_heading_telemetry())
            self.assertTrue(ext.enable_rtk_telemetry())

    def test_telemetry_flags_can_be_toggled(self):
        with patch.dict(os.environ, {
            "OPENNOVA_ENABLE_BLADE_TELEMETRY": "1",
            "OPENNOVA_ENABLE_RTK_TELEMETRY": "0",
            "OPENNOVA_ENABLE_HEADING_TELEMETRY": "true",
        }, clear=True):
            self.assertTrue(ext.enable_blade_telemetry())
            self.assertFalse(ext.enable_rtk_telemetry())
            self.assertTrue(ext.enable_heading_telemetry())

    def test_intervals_have_safe_minimums(self):
        with patch.dict(os.environ, {
            "OPENNOVA_BLADE_IDLE_HOLD_SECONDS": "0",
            "OPENNOVA_CHG_GUARD_INTERVAL_SECONDS": "1",
        }, clear=True):
            self.assertEqual(ext.blade_idle_hold_seconds(), 2.0)
            self.assertEqual(ext.charging_station_guard_interval_seconds(), 30.0)


if __name__ == "__main__":
    unittest.main()
