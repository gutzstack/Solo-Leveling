// End-to-end smoke test: drives the real UI in Chromium against a running server.
// Usage: BASE_URL=http://localhost:3000 npm run test:e2e   (screenshots go to test-results/)
import { createRequire } from "node:module";
// Playwright is resolved via require so a globally installed copy (NODE_PATH) also works.
const { chromium } = createRequire(import.meta.url)("playwright");
import { mkdirSync } from "node:fs";

const BASE = process.env.BASE_URL ?? "http://localhost:3000";
const OUT = process.env.SCREENSHOT_DIR ?? "test-results";
mkdirSync(OUT, { recursive: true });

const email = `e2e_${Date.now()}@example.test`;
const errors = [];
const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1360, height: 900 }, reducedMotion: "reduce" });
const page = await ctx.newPage();
page.on("pageerror", (e) => errors.push(`pageerror: ${e.message}`));
page.on("console", (m) => {
  if (m.type() === "error" && !m.text().includes("Download the React DevTools")) errors.push(`console: ${m.text()}`);
});

async function step(name, fn) {
  process.stdout.write(`• ${name} … `);
  await fn();
  console.log("ok");
}

try {
  await step("gate & signup", async () => {
    await page.goto(BASE + "/");
    await page.getByRole("button", { name: "Accept" }).click();
    await page.getByLabel("Email").fill(email);
    await page.getByLabel("Password").fill("correct-horse-battery");
    await page.getByRole("button", { name: "Awaken" }).click();
    await page.waitForURL("**/awakening");
  });

  await step("awakening onboarding", async () => {
    await page.getByText("Tap to skip").click();
    await page.getByLabel("Player name").fill("Shadow");
    await page.getByLabel("Age").fill("24");
    await page.getByLabel("Sex (optional)").selectOption("male");
    for (let i = 0; i < 5; i++) await page.getByRole("button", { name: "Next", exact: true }).click();
    await page.screenshot({ path: `${OUT}/01-confirm.png` });
    await page.getByRole("button", { name: "Accept the System" }).click();
    await page.waitForURL("**/status", { timeout: 30000 });
    await page.getByText("HUNTER RANK", { exact: true }).waitFor();
    await page.waitForTimeout(1500);
    await page.mouse.click(5, 5);
    await page.screenshot({ path: `${OUT}/02-status.png`, fullPage: true });
  });

  await step("log an activity", async () => {
    // dismiss any overlay
    for (let i = 0; i < 6; i++) {
      const overlay = page.getByText("Tap to continue");
      if (!(await overlay.count())) break;
      await overlay.first().click({ force: true, timeout: 3000 }).catch(() => {});
      await page.waitForTimeout(400);
    }
    await page.getByRole("button", { name: "Log activity" }).click();
    await page.getByLabel("Activity", { exact: true }).selectOption("study");
    await page.getByLabel(/Minutes/).fill("95");
    await page.getByRole("button", { name: "Record" }).click();
    await page.getByText("[QUEST COMPLETE]").first().waitFor({ timeout: 15000 });
  });

  await step("activity log: delete reverses XP", async () => {
    await page.goto(BASE + "/status");
    await page.getByRole("button", { name: "Full log" }).waitFor({ timeout: 20000 });
    for (let i = 0; i < 6; i++) {
      const overlay = page.getByText("Tap to continue");
      if (!(await overlay.count())) break;
      await overlay.first().click({ force: true, timeout: 3000 }).catch(() => {});
      await page.waitForTimeout(400);
    }
    await page.getByRole("button", { name: "Full log" }).click();
    page.once("dialog", (d) => d.accept());
    await page.getByRole("button", { name: /^Delete Focused study session/ }).first().click();
    await page.getByText("Nothing logged yet.", { exact: true }).waitFor({ timeout: 15000 });
    await page.keyboard.press("Escape");
  });

  await step("quest board: categories and quick-logging reps", async () => {
    await page.goto(BASE + "/quests");
    await page.getByRole("heading", { name: "Physical" }).waitFor({ timeout: 20000 });
    await page.getByRole("heading", { name: "Intellectual" }).waitFor();
    const regimen = page.locator("section").filter({ hasText: "PREPARATIONS TO BECOME POWERFUL" }).last();
    const pushups = regimen.locator("li").filter({ hasText: "100 push-ups" });
    await pushups.getByRole("button", { name: "+25" }).click();
    await pushups.getByText("25 / 100").waitFor({ timeout: 15000 });
    await page.screenshot({ path: `${OUT}/05-quest-board.png`, fullPage: true });
  });

  await step("reasoning trial: complete 12 items", async () => {
    await page.goto(BASE + "/trials");
    await page.getByRole("heading", { name: "Reasoning Trial" }).waitFor({ timeout: 20000 });
    const card = page.locator("section").filter({ has: page.getByRole("heading", { name: "Reasoning Trial" }) }).last();
    await card.getByRole("button", { name: "Begin" }).click();
    for (let i = 0; i < 12; i++) {
      await page.getByText(`Item ${i + 1} / 12`).waitFor({ timeout: 15000 });
      await page.locator("button", { hasText: /^A/ }).first().click();
    }
    await page.getByText("[TRIAL COMPLETE]").waitFor({ timeout: 15000 });
    await page.screenshot({ path: `${OUT}/04-trial-complete.png`, fullPage: true });
    await page.getByRole("button", { name: "Return" }).click();
  });

  const pages = ["attributes", "attributes/INT", "quests", "dungeons", "trials", "skills", "achievements", "analytics", "rankings", "system"];
  for (const p of pages) {
    await step(`page /${p}`, async () => {
      await page.goto(`${BASE}/${p}`);
      await page.locator("main h1").first().waitFor({ timeout: 20000 });
      await page.waitForTimeout(800);
      await page.screenshot({ path: `${OUT}/page-${p.replace("/", "-")}.png`, fullPage: true });
    });
  }

  await step("mobile layout", async () => {
    const m = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, reducedMotion: "reduce", storageState: await ctx.storageState() });
    const mp = await m.newPage();
    await mp.goto(`${BASE}/status`);
    await mp.getByText("HUNTER RANK", { exact: true }).waitFor();
    await mp.waitForTimeout(800);
    const overflow = await mp.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    if (overflow > 2) throw new Error(`horizontal overflow of ${overflow}px on mobile`);
    await mp.screenshot({ path: `${OUT}/03-mobile-status.png`, fullPage: true });
    await m.close();
  });
} catch (e) {
  console.log("FAILED");
  console.error(e);
  await page.screenshot({ path: `${OUT}/failure.png`, fullPage: true }).catch(() => {});
  process.exitCode = 1;
}

if (errors.length) {
  console.log("\nBrowser errors:");
  for (const e of errors) console.log("  " + e);
  process.exitCode = 1;
}
await browser.close();
