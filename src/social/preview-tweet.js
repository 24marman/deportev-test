#!/usr/bin/env node

const fs = require("fs");
const { buildFinalScoreCaption } = require("./x-publisher");

const dataPath = process.argv[2] || "work/templates/figma_match_card/data/current-match.json";
const matchData = JSON.parse(fs.readFileSync(dataPath, "utf8"));

console.log(buildFinalScoreCaption(matchData));
