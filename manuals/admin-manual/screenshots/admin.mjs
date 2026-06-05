#!/usr/bin/env node
/**
 * Admin-panel screenshot harness.
 *
 * Spins up a Playwright Chromium against a running OpenNova server,
 * registers a throwaway admin user (promoted via direct SQLite write),
 * walks every tab + card of the admin UI, and dumps PNGs under
 * `output/`. The throwaway user is deleted at the end so repeated runs
 * stay idempotent.
 *
 * Intended for refreshing screenshots in `docs/user-guide/admin-panel.md`
 * and the wiki when the UI changes. NOT shipped in any release artifact —
 * `tools/screenshots/output/` is gitignored.
 *
 * Usage:
 *   cd tools/screenshots
 *   npm install
 *   npx playwright install chromium
 *   BASE_URL=http://localhost:3000 \
 *   DB_PATH=../../server/novabot.db \
 *   npm run admin
 *
 * Env overrides:
 *   BASE_URL    — admin URL (default http://localhost:3000)
 *   DB_PATH     — path to novabot.db SQLite file (default ../../server/novabot.db)
 *   OUTPUT_DIR  — where PNGs land (default ./output)
 *   HEADED      — set to "1" to watch the run in a visible browser
 */

import { chromium } from 'playwright';
import Database from 'better-sqlite3';
import { mkdirSync, rmSync, existsSync } from 'node:fs';
import { resolve, join } from 'node:path';

const BASE_URL = process.env.BASE_URL ?? 'http://localhost:3000';
const DB_PATH = resolve(process.env.DB_PATH ?? '../../server/novabot.db');
const OUTPUT_DIR = resolve(process.env.OUTPUT_DIR ?? './output');
const HEADED = process.env.HEADED === '1';

const TEST_EMAIL = `screenshots+${Date.now()}@opennova.local`;
const TEST_PASSWORD = 'screenshot-bot-' + Math.random().toString(36).slice(2, 10);
const TEST_USERNAME = 'Screenshot Bot';

const TABS = [
  { id: 'devices',    label: 'Devices' },
  { id: 'console',    label: 'Console' },
  { id: 'mowerdebug', label: 'Mower Debug' },
  { id: 'maps',       label: 'Maps' },
  { id: 'firmware',   label: 'Firmware' },
  { id: 'settings',   label: 'Settings' },
];

function log(msg) { console.log(`[screenshots] ${msg}`); }

async function registerUser() {
  log(`registering ${TEST_EMAIL}`);
  const r = await fetch(`${BASE_URL}/api/nova-user/appUser/regist`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email: TEST_EMAIL,
      password: TEST_PASSWORD,
      username: TEST_USERNAME,
    }),
  });
  if (!r.ok) throw new Error(`register HTTP ${r.status}: ${await r.text()}`);
  const body = await r.json();
  if (body.code !== 200) throw new Error(`register failed: ${body.msg ?? JSON.stringify(body)}`);
  return body;
}

function promoteToAdmin(db) {
  log(`promoting ${TEST_EMAIL} to is_admin=1`);
  const result = db
    .prepare("UPDATE users SET is_admin = 1, dashboard_access = 1 WHERE email = ?")
    .run(TEST_EMAIL);
  if (result.changes !== 1) {
    throw new Error(`expected 1 row updated, got ${result.changes}`);
  }
}

function deleteUser(db) {
  log(`cleaning up ${TEST_EMAIL}`);
  db.prepare("DELETE FROM users WHERE email = ?").run(TEST_EMAIL);
}

async function run() {
  if (!existsSync(DB_PATH)) {
    throw new Error(`DB not found at ${DB_PATH} — pass DB_PATH=... to override`);
  }
  // Reset output directory so stale screenshots from previous runs don't
  // pile up under deleted tabs.
  rmSync(OUTPUT_DIR, { recursive: true, force: true });
  mkdirSync(OUTPUT_DIR, { recursive: true });

  const db = new Database(DB_PATH);
  let registered = false;
  let browser;
  try {
    await registerUser();
    registered = true;
    promoteToAdmin(db);

    browser = await chromium.launch({ headless: !HEADED });
    const context = await browser.newContext({
      viewport: { width: 1440, height: 900 },
      deviceScaleFactor: 2, // crisp on retina
    });
    const page = await context.newPage();

    log(`opening ${BASE_URL}/admin`);
    await page.goto(`${BASE_URL}/admin`, { waitUntil: 'domcontentloaded' });

    // Login form
    await page.fill('#email', TEST_EMAIL);
    await page.fill('#pass', TEST_PASSWORD);
    await Promise.all([
      page.waitForSelector('#app:not([style*="display: none"])', { timeout: 10_000 }),
      page.click('button:has-text("Login")'),
    ]);

    for (const tab of TABS) {
      log(`tab: ${tab.label}`);
      await page.click(`button.tab:has-text("${tab.label}")`);
      // Give cards time to fire their initial fetches.
      await page.waitForTimeout(800);

      const fullPath = join(OUTPUT_DIR, `tab-${tab.id}.png`);
      await page.screenshot({ path: fullPath, fullPage: true });

      // Individual cards inside this tab — one PNG per card so they can
      // be embedded next to the relevant paragraph in the user guide.
      const cards = await page.$$(`#tab_${tab.id} .card`);
      for (let i = 0; i < cards.length; i++) {
        const card = cards[i];
        const heading = (await card.$eval('h2', el => el.textContent?.trim() ?? '').catch(() => '')) || `card-${i}`;
        const slug = heading
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, '-')
          .replace(/^-+|-+$/g, '') || `card-${i}`;
        const cardPath = join(OUTPUT_DIR, `tab-${tab.id}--${slug}.png`);
        await card.screenshot({ path: cardPath });
      }
    }

    log(`screenshots saved under ${OUTPUT_DIR}`);
  } finally {
    if (browser) await browser.close();
    if (registered) {
      try { deleteUser(db); } catch (e) { console.error('[screenshots] cleanup failed:', e); }
    }
    db.close();
  }
}

run().catch((err) => {
  console.error('[screenshots]', err);
  process.exit(1);
});
