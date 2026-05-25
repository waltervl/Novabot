import datetime
Import("env")
version = datetime.datetime.now().strftime("%Y.%m%d.%H%M")
env.Append(BUILD_FLAGS=[f'-DFIRMWARE_VERSION=\\"{version}\\"'])
print(f"Walker firmware version: {version}")
