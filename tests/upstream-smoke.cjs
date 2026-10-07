const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const http = require("node:http");
const { execFileSync } = require("node:child_process");
const { chromium, firefox, webkit } = require("playwright-core");

const root = path.resolve(__dirname, "..");
const garden = process.env.DG_TEST_GARDEN;
if (!garden) throw new Error("Set DG_TEST_GARDEN to the existing upstream integration garden containing /reading-lab/.");
const ids = ["resizable-panes", "toc-settings", "reading-progress", "theme-toggle", "clean-print", "heading-folding"];
const includeNoteLock = process.env.DG_TEST_INCLUDE_NOTE_LOCK === "1";
if (includeNoteLock) ids.push("note-lock");
const manifests = {};
for (const id of ids) {
  const source = id === "note-lock" && process.env.DG_NOTE_LOCK_SOURCE || path.join(path.dirname(root), "garden-plugin-" + id);
  const target = path.join(garden, "src/plugins", id);
  const manifest = JSON.parse(fs.readFileSync(path.join(source, "garden-plugin.json")));
  manifests[id] = manifest;
  fs.mkdirSync(target, { recursive: true });
  fs.copyFileSync(path.join(source, "garden-plugin.json"), path.join(target, "garden-plugin.json"));
  const files = new Set([manifest.hooks, ...Object.values(manifest.slots || {}).flat(), ...(manifest.styles || []), ...(manifest.scripts || []), ...(manifest.assets || [])].filter(Boolean));
  for (const file of files) {
    fs.mkdirSync(path.dirname(path.join(target, file)), { recursive: true });
    fs.cpSync(path.join(source, file), path.join(target, file), { recursive: true });
  }
}
// Enable only the requested test set, leaving other installed test plugins disabled.
const plugins = {};
for (const entry of fs.readdirSync(path.join(garden, "src/plugins"), { withFileTypes: true })) {
  if (entry.isDirectory()) plugins[entry.name] = { enabled: ids.includes(entry.name) };
}
if (includeNoteLock) plugins["note-lock"].settings = { defaultPassword: "integration fixture only", notePasswords: "{}" };
fs.writeFileSync(path.join(garden, "src/plugins/plugins.json"), JSON.stringify({ plugins }, null, 2));
console.log("Upstream:", execFileSync("git", ["rev-parse", "HEAD"], { cwd: garden, encoding: "utf8" }).trim());
execFileSync("npm", ["run", "build"], { cwd: garden, env: { ...process.env, SITE_BASE_URL: "http://localhost", BASE_THEME: "dark" }, stdio: "inherit" });

const dist = path.join(garden, "dist");
const server = http.createServer((request, response) => {
  const url = new URL(request.url, "http://localhost");
  let file = path.resolve(dist, "." + decodeURIComponent(url.pathname));
  if (!path.extname(file)) file = path.join(file, "index.html");
  if (!file.startsWith(dist + path.sep) || !fs.existsSync(file)) { response.statusCode = 404; return response.end("Not found"); }
  let data = fs.readFileSync(file);
  if (file.endsWith(".html")) {
    const enabled = (url.searchParams.get("plugins") || ids.join(",")).split(",");
    data = data.toString().replace(/<(script|link)\b[^>]*(?:src|href)="\/plugins\/([^/]+)\/[^" ]+"[^>]*>(?:<\/script>)?/g, (tag, kind, id) => enabled.includes(id) ? tag : "");
  }
  response.setHeader("Content-Type", ({ ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".json": "application/json", ".svg": "image/svg+xml", ".png": "image/png" })[path.extname(file)] || "application/octet-stream");
  response.end(data);
});

async function progressMatchesGeometry(page) {
  await page.waitForFunction(() => {
    const rect = document.querySelector("main.content").getBoundingClientRect();
    const range = rect.height - innerHeight;
    const expected = Math.round((range <= 0 ? 1 : Math.max(0, Math.min(1, -rect.top / range))) * 100);
    return Number(document.querySelector(".dg-reading-progress").getAttribute("aria-valuenow")) === expected;
  });
}

async function smoke(browser, base, enabled, exercise) {
  const page = await browser.newPage({ viewport: { width: 1800, height: 1000 } });
  const errors = [];
  page.on("pageerror", error => errors.push(error.message));
  page.on("console", message => { if (message.type() === "error") errors.push(message.text()); });
  await page.addInitScript(() => {
    const original = document.createTreeWalker;
    window.readingTimeTraversals = 0;
    document.createTreeWalker = function (target, ...args) {
      if (target.matches && target.matches("main.content")) window.readingTimeTraversals++;
      return original.call(this, target, ...args);
    };
  });
  try {
    await page.goto(base + "/reading-lab/?plugins=" + enabled.join(","), { waitUntil: "networkidle" });
    await page.waitForFunction(() => window.readingTimeTraversals === 1 && document.querySelector(".dg-reading-meta span").textContent.includes("min read"));
    await page.evaluate(async () => {
      for (let i = 0; i < 10; i++) { dispatchEvent(new Event("scroll")); await new Promise(requestAnimationFrame); }
      scrollTo(0, document.documentElement.scrollHeight / 2);
    });
    await progressMatchesGeometry(page);
    assert.equal(await page.evaluate(() => window.readingTimeTraversals), 1);
    if (exercise && enabled.includes("heading-folding")) {
      const height = await page.locator("main.content").evaluate(el => el.getBoundingClientRect().height);
      await page.locator("h2 .dg-fold-button").first().click();
      assert((await page.locator("main.content").boundingBox()).height < height);
      await progressMatchesGeometry(page);
      await page.locator("h2 .dg-fold-button").first().click();
      await progressMatchesGeometry(page);
      assert.equal(await page.evaluate(() => window.readingTimeTraversals), 1);
    }
    if (exercise && enabled.includes("resizable-panes")) {
      const width = (await page.locator("main.content").boundingBox()).width;
      await page.locator("#dg-reading-width-control").click();
      await page.locator("#dg-reading-width").fill("480");
      assert((await page.locator("main.content").boundingBox()).width < width);
      await progressMatchesGeometry(page);
      await page.locator(".dg-rp-width-reset").click();
      await page.locator('.dg-rp-width-dialog button[type="submit"]').click();
      await progressMatchesGeometry(page);
      assert.equal(await page.evaluate(() => window.readingTimeTraversals), 1);
    }
    if (exercise) {
      const label = await page.locator(".dg-reading-meta span").textContent();
      await page.evaluate(() => {
        const paragraph = document.createElement("p"); paragraph.id = "dg-test-dynamic-text";
        paragraph.textContent = "Dynamic reading text ".repeat(2000);
        document.querySelector("main.content").appendChild(paragraph);
      });
      await page.waitForFunction(() => window.readingTimeTraversals === 2);
      assert.notEqual(await page.locator(".dg-reading-meta span").textContent(), label);
      await progressMatchesGeometry(page);
      await page.evaluate(() => { document.getElementById("dg-test-dynamic-text").firstChild.data = "Short replacement."; });
      await page.waitForFunction(() => window.readingTimeTraversals === 3);
      await page.evaluate(() => document.getElementById("dg-test-dynamic-text").remove());
      await page.waitForFunction(() => window.readingTimeTraversals === 4);
      assert.equal(await page.locator(".dg-reading-meta span").textContent(), label);
      await page.evaluate(() => {
        const image = document.createElement("img"); image.id = "dg-test-image"; image.alt = "";
        image.src = "data:image/svg+xml," + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20"><rect width="20" height="20" fill="black"/></svg>');
        image.style.cssText = "display:block;width:20px;height:20px";
        document.querySelector("main.content").appendChild(image);
      });
      await page.waitForFunction(() => window.readingTimeTraversals === 5);
      await page.evaluate(async () => { await document.getElementById("dg-test-image").decode(); document.getElementById("dg-test-image").style.height = "2000px"; scrollTo(0, document.documentElement.scrollHeight / 2); });
      await progressMatchesGeometry(page);
      assert.equal(await page.evaluate(() => window.readingTimeTraversals), 5, "Image loading/resizing does not recount words");
      for (const width of [1100, 390]) { await page.setViewportSize({ width, height: 844 }); await progressMatchesGeometry(page); }
      for (const id of enabled) for (const file of manifests[id].scripts || []) await page.addScriptTag({ url: base + "/plugins/" + id + "/" + file });
      assert.equal(await page.locator(".dg-reading-progress").count(), 1);
      assert.equal(await page.locator(".dg-reading-meta").count(), 1);
      assert.equal(await page.evaluate(() => window.readingTimeTraversals), 5);
      await page.goto(base + "/reading-lab/?plugins=" + enabled.join(","), { waitUntil: "networkidle" });
      await page.waitForFunction(() => window.readingTimeTraversals === 1);
      assert.equal(await page.locator(".dg-reading-progress").count(), 1);
    }
    if (enabled.includes("note-lock")) {
      await page.goto(base + "/locked-demonstration/?plugins=" + enabled.join(","), { waitUntil: "networkidle" });
      assert.equal(await page.locator('.dg-note-lock').isVisible(), true);
      await page.locator('#dg-note-lock-password').fill('integration fixture only');
      await page.locator('.dg-note-lock-submit').click();
      await page.waitForFunction(() => !document.documentElement.classList.contains('dg-note-locked'));
      await page.waitForFunction(() => window.readingTimeTraversals === 1);
      await progressMatchesGeometry(page);
      assert.equal(await page.locator('.dg-reading-progress').count(), 1);
    }
    assert.deepEqual(errors, []);
    console.log("PASS", enabled.join(" + "));
  } finally { await page.close(); }
}

(async () => {
  const executablePath = process.env.CHROME_PATH;
  if (!executablePath) throw new Error("Set CHROME_PATH to the installed Chrome/Edge executable.");
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  const base = "http://127.0.0.1:" + server.address().port;
  try {
    const browser = await chromium.launch({ executablePath, headless: true });
    try {
      for (const enabled of [["reading-progress"], ["reading-progress", "heading-folding"], ["reading-progress", "resizable-panes"], ids]) await smoke(browser, base, enabled, true);
    } finally { await browser.close(); }
    for (const [name, engine] of Object.entries({ Firefox: firefox, WebKit: webkit })) {
      if (!fs.existsSync(engine.executablePath())) { console.log("UNAVAILABLE", name, "(no existing Playwright browser binary; no installation attempted)"); continue; }
      const browser = await engine.launch({ headless: true });
      try { await smoke(browser, base, ids, false); console.log("PASS", name, includeNoteLock ? "all-seven smoke" : "all-six smoke"); }
      finally { await browser.close(); }
    }
  } finally { await new Promise(resolve => server.close(resolve)); }
})().catch(error => { console.error(error); process.exitCode = 1; });
