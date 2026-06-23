from open_mapping.core.overlap import check_overlap

SQ = [(0, 0), (2, 0), (2, 2), (0, 2)]


def test_disjoint_is_ok():
    assert check_overlap(SQ, [[(5, 5), (6, 5), (6, 6), (5, 6)]], []) == 0


def test_overlapping_map_is_code_1():
    assert check_overlap(SQ, [[(1, 1), (3, 1), (3, 3), (1, 3)]], []) == 1


def test_overlapping_unicom_is_code_2():
    assert check_overlap(SQ, [], [[(1, 1), (3, 1), (3, 3), (1, 3)]]) == 2
