const { getAllTeamMetadata, getDisplayTeamName, normalizeTeamKey } = require("../lib/team-metadata");

const BSD_API_BASE = "https://sports.bzzoiro.com/api/v2";
const DEFAULT_HISTORY_FROM = "1990-01-01";
const DEFAULT_TIMEOUT_MS = 7000;
const DEFAULT_LIMIT = 10;
const MAX_LIMIT = 20;

async function buildHistoricalVoiceContext(question, options = {}) {
  const normalizedQuestion = normalize(question);
  if (!isHeadToHeadQuestion(normalizedQuestion)) return null;

  const teams = detectTeams(normalizedQuestion);
  const requestedMatchCount = getRequestedMatchLimit(normalizedQuestion);

  if (teams.length < 2) {
    return {
      intent: "head_to_head_history",
      available: false,
      provider: "bsd-api",
      reason: "No pude identificar dos selecciones en la pregunta.",
      requested_match_count: requestedMatchCount,
    };
  }

  const token = getBsdApiToken();
  if (!token) {
    return {
      intent: "head_to_head_history",
      available: false,
      provider: "bsd-api",
      reason: "BSD_API_TOKEN is missing.",
      teams: teams.map((team) => team.displayName),
      requested_match_count: requestedMatchCount,
    };
  }

  try {
    return await fetchHeadToHeadFromBsd(teams[0], teams[1], {
      fetchImpl: options.fetchImpl || globalThis.fetch,
      token,
      requestedMatchCount,
      timeoutMs: options.timeoutMs,
    });
  } catch (error) {
    return {
      intent: "head_to_head_history",
      available: false,
      provider: "bsd-api",
      reason: cleanErrorMessage(error),
      teams: teams.slice(0, 2).map((team) => team.displayName),
      requested_match_count: requestedMatchCount,
    };
  }
}

function answerHistoricalVoiceContext(context) {
  if (!context?.available) {
    const teams = (context?.teams || []).join(" contra ");
    const target = teams ? ` de ${teams}` : "";
    const missingToken = String(context?.reason || "").includes("BSD_API_TOKEN");
    return {
      intent: "head_to_head_history",
      answer: missingToken
        ? `No pude consultar el historial${target} porque en este entorno no esta configurado el token de BSD. La logica ya consulta el API; falta esa variable para probarlo en vivo.`
        : `Con la API de futbol actual no pude obtener el historial${target}. No lo voy a inventar: BSD no devolvio esos eventos historicos y haria falta conectar una fuente historica automatica.`,
      confidence: 0.65,
      source: "bsd-api",
      data: context || null,
    };
  }

  const [teamA, teamB] = context.teams;
  const statsA = context.summary.by_team[teamA];
  const statsB = context.summary.by_team[teamB];
  const latest = context.matches[0];
  const drawText = context.summary.draws === 1 ? "1 empate" : `${context.summary.draws} empates`;
  const scopeText =
    context.matches.length < context.requested_match_count
      ? `BSD no devolvio los ${context.requested_match_count} cruces pedidos; solo encontre ${context.matches.length}`
      : `En los ultimos ${context.requested_match_count} cruces que devolvio BSD`;

  return {
    intent: "head_to_head_history",
    answer: `${scopeText}, ${teamA} suma ${statsA.wins} victorias, ${teamB} ${statsB.wins} y hay ${drawText}. El mas reciente fue ${latest.score}.`,
    confidence: 0.92,
    source: "bsd-api",
    data: context,
  };
}

async function fetchHeadToHeadFromBsd(teamA, teamB, options) {
  const fetchImpl = options.fetchImpl;
  if (typeof fetchImpl !== "function") {
    throw new Error("fetch is not available in this Node runtime.");
  }

  const [bsdTeamA, bsdTeamB] = await Promise.all([
    resolveBsdTeam(teamA, options),
    resolveBsdTeam(teamB, options),
  ]);
  const resolvedTeamA = { ...teamA, bsdTeamId: bsdTeamA?.id || null };
  const resolvedTeamB = { ...teamB, bsdTeamId: bsdTeamB?.id || null };

  const events = await fetchBsdEventsForTeam(resolvedTeamA, options);
  const matches = events
    .filter((event) => eventHasTeam(event, resolvedTeamA) && eventHasTeam(event, resolvedTeamB))
    .sort((a, b) => Date.parse(getEventDate(b) || 0) - Date.parse(getEventDate(a) || 0))
    .slice(0, options.requestedMatchCount)
    .map(toPublicMatch);

  if (!matches.length) {
    return {
      intent: "head_to_head_history",
      available: false,
      provider: "bsd-api",
      reason: "BSD did not return indexed historical events for this pair.",
      teams: [teamA.displayName, teamB.displayName],
      requested_match_count: options.requestedMatchCount,
      query: {
        team_id: resolvedTeamA.bsdTeamId,
        team_name: resolvedTeamA.searchName,
        date_from: getHistoryDateFrom(),
        date_to: getHistoryDateTo(),
      },
    };
  }

  const summary = summarizeMatches(matches, teamA.displayName, teamB.displayName);
  const h2hAggregate = await fetchOptionalBsdH2h(matches[0].eventId, options);

  return {
    intent: "head_to_head_history",
    available: true,
    provider: "bsd-api",
    source_name: "BSD Football API",
    source_url: "https://sports.bzzoiro.com/docs/football/",
    scope: "Eventos historicos devueltos por /api/v2/events/ filtrados por selecciones.",
    teams: [teamA.displayName, teamB.displayName],
    requested_match_count: options.requestedMatchCount,
    coverage: {
      requested: options.requestedMatchCount,
      returned: matches.length,
      complete: matches.length >= options.requestedMatchCount,
    },
    summary,
    matches,
    h2h_aggregate: h2hAggregate,
  };
}

async function fetchBsdEventsForTeam(team, options) {
  const limit = Number(process.env.VOICE_H2H_PAGE_SIZE || 200);
  const maxPages = Number(process.env.VOICE_H2H_MAX_PAGES || 6);
  const all = [];

  for (let page = 0; page < maxPages; page += 1) {
    const query = new URLSearchParams({
      date_from: getHistoryDateFrom(),
      date_to: getHistoryDateTo(),
      limit: String(limit),
      offset: String(page * limit),
    });
    if (team.bsdTeamId) {
      query.set("team_id", String(team.bsdTeamId));
    } else {
      query.set("team_name", team.searchName);
    }

    const payload = await bsdRequestJson(`/events/?${query.toString()}`, options);
    const events = extractEvents(payload);
    all.push(...events);

    if (events.length < limit) break;
  }

  return dedupeEvents(all);
}

async function resolveBsdTeam(team, options) {
  const query = new URLSearchParams({
    name: team.searchName,
    limit: "20",
  });
  const payload = await bsdRequestJson(`/teams/?${query.toString()}`, options);
  const teams = extractTeams(payload);
  const exact = teams.find((candidate) => teamNameMatches(candidate.name, team));
  return exact || teams[0] || null;
}

async function fetchOptionalBsdH2h(eventId, options) {
  if (!eventId) return null;
  try {
    const payload = await bsdRequestJson(`/events/${eventId}/h2h/`, {
      ...options,
      timeoutMs: Math.min(Number(options.timeoutMs || DEFAULT_TIMEOUT_MS), 2500),
    });
    return hasUsefulPayload(payload) ? payload : null;
  } catch (error) {
    return null;
  }
}

async function bsdRequestJson(endpoint, options) {
  const controller = new AbortController();
  const timeout = setTimeout(
    () => controller.abort(),
    Math.max(1000, Number(options.timeoutMs || DEFAULT_TIMEOUT_MS)),
  );

  try {
    const result = await options.fetchImpl(`${BSD_API_BASE}${endpoint}`, {
      signal: controller.signal,
      headers: {
        Accept: "application/json",
        Authorization: `Token ${options.token}`,
      },
    });

    if (!result.ok) {
      const body = await safeResponseText(result);
      throw new Error(`BSD API ${result.status}: ${body.slice(0, 160)}`);
    }

    return await result.json();
  } finally {
    clearTimeout(timeout);
  }
}

function isHeadToHeadQuestion(text) {
  return /(historial|enfrentamientos|partidos|duelos|cruces|cara a cara|head to head|h2h)/.test(text);
}

function detectTeams(normalizedQuestion) {
  const found = [];
  for (const team of getAllTeamMetadata()) {
    const aliases = [team.displayName, ...team.keys];
    const matchIndex = getAliasMatchIndex(normalizedQuestion, aliases);
    if (matchIndex >= 0) {
      found.push({
        displayName: team.displayName,
        searchName: toProviderSearchName(team),
        aliases,
        matchIndex,
      });
    }
  }
  return found.sort((a, b) => a.matchIndex - b.matchIndex);
}

function getAliasMatchIndex(text, aliases) {
  let bestIndex = -1;
  for (const alias of aliases) {
    const normalizedAlias = normalizeTeamKey(alias);
    if (!normalizedAlias) continue;
    const pattern = new RegExp(`(^|\\s)${escapeRegExp(normalizedAlias)}(\\s|$)`);
    const match = text.match(pattern);
    if (!match) continue;
    const index = Math.max(0, match.index + (match[1] ? match[1].length : 0));
    if (bestIndex === -1 || index < bestIndex) bestIndex = index;
  }
  return bestIndex;
}

function toProviderSearchName(team) {
  const preferred = team.keys.find((key) => /^[a-z0-9 &.'-]+$/i.test(key)) || team.displayName;
  if (preferred.toLowerCase() === "usa") return "USA";
  return preferred
    .split(/\s+/)
    .map((part) => (part.length <= 2 ? part.toUpperCase() : `${part[0].toUpperCase()}${part.slice(1)}`))
    .join(" ");
}

function eventHasTeam(event, team) {
  if (team.bsdTeamId) {
    const homeId = Number(event.home_team_id ?? event.homeTeamId ?? event.home?.id);
    const awayId = Number(event.away_team_id ?? event.awayTeamId ?? event.away?.id);
    if (homeId === Number(team.bsdTeamId) || awayId === Number(team.bsdTeamId)) return true;
  }

  const home = normalizeTeamKey(event.home_team || event.homeTeam || event.home?.name || "");
  const away = normalizeTeamKey(event.away_team || event.awayTeam || event.away?.name || "");
  return team.aliases.some((alias) => {
    const normalizedAlias = normalizeTeamKey(alias);
    return home.includes(normalizedAlias) || away.includes(normalizedAlias);
  });
}

function teamNameMatches(value, team) {
  const name = normalizeTeamKey(value);
  return team.aliases.some((alias) => normalizeTeamKey(alias) === name);
}

function toPublicMatch(event) {
  const home = getDisplayTeamName(event.home_team || event.homeTeam || event.home?.name || "");
  const away = getDisplayTeamName(event.away_team || event.awayTeam || event.away?.name || "");
  const homeScore = Number(event.home_score ?? event.homeScore ?? event.score?.home ?? 0);
  const awayScore = Number(event.away_score ?? event.awayScore ?? event.score?.away ?? 0);

  return {
    eventId: event.id,
    date: getEventDate(event),
    home,
    away,
    homeScore,
    awayScore,
    score: `${home} ${homeScore}-${awayScore} ${away}`,
    competition: event.league_name || event.competition_name || event.round_name || event.group_name || "",
    status: event.status || "",
  };
}

function summarizeMatches(matches, teamA, teamB) {
  const byTeam = {
    [teamA]: { wins: 0, draws: 0, losses: 0, goals_for: 0, goals_against: 0 },
    [teamB]: { wins: 0, draws: 0, losses: 0, goals_for: 0, goals_against: 0 },
  };
  let draws = 0;

  for (const match of matches) {
    const homeStats = byTeam[match.home];
    const awayStats = byTeam[match.away];
    if (!homeStats || !awayStats) continue;

    homeStats.goals_for += match.homeScore;
    homeStats.goals_against += match.awayScore;
    awayStats.goals_for += match.awayScore;
    awayStats.goals_against += match.homeScore;

    if (match.homeScore === match.awayScore) {
      draws += 1;
      homeStats.draws += 1;
      awayStats.draws += 1;
    } else if (match.homeScore > match.awayScore) {
      homeStats.wins += 1;
      awayStats.losses += 1;
    } else {
      awayStats.wins += 1;
      homeStats.losses += 1;
    }
  }

  return {
    matches_count: matches.length,
    draws,
    by_team: byTeam,
  };
}

function getRequestedMatchLimit(text) {
  const digitMatch = text.match(/(?:ultimos?|ultimas?)\s+(\d{1,2})/);
  if (digitMatch) return clampLimit(Number(digitMatch[1]));
  return DEFAULT_LIMIT;
}

function getHistoryDateFrom() {
  return process.env.VOICE_H2H_DATE_FROM || DEFAULT_HISTORY_FROM;
}

function getHistoryDateTo() {
  return process.env.VOICE_H2H_DATE_TO || new Date().toISOString().slice(0, 10);
}

function getEventDate(event) {
  return event.event_date || event.start_time || event.date || event.kickoff || null;
}

function extractEvents(payload) {
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload?.results)) return payload.results;
  if (Array.isArray(payload?.data)) return payload.data;
  if (Array.isArray(payload?.events)) return payload.events;
  return [];
}

function extractTeams(payload) {
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload?.results)) return payload.results;
  if (Array.isArray(payload?.data)) return payload.data;
  if (Array.isArray(payload?.teams)) return payload.teams;
  return [];
}

function dedupeEvents(events) {
  const seen = new Set();
  return events.filter((event) => {
    const key = event.id || `${event.home_team}-${event.away_team}-${getEventDate(event)}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function hasUsefulPayload(payload) {
  if (!payload) return false;
  if (Array.isArray(payload)) return payload.length > 0;
  if (typeof payload !== "object") return false;
  return Object.values(payload).some((value) => value !== null && value !== undefined && value !== "");
}

function clampLimit(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return DEFAULT_LIMIT;
  return Math.max(1, Math.min(MAX_LIMIT, Math.round(number)));
}

function getBsdApiToken() {
  return process.env.BSD_API_TOKEN || process.env.BZZOIRO_API_TOKEN || "";
}

function normalize(value) {
  return normalizeTeamKey(value);
}

function cleanErrorMessage(error) {
  return String(error?.message || error || "Unknown API error").slice(0, 220);
}

async function safeResponseText(response) {
  try {
    return await response.text();
  } catch (error) {
    return "";
  }
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

module.exports = {
  answerHistoricalVoiceContext,
  buildHistoricalVoiceContext,
};
