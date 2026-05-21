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
# Vertical offset of the SMA hole centre within the +Y wall. 0 = mid-
# height of the case, negative = lower (closer to the case floor where
# the LC29HDA's IPEX pad actually sits). The PCB top lands at about
# Z=-4 with the current standoffs, so a Z offset around -3 keeps the
# pigtail run horizontal instead of arching upward.
# Empirical: with the board on 5 mm standoffs and the user's caliper
# read of "5 mm from PCB bottom to antenna centre", the SMA threads
# axis lands at Z=-0.5 mm in case coords (just above the case mid-
# height). Antenna sticks straight out, pigtail-free.
sma_z_offset      = -0.5
# Horizontal offset of the SMA hole. The breakout puts the SMA roughly
# centred on the board's short axis (user measured 12 mm of clearance
# from one edge, ~8 mm from the other - slight left-of-centre).
sma_x_offset      = -2.0

# Gap between the +Y edge of the LC29HDA main PCB and the inner +Y
# wall. The breakout has an SMA tab that pokes ~3 mm past the main
# PCB outline, and the SMA bulkhead body adds another ~5 mm before
# the threaded barrel emerges. So we need ~10 mm of clearance, not
# 2 mm, otherwise the SMA threads can't actually reach through the
# wall hole.
lc29_y_wall_gap   = 10.0

# Battery (HH 103450 = 10 x 34 x 50 mm flat LiPo, 2000 mAh, 3.7 V).
# Sits on the -Y side of the case floor with its long edge along X so
# the JST wires can route toward the LC29HDA without crossing the
# polyline scratch area underneath the screen.
battery_w         = 34.0   # Y (board "width")
battery_l         = 50.0   # X (long edge)
battery_h         = 10.0   # Z (thickness)
battery_clearance = 0.6    # extra slack per side so the cell drops in
# U-frame tunnel retention. The pocket is shifted hard against the
# -X case wall so the entire +X half of the case interior is free
# space for slide-in: cell is dropped into the +X half (lid off),
# then slid -X-ward into the rail tunnel. The case interior -X wall
# is the slide stop — no printed endcap needed.
# Rails on +Y and -Y edges of the cell have top lips that hook over
# the cell's top corners. The -Y rail is split in two with a wire
# window in between so the JST wires can fold out toward the case
# -Y wall.
battery_rail_t        = 2.5    # rail wall thickness
battery_rail_h        = battery_h + 1.5   # rail top ~1.5 mm above cell
battery_lip_overhang  = 3.0    # how far the top lip reaches inward
battery_lip_t         = 1.5    # vertical thickness of the lip
battery_wire_gap      = 14.0   # X width of the wire window in -Y rail

# ── Power-button (SW1) long-plunger mechanism ─────────────────────────
# SW1 sits on the BACK of the screen PCB with its actuator pointing
# DOWN into the case interior. We can't reach it through the lid (PCB
# in the way). Instead, a long thin plunger runs from BELOW the case
# floor up through a 2 mm hole, all the way up to the SW1 actuator.
# Both the case-floor hole and the screen PCB's own 2 mm hole act as
# alignment guides ("klemmen"), keeping the stem perfectly vertical.
#
# The plunger is one printed piece, top to bottom (lengths supplied
# by user after first print revealed earlier guesses were too short):
#   1. Tip (Ø 1.6 mm, 5 mm)       - threads through the screen-back's
#                                    Ø 2 mm hole into the LCD module
#                                    and presses SW1. Must be 5 mm to
#                                    actually depress the switch —
#                                    shorter and it just hovers.
#   2. Column (Ø 4 mm)            - thick stiff section between flange
#                                    and tip. Length = case height
#                                    − flange thickness − 5 mm LCD
#                                    thickness, so the tip lands at
#                                    the back of the LCD when the
#                                    flange rests on the floor.
#   3. Inside flange (Ø 5.4 mm,   - DOWN-stop. Ø 5.4 > Ø 4.2 floor
#      1 mm)                        hole = catches on floor interior
#                                    when SW1 spring pushes plunger
#                                    down. Sits inside the case.
#   4. 7 mm below the flange      - all material that protrudes
#      (combined Ø 4 thru-hole +    through the case to the outside.
#      Ø 3 lower stem)              Thru-hole section fills the floor
#                                    hole (2.5 mm floor + 0.5 mm
#                                    travel), lower stem dangles
#                                    below for finger-press.
#
# Install: drop in from inside the case (lid off) — lower stem and
# thru-hole sections thread DOWN through the Ø 4.2 floor hole, Ø 5.4
# flange catches on the floor interior. UP-stop is SW1 itself
# bottoming out internally.
power_btn_x          =  length / 2 - 30.0   # 30 mm from +X exterior edge of lid
power_btn_y          = -width / 2  + 19.0   # 19 mm from -Y exterior edge of lid

plunger_hole_r       = 2.1    # Ø 4.2 floor hole — column slides through
# Section diameters
plunger_lower_stem_d = 3.0    # visible Ø3 stem below the case floor
plunger_thru_d       = 4.0    # Ø 4 column in the floor hole (slip fit)
plunger_flange_d     = 5.4    # Ø 5.4 inside flange — DOWN stop
plunger_col_d        = 4.0    # main Ø 4 column inside the case
plunger_tip_d        = 1.6    # Ø 1.6 tip through screen-back hole
# Section lengths
plunger_below_flange_l = 7.0  # total below the flange (stem + thru-hole)
plunger_thru_l       = 3.0    # 2.5 mm floor + 0.5 mm travel slack
plunger_lower_stem_l = plunger_below_flange_l - plunger_thru_l  # = 4 mm
plunger_flange_h     = 1.0
plunger_lcd_thickness = 5.0   # how deep the tip enters the LCD
plunger_tip_l        = 5.0    # must be 5 mm to actually press SW1
# Column length tuned by physical iteration:
#   33 mm total (col=20) → 5 mm too tall (back of LCD didn't seat)
#   28 mm total (col=15) → unsure if too short
#   29 mm total (col=16) → trying this next
# Easy to swap back to the formula version: height - wall_thickness
# - lid_thickness - flange_h - LCD_thickness = 15.
plunger_col_l        = 16.0
# Battery Y centre: pinned against the -Y inner wall, with a little gap
# so the wires can fold along that wall.
battery_y_centre  = -(width / 2 - wall_thickness) + (battery_w / 2) + 3.0

# USB-C cutout on the case wall. The JC3248W535's USB-C plug sits
# roughly mid-edge; tune the X offset to your board.
usb_cutout_w      = 11.0
usb_cutout_h      = 7.5
usb_cutout_z_off  = 0.0     # vertical offset from the case mid-height

# Corner screw posts that fasten the lid to the case.
post_r            = 3.5
post_hole_r       = 1.4     # M3 self-tap pilot
post_inset        = wall_thickness  # posts hug the inner corners

# Shift the pocket against the -X side as far as the corner screw
# post allows. The corner posts (post_dx away from centre, radius
# post_r) intrude into the +Y/-Y rails' X range, so the cell -X face
# has to clear the post's +X edge plus a clearance margin. The post
# is the slide stop now — case wall is further back.
battery_x_centre  = -(length / 2 - wall_thickness - 2 * post_r) + (battery_l / 2) + battery_clearance

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
    lc29_y_centre = (width / 2 - wall_thickness) - (lc29_l / 2) - lc29_y_wall_gap
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

    # Battery U-frame retention. The pocket sits hard against the -X
    # case wall, so the entire +X half of the case is free space for
    # slide-in (cell ~50 mm + clearance fits comfortably). The case
    # interior -X wall is the slide travel stop — no printed end cap
    # needed. Two parallel rails along the cell's long edges have
    # top lips that hook over the +Y/-Y top corners; the -Y rail is
    # split with a wire window in the middle so the JST wires can
    # fold out toward the case -Y wall.
    bp_z   = -height / 2 + wall_thickness
    cell_x = battery_l / 2 + battery_clearance        # outer face of cell from battery centre
    cell_y = battery_w / 2 + battery_clearance        # outer face of cell from battery centre
    # Rail length spans cell + clearance; -X end fuses with the case
    # -X wall so the wall doubles as the rail anchor and the slide
    # stop. +X end is the open insertion mouth.
    rail_x_len = battery_l + 2 * battery_clearance
    # +Y rail (solid, full length).
    rail_y_pos = battery_y_centre + cell_y + battery_rail_t / 2
    with Locations((battery_x_centre, rail_y_pos, bp_z)):
        Box(
            rail_x_len,
            battery_rail_t,
            battery_rail_h,
            align=(Align.CENTER, Align.CENTER, Align.MIN),
        )
    # +Y rail top lip — overhangs inward (toward -Y) above the cell.
    lip_y_pos = battery_y_centre + cell_y - battery_lip_overhang / 2
    with Locations((battery_x_centre, lip_y_pos, bp_z + battery_rail_h - battery_lip_t)):
        Box(
            rail_x_len,
            battery_rail_t + battery_lip_overhang,
            battery_lip_t,
            align=(Align.CENTER, Align.CENTER, Align.MIN),
        )
    # -Y rails (two segments with a wire window in the middle). Same
    # geometry as the +Y rail but mirrored, and split so the JST wires
    # can route out toward the case -Y wall through the central gap.
    seg_total = battery_l + 2 * battery_clearance
    seg_len   = (seg_total - battery_wire_gap) / 2     # one segment
    seg_offset = (seg_total - seg_len) / 2              # X centre of one segment, relative to pocket
    neg_rail_y = battery_y_centre - cell_y - battery_rail_t / 2
    neg_lip_y  = battery_y_centre - cell_y + battery_lip_overhang / 2
    for sx_rel in (-seg_offset, +seg_offset):
        sx = battery_x_centre + sx_rel
        with Locations((sx, neg_rail_y, bp_z)):
            Box(
                seg_len,
                battery_rail_t,
                battery_rail_h,
                align=(Align.CENTER, Align.CENTER, Align.MIN),
            )
        with Locations((sx, neg_lip_y, bp_z + battery_rail_h - battery_lip_t)):
            Box(
                seg_len,
                battery_rail_t + battery_lip_overhang,
                battery_lip_t,
                align=(Align.CENTER, Align.CENTER, Align.MIN),
            )

    # SMA antenna pigtail hole through the +Y wall (= "top" in the
    # device's hand-held orientation), centred over the LC29HDA so the
    # pigtail makes a short straight run from the breakout's u.FL/SMA
    # pad up through a panel-mount SMA bulkhead with the antenna
    # pointing straight up out of the case.
    sma_loc = Location(
        (sma_x_offset, width / 2, sma_z_offset)
    ) * Rotation(90, 0, 0)
    with Locations(sma_loc):
        Cylinder(
            radius=sma_hole_r,
            height=wall_thickness * 4,
            align=(Align.CENTER, Align.CENTER, Align.CENTER),
            mode=Mode.SUBTRACT,
        )

    # USB-C cutout intentionally omitted for now - the exact position of
    # the JC3248W535's USB-C connector relative to the case wall hasn't
    # been verified against a printed enclosure yet. Re-add by carving a
    # Box at (length/2, 0, usb_cutout_z_off) rotated to face +X once the
    # connector position is measured.

    # ── SW1 wedge-button mechanism ─────────────────────────────────
    # Channel sidewalls (two parallel walls along X) + bridge cap on
    # top (with the vertical pin guide hole) + button slot through the
    # -X case wall. The wedge slides between the side walls; the bridge
    # caps the channel so the wedge can't escape upward; the pin slides
    # vertically through the bridge hole and rests on the wedge slope.
    ch_floor_z = -height / 2 + wall_thickness    # case floor (inside)
    ch_centre_x = power_btn_x
    ch_centre_y = power_btn_y

    # Plunger floor hole: a single 2 mm Ø hole through the case floor
    # at the SW1 XY. The plunger gets pushed UP through this hole from
    # outside during assembly; its barb snaps into place above the
    # floor on the inside and traps it there for life.
    with Locations((ch_centre_x, ch_centre_y, ch_floor_z)):
        Cylinder(
            radius=plunger_hole_r,
            height=wall_thickness + 1.0,
            align=(Align.CENTER, Align.CENTER, Align.MAX),
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

# ── Plunger for SW1 power button ─────────────────────────────────────────────
# Single tall part, bottom (user-facing) → top (SW1-facing) in a Z
# stack. Sections (bottom up):
#   1. Lower stem Ø3       — visible below the case
#   2. Thru-hole Ø4        — fills the floor hole + 0.5 mm travel
#   3. Inside flange Ø5.4  — DOWN-stop on floor interior
#   4. Main column Ø4      — main body inside the case
#   5. Tip Ø1.6            — into the LCD, presses SW1
# Below the flange totals 7 mm. Column length = height − flange −
# LCD thickness so the tip just reaches SW1 at rest.
with BuildPart() as plunger:
    z_cursor = 0.0

    # 1. Lower stem - finger-pressable end below the case floor.
    Cylinder(
        radius=plunger_lower_stem_d / 2,
        height=plunger_lower_stem_l,
        align=(Align.CENTER, Align.CENTER, Align.MIN),
    )
    z_cursor += plunger_lower_stem_l

    # 2. Thru-hole - rides in the Ø4.2 case-floor hole with 0.5 mm
    #    travel slack. Same Ø as the main column above the flange.
    with Locations((0, 0, z_cursor)):
        Cylinder(
            radius=plunger_thru_d / 2,
            height=plunger_thru_l,
            align=(Align.CENTER, Align.CENTER, Align.MIN),
        )
    z_cursor += plunger_thru_l

    # 3. Inside flange - sits on the floor interior, DOWN-stop. Ø5.4
    #    > Ø4.2 hole = can't pull through. Clears the corner screw
    #    post by 0.47 mm.
    with Locations((0, 0, z_cursor)):
        Cylinder(
            radius=plunger_flange_d / 2,
            height=plunger_flange_h,
            align=(Align.CENTER, Align.CENTER, Align.MIN),
        )
    z_cursor += plunger_flange_h

    # 4. Main column - thick stiff section, flange top to tip base.
    with Locations((0, 0, z_cursor)):
        Cylinder(
            radius=plunger_col_d / 2,
            height=plunger_col_l,
            align=(Align.CENTER, Align.CENTER, Align.MIN),
        )
    z_cursor += plunger_col_l

    # 5. Tip - threads through the screen-back's Ø2 hole and presses
    #    SW1. Must be 5 mm to actually depress the actuator (earlier
    #    3 mm just hovered above it per field test).
    with Locations((0, 0, z_cursor)):
        Cylinder(
            radius=plunger_tip_d / 2,
            height=plunger_tip_l,
            align=(Align.CENTER, Align.CENTER, Align.MIN),
        )

# ── Placement + export ──────────────────────────────────────────────────────
case_part = case.part
lid_part = lid.part.moved(Location((0, 0, height / 2)))
screen_ghost = screen_def.part.moved(Location((0, 0, height / 2 + lid_thickness)))
# Park the plunger next to the case so it shows up as a separate
# object in the viewer instead of overlapping with the case.
plunger_part = plunger.part.moved(Location((length / 2 + 30, 0, -height / 2)))

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
        case_part, lid_part, screen_ghost, plunger_part,
        names=["Case", "Lid", "Screen", "Plunger"],
        alphas=[0.8, 0.6, 0.4, 1.0],
    )
    print("[ocp] sent to viewer on :3939")
elif _OCP_AVAILABLE:
    print(
        "\n[ocp] Viewer is not running on :3939.\n"
        "      In VSCode: Cmd+Shift+P -> 'OCP CAD Viewer: Open Viewer'\n"
        "      (or click the cube icon in the sidebar), then re-run\n"
        "      this script. STL/STEP exports happen regardless.\n"
    )

# Exports. Plunger ships untransformed (in its part-local coords) so
# the slicer can lay it however suits the print bed.
for part, basename in [
    (case_part,    "case"),
    (lid_part,     "lid"),
    (plunger.part, "plunger"),
]:
    step_path = OUT / f"{basename}.step"
    stl_path = OUT / f"{basename}.stl"
    export_step(part, str(step_path))
    export_stl(part, str(stl_path))
    print(f"Wrote {step_path} and {stl_path}")
