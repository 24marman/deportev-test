require("dotenv").config();

const path = require("path");
const { server } = require("./server");
const { renderMatchCard } = require("./render-match-card");
const { uploadGeneratedImage } = require("./lib/storage");
const bsd = require("../work/tools/bsd_match_adapter");

const generatedDir = path.join("outputs", "generated");

function slug(value) {
  return String(value || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function getOutputName(matchData) {
  const date = new Date(matchData.source?.fetchedAt || Date.now()).toISOString().slice(0, 10);
  const group = matchData.competition?.groupLetter ? `group-${matchData.competition.groupLetter.toLowerCase()}` : "group";
  const home = slug(matchData.teams?.home?.name || "home");
  const away = slug(matchData.teams?.away?.name || "away");
  const score = `${matchData.teams?.home?.score ?? 0}-${matchData.teams?.away?.score ?? 0}`;

  return `${date}_${group}_${home}-${score}-${away}.webp`;
}

async function renderEvent(eventId) {
  console.log(`Fetching BSD event ${eventId}`);
  const matchData = await bsd.fetchMatchData(eventId);
  const outputName = getOutputName(matchData);
  const outputPath = path.join(generatedDir, outputName);

  console.log(`Rendering ${outputPath}`);
  await renderMatchCard({
    data: matchData,
    outputPath,
    quality: Number(process.env.RENDER_QUALITY || "88"),
  });

  const uploadResult = await uploadGeneratedImage(outputPath, outputName);
  console.log(
    uploadResult.uploaded
      ? `Uploaded ${uploadResult.publicUrl}`
      : `Skipped upload: ${uploadResult.reason}`,
  );

  return {
    matchData,
    outputPath,
    uploadResult,
  };
}

async function runStartupJob() {
  const eventId = process.env.RUN_ON_START_EVENT_ID;
  if (!eventId) return;

  try {
    await renderEvent(eventId);
  } catch (error) {
    console.error(`Startup render failed: ${error.message}`);
  }
}

async function runMonitorLoop() {
  if (process.env.MONITOR_ENABLED !== "true") {
    console.log("Monitor disabled. Set MONITOR_ENABLED=true in Railway when ready.");
    return;
  }

  console.log("Monitor loop placeholder is active. Next step: persist schedule/state in Supabase.");
}

runStartupJob()
  .then(runMonitorLoop)
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
    server.close();
  });
