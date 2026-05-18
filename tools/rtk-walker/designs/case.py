"""
RTK Walker enclosure — parametric build123d script.

Re-uses the JC3248W535EN screen mounting pattern from the PoolLab case
verbatim:

  - Bezel  94.5 x 62 mm, 4 mm thick, sits ON TOP of the lid.
  - Rear   82.2 x 57.8 mm, 8 mm deep, falls IN through the lid cutout.
  - M3 mounting holes at 84 x 52 mm pitch (+-42 x +-26).
  - Lid cutout 91 x 58.6 mm with 4 inverted-ear brackets at the mount
    holes; the ear hangs from the lid via a hull-arm to the rim.

Internal layout:

  - JC3248W535EN dev board (the TFT module itself) hangs from the lid
    on 4 M3 screws into the screen's threaded inserts.
  - Quectel LC29HDA breakout sits on standoffs on the case floor with
    an SMA pigtail exiting through the side wall.
  - USB-C cutout on the right-hand wall lines up with the connector
    on the JC3248W535 (data + power).

All dimensions live at the top of the file so you can tweak the LC29HDA
footprint or the case proportions without touching the geometry.

Build (needs build123d in the env):
    python tools/rtk-walker/designs/case.py
Generates:
    case.step, case.stl, lid.step, lid.stl in the same folder.
"""

from build123d import *
from pathlib import Path

# OCP CAD Viewer integration — same setup as the PoolLab design. The
# default port is 3939; setting it explicitly avoids the "Port could
# not be cast to integer value as 'None'" warning that fires when the
# OCP_PORT env var isn't exported. Guarded so headless runs still work.
try:
    from ocp_vscode import show, set_port, set_defaults, Camera
    set_port(3939)
    set_defaults(reset_camera=Camera.CENTER)
    _OCP_AVAILABLE = True
except Exception:
    _OCP_AVAILABLE = False

# ── User-tweakable parameters ───────────────────────────────────────────────

# Outer dimensions. With the screen cutout at 91 x 58.6 and the bracket
# arms routed to the +-X side walls, 120 x 88 leaves ~14 mm wall on
# each side - plenty to keep the corner posts clear of the bracket arms.
length         = 120.0    # X dimension (along the screen long axis)
width          = 88.0     # Y dimension (along the screen short axis)
height         = 26.0     # Z height of the case (lid sits on top). LC29HDA
                          # stack + screen rear bottoms out at ~22 mm so 26
                          # leaves ~4 mm of clearance. The -Y half stays
                          # full-height open for a flat LiPo on the floor.
wall_thickness = 2.5
fillet_outer   = 5.0

# Lid.
lid_thickness  = 2.5

# Screen specs (JC3248W535EN, identical to PoolLab).
screen_front_w        = 94.5
screen_front_h        = 62.0
screen_front_t        = 4.0
screen_back_w         = 82.2
screen_back_h         = 57.8
screen_back_t         = 8.0
screen_corner_radius  = 4.0
screen_mount_dx       = 84.0    # full pitch in X
screen_mount_dy       = 52.0    # full pitch in Y
screen_cutout_w       = 91.0    # lid cutout opening
screen_cutout_h       = 58.6

# Ear-bracket parameters (hangs below the lid to receive the M3 screws).
bracket_h         = 3.0     # bracket arm thickness in Z
bracket_radius    = 1.75    # ear disc radius (3.5 mm dia)
bracket_anchor_r   = 3.0    # anchor radius at the case wall
bracket_anchor_gap = 1.0    # gap between anchor edge and the inner case wall
bracket_z_drop    = 5.0     # bracket top this far below outer surface
bracket_screw_r   = 1.3     # M3 self-tap pilot

# LC29HDA breakout - measured dimensions (see datasheet image). Board is
# 20.3 x 30.5 with 2 mount holes on ONE short edge and the antenna (u.FL)
# on the opposite short edge. Place it with mount-holes facing into the
# case so the antenna end butts up against the +Y wall + SMA bulkhead.
lc29_w               = 20.3   # board width  (X, along the short axis)
lc29_l               = 30.5   # board length (Y, mount-holes to antenna axis)
lc29_mount_pitch     = 15.1   # spacing between the two M2 mount holes
lc29_mount_edge_off  = 2.6    # mount-hole centre to nearest board edge
lc29_screw_r         = 1.1    # M2 self-tap pilot
lc29_standoff_h      = 5.0    # clearance under board for through-hole pins
lc29_standoff_r      = 2.5
lc29_support_r       = 2.0    # plain support post (no screw) at the antenna end
lc29_pcb_thickness   = 1.6

# SMA antenna pigtail hole on the case wall (RP-SMA bulkhead = 6.5 mm
# threaded barrel; allow a touch of slack).
sma_hole_r        = 3.25

# USB-C cutout on the case wall. The JC3248W535's USB-C plug sits
# roughly mid-edge; tune the X offset to your board.
usb_cutout_w      = 11.0
usb_cutout_h      = 7.5
usb_cutout_z_off  = 0.0     # vertical offset from the case mid-height

# Corner screw posts that fasten the lid to the case.
post_r            = 3.5
post_hole_r       = 1.4     # M3 self-tap pilot
post_inset        = wall_thickness  # posts hug the inner corners

OUT = Path(__file__).resolve().parent

# ── Screen ghost (visualisation only) ───────────────────────────────────────
with BuildPart() as screen_def:
    # Bezel (above lid).
    with BuildSketch():
        rect = Rectangle(screen_front_w, screen_front_h, align=(Align.CENTER, Align.CENTER))
        fillet(rect.vertices(), radius=screen_corner_radius)
    extrude(amount=screen_front_t)

    # Rear body (drops through the lid cutout).
    with BuildSketch():
        Rectangle(screen_back_w, screen_back_h, align=(Align.CENTER, Align.CENTER))
    extrude(amount=-screen_back_t)

    # Active LCD area for visual reference.
    with Locations((0, 0, screen_front_t)):
        Box(73.4, 49.0, 0.1, align=(Align.CENTER, Align.CENTER, Align.MIN))

# ── Case (bottom shell with screw posts + cutouts) ──────────────────────────
with BuildPart() as case:
    # Outer shell with rounded corners.
    with BuildSketch(Plane.XY.offset(-height / 2)):
        Rectangle(length, width)
        fillet(vertices(), radius=fillet_outer)
    extrude(amount=height)

    # Hollow interior.
    with BuildSketch(Plane.XY.offset(-height / 2 + wall_thickness)):
        Rectangle(length - 2 * wall_thickness, width - 2 * wall_thickness)
        fillet(vertices(), radius=fillet_outer - wall_thickness)
    extrude(amount=height, mode=Mode.SUBTRACT)

    # Corner screw posts that the lid screws into.
    post_dx = length / 2 - wall_thickness - post_r
    post_dy = width / 2 - wall_thickness - post_r
    with Locations(
        [(post_dx, post_dy), (post_dx, -post_dy), (-post_dx, post_dy), (-post_dx, -post_dy)]
    ):
        with Locations((0, 0, -height / 2 + wall_thickness)):
            Cylinder(
                radius=post_r,
                height=height - wall_thickness,
                align=(Align.CENTER, Align.CENTER, Align.MIN),
                mode=Mode.ADD,
            )
        with Locations((0, 0, height / 2)):
            Cylinder(
                radius=post_hole_r,
                height=15,
                align=(Align.CENTER, Align.CENTER, Align.MAX),
                mode=Mode.SUBTRACT,
            )

    # LC29HDA standoffs on the floor. The breakout has only TWO M2 mount
    # holes on one short edge, with the u.FL/SMA antenna pad on the
    # opposite short edge. We orient it so the antenna end butts up
    # against the +Y wall (where the SMA bulkhead lives) and the mount
    # holes face the case interior. To keep the board from tipping with
    # only two anchored corners, two plain support posts (no screw) sit
    # under the antenna end as well.
    lc29_y_centre = (width / 2 - wall_thickness) - (lc29_l / 2) - 4
    lc29_z_floor  = -height / 2 + wall_thickness
    lc29_origin   = (0, lc29_y_centre, lc29_z_floor)

    # Mount-hole positions, relative to the board centre. Two holes on
    # the -Y short edge (the one facing the case interior).
    mount_y_local    = -lc29_l / 2 + lc29_mount_edge_off
    mount_locs_local = [
        (-lc29_mount_pitch / 2, mount_y_local),
        ( lc29_mount_pitch / 2, mount_y_local),
    ]
    # Plain support posts at the antenna end so the board sits on four
    # contact points; pulled in 3 mm from the corners so they clear the
    # antenna pad and the +Y wall fillet.
    support_locs_local = [
        (-lc29_w / 2 + 3, lc29_l / 2 - 3),
        ( lc29_w / 2 - 3, lc29_l / 2 - 3),
    ]

    with Locations(lc29_origin):
        # Screw standoffs (with M2 self-tap pilot).
        with Locations(mount_locs_local):
            Cylinder(
                radius=lc29_standoff_r,
                height=lc29_standoff_h,
                align=(Align.CENTER, Align.CENTER, Align.MIN),
            )
            Cylinder(
                radius=lc29_screw_r,
                height=lc29_standoff_h + 0.5,
                align=(Align.CENTER, Align.CENTER, Align.MIN),
                mode=Mode.SUBTRACT,
            )
        # Plain support posts (board rests on them, not screwed).
        with Locations(support_locs_local):
            Cylinder(
                radius=lc29_support_r,
                height=lc29_standoff_h,
                align=(Align.CENTER, Align.CENTER, Align.MIN),
            )

    # SMA antenna pigtail hole through the +Y wall (= "top" in the
    # device's hand-held orientation), centred over the LC29HDA so the
    # pigtail makes a short straight run from the breakout's u.FL/SMA
    # pad up through a panel-mount SMA bulkhead with the antenna
    # pointing straight up out of the case.
    sma_loc = Location(
        (0, width / 2, 0)
    ) * Rotation(90, 0, 0)
    with Locations(sma_loc):
        Cylinder(
            radius=sma_hole_r,
            height=wall_thickness * 4,
            align=(Align.CENTER, Align.CENTER, Align.CENTER),
            mode=Mode.SUBTRACT,
        )

    # USB-C cutout on the opposite side wall. Sized for a flush-style
    # USB-C plug, with a small chamfer slot.
    usb_loc = Location(
        (length / 2, 0, usb_cutout_z_off)
    ) * Rotation(0, 90, 0)
    with Locations(usb_loc):
        Box(
            usb_cutout_h,
            usb_cutout_w,
            wall_thickness * 4,
            align=(Align.CENTER, Align.CENTER, Align.CENTER),
            mode=Mode.SUBTRACT,
        )

# ── Lid (with screen cutout + ear-brackets verbatim from PoolLab) ───────────
with BuildPart() as lid:
    # Lid plate.
    with BuildSketch():
        Rectangle(length, width)
        fillet(vertices(), radius=fillet_outer)
    extrude(amount=lid_thickness)

    # Ear-brackets that hang below the lid and receive the screen's M3
    # screws. Each ear is hulled to an anchor pinned against the +-X
    # side wall (NOT the diagonal corner) so the arm runs perpendicular
    # to the long axis. That keeps the arms clear of the lid-screw
    # corner posts at (+-post_dx, +-post_dy) and stops the anchors from
    # poking through the case wall.
    bracket_z_top = lid_thickness - bracket_z_drop  # 5 mm below outer surface
    anchor_inset = wall_thickness + bracket_anchor_r + bracket_anchor_gap
    mount_data = [
        ( screen_mount_dx / 2,  screen_mount_dy / 2),
        ( screen_mount_dx / 2, -screen_mount_dy / 2),
        (-screen_mount_dx / 2,  screen_mount_dy / 2),
        (-screen_mount_dx / 2, -screen_mount_dy / 2),
    ]

    for mx, my in mount_data:
        with BuildPart(mode=Mode.ADD):
            # Anchor on the nearest +-X side wall at the same Y as the ear.
            ax = (length / 2 - anchor_inset) * (1 if mx > 0 else -1)
            ay = my
            full_arm_depth = abs(bracket_z_top) + bracket_h
            with BuildSketch(Plane.XY.offset(0)):
                with Locations((mx, my)):
                    Circle(bracket_radius)
                with Locations((ax, ay)):
                    Circle(bracket_anchor_r)
                make_hull()
            extrude(amount=-full_arm_depth)
            with Locations((mx, my, 0)):
                Cylinder(
                    radius=bracket_screw_r,
                    height=full_arm_depth + 1,
                    align=(Align.CENTER, Align.CENTER, Align.MAX),
                    mode=Mode.SUBTRACT,
                )

    # Screen cutout — cuts through lid + bracket-pillar so the bezel
    # rear can drop into the lid while the ears stay intact.
    cutout_depth = bracket_z_drop  # 5 mm
    with BuildSketch(Plane.XY.offset(lid_thickness)):
        Rectangle(screen_cutout_w, screen_cutout_h, align=(Align.CENTER, Align.CENTER))
    extrude(amount=-cutout_depth, mode=Mode.SUBTRACT)

    # Lid screw holes (countersunk M3 into the case corner posts).
    post_dx = length / 2 - wall_thickness - post_r
    post_dy = width / 2 - wall_thickness - post_r
    with Locations(
        [(post_dx, post_dy), (post_dx, -post_dy), (-post_dx, post_dy), (-post_dx, -post_dy)]
    ):
        Cylinder(
            radius=1.6,
            height=lid_thickness,
            align=(Align.CENTER, Align.CENTER, Align.MIN),
            mode=Mode.SUBTRACT,
        )
        with Locations((0, 0, lid_thickness)):
            Cone(
                bottom_radius=1.6,
                top_radius=3,
                height=1.6,
                align=(Align.CENTER, Align.CENTER, Align.MAX),
                mode=Mode.SUBTRACT,
            )

# ── Placement + export ──────────────────────────────────────────────────────
case_part = case.part
lid_part = lid.part.moved(Location((0, 0, height / 2)))
screen_ghost = screen_def.part.moved(Location((0, 0, height / 2 + lid_thickness)))

# Send the full assembly to OCP CAD Viewer in one go — matches the
# PoolLab pattern (positional parts + parallel names/alphas lists)
# so the viewer tree groups everything sensibly.
def _ocp_viewer_listening(port: int = 3939) -> bool:
    """Quick TCP probe — show() either swallows or warns about a missing
    viewer depending on the package version, so check ourselves."""
    import socket
    s = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    s.settimeout(0.25)
    try:
        return s.connect_ex(("127.0.0.1", port)) == 0
    finally:
        s.close()

if _OCP_AVAILABLE and _ocp_viewer_listening():
    show(
        case_part, lid_part, screen_ghost,
        names=["Case", "Lid", "Screen"],
        alphas=[0.8, 0.6, 0.4],
    )
    print("[ocp] sent to viewer on :3939")
elif _OCP_AVAILABLE:
    print(
        "\n[ocp] Viewer is not running on :3939.\n"
        "      In VSCode: Cmd+Shift+P -> 'OCP CAD Viewer: Open Viewer'\n"
        "      (or click the cube icon in the sidebar), then re-run\n"
        "      this script. STL/STEP exports happen regardless.\n"
    )

# Exports.
for part, basename in [(case_part, "case"), (lid_part, "lid")]:
    step_path = OUT / f"{basename}.step"
    stl_path = OUT / f"{basename}.stl"
    export_step(part, str(step_path))
    export_stl(part, str(stl_path))
    print(f"Wrote {step_path} and {stl_path}")
