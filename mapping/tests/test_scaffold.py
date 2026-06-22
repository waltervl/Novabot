def test_packages_import():
    import open_mapping
    import open_mapping.core
    import harness
    assert open_mapping.__doc__ is not None
