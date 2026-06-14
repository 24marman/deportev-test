const { findScheduledGroupStageMatch } = require("../lib/world-cup-group-stage-schedule");
const { normalizeTeamKey } = require("../lib/team-metadata");

function emptyStanding() {
  return { played: 0, wins: 0, draws: 0, losses: 0, points: 0, goalsFor: 0, goalsAgainst: 0 };
}

function applyResult(table, team, goalsFor, goalsAgainst) {
  if (!table.has(team)) table.set(team, emptyStanding());
  const row = table.get(team);

  row.played += 1;
  row.goalsFor += goalsFor;
  row.goalsAgainst += goalsAgainst;

  if (goalsFor > goalsAgainst) {
    row.wins += 1;
    row.points += 3;
  } else if (goalsFor === goalsAgainst) {
    row.draws += 1;
    row.points += 1;
  } else {
    row.losses += 1;
  }
}

function isFinished(status) {
  return ["finished", "final"].includes(String(status || "").toLowerCase());
}

function getEventTime(event) {
  const value = event.event_date || event.start_time;
  const time = value ? new Date(value).getTime() : 0;
  return Number.isFinite(time) ? time : 0;
}

function buildPriorGroupContext(matchData, events = []) {
  const group = matchData.competition?.groupLetter;
  const eventId = String(matchData.source?.eventId || "");
  const eventTime = getEventTime({ event_date: matchData.source?.eventDate });
  const homeKey = normalizeTeamKey(matchData.teams?.home?.providerName || matchData.teams?.home?.name);
  const awayKey = normalizeTeamKey(matchData.teams?.away?.providerName || matchData.teams?.away?.name);
  const table = new Map();

  for (const event of events) {
    if (!event?.id || String(event.id) === eventId || !isFinished(event.status)) continue;

    const scheduled = findScheduledGroupStageMatch(event);
    if (!scheduled || scheduled.group !== group) continue;

    const finishedAt = getEventTime(event);
    if (eventTime && finishedAt && finishedAt >= eventTime) continue;

    const eventHomeKey = normalizeTeamKey(event.home_team);
    const eventAwayKey = normalizeTeamKey(event.away_team);
    const homeScore = Number(event.home_score || 0);
    const awayScore = Number(event.away_score || 0);

    applyResult(table, eventHomeKey, homeScore, awayScore);
    applyResult(table, eventAwayKey, awayScore, homeScore);
  }

  return {
    homePrior: table.get(homeKey) || emptyStanding(),
    awayPrior: table.get(awayKey) || emptyStanding(),
  };
}

module.exports = {
  buildPriorGroupContext,
};
