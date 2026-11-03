// Navigation e2e: every top-nav item, from every public page, desktop and mobile, plus back/forward.
//   BASE_URL=https://redline-app-production-b0e6.up.railway.app npm run e2e:nav
// Needs a Chromium: set CHROMIUM_PATH, or let playwright-core find one installed by `npx playwright install chromium`.
import { chromium } from "playwright-core";

const BASE = (process.env.BASE_URL ?? "http://localhost:5173").replace(/\/$/, "");
const DISCLOSURE = process.env.DISCLOSURE_ID ?? "rl-6f0812c1a1a5";
const RESEARCHER = process.env.RESEARCHER ?? "p2pmerch";

const START_PAGES = process.env.NAV_START ? process.env.NAV_START.split(",") : ["/", "/disclosures", `/disclosures/${DISCLOSURE}`, "/leaderboard", `/researchers/${RESEARCHER}`, "/no-such-page"];
const SECTIONS = [["How it works", "how-it-works"], ["Pipeline", "pipeline"], ["Security", "security"], ["FAQ", "faq"]];
const PAGES = [["Disclosures", "/disclosures", "Public disclosures"], ["Leaderboard", "/leaderboard", "Researcher leaderboard"]];
const ALL_VIEWPORTS = { desktop: { width: 1280, height: 800 }, mobile: { width: 390, height: 800 } };
const VIEWPORTS = Object.fromEntries(Object.entries(ALL_VIEWPORTS).filter(([k]) => !process.env.NAV_VIEWPORT || process.env.NAV_VIEWPORT === k));

let failures = 0;
let checks = 0;
const fail = (msg) => { failures++; console.error(`  FAIL ${msg}`); };
const ok = (cond, msg) => { checks++; if (!cond) fail(msg); };

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined, args: ["--no-sandbox"] });

/** Which page is showing, judged by content (not the URL, which is the thing that was wrong). */
const pageKind = (page) => page.evaluate(() => {
  const h1 = document.querySelector("main h1")?.textContent?.trim() ?? "";
  if (document.getElementById("how-it-works")) return "landing";
  if (/Public disclosures/.test(h1)) return "disclosures";
  if (/Researcher leaderboard/.test(h1)) return "leaderboard";
  return h1 ? `other:${h1}` : "unknown";
});

const waitFor = async (page, fn, arg, timeout = 8000) => {
  try { await page.waitForFunction(fn, arg, { timeout }); return true; } catch { return false; }
};

const inView = (id) => `(() => { const r = document.getElementById(${JSON.stringify(id)})?.getBoundingClientRect(); return !!r && r.top < window.innerHeight * 0.6 && r.bottom > 0; })()`;

async function navItem(page, label, mobile) {
  if (mobile) {
    await page.getByRole("button", { name: "Open menu" }).click();
    return page.locator('nav[aria-label="Mobile"]').getByRole("link", { name: label, exact: true });
  }
  return page.locator('nav[aria-label="Primary"]').getByRole("link", { name: label, exact: true });
}

for (const [vpName, viewport] of Object.entries(VIEWPORTS)) {
  const mobile = vpName === "mobile";
  const context = await browser.newContext({ viewport });
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));

  for (const start of START_PAGES) {
    const where = `[${vpName}] from ${start}`;
    const reset = async () => { await page.goto(BASE + start, { waitUntil: "domcontentloaded" }); await page.locator("header").first().waitFor(); };
    console.log(where);

    for (const [label, id] of SECTIONS) {
      await reset();
      await (await navItem(page, label, mobile)).click();
      ok(await waitFor(page, `document.getElementById(${JSON.stringify(id)}) && ${inView(id)}`), `${where}: "${label}" did not show #${id}`);
      ok(new URL(page.url()).pathname === "/" && new URL(page.url()).hash === `#${id}`, `${where}: "${label}" URL is ${page.url()}`);
      ok((await pageKind(page)) === "landing", `${where}: "${label}" did not land on the home page`);
    }

    for (const [label, path, heading] of PAGES) {
      await reset();
      await (await navItem(page, label, mobile)).click();
      ok(await waitFor(page, (h) => document.querySelector("main h1")?.textContent?.includes(h), heading), `${where}: "${label}" did not render "${heading}"`);
      ok(new URL(page.url()).pathname === path, `${where}: "${label}" URL is ${page.url()}`);
    }

    // The logo goes home, at the top of the page.
    await reset();
    await page.getByRole("link", { name: "Redline home" }).first().click();
    ok(await waitFor(page, `!!document.getElementById("how-it-works")`), `${where}: logo did not show the home page`);
    ok(new URL(page.url()).pathname === "/", `${where}: logo URL is ${page.url()}`);
  }

  // Footer anchors work from other routes as well.
  for (const [label, id] of [["How it works", "how-it-works"], ["Security", "security"]]) {
    await page.goto(`${BASE}/leaderboard`, { waitUntil: "domcontentloaded" });
    await page.locator('nav[aria-label="Footer"]').getByRole("link", { name: label }).click();
    ok(await waitFor(page, `document.getElementById(${JSON.stringify(id)}) && ${inView(id)}`), `[${vpName}] footer "${label}" from /leaderboard did not show #${id}`);
  }

  // A deep link with a hash scrolls on first load.
  await page.goto(`${BASE}/#faq`, { waitUntil: "domcontentloaded" });
  ok(await waitFor(page, `document.getElementById("faq") && ${inView("faq")}`), `[${vpName}] direct load of /#faq did not scroll to it`);

  // Back / forward walk through real pages, not just URLs.
  console.log(`[${vpName}] back/forward`);
  await page.goto(BASE + "/", { waitUntil: "domcontentloaded" });
  await page.locator("header").first().waitFor();
  const hop = async (label) => { await (await navItem(page, label, mobile)).click(); };
  await hop("Leaderboard");
  ok(await waitFor(page, () => document.querySelector("main h1")?.textContent?.includes("leaderboard")), `[${vpName}] home -> leaderboard`);
  await hop("Disclosures");
  ok(await waitFor(page, () => document.querySelector("main h1")?.textContent?.includes("Public disclosures")), `[${vpName}] leaderboard -> disclosures`);
  await hop("How it works");
  ok(await waitFor(page, `!!document.getElementById("how-it-works")`), `[${vpName}] disclosures -> how it works`);
  await page.goBack();
  ok(await waitFor(page, () => document.querySelector("main h1")?.textContent?.includes("Public disclosures")), `[${vpName}] back -> disclosures (kind: ${await pageKind(page)}, url ${page.url()})`);
  await page.goBack();
  ok(await waitFor(page, () => document.querySelector("main h1")?.textContent?.includes("leaderboard")), `[${vpName}] back -> leaderboard`);
  await page.goBack();
  ok(await waitFor(page, `!!document.getElementById("how-it-works")`), `[${vpName}] back -> home`);
  await page.goForward();
  ok(await waitFor(page, () => document.querySelector("main h1")?.textContent?.includes("leaderboard")), `[${vpName}] forward -> leaderboard`);
  await page.goForward();
  ok(await waitFor(page, () => document.querySelector("main h1")?.textContent?.includes("Public disclosures")), `[${vpName}] forward -> disclosures`);

  // Leaderboard row -> profile -> back.
  await hop("Leaderboard");
  await page.locator(`a[href="/researchers/${RESEARCHER}"]`).first().click();
  ok(await waitFor(page, (h) => document.querySelector("main h1")?.textContent?.trim() === h, RESEARCHER), `[${vpName}] leaderboard row did not open the profile`);
  await page.goBack();
  ok(await waitFor(page, () => document.querySelector("main h1")?.textContent?.includes("leaderboard")), `[${vpName}] profile -> back -> leaderboard`);

  ok(errors.length === 0, `[${vpName}] uncaught page errors: ${errors.join(" | ")}`);
  await context.close();
}

await browser.close();
console.log(`${checks} checks, ${failures} failed against ${BASE}`);
process.exit(failures ? 1 : 0);
