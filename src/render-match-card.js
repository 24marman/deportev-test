#!/usr/bin/env node

const fs = require("fs");
const path = require("path");
const { pathToFileURL } = require("url");
const { chromium } = require("playwright");
const sharp = require("sharp");

const DEFAULT_TEMPLATE_DIR = path.join("work", "templates", "figma_match_card");
const DEFAULT_OUTPUT = path.join("outputs", "generated", "match-card.webp");
const CARD_SIZE = { width: 1080, height: 1350 };
const STABLE_DELAY_MS = Number(process.env.RENDER_STABLE_DELAY_MS || "75");
const WEBP_EFFORT = Number(process.env.RENDER_WEBP_EFFORT || "2");
let browserPromise = null;

function getArg(name, fallback) {
  const index = process.argv.indexOf(`--${name}`);
  if (index === -1) return fallback;
  return process.argv[index + 1] || fallback;
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function ensureDirectory(filePath) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
}

async function getBrowser() {
  if (!browserPromise) {
    browserPromise = chromium.launch({
      args: ["--no-sandbox", "--disable-setuid-sandbox"],
    });
  }

  const browser = await browserPromise;
  if (browser.isConnected()) return browser;

  browserPromise = null;
  return getBrowser();
}

async function waitForRenderer(page) {
  await page.waitForFunction(() => Boolean(window.renderMatchCard), null, { timeout: 10000 });
}

async function waitForStableCard(page) {
  const brokenImages = await page.evaluate(async () => {
    if (document.fonts && document.fonts.ready) {
      await document.fonts.ready;
    }

    await Promise.all(
      Array.from(document.images).map((image) => {
        if (image.complete) return Promise.resolve();
        return new Promise((resolve) => {
          image.addEventListener("load", resolve, { once: true });
          image.addEventListener("error", resolve, { once: true });
        });
      }),
    );

    return Array.from(document.images)
      .filter((image) => image.naturalWidth === 0 || image.naturalHeight === 0)
      .map((image) => image.currentSrc || image.src || image.getAttribute("src") || "(missing src)");
  });

  if (brokenImages.length > 0) {
    throw new Error(`Render blocked because images failed to load: ${brokenImages.join(", ")}`);
  }

  if (STABLE_DELAY_MS > 0) {
    await page.waitForTimeout(STABLE_DELAY_MS);
  }
}

async function renderMatchCard({ data, templateDir = DEFAULT_TEMPLATE_DIR, outputPath = DEFAULT_OUTPUT, quality = 88 }) {
  const absoluteTemplateDir = path.resolve(templateDir);
  const absoluteOutputPath = path.resolve(outputPath);
  const indexUrl = pathToFileURL(path.join(absoluteTemplateDir, "index.html")).href;

  ensureDirectory(absoluteOutputPath);

  const browser = await getBrowser();
  const page = await browser.newPage({
    viewport: CARD_SIZE,
    deviceScaleFactor: 1,
  });

  try {
    await page.goto(indexUrl, { waitUntil: "domcontentloaded" });
    await waitForRenderer(page);

    if (data) {
      await page.evaluate((matchData) => {
        window.renderMatchCard(matchData);
      }, data);
    }

    await waitForStableCard(page);

    const card = page.locator("#match-card");
    const pngBuffer = await card.screenshot({
      type: "png",
      omitBackground: false,
    });

    await sharp(pngBuffer)
      .rotate()
      .webp({
        quality,
        effort: WEBP_EFFORT,
      })
      .toFile(absoluteOutputPath);

    return absoluteOutputPath;
  } finally {
    await page.close().catch(() => {});
  }
}

async function closeRenderBrowser() {
  if (!browserPromise) return;

  const browser = await browserPromise.catch(() => null);
  browserPromise = null;

  if (browser?.isConnected()) {
    await browser.close();
  }
}

async function main() {
  const dataPath = getArg("data", path.join(DEFAULT_TEMPLATE_DIR, "data", "current-match.json"));
  const outputPath = getArg("out", DEFAULT_OUTPUT);
  const templateDir = getArg("template", DEFAULT_TEMPLATE_DIR);
  const quality = Number(getArg("quality", process.env.RENDER_QUALITY || "88"));
  const data = fs.existsSync(dataPath) ? readJson(dataPath) : null;
  try {
    const renderedPath = await renderMatchCard({ data, templateDir, outputPath, quality });
    console.log(`Rendered ${renderedPath}`);
  } finally {
    await closeRenderBrowser();
  }
}

if (require.main === module) {
  main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}

module.exports = {
  closeRenderBrowser,
  renderMatchCard,
};
