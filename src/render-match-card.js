#!/usr/bin/env node

const fs = require("fs");
const path = require("path");
const { pathToFileURL } = require("url");
const { chromium } = require("playwright");
const sharp = require("sharp");

const DEFAULT_TEMPLATE_DIR = path.join("work", "templates", "figma_match_card");
const DEFAULT_OUTPUT = path.join("outputs", "generated", "match-card.webp");
const CARD_SIZE = { width: 1080, height: 1350 };

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

async function waitForStableCard(page) {
  await page.waitForFunction(() => Boolean(window.renderMatchCard), null, { timeout: 10000 });
  await page.evaluate(async () => {
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
  });
  await page.waitForTimeout(250);
}

async function renderMatchCard({ data, templateDir = DEFAULT_TEMPLATE_DIR, outputPath = DEFAULT_OUTPUT, quality = 88 }) {
  const absoluteTemplateDir = path.resolve(templateDir);
  const absoluteOutputPath = path.resolve(outputPath);
  const indexUrl = pathToFileURL(path.join(absoluteTemplateDir, "index.html")).href;

  ensureDirectory(absoluteOutputPath);

  const browser = await chromium.launch({
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
  });

  try {
    const page = await browser.newPage({
      viewport: CARD_SIZE,
      deviceScaleFactor: 1,
    });

    await page.goto(indexUrl, { waitUntil: "load" });
    await waitForStableCard(page);

    if (data) {
      await page.evaluate((matchData) => {
        window.renderMatchCard(matchData);
      }, data);
      await waitForStableCard(page);
    }

    const card = page.locator("#match-card");
    const pngBuffer = await card.screenshot({ type: "png" });

    await sharp(pngBuffer)
      .webp({
        quality,
        effort: 5,
      })
      .toFile(absoluteOutputPath);

    return absoluteOutputPath;
  } finally {
    await browser.close();
  }
}

async function main() {
  const dataPath = getArg("data", path.join(DEFAULT_TEMPLATE_DIR, "data", "current-match.json"));
  const outputPath = getArg("out", DEFAULT_OUTPUT);
  const templateDir = getArg("template", DEFAULT_TEMPLATE_DIR);
  const quality = Number(getArg("quality", process.env.RENDER_QUALITY || "88"));
  const data = fs.existsSync(dataPath) ? readJson(dataPath) : null;
  const renderedPath = await renderMatchCard({ data, templateDir, outputPath, quality });

  console.log(`Rendered ${renderedPath}`);
}

if (require.main === module) {
  main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}

module.exports = {
  renderMatchCard,
};
