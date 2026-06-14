require("dotenv").config();

const path = require("path");
const { server } = require("./server");
const { renderMatchCard } = require("./render-match-card");
const { uploadGeneratedImage } = require("./lib/storage");
const { loadMonitorState, saveMonitorState } = require("./lib/monitor-state");
const { findScheduledGroupStageMatch } = require("./lib/world-cup-group-stage-schedule");
const { publishFinalScorePost } = require("./social/x-publisher");
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

  let uploadResult;
  try {
    uploadResult = await uploadGeneratedImage(outputPath, outputName);
  } catch (error) {
    uploadResult = {
      uploaded: false,
      reason: error.message,
    };
  }

  console.log(
    uploadResult.uploaded
      ? `Uploaded ${uploadResult.publicUrl}`
      : `Skipped upload: ${uploadResult.reason}`,
  );

  const socialResult = await publishFinalScorePost({
    matchData,
    imagePath: outputPath,
  });
  console.log(
    socialResult.published
      ? `Published ${socialResult.tweetUrl}`
      : `X post not published: ${socialResult.reason}`,
  );

  return {
    matchData,
    outputPath,
    uploadResult,
    socialResult,
  };
}

async function runStartupJob() {
  if (process.env.RUN_ON_START !== "true") return;

  const eventId = process.env.RUN_ON_START_EVENT_ID;
  if (!eventId) return;

  try {
    await renderEvent(eventId);
  } catch (error) {
    console.error(`Startup render failed: ${error.message}`);
  }
}

function isGroupStageEvent(event) {
  const groupName = String(event.group_name || "");
  const roundName = String(event.round_name || "").toLowerCase();
  const knockoutTerms = ["round of", "quarter", "semi", "final", "third", "16", "32"];

  return Boolean(groupName) && !knockoutTerms.some((term) => roundName.includes(term));
}

function isSecondHalfStatus(status) {
  return ["2nd_half", "second_half", "inprogress"].includes(String(status || "").toLowerCase());
}

function isFinishedStatus(status) {
  return ["finished", "final"].includes(String(status || "").toLowerCase());
}

function minutesSince(isoDate) {
  if (!isoDate) return 0;
  return (Date.now() - new Date(isoDate).getTime()) / 60000;
}

function getMonitorIntervalMs() {
  const seconds = Number(process.env.MONITOR_POLL_SECONDS || "120");
  return Math.max(30, seconds) * 1000;
}

function getStrongMonitorDelayMinutes() {
  return Number(process.env.SECOND_HALF_STRONG_MONITOR_MINUTES || "40");
}

async function processFinishedEvent(event, state) {
  const eventId = String(event.id);
  const record = state.matches[eventId] || {};

  if (record.processedAt) {
    console.log(`Skipping BSD event ${eventId}; already processed at ${record.processedAt}`);
    return state;
  }

  state.matches[eventId] = {
    ...record,
    status: event.status,
    finalDetectedAt: record.finalDetectedAt || new Date().toISOString(),
    renderStartedAt: new Date().toISOString(),
  };
  await saveMonitorState(state);

  const result = await renderEvent(eventId);

  state.matches[eventId] = {
    ...state.matches[eventId],
    renderCompletedAt: new Date().toISOString(),
    processedAt: new Date().toISOString(),
    outputPath: result.outputPath,
    publicUrl: result.uploadResult?.publicUrl || null,
    tweetUrl: result.socialResult?.tweetUrl || null,
    xPostMode: result.socialResult?.mode || null,
    xPublished: Boolean(result.socialResult?.published),
  };

  await saveMonitorState(state);
  console.log(`Processed final BSD event ${eventId}`);
  return state;
}

async function tickMonitor() {
  let state = await loadMonitorState();
  const liveEvents = await bsd.fetchLiveEvents();
  const now = new Date().toISOString();
  const strongDelay = getStrongMonitorDelayMinutes();

  console.log(`Monitor checked ${liveEvents.length} live BSD events.`);

  for (const event of liveEvents) {
    if (!event?.id) continue;

    const scheduledMatch = findScheduledGroupStageMatch(event);
    if (!isGroupStageEvent(event) || !scheduledMatch) {
      console.log(`Skipping BSD event ${event.id}; not in World Cup 2026 group-stage schedule.`);
      continue;
    }

    const eventId = String(event.id);
    const record = state.matches[eventId] || {};
    const nextRecord = {
      ...record,
      eventId,
      homeTeam: event.home_team,
      awayTeam: event.away_team,
      eventDate: event.event_date || event.start_time || record.eventDate || null,
      groupName: event.group_name || record.groupName || null,
      roundNumber: event.round_number || scheduledMatch.matchday || record.roundNumber || null,
      scheduledDate: scheduledMatch.date,
      scheduledVenue: scheduledMatch.venue,
      status: event.status,
      lastCheckedAt: now,
      checkCount: (record.checkCount || 0) + 1,
    };

    if (!nextRecord.secondHalfStartedAt && isSecondHalfStatus(event.status)) {
      nextRecord.secondHalfStartedAt = now;
      console.log(`BSD event ${eventId} entered second half.`);
    }

    state.matches[eventId] = nextRecord;

    if (!isFinishedStatus(event.status)) continue;

    const canProcess =
      !nextRecord.secondHalfStartedAt || minutesSince(nextRecord.secondHalfStartedAt) >= strongDelay;

    if (!canProcess) {
      console.log(`BSD event ${eventId} is final, waiting for second-half monitor window.`);
      continue;
    }

    state = await processFinishedEvent(event, state);
  }

  await saveMonitorState(state);
}

async function runMonitorLoop() {
  if (process.env.MONITOR_ENABLED !== "true") {
    console.log("Monitor disabled. Set MONITOR_ENABLED=true in Railway when ready.");
    return;
  }

  const intervalMs = getMonitorIntervalMs();
  console.log(`Monitor loop active. Polling BSD every ${intervalMs / 1000} seconds.`);

  await tickMonitor().catch((error) => {
    console.error(`Monitor tick failed: ${error.message}`);
  });

  setInterval(() => {
    tickMonitor().catch((error) => {
      console.error(`Monitor tick failed: ${error.message}`);
    });
  }, intervalMs);
}

runStartupJob()
  .then(runMonitorLoop)
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
    server.close();
  });
