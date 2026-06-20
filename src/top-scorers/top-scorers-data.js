const fs = require("fs");
const path = require("path");
const bsd = require("../../work/tools/bsd_match_adapter");
const {
  GROUP_STAGE_SCHEDULE,
  normalizeTeamKey,
} = require("../lib/world-cup-group-stage-schedule");
const { getDisplayTeamName, getFlagAssetUrl } = require("../lib/team-metadata");
const { resolvePlayerPortraitAssets } = require("../lib/player-portrait-assets");

const MATCHDAYS_WITH_TOP_SCORERS = new Set(["2", "3"]);

function isFinishedStatus(status) {
  return ["finished", "final"].includes(String(status || "").toLowerCase());
}

function toTemplateAssetPath(assetPath) {
  return String(assetPath || "").replace("./assets/", "../figma_match_card/assets/");
}

function getTargetSchedule(matchday) {
  return GROUP_STAGE_SCHEDULE.filter((match) => Number(match.matchday) <= Number(matchday));
}

function getExactMatchdaySchedule(matchday) {
  return GROUP_STAGE_SCHEDULE.filter((match) => String(match.matchday) === String(matchday));
}

function sameTeams(scheduleMatch, event) {
  const scheduledHome = normalizeTeamKey(scheduleMatch.home);
  const scheduledAway = normalizeTeamKey(scheduleMatch.away);
  const eventHome = normalizeTeamKey(event.home_team || event.teams?.home?.name);
  const eventAway = normalizeTeamKey(event.away_team || event.teams?.away?.name);

  return (
    (scheduledHome === eventHome && scheduledAway === eventAway) ||
    (scheduledHome === eventAway && scheduledAway === eventHome)
  );
}

function findEventForSchedule(scheduleMatch, events) {
  return (events || []).find((event) => sameTeams(scheduleMatch, event));
}

function getDateRangeForMatchday(matchday) {
  const schedule = getTargetSchedule(matchday);
  const dates = schedule.map((match) => match.date).sort();

  return {
    dateFrom: dates[0],
    dateTo: dates[dates.length - 1],
  };
}

async function fetchEventsThroughMatchday(matchday) {
  const { dateFrom, dateTo } = getDateRangeForMatchday(matchday);
  return bsd.fetchEvents({
    date_from: dateFrom,
    date_to: dateTo,
    limit: 200,
  });
}

function isMatchdayComplete(matchday, events) {
  const schedule = getExactMatchdaySchedule(matchday);

  if (!MATCHDAYS_WITH_TOP_SCORERS.has(String(matchday))) {
    return false;
  }

  return schedule.every((match) => {
    const event = findEventForSchedule(match, events);
    return event && isFinishedStatus(event.status);
  });
}

function extractIncidentList(payload) {
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload?.incidents)) return payload.incidents;
  if (Array.isArray(payload?.results)) return payload.results;
  if (Array.isArray(payload?.data)) return payload.data;
  return [];
}

function getIncidentPlayerName(incident) {
  if (typeof incident.player === "string") return incident.player;
  return (
    incident.player_name ||
    incident.player?.short_name ||
    incident.player?.name ||
    incident.scorer ||
    incident.scorer_name ||
    ""
  );
}

function getIncidentPlayerId(incident) {
  return incident.player_id || incident.player?.id || incident.scorer_id || null;
}

function isGoalIncident(incident) {
  return String(incident.type || incident.incident_type || "").toLowerCase() === "goal";
}

function isOwnGoal(incident) {
  const value = String(incident.goal_type || incident.goalType || "").toLowerCase();
  return value === "own_goal" || value === "owngoal";
}

function getScoringTeamName(event, incident) {
  if (incident.team_name) return incident.team_name;
  if (incident.team?.name) return incident.team.name;
  if (incident.team_id && Number(incident.team_id) === Number(event.home_team_id)) return event.home_team;
  if (incident.team_id && Number(incident.team_id) === Number(event.away_team_id)) return event.away_team;
  return incident.is_home ? event.home_team : event.away_team;
}

function parseMinute(incident) {
  const minute = Number(incident.minute || 999);
  const added = Number(incident.added_time || incident.addedTime || 0);
  return minute + added / 100;
}

function getNameForBoard(fullName) {
  const cleanName = String(fullName || "").trim();
  if (!cleanName) return "JUGADOR";

  const parts = cleanName.split(/\s+/);
  const suffixes = new Set(["jr.", "jr", "junior", "júnior"]);
  if (parts.length > 1 && suffixes.has(parts[parts.length - 1].toLowerCase())) {
    return `${parts[parts.length - 2]} ${parts[parts.length - 1]}`.toUpperCase();
  }

  return parts[parts.length - 1].toUpperCase();
}

function getPlayerKey({ playerId, playerName, teamName }) {
  if (playerId) return `bsd:${playerId}`;
  return `${normalizeTeamKey(teamName)}:${String(playerName || "").toLowerCase()}`;
}

async function addMatchGoalsToTable(event, table) {
  const payload = await bsd.fetchEventIncidents(event.id);
  const incidents = extractIncidentList(payload);

  for (const incident of incidents) {
    if (!isGoalIncident(incident) || isOwnGoal(incident)) continue;

    const playerName = getIncidentPlayerName(incident);
    if (!playerName) continue;

    const teamName = getScoringTeamName(event, incident);
    const playerId = getIncidentPlayerId(incident);
    const key = getPlayerKey({ playerId, playerName, teamName });
    const existing = table.get(key) || {
      playerId,
      fullName: playerName,
      displayName: getNameForBoard(playerName),
      country: getDisplayTeamName(teamName),
      providerCountry: teamName,
      goals: 0,
      firstGoalSort: parseMinute(incident),
    };

    existing.goals += 1;
    existing.firstGoalSort = Math.min(existing.firstGoalSort, parseMinute(incident));
    table.set(key, existing);
  }
}

async function buildTopScorers(matchday, options = {}) {
  const events = options.events || (await fetchEventsThroughMatchday(matchday));
  const schedule = getTargetSchedule(matchday);
  const table = new Map();
  const finishedEvents = [];

  for (const match of schedule) {
    const event = findEventForSchedule(match, events);
    if (!event || !isFinishedStatus(event.status)) continue;
    finishedEvents.push(event);
    await addMatchGoalsToTable(event, table);
  }

  const leaders = await Promise.all(
    Array.from(table.values())
      .sort((a, b) => {
        if (b.goals !== a.goals) return b.goals - a.goals;
        if (a.firstGoalSort !== b.firstGoalSort) return a.firstGoalSort - b.firstGoalSort;
        return a.displayName.localeCompare(b.displayName, "es");
      })
      .slice(0, 5)
      .map(async (leader) => {
        const portraits = options.skipPortraitLookup
          ? { approved: false, hero: null, playerKey: null }
          : await resolvePlayerPortraitAssets({
              playerId: leader.playerId,
              name: leader.displayName,
              fullName: leader.fullName,
              country: leader.providerCountry,
            });

        return {
          name: leader.displayName,
          fullName: leader.fullName,
          country: leader.country.toUpperCase(),
          providerCountry: leader.providerCountry,
          goals: leader.goals,
          flag: toTemplateAssetPath(getFlagAssetUrl(leader.providerCountry)),
          portrait: portraits.hero,
          portraitStatus: portraits.approved ? "approved" : "pending",
          playerKey: portraits.playerKey,
        };
      }),
  );

  return {
    competition: {
      name: "COPA MUNDIAL",
      year: "2026",
      phase: "TABLA DE GOLEO",
      matchdayNumber: String(matchday),
    },
    meta: {
      type: "top-scorers",
      scope: "group-stage",
      trigger: `end-of-matchday-${matchday}`,
      matchdayComplete: isMatchdayComplete(matchday, events),
      finishedMatchCount: finishedEvents.length,
      generatedAt: new Date().toISOString(),
    },
    leaders,
  };
}

function writeTopScorersData(filePath, data) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(data, null, 2)}\n`);
}

module.exports = {
  MATCHDAYS_WITH_TOP_SCORERS,
  buildTopScorers,
  fetchEventsThroughMatchday,
  isMatchdayComplete,
  writeTopScorersData,
};
