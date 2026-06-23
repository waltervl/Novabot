"""Overlap detection gating a save (mapping_msgs/srv/Mapping error_code).

1 = OVERLAPING_OTHER_MAP, 2 = OVERLAPING_OTHER_UNICOM, 3 = CROSS_MULTI_MAPS, 0 = ok.
"""
import pyclipper

SCALE = 1000


def _intersects(a, b):
    pc = pyclipper.Pyclipper()
    pc.AddPath([(round(x * SCALE), round(y * SCALE)) for x, y in a], pyclipper.PT_SUBJECT, True)
    pc.AddPath([(round(x * SCALE), round(y * SCALE)) for x, y in b], pyclipper.PT_CLIP, True)
    sol = pc.Execute(pyclipper.CT_INTERSECTION, pyclipper.PFT_NONZERO, pyclipper.PFT_NONZERO)
    return bool(sol)


def check_overlap(new_work, existing_works, existing_unicoms):
    for w in existing_works:
        if _intersects(new_work, w):
            return 1
    for u in existing_unicoms:
        if _intersects(new_work, u):
            return 2
    return 0
