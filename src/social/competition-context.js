const { GROUP_STAGE_SCHEDULE, findScheduledGroupStageMatch } = require("../lib/world-cup-group-stage-schedule");
const { normalizeTeamKey } = require("../lib/team-metadata");

function emptyStanding() {
  return { played: 0, wins: 0, draws: 0, losses: 0, points: 0, goalsFor: 0, goalsAgainst: 0 };
}

function cloneStanding(row = emptyStanding()) {
  return {
    played: Number(row.played || 0),
    wins: Number(row.wins || 0),
    draws: Number(row.draws || 0),
    losses: Number(row.losses || 0),
    points: Number(row.points || 0),
    goalsFor: Number(row.goalsFor || 0),
    goalsAgainst: Number(row.goalsAgainst || 0),
  };
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

function getSortedTableRows(table) {
  return Array.from(table.entries())
    .map(([team, row]) => ({
      team,
      ...cloneStanding(row),
      goalDifference: Number(row.goalsFor || 0) - Number(row.goalsAgainst || 0),
    }))
    .sort((a, b) => {
      if (b.points !== a.points) return b.points - a.points;
      if (b.goalDifference !== a.goalDifference) return b.goalDifference - a.goalDifference;
      if (b.goalsFor !== a.goalsFor) return b.goalsFor - a.goalsFor;
      return a.team.localeCompare(b.team);
    });
}

function isFinished(status) {
  return ["finished", "final"].includes(String(status || "").toLowerCase());
}

function getEventTime(event) {
  const value = event.event_date || event.start_time;
  const time = value ? new Date(value).getTime() : 0;
  return Number.isFinite(time) ? time : 0;
}

function getCurrentEvent(matchData) {
  return {
    id: matchData.source?.eventId,
    event_date: matchData.source?.eventDate,
    status: "finished",
    group_name: matchData.competition?.groupLetter ? `Group ${matchData.competition.groupLetter}` : "",
    round_number: matchData.competition?.matchdayNumber,
    home_team: matchData.teams?.home?.providerName || matchData.teams?.home?.name,
    away_team: matchData.teams?.away?.providerName || matchData.teams?.away?.name,
    home_score: matchData.teams?.home?.score ?? 0,
    away_score: matchData.teams?.away?.score ?? 0,
  };
}

function getEventKey(event) {
  const scheduled = findScheduledGroupStageMatch(event);
  const home = normalizeTeamKey(event.home_team || event.teams?.home?.name);
  const away = normalizeTeamKey(event.away_team || event.teams?.away?.name);
  return scheduled ? `${scheduled.date}:${scheduled.group}:${home}:${away}` : String(event.id || `${home}:${away}`);
}

function scheduledMatchKey(match) {
  const home = normalizeTeamKey(match.home);
  const away = normalizeTeamKey(match.away);
  return `${match.date}:${match.group}:${home}:${away}`;
}

function eventScheduleKey(event) {
  const scheduled = findScheduledGroupStageMatch(event);
  return scheduled ? scheduledMatchKey(scheduled) : null;
}

function mergeCurrentEvent(events, currentEvent) {
  const merged = new Map();

  for (const event of events || []) {
    if (!event) continue;
    merged.set(getEventKey(event), event);
  }

  merged.set(getEventKey(currentEvent), currentEvent);
  return Array.from(merged.values());
}

function getResultForTeam(event, teamKey) {
  const homeKey = normalizeTeamKey(event.home_team);
  const awayKey = normalizeTeamKey(event.away_team);
  const homeScore = Number(event.home_score || 0);
  const awayScore = Number(event.away_score || 0);

  if (homeKey !== teamKey && awayKey !== teamKey) return null;
  if (homeScore === awayScore) return "D";

  const teamWon = (homeKey === teamKey && homeScore > awayScore) || (awayKey === teamKey && awayScore > homeScore);
  return teamWon ? "W" : "L";
}

function getConsecutiveResultCount(results, result) {
  let count = 0;

  for (let index = results.length - 1; index >= 0; index -= 1) {
    if (results[index] !== result) break;
    count += 1;
  }

  return count;
}

function buildTeamFormContext(matchData, events = []) {
  const currentEvent = getCurrentEvent(matchData);
  const currentTime = getEventTime(currentEvent);
  const allEvents = mergeCurrentEvent(events, currentEvent)
    .filter((event) => event?.id && isFinished(event.status) && findScheduledGroupStageMatch(event))
    .filter((event) => {
      const eventTime = getEventTime(event);
      return !currentTime || !eventTime || eventTime <= currentTime || String(event.id) === String(currentEvent.id);
    })
    .sort((a, b) => getEventTime(a) - getEventTime(b));

  function build(teamName) {
    const teamKey = normalizeTeamKey(teamName);
    const results = allEvents.map((event) => getResultForTeam(event, teamKey)).filter(Boolean);
    const currentResult = results[results.length - 1] || null;

    return {
      result: currentResult,
      results,
      consecutive: currentResult ? getConsecutiveResultCount(results, currentResult) : 0,
    };
  }

  return {
    home: build(currentEvent.home_team),
    away: build(currentEvent.away_team),
  };
}

function buildDayContext(matchData, events = []) {
  const currentEvent = getCurrentEvent(matchData);
  const currentScheduled = findScheduledGroupStageMatch(currentEvent);
  const currentDate = currentScheduled?.date;
  const currentTime = getEventTime(currentEvent);

  if (!currentDate) {
    return null;
  }

  const allEvents = mergeCurrentEvent(events, currentEvent);
  const daySchedule = GROUP_STAGE_SCHEDULE.filter((match) => match.date === currentDate);
  const currentScheduleKey = eventScheduleKey(currentEvent);
  const currentScheduledIndex = daySchedule.findIndex((match) => scheduledMatchKey(match) === currentScheduleKey);
  const dayEvents = allEvents
    .filter((event) => {
      const scheduled = findScheduledGroupStageMatch(event);
      if (!scheduled || scheduled.date !== currentDate || !isFinished(event.status)) return false;

      const eventTime = getEventTime(event);
      return !currentTime || !eventTime || eventTime <= currentTime || String(event.id) === String(currentEvent.id);
    })
    .map((event) => ({
      id: String(event.id),
      homeTeam: event.home_team,
      awayTeam: event.away_team,
      homeScore: Number(event.home_score || 0),
      awayScore: Number(event.away_score || 0),
      isDraw: Number(event.home_score || 0) === Number(event.away_score || 0),
    }));

  const scheduledCount = daySchedule.length;
  const drawCount = dayEvents.filter((event) => event.isDraw).length;
  const currentIsDraw = Number(currentEvent.home_score || 0) === Number(currentEvent.away_score || 0);

  return {
    date: currentDate,
    scheduledCount,
    finishedCount: dayEvents.length,
    currentScheduledIndex,
    isFirstScheduledMatch: currentScheduledIndex === 0,
    isLastScheduledMatch: currentScheduledIndex >= 0 && currentScheduledIndex === scheduledCount - 1,
    drawCount,
    currentIsDraw,
    allFinishedDrawDay: scheduledCount > 0 && dayEvents.length >= scheduledCount && drawCount >= scheduledCount,
    drawRunCount: currentIsDraw ? drawCount : 0,
    events: dayEvents,
  };
}

function buildPriorGroupContext(matchData, events = []) {
  const group = matchData.competition?.groupLetter;
  const eventId = String(matchData.source?.eventId || "");
  const eventTime = getEventTime({ event_date: matchData.source?.eventDate });
  const currentEvent = getCurrentEvent(matchData);
  const currentScheduleKey = eventScheduleKey(currentEvent);
  const homeKey = normalizeTeamKey(matchData.teams?.home?.providerName || matchData.teams?.home?.name);
  const awayKey = normalizeTeamKey(matchData.teams?.away?.providerName || matchData.teams?.away?.name);
  const table = new Map();
  const groupSchedule = GROUP_STAGE_SCHEDULE.filter((match) => match.group === group);
  const groupTeams = getGroupTeams(groupSchedule);
  const playedScheduleKeys = new Set(currentScheduleKey ? [currentScheduleKey] : []);

  for (const team of groupTeams) {
    table.set(team, emptyStanding());
  }

  for (const event of events) {
    if (!event?.id || String(event.id) === eventId || !isFinished(event.status)) continue;

    const scheduled = findScheduledGroupStageMatch(event);
    if (!scheduled || scheduled.group !== group) continue;
    playedScheduleKeys.add(scheduledMatchKey(scheduled));

    const finishedAt = getEventTime(event);
    if (eventTime && finishedAt && finishedAt >= eventTime) continue;

    const eventHomeKey = normalizeTeamKey(event.home_team);
    const eventAwayKey = normalizeTeamKey(event.away_team);
    const homeScore = Number(event.home_score || 0);
    const awayScore = Number(event.away_score || 0);

    applyResult(table, eventHomeKey, homeScore, awayScore);
    applyResult(table, eventAwayKey, awayScore, homeScore);
  }

  const priorTable = getSortedTableRows(table);

  const afterTable = new Map();
  for (const [team, row] of table.entries()) {
    afterTable.set(team, cloneStanding(row));
  }

  const currentHomeScore = Number(matchData.teams?.home?.score || 0);
  const currentAwayScore = Number(matchData.teams?.away?.score || 0);
  applyResult(afterTable, homeKey, currentHomeScore, currentAwayScore);
  applyResult(afterTable, awayKey, currentAwayScore, currentHomeScore);

  return {
    homePrior: table.get(homeKey) || emptyStanding(),
    awayPrior: table.get(awayKey) || emptyStanding(),
    homeAfter: afterTable.get(homeKey) || emptyStanding(),
    awayAfter: afterTable.get(awayKey) || emptyStanding(),
    tableBefore: priorTable,
    tableAfter: getSortedTableRows(afterTable),
    groupOutlook: buildGroupOutlook({
      afterTable,
      groupSchedule,
      groupTeams,
      currentScheduleKey,
      playedScheduleKeys,
      homeKey,
      awayKey,
    }),
  };
}

function buildTournamentContext(matchData, events = []) {
  const currentEvent = getCurrentEvent(matchData);
  const currentScheduleKey = eventScheduleKey(currentEvent);
  const currentTime = getEventTime(currentEvent);
  const currentGroup = matchData.competition?.groupLetter;
  const homeKey = normalizeTeamKey(matchData.teams?.home?.providerName || matchData.teams?.home?.name);
  const awayKey = normalizeTeamKey(matchData.teams?.away?.providerName || matchData.teams?.away?.name);

  if (!currentGroup || !currentScheduleKey) return null;

  const before = buildTournamentSnapshot(events, {
    currentEvent,
    currentTime,
    includeCurrent: false,
  });
  const after = buildTournamentSnapshot(events, {
    currentEvent,
    currentTime,
    includeCurrent: true,
  });

  const beforeQualified = new Set(before.qualifiedTopTwo);
  const beforeFirst = new Set(before.guaranteedFirst);
  const newlyQualified = after.qualifiedTopTwo.filter((team) => !beforeQualified.has(team));
  const newlyGuaranteedFirst = after.guaranteedFirst.filter((team) => !beforeFirst.has(team));
  const currentTeams = new Set([homeKey, awayKey]);

  return {
    qualifiedBeforeCount: before.qualifiedTopTwo.length,
    qualifiedAfterCount: after.qualifiedTopTwo.length,
    newlyQualified: newlyQualified.filter((team) => currentTeams.has(team)),
    newlyGuaranteedFirst: newlyGuaranteedFirst.filter((team) => currentTeams.has(team)),
    firstQualifiedThisTournament:
      before.qualifiedTopTwo.length === 0 && newlyQualified.some((team) => currentTeams.has(team)),
    home: after.outlooks[homeKey] || null,
    away: after.outlooks[awayKey] || null,
  };
}

function buildTournamentSnapshot(events = [], { currentEvent, currentTime, includeCurrent }) {
  const tablesByGroup = new Map();
  const playedKeysByGroup = new Map();
  const currentScheduleKey = eventScheduleKey(currentEvent);

  for (const match of GROUP_STAGE_SCHEDULE) {
    if (!tablesByGroup.has(match.group)) {
      tablesByGroup.set(match.group, new Map());
      playedKeysByGroup.set(match.group, new Set());
    }

    const table = tablesByGroup.get(match.group);
    const home = normalizeTeamKey(match.home);
    const away = normalizeTeamKey(match.away);
    if (!table.has(home)) table.set(home, emptyStanding());
    if (!table.has(away)) table.set(away, emptyStanding());
  }

  for (const event of mergeCurrentEvent(events, currentEvent)) {
    if (!event?.id || !isFinished(event.status)) continue;
    if (!includeCurrent && String(event.id) === String(currentEvent.id)) continue;

    const scheduled = findScheduledGroupStageMatch(event);
    if (!scheduled) continue;
    const scheduleKey = scheduledMatchKey(scheduled);
    if (!includeCurrent && currentScheduleKey && scheduleKey === currentScheduleKey) continue;

    const eventTime = getEventTime(event);
    if (eventTime && currentTime && eventTime > currentTime) continue;

    const group = scheduled.group;
    const table = tablesByGroup.get(group);
    const playedKeys = playedKeysByGroup.get(group);
    if (!table || !playedKeys) continue;

    const home = normalizeTeamKey(event.home_team);
    const away = normalizeTeamKey(event.away_team);
    applyResult(table, home, Number(event.home_score || 0), Number(event.away_score || 0));
    applyResult(table, away, Number(event.away_score || 0), Number(event.home_score || 0));
    playedKeys.add(scheduleKey);
  }

  const qualifiedTopTwo = [];
  const guaranteedFirst = [];
  const outlooks = {};

  for (const [group, table] of tablesByGroup.entries()) {
    const groupSchedule = GROUP_STAGE_SCHEDULE.filter((match) => match.group === group);
    const groupTeams = getGroupTeams(groupSchedule);
    const outlook = buildGroupOutlook({
      afterTable: table,
      groupSchedule,
      groupTeams,
      currentScheduleKey: null,
      playedScheduleKeys: playedKeysByGroup.get(group) || new Set(),
      homeKey: null,
      awayKey: null,
    });

    for (const team of groupTeams) {
      const teamOutlook = outlook?.teams?.[team];
      if (!teamOutlook) continue;

      outlooks[team] = {
        ...teamOutlook,
        group,
      };

      if (teamOutlook.guaranteedTopTwo) qualifiedTopTwo.push(team);
      if (teamOutlook.guaranteedFirst) guaranteedFirst.push(team);
    }
  }

  return {
    qualifiedTopTwo,
    guaranteedFirst,
    outlooks,
  };
}

function getGroupTeams(groupSchedule) {
  const teams = new Set();

  for (const match of groupSchedule) {
    teams.add(normalizeTeamKey(match.home));
    teams.add(normalizeTeamKey(match.away));
  }

  return Array.from(teams);
}

function getRemainingMatchesForTeam(groupSchedule, playedScheduleKeys, team) {
  return groupSchedule.filter((match) => {
    if (playedScheduleKeys.has(scheduledMatchKey(match))) return false;

    const home = normalizeTeamKey(match.home);
    const away = normalizeTeamKey(match.away);
    return home === team || away === team;
  });
}

function getTeamRank(tableRows, team) {
  const index = tableRows.findIndex((row) => row.team === team);
  return index >= 0 ? index + 1 : null;
}

function buildGroupOutlook({ afterTable, groupSchedule, groupTeams, currentScheduleKey, playedScheduleKeys, homeKey, awayKey }) {
  if (!groupSchedule.length || !groupTeams.length) {
    return null;
  }

  const tableRows = getSortedTableRows(afterTable);
  const byTeam = {};

  for (const team of groupTeams) {
    const row = cloneStanding(afterTable.get(team) || emptyStanding());
    const remainingMatches = getRemainingMatchesForTeam(groupSchedule, playedScheduleKeys, team);

    byTeam[team] = {
      ...row,
      rank: getTeamRank(tableRows, team),
      remainingGames: remainingMatches.length,
      maxPoints: row.points + remainingMatches.length * 3,
    };
  }

  const secondPlacePoints = Number(tableRows[1]?.points || 0);
  const currentIndex = groupSchedule.findIndex((match) => scheduledMatchKey(match) === currentScheduleKey);
  const currentMatch = currentIndex >= 0 ? groupSchedule[currentIndex] : null;
  const remainingSameMatchdayMatches =
    currentMatch
      ? groupSchedule.filter(
          (match) => String(match.matchday) === String(currentMatch.matchday) && !playedScheduleKeys.has(scheduledMatchKey(match)),
        )
      : [];

  for (const team of groupTeams) {
    const outlook = byTeam[team];
    const others = groupTeams.filter((other) => other !== team).map((other) => byTeam[other]);
    const teamsAbleToTieOrPass = others.filter((other) => other.maxPoints >= outlook.points).length;

    outlook.guaranteedFirst = outlook.remainingGames >= 0 && others.every((other) => other.maxPoints < outlook.points);
    outlook.guaranteedTopTwo = teamsAbleToTieOrPass <= 1;
    outlook.oneStepFromTopTwo =
      !outlook.guaranteedTopTwo && outlook.remainingGames > 0 && outlook.played >= 2 && outlook.points >= 6;
    outlook.noLongerControlsTopTwo =
      outlook.remainingGames > 0 && outlook.rank > 2 && outlook.maxPoints <= secondPlacePoints;
    outlook.eliminatedTopTwo = outlook.remainingGames === 0 && outlook.rank > 2;
  }

  const aliveForTopTwo = groupTeams.filter((team) => byTeam[team].maxPoints >= secondPlacePoints).length;
  const spread = Number(tableRows[0]?.points || 0) - Number(tableRows[tableRows.length - 1]?.points || 0);

  return {
    tableAfter: tableRows,
    teams: byTeam,
    home: byTeam[homeKey] || null,
    away: byTeam[awayKey] || null,
    openForFinalDay:
      String(currentMatch?.matchday || "") === "2" &&
      remainingSameMatchdayMatches.length === 0 &&
      aliveForTopTwo >= 3 &&
      spread <= 4,
  };
}

module.exports = {
  buildPriorGroupContext,
  buildDayContext,
  buildTeamFormContext,
  buildTournamentContext,
};
