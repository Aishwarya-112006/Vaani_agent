/**
 * Chromium smoke: mock-data happy path + interrupt chips visibility.
 * Run: npx playwright@1.49.1 test --config=... OR node scripts/chromium-smoke.mjs
 */
import { chromium } from "playwright";
import fs from "node:fs";
import path from "node:path";

const BASE = process.env.VAANI_UI_URL || "http://localhost:8082";
const OUT = path.resolve("chromium-smoke-out");
fs.mkdirSync(OUT, { recursive: true });

const findings = [];

function note(ok, label, detail = "") {
  findings.push({ ok, label, detail });
  console.log(`${ok ? "PASS" : "FAIL"} · ${label}${detail ? ` — ${detail}` : ""}`);
}

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });

try {
  page.setDefaultTimeout(20000);
  const resp = await page.goto(BASE, { waitUntil: "domcontentloaded" });
  note(Boolean(resp && resp.ok()), "page loads", `${BASE} status=${resp?.status()}`);

  await page.waitForTimeout(2500);
  await page.screenshot({ path: path.join(OUT, "01-home.png"), fullPage: true });

  const sessionBanner = await page.getByText(/Backend session nahi bani/i).count();
  note(sessionBanner === 0, "session created (no error banner)");

  const live = await page.getByText(/Live conversation/i).count();
  note(live > 0, "Live conversation card visible");

  const interrupts = ["REFINE", "STATUS", "FACT", "PIVOT", "CANCEL"];
  for (const label of interrupts) {
    const n = await page.getByRole("button", { name: label, exact: true }).count();
    note(n > 0, `interrupt chip ${label}`);
  }

  // Confirm city if prompt present
  const yes = page.getByRole("button", { name: "Yes", exact: true });
  if (await yes.count()) {
    await yes.first().click();
    await page.waitForTimeout(800);
    note(true, "city Yes clicked");
  } else {
    note(true, "city prompt already closed / skipped");
  }

  const input = page.getByPlaceholder(/Type an interruption/i);
  await input.fill("Find hotels in Delhi under 5000");
  await page.getByRole("button", { name: "Send" }).click();
  note(true, "submitted mock hotel search");

  await page.waitForTimeout(1500);
  await page.screenshot({ path: path.join(OUT, "02-searching.png"), fullPage: true });

  // Interrupt STATUS while searching (best effort)
  const statusBtn = page.getByRole("button", { name: "STATUS", exact: true }).first();
  if (await statusBtn.isVisible()) {
    await statusBtn.click();
    note(true, "STATUS interrupt clicked mid-search");
  }

  // Wait for completion cues
  const done = await Promise.race([
    page.getByText(/Next · one tap/i).waitFor({ timeout: 20000 }).then(() => "next"),
    page.getByText(/Live map/i).waitFor({ timeout: 20000 }).then(() => "map"),
    page.waitForTimeout(18000).then(() => "timeout"),
  ]);
  note(done !== "timeout", "search progressed (map or next chips)", done);

  await page.screenshot({ path: path.join(OUT, "03-after-search.png"), fullPage: true });

  // City pollution edge: open change city then try bogus
  const change = page.getByRole("button", { name: /change city/i }).first();
  if (await change.count()) {
    await change.click();
    await page.waitForTimeout(400);
    const delhi = page.getByRole("button", { name: "Delhi", exact: true });
    if (await delhi.count()) {
      await delhi.first().click();
      note(true, "change city → Delhi");
    }
  }

  const filtersActually = await page.getByText(/city Actually/i).count();
  note(filtersActually === 0, "no city=Actually pollution in filters");

  await page.screenshot({ path: path.join(OUT, "04-final.png"), fullPage: true });
} catch (err) {
  note(false, "uncaught", String(err));
  await page.screenshot({ path: path.join(OUT, "error.png"), fullPage: true }).catch(() => {});
} finally {
  await browser.close();
}

const failed = findings.filter((f) => !f.ok);
fs.writeFileSync(path.join(OUT, "findings.json"), JSON.stringify({ findings, failed: failed.length }, null, 2));
console.log(`\nSummary: ${findings.length - failed.length}/${findings.length} passed`);
process.exit(failed.length ? 1 : 0);
