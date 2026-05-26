from pathlib import Path
import sys

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))

import e22_lora_mount_test as mount


def approx(value, expected, tolerance=0.25):
    assert abs(value - expected) <= tolerance, f"{value:.3f} != {expected:.3f}"


part = mount.build_fixture()
bb = part.bounding_box()

assert mount.board_w == 26.0
assert mount.board_l == 16.0
assert mount.fixture_name == "E22 LoRa Mount Test"
assert bb.size.X > mount.board_w + 6.0
assert bb.size.Y > mount.board_l + 4.0
approx(bb.min.Z, -mount.base_t)
assert bb.max.Z >= mount.hook_z + mount.hook_h

print("E22 LoRa mount geometry OK")
