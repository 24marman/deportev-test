#!/usr/bin/env node

require("dotenv").config();

const { loadMonitorState, saveMonitorState } = require("../../src/lib/monitor-state");
const { fetchEventsThroughMatchday } = require("../../src/top-scorers/top-scorers-data");
const { prepareTopScorersMatchday } = require("../../src/top-scorers/top-scorers-prep");

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
Top Scorers Prep

Usage:
  node work/tools/top_scorers_prep.js --matchday 2 [--dry-run] [--force] [--generate]

Examples:
  npm run top-scorers:prep -- --matchday 2 --dry-run --force
  TOP_SCORERS_PORTRAIT_GENERATION_ENABLED=false npm run top-scorers:prep -- --matchday 2 --force

Notes:
  --dry-run only computes candidates; it does not download or generate portraits.
  Higgsfield generation is enabled by default. Set TOP_SCORERS_PORTRAIT_GENERATION_ENABLED=false for reference-only runs.
`);
}

async function main() {
  if (hasFlag("help")) {
    printHelp();
    return;
  }

  if (hasFlag("generate")) {
    process.env.TOP_SCORERS_PORTRAIT_GENERATION_ENABLED = "true";
  }

  const matchday = getArg("matchday", "2");
  const dryRun = hasFlag("dry-run");
  const force = hasFlag("force");
  const limit = Number(getArg("limit", process.env.TOP_SCORERS_PREP_CANDIDATE_LIMIT || "8"));
  const state = await loadMonitorState();
  const events = await fetchEventsThroughMatchday(matchday);
  const nextState = await prepareTopScorersMatchday(state, matchday, {
    events,
    dryRun,
    force,
    limit,
  });

  if (!dryRun) {
    await saveMonitorState(nextState);
  }

  const record = nextState.topScorersPrep?.[String(matchday)] || {};
  const candidates = Object.values(record.candidates || {});
  console.log(
    JSON.stringify(
      {
        matchday: String(matchday),
        dryRun,
        generationEnabled: record.generationEnabled,
        candidateCount: record.candidateCount || 0,
        statuses: candidates.reduce((acc, candidate) => {
          acc[candidate.status] = (acc[candidate.status] || 0) + 1;
          return acc;
        }, {}),
        candidates: candidates.map((candidate) => ({
          playerKey: candidate.playerKey,
          name: candidate.player?.fullName || candidate.player?.name,
          country: candidate.player?.country,
          goals: candidate.goals,
          status: candidate.status,
        })),
      },
      null,
      2,
    ),
  );
}

if (require.main === module) {
  main().catch((error) => {
    console.error(error.message);
    process.exit(1);
  });
}
