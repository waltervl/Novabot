"""Run the surface-coverage report as part of the test suite.

Hard fails if ROS2 endpoint or MQTT inbound coverage drops below 100%.
The report itself lives under tests/runtime/ so it can be invoked as a
standalone CLI from the dev host (`python ... coverage_report.py`).
"""
import subprocess
import sys
from pathlib import Path

REPORT = Path(__file__).parent / 'runtime' / 'coverage_report.py'


def test_coverage_report_passes_at_100_percent():
    proc = subprocess.run(
        [sys.executable, str(REPORT)],
        capture_output=True, text=True,
    )
    output = proc.stdout + proc.stderr
    assert proc.returncode == 0, (
        f'coverage_report exited {proc.returncode}\n{output}'
    )
    # Sanity: both surface lines present in the report.
    assert 'ROS2 endpoints wired:' in output, output
    assert 'MQTT inbound commands:' in output, output
    # Hard fail on any drop below 100%.
    assert '(100.0%)' in output, output
