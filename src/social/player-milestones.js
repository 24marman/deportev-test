const playerFacts = require("../data/world-cup-player-facts.json");
const { findScheduledGroupStageMatch } = require("../lib/world-cup-group-stage-schedule");

function normalizeName(value) {
  return String(value || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function getEventTime(event) {
  const value = event?.event_date || event?.start_time || event?.source?.eventDate;
  const time = value ? new Date(value).getTime() : 0;
  return Number.isFinite(time) ? time : 0;
}

function isFinished(event) {
  return ["finished", "final"].includes(String(event?.status || "").toLowerCase());
}

function isGoalIncident(incident = {}) {
  return String(incident.type || incident.incident_type || "").toLowerCase() === "goal";
}

function isOwnGoal(incident = {}) {
  const value = String(incident.goal_type || incident.goalType || "").toLowerCase();
  return value === "own_goal" || value === "owngoal";
}

function getIncidentPlayerName(incident = {}) {
  if (typeof incident.player === "string") return incident.player;
  return (
    incident.player_name ||
    incident.player?.short_name ||
    incident.player?.name ||
    incident.scorer_name ||
    ""
  );
}

function canonicalPlayerKey(playerName) {
  const normalized = normalizeName(playerName);
  if (!normalized) return "";

  for (const [key, facts] of Object.entries(playerFacts)) {
    const aliases = [key, facts.displayName, ...(facts.aliases || [])].map(normalizeName);
    if (aliases.some((alias) => alias && (normalized === alias || normalized.includes(alias) || alias.includes(normalized)))) {
      return key;
    }
  }

  return normalized;
}

function getCurrentEvent(matchData) {
  return {
    id: matchData.source?.eventId,
    event_date: matchData.source?.eventDate,
    status: "finished",
    home_team: matchData.teams?.home?.providerName || matchData.teams?.home?.name,
    away_team: matchData.teams?.away?.providerName || matchData.teams?.away?.name,
  };
}

async function safeFetchIncidents(eventId, fetchEventIncidents) {
  try {
    const payload = await fetchEventIncidents(eventId);
    return Array.isArray(payload?.incidents) ? payload.incidents : [];
  } catch (error) {
    return [];
  }
}

async function buildPlayerMilestoneContext(matchData, events = [], fetchEventIncidents) {
  if (typeof fetchEventIncidents !== "function") return null;

  const currentEvent = getCurrentEvent(matchData);
  const currentEventId = String(currentEvent.id || "");
  const currentTime = getEventTime(currentEvent);
  const allEvents = [...(events || []), currentEvent]
    .filter((event) => event?.id && isFinished(event) && findScheduledGroupStageMatch(event))
    .filter((event) => {
      const eventTime = getEventTime(event);
      return String(event.id) === currentEventId || !currentTime || !eventTime || eventTime <= currentTime;
    })
    .sort((a, b) => getEventTime(a) - getEventTime(b));

  const goalsBeforeCurrent = new Map();
  const goalsInCurrent = new Map();

  for (const event of allEvents) {
    const eventId = String(event.id);
    const incidents = eventId === currentEventId ? null : await safeFetchIncidents(eventId, fetchEventIncidents);
    const incidentList = incidents || (await safeFetchIncidents(eventId, fetchEventIncidents));

    for (const incident of incidentList) {
      if (!isGoalIncident(incident) || isOwnGoal(incident)) continue;

      const key = canonicalPlayerKey(getIncidentPlayerName(incident));
      if (!key || !playerFacts[key]) continue;

      const target = eventId === currentEventId ? goalsInCurrent : goalsBeforeCurrent;
      target.set(key, Number(target.get(key) || 0) + 1);
    }
  }

  const facts = [];

  for (const [key, currentGoals] of goalsInCurrent.entries()) {
    const record = playerFacts[key];
    const tournamentGoalsBefore = Number(goalsBeforeCurrent.get(key) || 0);
    const careerBefore2026 = Number(record.worldCupGoalsBefore2026 || 0);
    const careerBeforeMatch = careerBefore2026 + tournamentGoalsBefore;
    const careerAfterMatch = careerBeforeMatch + Number(currentGoals || 0);
    const displayName = record.displayName || key;

    if (
      record.allTimeWorldCupGoalRecordBefore2026 &&
      careerBeforeMatch <= Number(record.allTimeWorldCupGoalRecordBefore2026 || 0) &&
      careerAfterMatch > Number(record.allTimeWorldCupGoalRecordBefore2026 || 0)
    ) {
      facts.push({
        priority: 132,
        level: 1,
        source: "editorial-player-milestone",
        signature: "player-all-time-world-cup-goal-record",
        text: `${displayName} se convierte en el máximo goleador histórico de los Mundiales.`,
        playerKey: key,
        goalsBeforeMatch: careerBeforeMatch,
        goalsAfterMatch: careerAfterMatch,
      });
    }

    if (
      record.firstPlayerToScoreInSixWorldCups &&
      Number(currentGoals || 0) > 0 &&
      Array.isArray(record.worldCupEditionsScoredBefore2026) &&
      !record.worldCupEditionsScoredBefore2026.includes(2026) &&
      record.worldCupEditionsScoredBefore2026.length + 1 >= 6
    ) {
      facts.push({
        priority: 131,
        level: 1,
        source: "editorial-player-milestone",
        signature: "player-first-to-score-in-six-world-cups",
        text: `${displayName} se convierte en el primer jugador en anotar en seis Mundiales distintos.`,
        playerKey: key,
      });
    }
  }

  return {
    source: "player-milestones",
    updatedAt: new Date().toISOString(),
    facts,
  };
}

module.exports = {
  buildPlayerMilestoneContext,
  canonicalPlayerKey,
};
