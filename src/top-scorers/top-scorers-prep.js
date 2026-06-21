const fs = require("fs");
const path = require("path");
const { downloadGuardianPlayerImage } = require("../lib/guardian-player-guide");
const { generateHiggsfieldPortrait } = require("../lib/higgsfield-portrait-generator");
const {
  TOP_SCORER_HIGGSFIELD_PRESET_VERSION,
  buildTopScorerHiggsfieldPrompt,
} = require("../lib/higgsfield-portrait-preset");
const {
  getPlayerAssetKey,
  resolvePlayerPortraitAssets,
  saveApprovedPlayerPortrait,
  savePlayerPortraitManifest,
} = require("../lib/player-portrait-assets");
const {
  MATCHDAYS_WITH_TOP_SCORERS,
  buildTopScorers,
  fetchEventsThroughMatchday,
  getExactMatchdaySchedule,
} = require("./top-scorers-data");

function isPrepEnabled() {
  return process.env.TOP_SCORERS_PREP_ENABLED !== "false";
}

function isGenerationEnabled() {
  return process.env.TOP_SCORERS_PORTRAIT_GENERATION_ENABLED !== "false";
}

function getCandidateLimit() {
  const limit = Number(process.env.TOP_SCORERS_PREP_CANDIDATE_LIMIT || "8");
  return Number.isFinite(limit) && limit > 5 ? limit : 8;
}

function getRetryMinutes() {
  const minutes = Number(process.env.TOP_SCORERS_PORTRAIT_RETRY_MINUTES || "30");
  return Number.isFinite(minutes) && minutes > 0 ? minutes : 30;
}

function minutesSince(value) {
  if (!value) return Infinity;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return Infinity;
  return (Date.now() - date.getTime()) / 60000;
}

function formatLocalDate(date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: process.env.TZ || "America/Chicago",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const pick = (type) => parts.find((part) => part.type === type)?.value || "";
  return `${pick("year")}-${pick("month")}-${pick("day")}`;
}

function getMatchdayWindow(matchday) {
  const schedule = getExactMatchdaySchedule(matchday);
  const dates = schedule.map((match) => match.date).sort();

  return {
    matchday: String(matchday),
    dateFrom: dates[0] || null,
    dateTo: dates[dates.length - 1] || null,
    matchCount: schedule.length,
  };
}

function hasMatchdayStarted(matchday, today = formatLocalDate()) {
  const window = getMatchdayWindow(matchday);
  if (!window.dateFrom) return false;
  return today >= window.dateFrom;
}

function isFinalRecord(record = {}) {
  return record.status === "approved" || record.status === "generated-local";
}

function shouldSkipCandidate(existingRecord = {}) {
  if (!existingRecord.status) return false;
  if (isFinalRecord(existingRecord)) return true;
  if (!isGenerationEnabled() && existingRecord.status === "reference-ready") return true;
  if (
    ["source-missing", "higgsfield-failed"].includes(existingRecord.status) &&
    minutesSince(existingRecord.updatedAt) < getRetryMinutes()
  ) {
    return true;
  }
  return false;
}

function playerForAssets(leader) {
  return {
    playerId: leader.playerId,
    name: leader.name,
    fullName: leader.fullName,
    country: leader.providerCountry || leader.country,
  };
}

function localCandidatePaths(playerKey) {
  const dir = path.join("outputs", "player-assets", "portraits", playerKey);
  return {
    dir,
    referencePath: path.join(dir, "guardian-reference.jpg"),
    rawPath: path.join(dir, "higgsfield-source.png"),
    outputPath: path.join(dir, "approved-hero.webp"),
    manifestPath: path.join(dir, "manifest.json"),
  };
}

async function writeLocalManifest(filePath, payload) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(payload, null, 2)}\n`);
}

async function prepareCandidate(leader, existingRecord = {}, options = {}) {
  const player = playerForAssets(leader);
  const playerKey = getPlayerAssetKey(player);
  const paths = localCandidatePaths(playerKey);

  const approved = await resolvePlayerPortraitAssets(player);
  if (approved.approved) {
    return {
      playerKey,
      player,
      goals: leader.goals,
      status: "approved",
      hero: approved.hero,
      manifest: approved.manifest || null,
      reused: true,
      updatedAt: new Date().toISOString(),
    };
  }

  if (shouldSkipCandidate(existingRecord)) {
    return {
      ...existingRecord,
      goals: leader.goals,
      skippedReason: "Already prepared for the current generation mode.",
      updatedAt: new Date().toISOString(),
    };
  }

  if (options.dryRun) {
    return {
      playerKey,
      player,
      goals: leader.goals,
      status: "dry-run",
      needsReference: true,
      needsHiggsfield: isGenerationEnabled(),
      updatedAt: new Date().toISOString(),
    };
  }

  let reference = null;
  try {
    reference = await downloadGuardianPlayerImage({
      playerName: leader.fullName,
      teamName: leader.providerCountry,
      outputPath: paths.referencePath,
    });
  } catch (error) {
    const failure = {
      playerKey,
      player,
      goals: leader.goals,
      status: "source-missing",
      source: "guardian-player-guide",
      error: error.message,
      updatedAt: new Date().toISOString(),
    };
    await savePlayerPortraitManifest(player, failure).catch(() => null);
    await writeLocalManifest(paths.manifestPath, failure);
    return failure;
  }

  const referenceManifest = {
    playerKey,
    player,
    goals: leader.goals,
    status: "reference-ready",
    source: "guardian-player-guide",
    sourceMetadata: reference,
    referencePath: reference.outputPath,
    provider: "higgsfield",
    processingVersion: TOP_SCORER_HIGGSFIELD_PRESET_VERSION,
    visualContract: "locked-bw-grunge-editorial-same-session",
    updatedAt: new Date().toISOString(),
  };

  if (!isGenerationEnabled()) {
    await savePlayerPortraitManifest(player, referenceManifest).catch(() => null);
    await writeLocalManifest(paths.manifestPath, referenceManifest);
    return referenceManifest;
  }

  const prompt = buildTopScorerHiggsfieldPrompt({ direction: "left" });

  try {
    const generated = await generateHiggsfieldPortrait({
      inputPath: reference.outputPath,
      outputPath: paths.outputPath,
      rawOutputPath: paths.rawPath,
      prompt,
      direction: "left",
    });
    const upload = await saveApprovedPlayerPortrait(player, paths.outputPath, {
      ...referenceManifest,
      status: "approved",
      prompt,
      provider: "higgsfield",
      higgsfield: {
        model: generated.model,
        aspectRatio: generated.aspectRatio,
        mediaId: generated.mediaId,
        resultUrl: generated.resultUrl,
      },
      generatedPath: generated.rawOutputPath,
      outputPath: paths.outputPath,
    });
    const approvedManifest = {
      ...referenceManifest,
      status: upload.uploaded ? "approved" : "generated-local",
      prompt,
      hero: upload.publicUrl || paths.outputPath,
      manifest: upload.manifestUrl || null,
      uploaded: Boolean(upload.uploaded),
      provider: "higgsfield",
      higgsfield: {
        model: generated.model,
        aspectRatio: generated.aspectRatio,
        mediaId: generated.mediaId,
        resultUrl: generated.resultUrl,
      },
      generatedPath: generated.rawOutputPath,
      outputPath: paths.outputPath,
      updatedAt: new Date().toISOString(),
    };
    await writeLocalManifest(paths.manifestPath, approvedManifest);
    return approvedManifest;
  } catch (error) {
    const failure = {
      ...referenceManifest,
      status: "higgsfield-failed",
      error: error.message,
      updatedAt: new Date().toISOString(),
    };
    await savePlayerPortraitManifest(player, failure).catch(() => null);
    await writeLocalManifest(paths.manifestPath, failure);
    return failure;
  }
}

async function prepareTopScorersMatchday(state = {}, matchday, options = {}) {
  const key = String(matchday);

  if (!isPrepEnabled() || !MATCHDAYS_WITH_TOP_SCORERS.has(key)) {
    return state;
  }

  if (!options.force && !hasMatchdayStarted(key)) {
    return state;
  }

  const events = options.events || (await fetchEventsThroughMatchday(key));
  const limit = Number(options.limit || getCandidateLimit());
  const data = await buildTopScorers(key, {
    events,
    limit,
    skipPortraitLookup: true,
  });
  const previous = state.topScorersPrep?.[key] || {};
  const previousCandidates = previous.candidates || {};
  const nextCandidates = { ...previousCandidates };

  for (const leader of data.leaders) {
    const player = playerForAssets(leader);
    const playerKey = getPlayerAssetKey(player);
    nextCandidates[playerKey] = await prepareCandidate(leader, previousCandidates[playerKey], options);
  }

  state.topScorersPrep = {
    ...(state.topScorersPrep || {}),
    [key]: {
      matchday: key,
      matchdayWindow: getMatchdayWindow(key),
      candidateLimit: limit,
      candidateCount: data.leaders.length,
      generationEnabled: isGenerationEnabled(),
      dryRun: Boolean(options.dryRun),
      updatedAt: new Date().toISOString(),
      candidates: nextCandidates,
    },
  };

  return state;
}

module.exports = {
  getMatchdayWindow,
  hasMatchdayStarted,
  isGenerationEnabled,
  isPrepEnabled,
  prepareTopScorersMatchday,
};
