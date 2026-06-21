const path = require("path");
const { uploadGeneratedImage } = require("../lib/storage");
const { publishTopScorersPost } = require("../social/x-publisher");
const { renderTopScorersCard } = require("./render-top-scorers");
const { hasMatchdayStarted, prepareTopScorersMatchday } = require("./top-scorers-prep");
const {
  MATCHDAYS_WITH_TOP_SCORERS,
  buildTopScorers,
  fetchEventsThroughMatchday,
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

  const events = contextEvents || (await fetchEventsThroughMatchday(matchday));

  if (!isMatchdayComplete(matchday, events)) {
    return state;
  }

  console.log(`Top scorers matchday ${matchday} is complete. Rendering leaderboard.`);

  const data = await buildTopScorers(matchday, {
    events,
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
  const xPost = await publishTopScorersPost({
    matchday,
    imagePath: outputPath,
    leaders: data.leaders,
  }).catch((error) => ({
    published: false,
    reason: error.message,
  }));

  state.topScorers = {
    ...(state.topScorers || {}),
    [key]: {
      processedAt: new Date().toISOString(),
      outputPath,
      dataPath,
      publicUrl: uploadResult.publicUrl || null,
      uploaded: Boolean(uploadResult.uploaded),
      uploadReason: uploadResult.reason || null,
      xPublished: Boolean(xPost.published),
      xPost,
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
    const key = String(matchday);
    if (nextState.topScorers?.[key]?.processedAt) continue;
    if (!hasMatchdayStarted(matchday)) continue;

    const events = await fetchEventsThroughMatchday(matchday);
    nextState = await prepareTopScorersMatchday(nextState, matchday, { events });
    nextState = await processTopScorersMatchday(matchday, nextState, events);
  }

  return nextState;
}

module.exports = {
  maybeProcessTopScorers,
};
