import XCTest

/// fastlane snapshot UI test for the OpenNova app.
///
/// The app must be built with `EXPO_PUBLIC_SNAPSHOT=1` (the Snapfile passes
/// this via `xcargs`). In that mode the app skips login and boots into demo
/// mode, so every screen renders populated without a live server.
///
/// Navigation is driven by stable `testID`s (set in the RN code), not by
/// visible text, so the test is language-independent.
///
/// `setupSnapshot`/`snapshot` from SnapshotHelper are `@MainActor`-isolated,
/// so the methods that call them are annotated `@MainActor`.
final class SnapshotUITests: XCTestCase {

    override func setUpWithError() throws {
        continueAfterFailure = false
    }

    // MARK: - Helpers

    /// Launch a fresh instance of the app in snapshot mode.
    @MainActor
    @discardableResult
    private func launchApp() -> XCUIApplication {
        let app = XCUIApplication()
        setupSnapshot(app)
        app.launch()
        return app
    }

    @discardableResult
    private func waitFor(_ element: XCUIElement, _ timeout: TimeInterval = 25) -> Bool {
        element.waitForExistence(timeout: timeout)
    }

    /// Give React Native a moment to finish rendering demo data / maps before
    /// the screenshot is taken.
    private func settle(_ seconds: TimeInterval = 1.5) {
        RunLoop.current.run(until: Date().addingTimeInterval(seconds))
    }

    /// Resolve a `testID`, whether RN exposes it as a button or a generic view.
    private func element(_ app: XCUIApplication, _ id: String) -> XCUIElement {
        let button = app.buttons[id]
        if button.exists { return button }
        return app.descendants(matching: .any)[id]
    }

    @MainActor
    private func tapTab(_ app: XCUIApplication, _ id: String) -> Bool {
        let tab = element(app, id)
        guard waitFor(tab, 12) else { return false }
        tab.tap()
        return true
    }

    // MARK: - Test

    @MainActor
    func testCaptureScreens() throws {
        // ── Pass 1: the six bottom tabs (tab bar stays visible) ──────────
        let app = launchApp()
        XCTAssertTrue(
            waitFor(element(app, "tab-home")),
            "App never reached the main tabs — is EXPO_PUBLIC_SNAPSHOT=1 baked into the build?"
        )

        settle(2.0)
        snapshot("01Home")

        let tabs: [(id: String, name: String)] = [
            ("tab-map",       "02Map"),
            ("tab-control",   "03Control"),
            ("tab-camera",    "04Camera"),
            ("tab-schedules", "05Schedules"),
            ("tab-settings",  "06Settings"),
        ]
        for tab in tabs where tapTab(app, tab.id) {
            settle(1.5)
            snapshot(tab.name)
        }

        // ── Pass 2: key sub-screens (relaunch each time for a clean root) ─
        captureSubScreen(tab: "tab-map",       entry: "map-create",     name: "07Mapping")
        captureSubScreen(tab: "tab-schedules", entry: "schedule-add",   name: "08ScheduleEditor")
        captureSubScreen(tab: "tab-settings",  entry: "settings-mower", name: "09MowerSettings")
        captureSubScreen(tab: "tab-settings",  entry: "settings-ota",   name: "10Ota")
    }

    /// Relaunch, open `tab`, tap the `entry` button, and snapshot the pushed
    /// screen. Sub-screens are best-effort: a missing entry is skipped (logged)
    /// rather than failing the whole run.
    @MainActor
    private func captureSubScreen(tab: String, entry: String, name: String) {
        let app = launchApp()
        guard tapTab(app, tab) else {
            NSLog("snapshot: tab \(tab) not found, skipping \(name)")
            return
        }
        settle(1.0)
        let button = element(app, entry)
        guard waitFor(button, 10) else {
            NSLog("snapshot: entry \(entry) not found, skipping \(name)")
            return
        }
        button.tap()
        settle(2.0)
        snapshot(name)
    }
}
