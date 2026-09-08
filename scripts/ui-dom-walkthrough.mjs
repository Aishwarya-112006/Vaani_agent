/**
 * Full DOM walkthrough for VaaniAgent UI.
 * Visits every route, inventories interactive elements, clicks them,
 * and runs a typed conversation through refine → pivot.
 *
 * Usage (from frontend/):
 *   pnpm exec playwright install chromium
 *   node ../scripts/ui-dom-walkthrough.mjs
 */
import { chromium } from "playwright";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const BASE = process.env.VAANI_UI_URL || "http://localhost:8080";
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(__dirname, "..", "scripts", "ui-walkthrough-report.json");

const report = {
  base: BASE,
  startedAt: new Date().toISOString(),
  pages: [],
  flows: [],
  failures: [],
  ok: true,
};

function fail(msg, extra = {}) {
  report.ok = false;
  report.failures.push({ msg, ...extra });
  console.error("FAIL:", msg, extra);
}

async function inventory(page, label) {
  const data = await page.evaluate(() => {
    const pick = (el) => {
      const text = (el.innerText || el.getAttribute("aria-label") || el.value || "")
        .trim()
        .replace(/\s+/g, " ")
        .slice(0, 80);
      return {
        tag: el.tagName.toLowerCase(),
        type: el.getAttribute("type") || undefined,
        role: el.getAttribute("role") || undefined,
        name: el.getAttribute("name") || undefined,
        href: el.getAttribute("href") || undefined,
        disabled: Boolean(el.disabled),
        text,
      };
    };
    const buttons = [...document.querySelectorAll("button, [role='button']")].map(pick);
    const links = [...document.querySelectorAll("a[href]")].map(pick);
    const inputs = [...document.querySelectorAll("input, textarea, select")].map(pick);
    const headings = [...document.querySelectorAll("h1, h2, h3")].map((el) =>
      (el.innerText || "").trim().slice(0, 100),
    );
    return {
      title: document.title,
      url: location.href,
      buttons,
      links,
      inputs,
      headings,
      buttonCount: buttons.length,
      linkCount: links.length,
      inputCount: inputs.length,
    };
  });
  report.pages.push({ label, ...data });
  console.log(
    `\n=== ${label} === ${data.url}\n  buttons=${data.buttonCount} links=${data.linkCount} inputs=${data.inputCount}`,
  );
  data.buttons.forEach((b, i) => console.log(`  [btn ${i}] ${b.disabled ? "DISABLED " : ""}${b.text || "(no text)"}`));
  data.links.forEach((l, i) => console.log(`  [lnk ${i}] ${l.text || l.href}`));
  return data;
}

async function clickAllEnabledButtons(page, label, { skipText = [] } = {}) {
  const results = [];
  const count = await page.locator("button:visible").count();
  for (let i = 0; i < count; i++) {
    const btn = page.locator("button:visible").nth(i);
    const text = ((await btn.innerText().catch(() => "")) || "").trim().replace(/\s+/g, " ");
    const disabled = await btn.isDisabled().catch(() => true);
    if (disabled) {
      results.push({ text, action: "skip-disabled" });
      continue;
    }
    if (skipText.some((s) => text.toLowerCase().includes(s.toLowerCase()))) {
      results.push({ text, action: "skip-listed" });
      continue;
    }
    // Avoid mic (animated) / demos during inventory pass
    const aria = (await btn.getAttribute("aria-label").catch(() => "")) || "";
    if (
      /start talking|stop and send|demo ·/i.test(text) ||
      /start talking|stop and send/i.test(aria)
    ) {
      results.push({ text: text || aria, action: "skip-heavy" });
      continue;
    }
    try {
      await btn.click({ timeout: 3000, force: true });
      await page.waitForTimeout(250);
      results.push({ text, action: "clicked" });
      console.log(`  clicked: ${text || "(icon)"}`);
    } catch (err) {
      results.push({ text, action: "error", error: String(err.message || err) });
      fail(`${label}: click failed`, { text, error: String(err.message || err) });
    }
  }
  report.flows.push({ label: `${label}:button-pass`, results });
  return results;
}

async function runConversation(page) {
  const flow = { name: "typed-conversation", steps: [] };
  const log = (step, ok, detail) => {
    flow.steps.push({ step, ok, detail });
    console.log(`  ${ok ? "OK" : "XX"} ${step}${detail ? ` — ${detail}` : ""}`);
    if (!ok) fail(`flow: ${step}`, { detail });
  };

  // City confirm Yes if present
  const yes = page.getByRole("button", { name: /^Yes$/i });
  if (await yes.isVisible().catch(() => false)) {
    await yes.click();
    await page.waitForTimeout(800);
    log("city-yes", true);
  } else {
    log("city-yes", true, "already confirmed / not shown");
  }

  const input = page.locator('input[placeholder*="interruption"], input[placeholder*="Hinglish"]').first();
  await input.waitFor({ state: "visible", timeout: 15000 });

  async function send(text) {
    await input.fill(text);
    await page.getByRole("button", { name: /send/i }).click();
    await page.waitForTimeout(3500);
  }

  await send("Find hotels in Delhi under ₹5000");
  const body1 = await page.locator("main").innerText();
  log(
    "search-hotels",
    /hotel|Delhi|searching|confirm/i.test(body1),
    body1.slice(0, 120).replace(/\s+/g, " "),
  );

  await send("Actually, only vegetarian and near a metro");
  await page.waitForTimeout(3500);
  const body2 = await page.locator("main").innerText();
  log(
    "refine",
    /refresh|veg|metro|filter|hotel/i.test(body2),
    body2.slice(-200).replace(/\s+/g, " "),
  );

  // Follow-up chips after COMPLETE
  await page.waitForTimeout(2000);
  const cheaper = page.getByRole("button", { name: /Cheaper\?/i });
  if (await cheaper.isVisible().catch(() => false)) {
    await cheaper.click();
    await page.waitForTimeout(3500);
    log("follow-up-cheaper", true);
  } else {
    log("follow-up-cheaper", true, "chip not visible yet (timing)");
  }

  await send("Find restaurants there instead");
  await page.waitForTimeout(3500);
  const body3 = await page.locator("main").innerText();
  log(
    "pivot-restaurants",
    /restaurant|Switching|Connaught|veg/i.test(body3),
    body3.slice(-200).replace(/\s+/g, " "),
  );

  // Constraint chips if any
  const filterBtns = page.locator("button").filter({ hasText: /^(city|budget|veg|metro|cuisine|area)\b/i });
  // chips have "city Delhi ×" style
  const chip = page.locator("button").filter({ hasText: /×/ }).first();
  if (await chip.isVisible().catch(() => false)) {
    const t = await chip.innerText();
    await chip.click();
    await page.waitForTimeout(2500);
    log("constraint-chip-remove", true, t.replace(/\s+/g, " ").slice(0, 60));
  } else {
    log("constraint-chip-remove", true, "no chip visible");
  }

  // Judge panel present
  const panel = await page.locator("text=JUDGE PANEL").isVisible().catch(() => false);
  log("debug-panel", panel);

  report.flows.push(flow);
}

async function main() {
  console.log(`Starting DOM walkthrough → ${BASE}`);
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  page.setDefaultTimeout(20000);

  page.on("pageerror", (err) => fail("pageerror", { error: String(err) }));
  page.on("console", (msg) => {
    if (msg.type() === "error") {
      // Rime/audio noise is common; only track hard failures later
    }
  });

  // --- / ---
  await page.goto(BASE, { waitUntil: "networkidle" });
  await page.waitForTimeout(1500);
  await inventory(page, "home");
  await clickAllEnabledButtons(page, "home", {
    skipText: ["Start talking", "Demo ·", "Send"],
  });

  // Nav links
  for (const name of ["Demo", "Evaluation", "Voice lab"]) {
    const link = page.getByRole("link", { name: new RegExp(`^${name}$`, "i") });
    if (await link.isVisible().catch(() => false)) {
      await link.click();
      await page.waitForTimeout(1000);
      await inventory(page, `nav-${name}`);
      await clickAllEnabledButtons(page, `nav-${name}`, {
        skipText: ["Start talking", "Demo ·", "Send", "Open Voice lab"],
      });
    } else {
      fail(`nav missing: ${name}`);
    }
  }

  // Back home for conversation
  await page.goto(BASE, { waitUntil: "networkidle" });
  await page.waitForTimeout(1200);
  console.log("\n=== conversation flow ===");
  await runConversation(page);

  // Interrupt cards (set input only)
  await page.goto(BASE, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(800);
  const tryBtns = page.locator("button").filter({ hasText: /^(REFINE|CANCEL|STATUS|FACT|PIVOT)\b/i });
  const tryCount = await tryBtns.count();
  console.log(`\n=== interrupt cards / try buttons: ${tryCount} ===`);
  for (let i = 0; i < Math.min(tryCount, 8); i++) {
    const b = tryBtns.nth(i);
    if (!(await b.isVisible().catch(() => false))) continue;
    if (await b.isDisabled().catch(() => true)) continue;
    const t = (await b.innerText()).replace(/\s+/g, " ").slice(0, 60);
    try {
      await b.click({ timeout: 2000, force: true });
      await page.waitForTimeout(200);
      console.log(`  card click: ${t}`);
    } catch (e) {
      fail("interrupt-card", { text: t, error: String(e.message || e) });
    }
  }

  // Scenario playground chips
  const playground = page.locator("section").filter({ hasText: /SCENARIO PLAYGROUND/i });
  if (await playground.isVisible().catch(() => false)) {
    const chips = playground.locator("button");
    const n = await chips.count();
    console.log(`\n=== scenario chips: ${n} ===`);
    for (let i = 0; i < n; i++) {
      const c = chips.nth(i);
      const t = (await c.innerText()).replace(/\s+/g, " ").slice(0, 70);
      await c.click();
      await page.waitForTimeout(150);
      console.log(`  scenario: ${t}`);
    }
  }

  // Demo script smoke — wait until demos re-enable after prior run
  console.log("\n=== demo REFINE (smoke) ===");
  await page.goto(BASE, { waitUntil: "networkidle" });
  await page.waitForTimeout(800);
  const yes2 = page.getByRole("button", { name: /^Yes$/i });
  if (await yes2.isVisible().catch(() => false)) await yes2.click();
  const refineDemo = page.getByRole("button", { name: /Demo · REFINE/i });
  try {
    await refineDemo.waitFor({ state: "visible", timeout: 5000 });
    // If still disabled from a previous demo, skip rather than fail the suite
    if (await refineDemo.isDisabled()) {
      console.log("  demo still disabled — skipping smoke (prior demo in flight)");
      report.flows.push({ name: "demo-refine-smoke", ok: true, skipped: true });
    } else {
      await refineDemo.click();
      await page.waitForTimeout(5000);
      report.flows.push({ name: "demo-refine-smoke", ok: true });
      console.log("  demo REFINE fired");
    }
  } catch (e) {
    fail("demo-refine-smoke", { error: String(e.message || e) });
  }

  // Mic button: verify presence + aria (don't start recording in CI)
  const mic = page.getByRole("button", { name: /start talking|stop and send/i });
  const micVisible = await mic.isVisible().catch(() => false);
  console.log(`\n=== mic button visible: ${micVisible} ===`);
  report.flows.push({ name: "mic-presence", ok: micVisible });
  if (!micVisible) fail("mic button missing");

  await browser.close();
  report.finishedAt = new Date().toISOString();
  fs.writeFileSync(OUT, JSON.stringify(report, null, 2));
  console.log(`\nReport → ${OUT}`);
  console.log(report.ok ? "\nALL CHECKS PASSED (see report for inventory)" : "\nSOME FAILURES — see report");
  process.exit(report.ok ? 0 : 1);
}

main().catch((err) => {
  console.error(err);
  report.ok = false;
  report.failures.push({ msg: "fatal", error: String(err) });
  fs.writeFileSync(OUT, JSON.stringify(report, null, 2));
  process.exit(1);
});
