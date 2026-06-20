#!/usr/bin/env node

const fs = require("fs");
const path = require("path");
const { closeRenderBrowser, renderMatchCard } = require("../render-match-card");
const { buildTopScorers, writeTopScorersData } = require("./top-scorers-data");

const DEFAULT_TEMPLATE_DIR = path.join("work", "templates", "figma_top_scorers");
const DEFAULT_OUTPUT = path.join("outputs", "generated", "top-scorers.webp");

function getArg(name, fallback) {
  const index = process.argv.indexOf(`--${name}`);
  if (index === -1) return fallback;
  return process.argv[index + 1] || fallback;
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

async function renderTopScorersCard({
  data,
  dataPath,
  matchday,
  templateDir = DEFAULT_TEMPLATE_DIR,
  outputPath = DEFAULT_OUTPUT,
  quality = 88,
  skipPortraitLookup = false,
} = {}) {
  let cardData = data;

  if (!cardData && dataPath && fs.existsSync(dataPath)) {
    cardData = readJson(dataPath);
  }

  if (!cardData) {
    cardData = await buildTopScorers(matchday || 2, { skipPortraitLookup });
  }

  return renderMatchCard({
    data: cardData,
    templateDir,
    outputPath,
    quality,
  });
}

async function main() {
  const matchday = Number(getArg("matchday", "2"));
  const dataPath = getArg("data", "");
  const outputPath = getArg("out", DEFAULT_OUTPUT);
  const templateDir = getArg("template", DEFAULT_TEMPLATE_DIR);
  const quality = Number(getArg("quality", process.env.RENDER_QUALITY || "88"));
  const writeDataPath = getArg("write-data", "");
  const skipPortraitLookup = process.argv.includes("--skip-portrait-lookup");
  const data = dataPath ? readJson(dataPath) : await buildTopScorers(matchday, { skipPortraitLookup });

  if (writeDataPath) {
    writeTopScorersData(writeDataPath, data);
  }

  try {
    const renderedPath = await renderTopScorersCard({
      data,
      templateDir,
      outputPath,
      quality,
      skipPortraitLookup,
    });
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
  renderTopScorersCard,
};
