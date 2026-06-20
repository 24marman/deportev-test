#!/usr/bin/env node

const path = require("path");
const {
  downloadGuardianPlayerImage,
  findGuardianPlayer,
} = require("../../src/lib/guardian-player-guide");

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
Guardian Player Guide Image

Usage:
  node work/tools/guardian_player_image.js --player <name> [--team <country>] [--out-dir <dir>] [--out <file>]

Examples:
  npm run guardian:player-image -- --player "Bruno Fernandes" --team Portugal
  npm run guardian:player-image -- --player "Lionel Messi" --team Argentina --metadata
`);
}

async function main() {
  if (hasFlag("help")) {
    printHelp();
    return;
  }

  const playerName = getArg("player") || getArg("name") || "";
  const teamName = getArg("team") || "";
  const outputDir = getArg("out-dir", path.join("outputs", "player-assets", "references", "guardian"));
  const outputPath = getArg("out", "");

  if (!playerName) {
    throw new Error("Provide a player name with --player.");
  }

  if (hasFlag("metadata")) {
    const result = await findGuardianPlayer({ playerName, teamName });
    console.log(JSON.stringify(result, null, 2));
    return;
  }

  const result = await downloadGuardianPlayerImage({
    playerName,
    teamName,
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
