const fs = require("fs");
const path = require("path");
const { normalizeTeamName } = require("./caption");
const { normalizeTeamKey } = require("../lib/team-metadata");

const FACTS_PATH = path.join(__dirname, "..", "data", "world-cup-team-facts.json");

function readFacts() {
  try {
    return JSON.parse(fs.readFileSync(FACTS_PATH, "utf8"));
  } catch (error) {
    return {};
  }
}

const TEAM_FACTS = readFacts();

function getTeamFacts(name) {
  return TEAM_FACTS[normalizeTeamKey(name)] || {};
}

function getInternalContext(matchData) {
  const facts = buildFactCandidates(matchData);
  const headline = pickHeadline(facts, matchData);

  return {
    source: facts[0]?.source || "internal-editorial-engine",
    headline,
    facts,
  };
}

function buildFactCandidates(matchData) {
  const home = matchData.teams?.home || {};
  const away = matchData.teams?.away || {};
  const homeScore = Number(home.score || 0);
  const awayScore = Number(away.score || 0);
  const totalGoals = homeScore + awayScore;
  const margin = Math.abs(homeScore - awayScore);
  const group = matchData.competition?.groupLetter;
  const matchday = Number(matchData.competition?.matchdayNumber || 0);
  const homeName = normalizeTeamName(home.name);
  const awayName = normalizeTeamName(away.name);
  const homeFacts = getTeamFacts(home.providerName || home.name);
  const awayFacts = getTeamFacts(away.providerName || away.name);
  const prior = matchData.context?.priorGroup || {};
  const homePrior = prior.homePrior || {};
  const awayPrior = prior.awayPrior || {};
  const stats = extractStatHighlights(matchData.context?.matchStats, homeName, awayName);
  const scoring = getScoringStory(matchData);
  const candidates = [];

  const isDraw = homeScore === awayScore;
  const winner = homeScore > awayScore ? home : away;
  const loser = homeScore > awayScore ? away : home;
  const winnerScore = Math.max(homeScore, awayScore);
  const loserScore = Math.min(homeScore, awayScore);
  const winnerName = normalizeTeamName(winner.name);
  const loserName = normalizeTeamName(loser.name);
  const winnerFacts = homeScore > awayScore ? homeFacts : awayFacts;
  const winnerPrior = homeScore > awayScore ? homePrior : awayPrior;

  pushFirstGoalCandidate(candidates, homeName, homeScore, homeFacts, homePrior);
  pushFirstGoalCandidate(candidates, awayName, awayScore, awayFacts, awayPrior);

  if (!isDraw) {
    if (Number(winnerPrior.played || 0) > 0 && Number(winnerPrior.wins || 0) === 0) {
      candidates.push({
        priority: 95,
        source: "bsd-tournament-results",
        text: `${winnerName} consigue su primera victoria de este Mundial y toma aire en la fase de grupos.`,
      });
    }

    if (isHistoricFirstWin(winnerFacts, winnerPrior)) {
      candidates.push({
        priority: 94,
        source: "curated-world-cup-team-facts",
        text: `${winnerName} firma una noche histórica: su primera victoria mundialista llega con un ${winnerScore}-${loserScore} ante ${loserName}.`,
      });
    }

    if (isHistoricFirstGoal(winnerFacts, winnerPrior) && winnerScore > 0) {
      candidates.push({
        priority: 89,
        source: "curated-world-cup-team-facts",
        text: `${winnerName} rompe una barrera mundialista: marca por primera vez en el torneo y lo convierte en triunfo.`,
      });
    }

    if (scoring.comebackWinner === normalizeTeamKey(winner.providerName || winner.name)) {
      candidates.push({
        priority: 88,
        source: "bsd-incidents",
        text: `${winnerName} transforma el golpe inicial en una remontada de carácter ante ${loserName}.`,
      });
    }

    if (margin >= 4) {
      candidates.push({
        priority: 84,
        source: "bsd-scoreline",
        text: `${winnerName} manda un mensaje fuerte: goleada de ${winnerScore}-${loserScore} y diferencia de peso para la tabla.`,
      });
    } else if (winnerScore >= 3) {
      candidates.push({
        priority: 78,
        source: "bsd-scoreline",
        text: `${winnerName} encuentra pegada en el momento justo y sale con tres puntos de alto valor ante ${loserName}.`,
      });
    } else if (margin === 1) {
      candidates.push({
        priority: 72,
        source: "bsd-scoreline",
        text: `${winnerName} gana un partido de detalles ante ${loserName} y suma tres puntos que pueden pesar mucho.`,
      });
    }

    if (loserScore === 0) {
      candidates.push({
        priority: 70,
        source: "bsd-scoreline",
        text: `${winnerName} combina eficacia y portería en cero para fortalecer su arranque mundialista.`,
      });
    }

    if (Number(winnerPrior.played || 0) > 0 && Number(winnerPrior.losses || 0) === 0) {
      candidates.push({
        priority: 68,
        source: "bsd-tournament-results",
        text: `${winnerName} mantiene el invicto y refuerza su posición en la pelea del grupo.`,
      });
    }
  } else {
    if (totalGoals >= 4) {
      candidates.push({
        priority: 82,
        source: "bsd-scoreline",
        text: `${homeName} y ${awayName} entregan un empate de alto voltaje: goles, respuesta y reparto de puntos.`,
      });
    } else if (totalGoals === 0) {
      candidates.push({
        priority: 72,
        source: "bsd-scoreline",
        text: `${homeName} y ${awayName} se neutralizan en un empate cerrado que deja todo abierto.`,
      });
    } else {
      candidates.push({
        priority: 70,
        source: "bsd-scoreline",
        text: `${homeName} y ${awayName} reparten puntos en un duelo que aprieta el margen de error.`,
      });
    }
  }

  for (const highlight of stats) {
    candidates.push(highlight);
  }

  if (matchday === 1 && !isDraw) {
    candidates.push({
      priority: 58,
      source: "bsd-schedule",
      text: `${winnerName} abre su camino mundialista con una victoria que marca tono desde la primera jornada.`,
    });
  } else if (matchday === 2 && !isDraw) {
    candidates.push({
      priority: 55,
      source: "bsd-schedule",
      text: `${winnerName} da un paso importante en la segunda jornada y mete presión en su grupo.`,
    });
  } else if (matchday === 3 && !isDraw) {
    candidates.push({
      priority: 55,
      source: "bsd-schedule",
      text: `${winnerName} responde en el cierre de la fase de grupos con una victoria de máximo valor competitivo.`,
    });
  }

  if (group && candidates.length < 3) {
    candidates.push({
      priority: 40,
      source: "bsd-schedule",
      text: isDraw
        ? `${homeName} y ${awayName} dejan el Grupo ${group} más apretado tras el empate.`
        : `${winnerName} suma tres puntos que mueven la conversación del Grupo ${group}.`,
    });
  }

  candidates.push({
    priority: 10,
    source: "internal-fallback",
    text: isDraw
      ? `${homeName} y ${awayName} cierran un partido competido con reparto de puntos.`
      : `${winnerName} supera a ${loserName} y suma una victoria importante en su Mundial.`,
  });

  return candidates
    .filter((candidate) => candidate.text)
    .sort((a, b) => b.priority - a.priority);
}

function pickHeadline(candidates, matchData) {
  const topPriority = candidates[0]?.priority || 0;
  const topBand = candidates.filter((candidate) => candidate.priority >= topPriority - 5);
  const seed = Number(matchData.source?.eventId || 0);
  return (topBand[Math.abs(seed) % topBand.length] || candidates[0] || {}).text || "";
}

function isHistoricFirstWin(facts, prior) {
  return facts.firstWorldCupAppearance === 2026 && Number(facts.worldCupWinsBefore2026 || 0) === 0 && Number(prior.wins || 0) === 0;
}

function isHistoricFirstGoal(facts, prior) {
  return facts.firstWorldCupAppearance === 2026 && Number(facts.worldCupGoalsBefore2026 || 0) === 0 && Number(prior.goalsFor || 0) === 0;
}

function pushFirstGoalCandidate(candidates, teamName, score, facts, prior) {
  if (score <= 0 || !isHistoricFirstGoal(facts, prior)) return;

  candidates.push({
    priority: 87,
    source: "curated-world-cup-team-facts",
    text: `${teamName} ya tiene su primer gol en la historia mundialista, una postal que queda por encima del marcador.`,
  });
}

function getScoringStory(matchData) {
  const events = [
    ...(matchData.events?.homeScorers || []).flatMap((event) => expandScorerEvent(event, "home")),
    ...(matchData.events?.awayScorers || []).flatMap((event) => expandScorerEvent(event, "away")),
  ].sort((a, b) => a.minuteValue - b.minuteValue);

  if (!events.length) return {};

  const firstSide = events[0].side;
  const homeScore = Number(matchData.teams?.home?.score || 0);
  const awayScore = Number(matchData.teams?.away?.score || 0);

  if (homeScore > awayScore && firstSide === "away") {
    return { comebackWinner: normalizeTeamKey(matchData.teams?.home?.providerName || matchData.teams?.home?.name) };
  }

  if (awayScore > homeScore && firstSide === "home") {
    return { comebackWinner: normalizeTeamKey(matchData.teams?.away?.providerName || matchData.teams?.away?.name) };
  }

  return {};
}

function expandScorerEvent(event, side) {
  const minutes = Array.isArray(event.minutes) && event.minutes.length ? event.minutes : [event.minute];
  return minutes
    .filter(Boolean)
    .map((minute) => ({
      side,
      minuteValue: parseInt(String(minute).replace(/'.*/, ""), 10) || 0,
    }));
}

function extractStatHighlights(rawStats, homeName, awayName) {
  const statRows = flattenStats(rawStats);
  const highlights = [];
  const possession = findPair(statRows, ["possession", "ball possession", "posesion", "posesión"]);
  const shots = findPair(statRows, ["total shots", "shots", "disparos", "remates"]);
  const shotsOnTarget = findPair(statRows, ["shots on target", "on target", "tiros a puerta", "remates a puerta"]);
  const xg = findPair(statRows, ["expected goals", "xg"]);

  if (possession) {
    const dominant = getDominant(possession, 65);
    if (dominant) {
      highlights.push({
        priority: 76,
        source: "bsd-match-stats",
        text: `${dominant.side === "home" ? homeName : awayName} llevó el peso del juego con ${dominant.value}% de posesión, un dato que explica buena parte del pulso del partido.`,
      });
    }
  }

  if (shots) {
    const dominant = getDominant(shots, 18);
    if (dominant) {
      highlights.push({
        priority: 74,
        source: "bsd-match-stats",
        text: `${dominant.side === "home" ? homeName : awayName} sostuvo la presión con ${dominant.value} disparos, una producción ofensiva que marcó el ritmo del duelo.`,
      });
    }
  }

  if (shotsOnTarget) {
    const dominant = getDominant(shotsOnTarget, 8);
    if (dominant) {
      highlights.push({
        priority: 73,
        source: "bsd-match-stats",
        text: `${dominant.side === "home" ? homeName : awayName} exigió constantemente al arco rival con ${dominant.value} remates a puerta.`,
      });
    }
  }

  if (xg) {
    const dominant = getDominant(xg, 2.5);
    if (dominant) {
      highlights.push({
        priority: 72,
        source: "bsd-match-stats",
        text: `${dominant.side === "home" ? homeName : awayName} generó ocasiones de alto valor y cerró con ${dominant.value} xG.`,
      });
    }
  }

  return highlights;
}

function flattenStats(value, rows = []) {
  if (!value) return rows;

  if (Array.isArray(value)) {
    for (const item of value) flattenStats(item, rows);
    return rows;
  }

  if (typeof value !== "object") return rows;

  const name = value.name || value.type || value.key || value.stat || value.label || value.title;
  const home = value.home ?? value.home_value ?? value.homeValue ?? value.home_team ?? value.homeTeam;
  const away = value.away ?? value.away_value ?? value.awayValue ?? value.away_team ?? value.awayTeam;

  if (name && home !== undefined && away !== undefined) {
    rows.push({ name: String(name).toLowerCase(), home: toNumber(home), away: toNumber(away) });
  }

  for (const nested of Object.values(value)) {
    if (nested && typeof nested === "object") flattenStats(nested, rows);
  }

  return rows;
}

function findPair(rows, aliases) {
  return rows.find((row) => aliases.some((alias) => row.name.includes(alias)) && row.home != null && row.away != null);
}

function toNumber(value) {
  if (value === null || value === undefined) return null;
  const parsed = Number(String(value).replace("%", "").trim());
  return Number.isFinite(parsed) ? parsed : null;
}

function getDominant(pair, floor) {
  if (pair.home >= floor && pair.home > pair.away) return { side: "home", value: pair.home };
  if (pair.away >= floor && pair.away > pair.home) return { side: "away", value: pair.away };
  return null;
}

module.exports = {
  getInternalContext,
};
