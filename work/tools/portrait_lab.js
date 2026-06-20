#!/usr/bin/env node

require("dotenv").config();

const fs = require("fs");
const path = require("path");
const {
  buildPortraitManifest,
  buildPortraitPrompt,
  callOpenAIImageEdit,
  preserveInputPortrait,
  removeChromaAndApplyGrunge,
  slug,
} = require("../../src/lib/portrait-ai-pipeline");

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
Portrait Lab

Usage:
  node work/tools/portrait_lab.js --input <reference-image> --player-key <key> [--mode prompt|generate|finalize|preserve|all]

Examples:
  npm run portrait:prompt -- --input ./messi-reference.png --player-key bsd-123
  npm run portrait:preserve -- --input ./messi-reference.png --player-key bsd-123
  npm run portrait:ai -- --input ./messi-reference.png --player-key bsd-123
  npm run portrait:finalize -- --generated ./generated-source.png --player-key bsd-123

Modes:
  prompt    Writes the exact AI prompt and manifest draft.
  generate  Calls OpenAI Images API and writes generated-source.png. Requires OPENAI_API_KEY.
  finalize  Converts a generated chroma-key image into approved-hero.webp.
  preserve  Preserves the input pixels, applies close-up crop, grunge and alpha/green outputs.
  all       prompt + generate + finalize.
`);
}

async function main() {
  if (hasFlag("help")) {
    printHelp();
    return;
  }

  const inputPath = getArg("input");
  const generatedArg = getArg("generated");
  const rawKey = getArg("player-key", generatedArg ? path.basename(generatedArg, path.extname(generatedArg)) : "player");
  const playerKey = slug(rawKey || "player");
  const mode = getArg("mode", generatedArg ? "finalize" : "prompt");
  const subject = getArg("subject", "footballer");
  const direction = getArg("direction", "left");
  const focus = getArg("focus", "right");
  const profile = getArg("profile", "right-profile");
  const outDir = getArg("out-dir", path.join("outputs", "player-assets", "portraits", playerKey));
  const promptPath = path.join(outDir, "portrait-prompt.txt");
  const generatedPath = generatedArg || path.join(outDir, "generated-source.png");
  const preservedGreenPath = path.join(outDir, "preserved-source-green.png");
  const outputPath = getArg("out", path.join(outDir, "approved-hero.webp"));
  const manifestPath = path.join(outDir, "manifest.json");
  const prompt = buildPortraitPrompt({
    subject,
    direction,
    preserveIdentity: true,
  });

  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(promptPath, `${prompt}\n`);

  const shouldGenerate = mode === "generate" || mode === "all";
  const shouldFinalize = mode === "finalize" || mode === "all";
  const shouldPreserve = mode === "preserve";

  if ((mode === "prompt" || shouldGenerate || shouldPreserve || shouldFinalize) && inputPath && !fs.existsSync(inputPath)) {
    throw new Error(`Input image not found: ${inputPath}`);
  }

  let finalGeneratedPath = generatedPath;
  if (shouldPreserve) {
    if (!inputPath) throw new Error("--input is required for preserve mode.");
    console.log(`Preserving input portrait identity from ${inputPath}`);
    await preserveInputPortrait({
      inputPath,
      outputPath,
      greenSourcePath: preservedGreenPath,
      focus,
      profile,
    });
    finalGeneratedPath = preservedGreenPath;
    console.log(`Preserved ${outputPath}`);
    console.log(`Green source ${preservedGreenPath}`);
  }

  if (shouldGenerate) {
    if (!inputPath) throw new Error("--input is required for generate/all mode.");
    console.log(`Generating AI portrait candidate from ${inputPath}`);
    finalGeneratedPath = await callOpenAIImageEdit({
      inputPath,
      outputPath: generatedPath,
      prompt,
    });
    console.log(`Generated ${finalGeneratedPath}`);
  }

  if (shouldFinalize) {
    if (!fs.existsSync(finalGeneratedPath)) {
      throw new Error(`Generated chroma-key image not found: ${finalGeneratedPath}`);
    }

    console.log(`Finalizing chroma-key portrait ${finalGeneratedPath}`);
    await removeChromaAndApplyGrunge({
      inputPath: finalGeneratedPath,
      outputPath,
    });
    console.log(`Finalized ${outputPath}`);
  }

  const manifest = buildPortraitManifest({
    inputPath,
    generatedPath: finalGeneratedPath,
    outputPath: shouldFinalize || shouldPreserve ? outputPath : null,
    prompt,
    playerKey,
    provider: shouldPreserve ? "deterministic-preserve" : "openai-images",
    status: shouldFinalize || shouldPreserve ? "candidate" : "pending-generation",
  });
  writeJson(manifestPath, manifest);

  console.log(`Prompt: ${promptPath}`);
  console.log(`Manifest: ${manifestPath}`);
  if (mode === "prompt" && !process.env.OPENAI_API_KEY) {
    console.log("OPENAI_API_KEY is not configured, so this run only prepared the prompt package.");
  }
}

if (require.main === module) {
  main().catch((error) => {
    console.error(error.message);
    process.exit(1);
  });
}
