const path = require("path");
const { uploadGeneratedImage } = require("../lib/storage");
const { renderTopScorersCard } = require("./render-top-scorers");
const {
  MATCHDAYS_WITH_TOP_SCORERS,
  buildTopScorers,
  isMatchdayComplete,
  writeTopScorersData,
} = require("./top-scorers-data");

function isTopScorersEnabled() {
  return process.env.TOP_SCORERS_ENABLED !== "false";
}

function getTopScorersOutputName(matchday) {
  return `top-scorers/jornada-${matchday}.webp`;
}

async function processTopScorersMatchday(matchday, state, contextEvents) {
  const key = String(matchday);
  const record = state.topScorers?.[key] || {};

  if (record.processedAt) {
    return state;
  }

  if (!isMatchdayComplete(matchday, contextEvents)) {
    return state;
  }

  console.log(`Top scorers matchday ${matchday} is complete. Rendering leaderboard.`);

  const data = await buildTopScorers(matchday, {
    events: contextEvents,
  });
  const outputPath = path.join("outputs", "generated", `top-scorers-jornada-${matchday}.webp`);
  const dataPath = path.join("outputs", "generated", `top-scorers-jornada-${matchday}.json`);

  writeTopScorersData(dataPath, data);

  await renderTopScorersCard({
    data,
    outputPath,
    quality: Number(process.env.RENDER_QUALITY || "82"),
  });

  const uploadResult = await uploadGeneratedImage(outputPath, getTopScorersOutputName(matchday));

  state.topScorers = {
    ...(state.topScorers || {}),
    [key]: {
      processedAt: new Date().toISOString(),
      outputPath,
      dataPath,
      publicUrl: uploadResult.publicUrl || null,
      uploaded: Boolean(uploadResult.uploaded),
      uploadReason: uploadResult.reason || null,
      leaderCount: data.leaders.length,
    },
  };

  console.log(
    uploadResult.uploaded
      ? `Uploaded top scorers matchday ${matchday}: ${uploadResult.publicUrl}`
      : `Top scorers matchday ${matchday} upload skipped: ${uploadResult.reason}`,
  );

  return state;
}

async function maybeProcessTopScorers(state, contextEvents) {
  if (!isTopScorersEnabled()) return state;

  let nextState = state;
  for (const matchday of MATCHDAYS_WITH_TOP_SCORERS) {
    nextState = await processTopScorersMatchday(matchday, nextState, contextEvents);
  }

  return nextState;
}

module.exports = {
  maybeProcessTopScorers,
};
