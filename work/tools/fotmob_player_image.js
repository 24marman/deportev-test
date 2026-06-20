#!/usr/bin/env node

const path = require("path");
const {
  downloadFotmobPlayerImage,
  extractFotmobPlayerId,
  getFotmobImageCandidates,
} = require("../../src/lib/fotmob-player-images");

function getArg(name, fallback = "") {
  const index = process.argv.indexOf(`--${name}`);
  if (index === -1) return fallback;
  return process.argv[index + 1] || fallback;
}

function hasFlag(name) {
  return process.argv.includes(`--${name}`);
}

function printHelp() {
  console.log(`
FotMob Player Image

Usage:
  node work/tools/fotmob_player_image.js --player <fotmob-url-or-id> [--out-dir <dir>] [--out <file>]

Examples:
  npm run fotmob:player-image -- --player 422685
  npm run fotmob:player-image -- --player https://www.fotmob.com/en/players/422685/bruno-fernandes
  npm run fotmob:player-image -- --player https://www.fotmob.com/api/data/playerData?id=422685
`);
}

async function main() {
  if (hasFlag("help")) {
    printHelp();
    return;
  }

  const input = getArg("player") || getArg("id") || process.argv[2] || "";
  const outputDir = getArg("out-dir", path.join("outputs", "player-assets", "references", "fotmob"));
  const outputPath = getArg("out", "");
  const playerId = extractFotmobPlayerId(input);

  if (!playerId) {
    throw new Error("Provide a FotMob player URL or player id with --player.");
  }

  if (hasFlag("candidates")) {
    console.log(JSON.stringify({ playerId, candidates: getFotmobImageCandidates(playerId) }, null, 2));
    return;
  }

  const result = await downloadFotmobPlayerImage({
    input,
    outputDir,
    outputPath,
  });

  console.log(JSON.stringify(result, null, 2));
}

if (require.main === module) {
  main().catch((error) => {
    console.error(error.message);
    process.exit(1);
  });
}
