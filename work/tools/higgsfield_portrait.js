#!/usr/bin/env node

require("dotenv").config();

const fs = require("fs");
const path = require("path");
const {
  TOP_SCORER_HIGGSFIELD_PRESET_VERSION,
  buildTopScorerHiggsfieldPrompt,
} = require("../../src/lib/higgsfield-portrait-preset");
const { generateHiggsfieldPortrait } = require("../../src/lib/higgsfield-portrait-generator");
const { slug } = require("../../src/lib/portrait-ai-pipeline");

function getArg(name, fallback = "") {
  const index = process.argv.indexOf(`--${name}`);
  if (index === -1) return fallback;
  return process.argv[index + 1] || fallback;
}

function hasFlag(name) {
  return process.argv.includes(`--${name}`);
}

function writeJson(filePath, payload) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(payload, null, 2)}\n`);
}

function printHelp() {
  console.log(`
Higgsfield Portrait

Usage:
  node work/tools/higgsfield_portrait.js --input <reference-image> --player-key <key> [--out-dir <dir>] [--dry-run]

Examples:
  npm run portrait:higgsfield -- --input ./reference.jpg --player-key bsd-422685
  npm run portrait:higgsfield -- --input /Users/24marman/Downloads/player.photo.png --player-key style-test --dry-run
`);
}

async function main() {
  if (hasFlag("help")) {
    printHelp();
    return;
  }

  const inputPath = getArg("input");
  const playerKey = slug(getArg("player-key", "player"));
  const direction = getArg("direction", "left");
  const outDir = getArg("out-dir", path.join("outputs", "player-assets", "portraits", playerKey));
  const outputPath = getArg("out", path.join(outDir, "approved-hero.webp"));
  const rawOutputPath = getArg("raw-out", path.join(outDir, "higgsfield-source.png"));
  const manifestPath = path.join(outDir, "manifest.json");
  const promptPath = path.join(outDir, "higgsfield-prompt.txt");
  const prompt = buildTopScorerHiggsfieldPrompt({ direction });

  if (!inputPath) {
    throw new Error("--input is required.");
  }

  if (!fs.existsSync(inputPath)) {
    throw new Error(`Input image not found: ${inputPath}`);
  }

  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(promptPath, `${prompt}\n`);

  if (hasFlag("dry-run")) {
    const manifest = {
      playerKey,
      status: "dry-run",
      provider: "higgsfield",
      processingVersion: TOP_SCORER_HIGGSFIELD_PRESET_VERSION,
      inputPath,
      outputPath,
      rawOutputPath,
      prompt,
      updatedAt: new Date().toISOString(),
    };
    writeJson(manifestPath, manifest);
    console.log(`Prompt: ${promptPath}`);
    console.log(`Manifest: ${manifestPath}`);
    console.log("Dry run only: no Higgsfield generation was submitted.");
    return;
  }

  const result = await generateHiggsfieldPortrait({
    inputPath,
    outputPath,
    rawOutputPath,
    prompt,
    direction,
  });
  const manifest = {
    playerKey,
    status: "candidate",
    provider: "higgsfield",
    processingVersion: TOP_SCORER_HIGGSFIELD_PRESET_VERSION,
    ...result,
    updatedAt: new Date().toISOString(),
  };
  writeJson(manifestPath, manifest);

  console.log(`Portrait: ${outputPath}`);
  console.log(`Raw Higgsfield image: ${rawOutputPath}`);
  console.log(`Prompt: ${promptPath}`);
  console.log(`Manifest: ${manifestPath}`);
}

if (require.main === module) {
  main().catch((error) => {
    console.error(error.message);
    process.exit(1);
  });
}
