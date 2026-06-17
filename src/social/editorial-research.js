const { findScheduledGroupStageMatch } = require("../lib/world-cup-group-stage-schedule");
const { getDisplayTeamName, normalizeTeamKey } = require("../lib/team-metadata");
const { warmEditorialContext } = require("./editorial-context-cache");
const teamFacts = require("../data/world-cup-team-facts.json");

const FINISHED_STATUSES = new Set(["finished", "final", "cancelled", "postponed"]);
const WARM_CONTEXT_STATUSES = new Set(["halftime", "inprogress", "2nd_half", "second_half"]);

function isEnabled() {
  return process.env.EDITORIAL_RESEARCH_ENABLED !== "false";
}

function getIntervalMinutes() {
  const value = Number(process.env.EDITORIAL_RESEARCH_INTERVAL_MINUTES || "120");
  return Math.max(30, Number.isFinite(value) ? value : 120);
}

function getLookaheadHours() {
  const value = Number(process.env.EDITORIAL_RESEARCH_LOOKAHEAD_HOURS || "36");
  return Math.max(2, Number.isFinite(value) ? value : 36);
}

function getMaxMatches() {
  const value = Number(process.env.EDITORIAL_RESEARCH_MAX_MATCHES || "8");
  return Math.max(1, Number.isFinite(value) ? value : 8);
}

function minutesSince(value, now = Date.now()) {
  if (!value) return Infinity;
  const time = new Date(value).getTime();
  if (!Number.isFinite(time)) return Infinity;
  return (now - time) / 60000;
}

function getEventStartMs(event) {
  const value = event?.event_date || event?.start_time || event?.scheduledDate;
  const time = new Date(value).getTime();
  return Number.isFinite(time) ? time : 0;
}

function shouldRunEditorialResearch(state) {
  if (!isEnabled()) return false;
  return minutesSince(state?.editorialResearch?.updatedAt) >= getIntervalMinutes();
}

function isResearchableEvent(event, now = Date.now()) {
  if (!event?.id) return false;
  const scheduledMatch = findScheduledGroupStageMatch(event);
  if (!scheduledMatch) return false;

  const status = String(event.status || "").toLowerCase();
  if (FINISHED_STATUSES.has(status)) return false;

  const startMs = getEventStartMs(event);
  if (!startMs) return true;

  const earliestMs = now - 2 * 60 * 60 * 1000;
  const latestMs = now + getLookaheadHours() * 60 * 60 * 1000;
  return startMs >= earliestMs && startMs <= latestMs;
}

function compactFacts(context) {
  return (context?.facts || []).slice(0, 8).map((fact) => ({
    source: fact.source,
    priority: fact.priority,
    signature: fact.signature,
    text: fact.text,
  }));
}

function getTeamFacts(name) {
  return teamFacts[normalizeTeamKey(name)] || {};
}

function buildPrematchProfile(event, scheduledMatch) {
  const providerHomeTeam = event.home_team || scheduledMatch.home;
  const providerAwayTeam = event.away_team || scheduledMatch.away;
  const homeTeam = getDisplayTeamName(providerHomeTeam);
  const awayTeam = getDisplayTeamName(providerAwayTeam);
  const homeFacts = getTeamFacts(providerHomeTeam);
  const awayFacts = getTeamFacts(providerAwayTeam);

  return {
    researchedAt: new Date().toISOString(),
    source: "scheduled-editorial-research",
    match: {
      homeTeam,
      awayTeam,
      group: scheduledMatch.group,
      matchday: scheduledMatch.matchday,
      venue: scheduledMatch.venue,
      date: scheduledMatch.date,
    },
    teams: {
      home: {
        name: homeTeam,
        bestFinish: homeFacts.bestFinish || null,
        worldCupTitlesBefore2026: homeFacts.worldCupTitlesBefore2026 || 0,
        defendingChampion: Boolean(homeFacts.defendingChampion),
        firstWorldCupAppearance: homeFacts.firstWorldCupAppearance || null,
      },
      away: {
        name: awayTeam,
        bestFinish: awayFacts.bestFinish || null,
        worldCupTitlesBefore2026: awayFacts.worldCupTitlesBefore2026 || 0,
        defendingChampion: Boolean(awayFacts.defendingChampion),
        firstWorldCupAppearance: awayFacts.firstWorldCupAppearance || null,
      },
    },
    notes: buildPrematchNotes(homeTeam, awayTeam, homeFacts, awayFacts, scheduledMatch),
  };
}

function buildPrematchNotes(homeTeam, awayTeam, homeFacts, awayFacts, scheduledMatch) {
  const notes = [
    `${homeTeam} vs ${awayTeam}: Grupo ${scheduledMatch.group}, Jornada ${scheduledMatch.matchday}.`,
  ];

  for (const [team, facts] of [
    [homeTeam, homeFacts],
    [awayTeam, awayFacts],
  ]) {
    if (facts.defendingChampion) {
      notes.push(`${team} llega como campeon vigente de la Copa del Mundo.`);
    }
    if (facts.worldCupTitlesBefore2026 > 0) {
      notes.push(`${team} tiene ${facts.worldCupTitlesBefore2026} titulo(s) mundial(es) antes de 2026.`);
    }
    if (facts.bestFinish === "debut") {
      notes.push(`${team} disputa su primer Mundial en 2026.`);
    }
  }

  return notes;
}

function buildResearchRecord(event, scheduledMatch, warmed, previousRecord) {
  return {
    ...previousRecord,
    eventId: String(event.id),
    firstSeenAt: previousRecord?.firstSeenAt || new Date().toISOString(),
    homeTeam: event.home_team || previousRecord?.homeTeam || null,
    awayTeam: event.away_team || previousRecord?.awayTeam || null,
    eventDate: event.event_date || event.start_time || previousRecord?.eventDate || null,
    groupName: event.group_name || scheduledMatch.group || previousRecord?.groupName || null,
    roundNumber: event.round_number || scheduledMatch.matchday || previousRecord?.roundNumber || null,
    scheduledDate: scheduledMatch.date,
    scheduledVenue: scheduledMatch.venue,
    status: event.status || previousRecord?.status || null,
    editorialResearchAt: warmed.warmedAt,
    editorialWarmedAt: warmed.warmedAt,
    editorialResearchMs: warmed.elapsedMs,
    editorialContext: warmed.context,
    editorialCandidateCount: warmed.context?.facts?.length || 0,
    editorialResearchSummary: compactFacts(warmed.context),
  };
}

function buildPrematchResearchRecord(event, scheduledMatch, previousRecord) {
  const profile = buildPrematchProfile(event, scheduledMatch);

  return {
    ...previousRecord,
    eventId: String(event.id),
    firstSeenAt: previousRecord?.firstSeenAt || new Date().toISOString(),
    homeTeam: event.home_team || previousRecord?.homeTeam || scheduledMatch.home,
    awayTeam: event.away_team || previousRecord?.awayTeam || scheduledMatch.away,
    eventDate: event.event_date || event.start_time || previousRecord?.eventDate || null,
    groupName: event.group_name || scheduledMatch.group || previousRecord?.groupName || null,
    roundNumber: event.round_number || scheduledMatch.matchday || previousRecord?.roundNumber || null,
    scheduledDate: scheduledMatch.date,
    scheduledVenue: scheduledMatch.venue,
    status: event.status || previousRecord?.status || null,
    editorialResearchAt: profile.researchedAt,
    editorialResearchProfile: profile,
    editorialResearchSummary: profile.notes.map((text) => ({
      source: profile.source,
      text,
    })),
  };
}

async function runEditorialResearch({ state, events, fetchMatchData }) {
  const startedAt = Date.now();
  const nextState = {
    ...state,
    matches: { ...(state.matches || {}) },
    editorialResearch: {
      ...(state.editorialResearch || {}),
    },
  };

  const candidates = (events || [])
    .filter((event) => isResearchableEvent(event))
    .sort((a, b) => getEventStartMs(a) - getEventStartMs(b))
    .slice(0, getMaxMatches());

  const summary = {
    startedAt: new Date(startedAt).toISOString(),
    candidateCount: candidates.length,
    researchedCount: 0,
    skippedFreshCount: 0,
    failedCount: 0,
    errors: [],
  };

  for (const event of candidates) {
    const eventId = String(event.id);
    const previousRecord = nextState.matches[eventId] || {};

    if (previousRecord.processedAt) {
      summary.skippedFreshCount += 1;
      continue;
    }

    if (minutesSince(previousRecord.editorialResearchAt) < getIntervalMinutes()) {
      summary.skippedFreshCount += 1;
      continue;
    }

    try {
      const scheduledMatch = findScheduledGroupStageMatch(event);
      const status = String(event.status || "").toLowerCase();

      if (!WARM_CONTEXT_STATUSES.has(status)) {
        nextState.matches[eventId] = buildPrematchResearchRecord(event, scheduledMatch, previousRecord);
        summary.researchedCount += 1;
        console.log(`Editorial research profiled BSD event ${eventId} before live data.`);
        continue;
      }

      const warmed = await warmEditorialContext({
        eventId,
        fetchMatchData: (id) => fetchMatchData(id, { optionalIncidents: true }),
        contextEvents: events,
      });

      nextState.matches[eventId] = buildResearchRecord(event, scheduledMatch, warmed, previousRecord);
      summary.researchedCount += 1;
      console.log(
        `Editorial research warmed BSD event ${eventId} in ${warmed.elapsedMs}ms ` +
          `(${nextState.matches[eventId].editorialCandidateCount} candidates).`,
      );
    } catch (error) {
      nextState.matches[eventId] = {
        ...previousRecord,
        eventId,
        editorialResearchFailedAt: new Date().toISOString(),
        editorialResearchError: error.message,
      };
      summary.failedCount += 1;
      summary.errors.push({ eventId, message: error.message });
      console.error(`Editorial research failed for BSD event ${eventId}: ${error.message}`);
    }
  }

  const finishedAt = Date.now();
  summary.finishedAt = new Date(finishedAt).toISOString();
  summary.elapsedMs = finishedAt - startedAt;

  nextState.editorialResearch = {
    ...nextState.editorialResearch,
    updatedAt: summary.finishedAt,
    latestRun: summary,
    runs: [summary, ...(nextState.editorialResearch.runs || [])].slice(0, 20),
  };

  console.log(
    `Editorial research cycle completed in ${summary.elapsedMs}ms ` +
      `(${summary.researchedCount}/${summary.candidateCount} researched).`,
  );

  return nextState;
}

module.exports = {
  runEditorialResearch,
  shouldRunEditorialResearch,
};
