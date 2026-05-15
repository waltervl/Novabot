# Screenshot tooling

Local dev tool. Generates admin-panel screenshots for the user guide.
Not shipped, not run in CI.

## Setup (once)

```bash
cd tools/screenshots
npm install
npx playwright install chromium
```

## Run

Start your OpenNova dev server first (it must be reachable on
`BASE_URL`):

```bash
# from repo root
cd server && npm run dev
```

Then in another terminal:

```bash
cd tools/screenshots
BASE_URL=http://localhost:3000 \
DB_PATH=../../server/novabot.db \
npm run admin
```

Output lands in `tools/screenshots/output/` (gitignored). One PNG per
tab plus one PNG per card inside the tab, named
`tab-<tab>--<card-slug>.png`.

## Test account

The script creates a throwaway admin user
(`screenshots+<timestamp>@opennova.local`) directly via the regist
endpoint, then promotes it to `is_admin = 1` via direct SQLite write.
The account is deleted again on exit. Repeated runs don't leave
litter behind.

## Embedding screenshots in the wiki

After running, copy the PNGs you want to keep into
`docs/user-guide/screenshots/admin/` (also gitignored unless you choose
to commit specific shots). Reference from markdown:

```markdown
![Settings tab](screenshots/admin/tab-settings.png)
```

Re-run whenever the UI changes.

## App screenshots

The OpenNova mobile app is not automated yet. Use the iOS Simulator or
Android Emulator with the app's built-in Demo Mode for repeatable
shots:

```bash
# iOS Simulator (screenshot the currently booted simulator)
xcrun simctl io booted screenshot ~/Desktop/home-screen.png

# Android Emulator
adb exec-out screencap -p > ~/Desktop/home-screen.png
```

A Maestro / Detox harness for full app screenshot automation is a TODO
— file an issue if you want to drive it.
