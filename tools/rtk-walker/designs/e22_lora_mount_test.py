"""
E22-900T22S LoRa mount test fixture.

Standalone printable snap-fit test piece based on PoolLab's CTP09 mount
fixture. The E22 module sits component-side up, antenna / IPEX end toward
+X, and wires exit through the -X back-wall slot.

Run from repo root:
    python3 tools/rtk-walker/designs/e22_lora_mount_test.py

Generates:
    e22_lora_mount_test.step
    e22_lora_mount_test.stl
"""

from build123d import *
from pathlib import Path
import socket

try:
    from ocp_vscode import show, set_port, set_defaults, Camera

    set_port(3939)
    set_defaults(reset_camera=Camera.CENTER)
    _OCP_AVAILABLE = True
except Exception:
    _OCP_AVAILABLE = False


OUT = Path(__file__).resolve().parent
fixture_name = "E22 LoRa Mount Test"

# EBYTE E22-900T22S package. Datasheet lists 16 x 26 mm, SMD, UART.
# Orientation in this fixture:
#   X = long axis, antenna / IPEX end at +X
#   Y = short axis
board_w = 26.0
board_l = 16.0
module_t = 3.2

# Vertical placement.
base_t = 2.0
standoff_z = 1.2

# Fit and clip tuning.
clr = 0.30
wall_t = 2.0
guide_h = 0.8
arm_t = 1.8
hook_d = 0.8
hook_h = 1.0
clamp_gap = 0.35
clip_cx = [-7.0, 2.0]
clip_w = 4.2

# Back-wall wire exit. The +X antenna side stays open.
wire_slot_w = 10.0

# +X anti-slide stops. Two low posts catch the module corners so it cannot
# walk out of the open side, while the middle stays clear for insertion and
# antenna / IPEX access.
front_stop_post_count = 2
front_stop_r = 1.1
front_stop_h = 2.6
front_stop_gap_y = 10.0

pkt_w = board_w + 2 * clr
pkt_l = board_l + 2 * clr
module_top = standoff_z + module_t
hook_z = module_top + clamp_gap
arm_h = hook_z + hook_h + arm_t + hook_d

fixture_x = pkt_w + wall_t + 5.0
fixture_y = pkt_l + 2 * arm_t + 2.0


def build_mount():
    """Build the snap-fit mount body with floor, stop wall and side clips."""
    with BuildPart() as e22_mount:
        # Floor shelf. The module underside rests at Z=standoff_z.
        with Locations((-wall_t / 2, 0, 0)):
            Box(
                pkt_w + wall_t,
                pkt_l + 2 * arm_t,
                standoff_z,
                align=(Align.CENTER, Align.CENTER, Align.MIN),
            )

        # -X back stop with a central wire slot.
        with Locations((-(pkt_w / 2 + wall_t / 2), 0, standoff_z)):
            Box(
                wall_t,
                pkt_l,
                module_t + guide_h,
                align=(Align.CENTER, Align.CENTER, Align.MIN),
            )
        with Locations((-(pkt_w / 2 + wall_t / 2), 0, standoff_z)):
            Box(
                wall_t + 1.0,
                wire_slot_w,
                module_t + guide_h + 1.0,
                align=(Align.CENTER, Align.CENTER, Align.MIN),
                mode=Mode.SUBTRACT,
            )

        # Four snap clips on the long edges. They clamp over the top of
        # the module body while leaving the antenna end open.
        for sign, iy in [(-1, -pkt_l / 2), (+1, +pkt_l / 2)]:
            for cx in clip_cx:
                with BuildSketch(Plane.YZ.offset(cx)):
                    with BuildLine():
                        Polyline(
                            (iy, 0),
                            (iy + sign * arm_t, 0),
                            (iy + sign * arm_t, arm_h),
                            (iy - sign * hook_d, hook_z + hook_h),
                            (iy - sign * hook_d, hook_z),
                            (iy, hook_z),
                            close=True,
                        )
                    make_face()
                extrude(amount=clip_w / 2, both=True)

        # Low +X nose pad. It acts as a print-bed anchor, not a wall, so the
        # antenna / IPEX area remains reachable.
        nose_x = pkt_w / 2 - 1.2
        with Locations((nose_x, 0, 0)):
            Box(
                2.4,
                pkt_l + 2 * arm_t,
                standoff_z,
                align=(Align.CENTER, Align.CENTER, Align.MIN),
            )
        stop_x = pkt_w / 2 - front_stop_r
        stop_y = front_stop_gap_y / 2 + front_stop_r
        with Locations([(stop_x, -stop_y, 0), (stop_x, stop_y, 0)]):
            Cylinder(
                radius=front_stop_r,
                height=front_stop_h,
                align=(Align.CENTER, Align.CENTER, Align.MIN),
            )

    return e22_mount.part


def build_fixture():
    """Build the printable test fixture."""
    with BuildPart() as fixture:
        with Locations((-wall_t / 2, 0, -base_t)):
            Box(
                fixture_x,
                fixture_y,
                base_t,
                align=(Align.CENTER, Align.CENTER, Align.MIN),
            )
        add(build_mount())

    part = fixture.part
    part.label = fixture_name
    return part


def _ocp_viewer_listening(port: int = 3939) -> bool:
    s = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    s.settimeout(0.25)
    try:
        return s.connect_ex(("127.0.0.1", port)) == 0
    finally:
        s.close()


def export_fixture(part):
    step_path = OUT / "e22_lora_mount_test.step"
    stl_path = OUT / "e22_lora_mount_test.stl"
    export_step(part, str(step_path))
    export_stl(part, str(stl_path))
    return step_path, stl_path


if __name__ == "__main__":
    test_part = build_fixture()
    step_path, stl_path = export_fixture(test_part)
    print(f"Exported: {step_path} + {stl_path}")
    print(
        f"  board {board_w:.1f}x{board_l:.1f} | hook underside Z={hook_z:.2f} "
        f"| clip gap {clamp_gap:.2f} | wire slot {wire_slot_w:.1f} "
        f"| front gap {front_stop_gap_y:.1f}"
    )

    if _OCP_AVAILABLE and _ocp_viewer_listening():
        show(test_part, names=[fixture_name], alphas=[0.85])
        print("[ocp] sent to viewer on :3939")
    elif _OCP_AVAILABLE:
        print("[ocp] viewer is not running on :3939")
