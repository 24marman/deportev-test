require("dotenv").config();

const path = require("path");
const { server } = require("./server");
const { renderMatchCard } = require("./render-match-card");
const { uploadGeneratedImage } = require("./lib/storage");
const { loadMonitorState, saveMonitorState } = require("./lib/monitor-state");
const { findScheduledGroupStageMatch } = require("./lib/world-cup-group-stage-schedule");
const { buildDayContext, buildPriorGroupContext, buildTeamFormContext } = require("./social/competition-context");
const {
  applyWarmEditorialContext,
  shouldWarmEditorialContext,
  warmEditorialContext,
} = require("./social/editorial-context-cache");
const { publishFinalScorePost, verifyXPublisherAccount } = require("./social/x-publisher");
const bsd = require("../work/tools/bsd_match_adapter");

const generatedDir = path.join("outputs", "generated");
const DEFAULT_AUTOPOST_NOT_BEFORE = "2026-06-14T23:00:00.000Z";

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

function nowMs() {
  return Date.now();
}

function logDuration(label, startedAt) {
  console.log(`${label} completed in ${Date.now() - startedAt}ms.`);
}

async function renderEvent(eventId, options = {}) {
  const startedAt = nowMs();
  console.log(`Fetching BSD event ${eventId}`);
  const matchData = await bsd.fetchMatchData(eventId, {
    skipEditorialExtras: Boolean(options.warmedRecord?.editorialContext),
  });
  applyWarmEditorialContext(matchData, options.warmedRecord);
  logDuration(`Fetch BSD event ${eventId}`, startedAt);

  const contextStartedAt = nowMs();
  await enrichCompetitionContext(matchData, options.contextEvents);
  logDuration(`Context enrichment for BSD event ${eventId}`, contextStartedAt);

  const outputName = getOutputName(matchData);
  const outputPath = path.join(generatedDir, outputName);
  console.log(
    `Render assets for BSD event ${eventId}: venue="${matchData.match?.venue?.name || "unknown"}", ` +
      `background="${matchData.match?.venue?.image || "unknown"}", ` +
      `homeFlag="${matchData.teams?.home?.flag || "unknown"}", ` +
      `awayFlag="${matchData.teams?.away?.flag || "unknown"}"`,
  );

  const renderStartedAt = nowMs();
  console.log(`Rendering ${outputPath}`);
  await renderMatchCard({
    data: matchData,
    outputPath,
    quality: Number(process.env.RENDER_QUALITY || "82"),
  });
  logDuration(`Render for BSD event ${eventId}`, renderStartedAt);

  const publishStartedAt = nowMs();
  const [uploadSettled, socialSettled] = await Promise.allSettled([
    uploadGeneratedImage(outputPath, outputName),
    publishFinalScorePost({
      matchData,
      imagePath: outputPath,
      recentEditorialSignatures: options.recentEditorialSignatures,
    }),
  ]);

  const uploadResult =
    uploadSettled.status === "fulfilled"
      ? uploadSettled.value
      : {
          uploaded: false,
          reason: uploadSettled.reason.message,
        };

  const socialResult =
    socialSettled.status === "fulfilled"
      ? socialSettled.value
      : {
          published: false,
          mode: process.env.X_POST_MODE || "manual",
          reason: socialSettled.reason.message,
        };

  console.log(
    uploadResult.uploaded
      ? `Uploaded ${uploadResult.publicUrl}`
      : `Skipped upload: ${uploadResult.reason}`,
  );
  console.log(
    socialResult.published
      ? `Published ${socialResult.tweetUrl}`
      : `X post not published: ${socialResult.reason}`,
  );
  logDuration(`Upload/post for BSD event ${eventId}`, publishStartedAt);
  logDuration(`Full processing for BSD event ${eventId}`, startedAt);

  return {
    matchData,
    outputPath,
    uploadResult,
    socialResult,
  };
}

async function enrichCompetitionContext(matchData, contextEvents) {
  try {
    const events =
      contextEvents ||
      (await bsd.fetchEvents({
        date_to: matchData.source?.eventDate || new Date().toISOString().slice(0, 10),
        limit: 100,
      }));

    matchData.context = {
      ...(matchData.context || {}),
      day: buildDayContext(matchData, events),
      priorGroup: buildPriorGroupContext(matchData, events),
      teamForm: buildTeamFormContext(matchData, events),
    };
  } catch (error) {
    console.error(`Competition context unavailable: ${error.message}`);
  }
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

  return !knockoutTerms.some((term) => roundName.includes(term));
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

function getAutopostNotBeforeMs() {
  const value = process.env.AUTOPOST_NOT_BEFORE || DEFAULT_AUTOPOST_NOT_BEFORE;
  const time = new Date(value).getTime();

  if (Number.isFinite(time)) return time;

  return new Date(DEFAULT_AUTOPOST_NOT_BEFORE).getTime();
}

function getEventStartMs(recordOrEvent) {
  const value = recordOrEvent.eventDate || recordOrEvent.event_date || recordOrEvent.start_time;
  if (!value) return 0;

  const time = new Date(value).getTime();
  return Number.isFinite(time) ? time : 0;
}

function getStrongMonitorDelayMinutes() {
  return Number(process.env.SECOND_HALF_STRONG_MONITOR_MINUTES || "40");
}

function addDays(date, days) {
  const copy = new Date(date);
  copy.setUTCDate(copy.getUTCDate() + days);
  return copy;
}

function formatDate(date) {
  return date.toISOString().slice(0, 10);
}

function getMonitoringDateRange(now = new Date()) {
  const beforeDays = Number(process.env.MONITOR_LOOKBACK_DAYS || "1");
  const afterDays = Number(process.env.MONITOR_LOOKAHEAD_DAYS || "1");

  return {
    dateFrom: formatDate(addDays(now, -beforeDays)),
    dateTo: formatDate(addDays(now, afterDays)),
  };
}

function mergeEvents(...eventGroups) {
  const seen = new Set();
  const merged = [];

  for (const group of eventGroups) {
    for (const event of group || []) {
      if (!event?.id) continue;
      const key = String(event.id);
      if (seen.has(key)) continue;
      seen.add(key);
      merged.push(event);
    }
  }

  return merged;
}

async function fetchMonitorEvents() {
  const liveEvents = await bsd.fetchLiveEvents();
  const { dateFrom, dateTo } = getMonitoringDateRange();
  let windowEvents = [];

  try {
    windowEvents = await bsd.fetchEvents({
      date_from: dateFrom,
      date_to: dateTo,
      limit: 100,
    });
  } catch (error) {
    console.error(`Could not fetch BSD schedule window ${dateFrom} to ${dateTo}: ${error.message}`);
  }

  const events = mergeEvents(liveEvents, windowEvents);
  console.log(
    `Monitor checked ${events.length} BSD events ` +
      `(${liveEvents.length} live, ${windowEvents.length} window ${dateFrom}..${dateTo}).`,
  );

  return events;
}

async function processFinishedEvent(event, state, contextEvents) {
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

  const result = await renderEvent(eventId, {
    contextEvents,
    warmedRecord: state.matches[eventId],
    recentEditorialSignatures: getRecentEditorialSignatures(state, eventId),
  });

  state.matches[eventId] = {
    ...state.matches[eventId],
    renderCompletedAt: new Date().toISOString(),
    processedAt: new Date().toISOString(),
    outputPath: result.outputPath,
    publicUrl: result.uploadResult?.publicUrl || null,
    tweetUrl: result.socialResult?.tweetUrl || null,
    editorialHeadline: result.socialResult?.editorialContext?.headline || null,
    editorialSource: result.socialResult?.editorialContext?.source || null,
    editorialSignature: result.socialResult?.editorialContext?.signature || null,
    xPostMode: result.socialResult?.mode || null,
    xPublished: Boolean(result.socialResult?.published),
  };

  await saveMonitorState(state);
  console.log(`Processed final BSD event ${eventId}`);
  return state;
}

function getRecentEditorialSignatures(state, currentEventId, limit = 8) {
  return Object.entries(state.matches || {})
    .filter(([eventId, record]) => eventId !== String(currentEventId) && record?.editorialSignature)
    .sort((a, b) => new Date(b[1].processedAt || b[1].renderCompletedAt || 0) - new Date(a[1].processedAt || a[1].renderCompletedAt || 0))
    .slice(0, limit)
    .map(([, record]) => record.editorialSignature);
}

async function maybeWarmEditorialContext(eventId, state, contextEvents) {
  const record = state.matches[eventId] || {};

  if (!shouldWarmEditorialContext(record, record.status)) return state;

  try {
    const warmed = await warmEditorialContext({
      eventId,
      fetchMatchData: bsd.fetchMatchData,
      contextEvents,
    });

    state.matches[eventId] = {
      ...state.matches[eventId],
      editorialWarmedAt: warmed.warmedAt,
      editorialWarmupMs: warmed.elapsedMs,
      editorialContext: warmed.context,
      editorialCandidateCount: warmed.context?.facts?.length || 0,
    };

    console.log(
      `Warmed editorial context for BSD event ${eventId} in ${warmed.elapsedMs}ms ` +
        `(${state.matches[eventId].editorialCandidateCount} candidates).`,
    );
    await saveMonitorState(state);
  } catch (error) {
    state.matches[eventId] = {
      ...state.matches[eventId],
      editorialWarmupFailedAt: new Date().toISOString(),
      editorialWarmupError: error.message,
    };
    console.error(`Editorial warmup failed for BSD event ${eventId}: ${error.message}`);
  }

  return state;
}

async function tickMonitor() {
  let state = await loadMonitorState();
  const monitorEvents = await fetchMonitorEvents();
  const now = new Date().toISOString();
  const strongDelay = getStrongMonitorDelayMinutes();

  for (const event of monitorEvents) {
    if (!event?.id) continue;

    let eventDetails = event;
    let scheduledMatch = findScheduledGroupStageMatch(eventDetails);

    if (!scheduledMatch || !eventDetails.group_name || !eventDetails.round_name) {
      try {
        eventDetails = await bsd.fetchEvent(event.id);
        scheduledMatch = findScheduledGroupStageMatch(eventDetails);
      } catch (error) {
        console.error(`Could not fetch BSD event ${event.id} details: ${error.message}`);
      }
    }

    if (!isGroupStageEvent(eventDetails) || !scheduledMatch) {
      console.log(
        `Skipping BSD event ${event.id}; not in World Cup 2026 group-stage schedule ` +
          `(${event.home_team || eventDetails.home_team || "unknown"} vs ${event.away_team || eventDetails.away_team || "unknown"}).`,
      );
      continue;
    }

    const eventId = String(event.id);
    const record = state.matches[eventId] || {};
    const sawBeforeThisTick = Boolean(record.firstSeenAt);
    const nextRecord = {
      ...record,
      eventId,
      firstSeenAt: record.firstSeenAt || now,
      homeTeam: eventDetails.home_team || event.home_team,
      awayTeam: eventDetails.away_team || event.away_team,
      eventDate: eventDetails.event_date || event.event_date || event.start_time || record.eventDate || null,
      groupName: eventDetails.group_name || event.group_name || scheduledMatch.group || record.groupName || null,
      roundNumber: eventDetails.round_number || event.round_number || scheduledMatch.matchday || record.roundNumber || null,
      scheduledDate: scheduledMatch.date,
      scheduledVenue: scheduledMatch.venue,
      status: eventDetails.status || event.status,
      lastCheckedAt: now,
      checkCount: (record.checkCount || 0) + 1,
    };

    const eventStartMs = getEventStartMs(nextRecord);
    const autopostNotBeforeMs = getAutopostNotBeforeMs();

    if (eventStartMs && eventStartMs < autopostNotBeforeMs) {
      state.matches[eventId] = {
        ...nextRecord,
        skippedBeforeCutoffAt: now,
        processedAt: now,
        xPublished: false,
        skipReason: `Event starts before autopost cutoff ${new Date(autopostNotBeforeMs).toISOString()}.`,
      };
      console.log(
        `Skipping BSD event ${eventId}; event starts before autopost cutoff ` +
          `${new Date(autopostNotBeforeMs).toISOString()}.`,
      );
      continue;
    }

    if (!nextRecord.secondHalfStartedAt && isSecondHalfStatus(nextRecord.status)) {
      nextRecord.secondHalfStartedAt = now;
      console.log(`BSD event ${eventId} entered second half.`);
    }

    state.matches[eventId] = nextRecord;

    state = await maybeWarmEditorialContext(eventId, state, monitorEvents);

    if (!isFinishedStatus(nextRecord.status)) continue;

    if (!sawBeforeThisTick && !nextRecord.secondHalfStartedAt) {
      state.matches[eventId] = {
        ...nextRecord,
        skippedPastFinalAt: now,
        processedAt: now,
        xPublished: false,
        skipReason: "First seen after final whistle; past matches are never autoposted.",
      };
      console.log(`Skipping BSD event ${eventId}; first seen already finished, so it will not be autoposted.`);
      continue;
    }

    const canProcess =
      !nextRecord.secondHalfStartedAt || minutesSince(nextRecord.secondHalfStartedAt) >= strongDelay;

    if (!canProcess) {
      console.log(`BSD event ${eventId} is final, waiting for second-half monitor window.`);
      continue;
    }

    state = await processFinishedEvent(event, state, monitorEvents);
  }

  await saveMonitorState(state);
}

async function logXAccountStatus() {
  const account = await verifyXPublisherAccount();
  if (account.ok) {
    console.log(`X publisher connected as @${account.username} (${account.name}); mode=${account.mode}.`);
    return;
  }

  console.error(`X publisher verification failed; mode=${account.mode}; reason=${account.reason}`);
}

async function runMonitorLoop() {
  if (process.env.MONITOR_ENABLED !== "true") {
    console.log("Monitor disabled. Set MONITOR_ENABLED=true in Railway when ready.");
    return;
  }

  const intervalMs = getMonitorIntervalMs();
  console.log(`Monitor loop active. Polling BSD every ${intervalMs / 1000} seconds.`);
  await logXAccountStatus();

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
