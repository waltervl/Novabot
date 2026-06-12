import os
import sys
import tempfile
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

    def test_set_coverage_planner_radius_updates_yaml_and_restarts_planner(self):
        with tempfile.TemporaryDirectory() as tmp:
            yaml_path = Path(tmp) / "coverage_planner_params.yaml"
            yaml_path.write_text(
                "coverage_planner_server:\n"
                "  ros__parameters:\n"
                "    inflation_radius: 0.61\n"
                "    planner_coverage_len: 0.16\n",
                encoding="utf-8",
            )
            responses = []

            with patch.dict(os.environ, {
                "OPENNOVA_COVERAGE_PLANNER_PARAMS_YAML": str(yaml_path),
            }, clear=False), \
                patch.object(ext, "_coverage_is_active", return_value=False), \
                patch.object(ext, "_restart_novabot_mapping", return_value=True):
                ext.handle_set_coverage_planner_radius(
                    {"radius": 0.25},
                    lambda name, data: responses.append((name, data)),
                )

            self.assertIn("inflation_radius: 0.25\n", yaml_path.read_text(encoding="utf-8"))
            self.assertEqual(responses[0][0], "set_coverage_planner_radius_respond")
            self.assertEqual(responses[0][1]["result"], 0)
            self.assertEqual(responses[0][1]["radius"], 0.25)
            self.assertTrue(responses[0][1]["restarted"])

    def test_set_coverage_planner_radius_refuses_active_coverage_without_force(self):
        responses = []
        with patch.object(ext, "_coverage_is_active", return_value=True):
            ext.handle_set_coverage_planner_radius(
                {"radius": 0.25},
                lambda name, data: responses.append((name, data)),
            )

        self.assertEqual(responses[0][0], "set_coverage_planner_radius_respond")
        self.assertEqual(responses[0][1]["result"], 2)
        self.assertIn("coverage active", responses[0][1]["error"])


if __name__ == "__main__":
    unittest.main()
