const { getDisplayTeamName } = require("../lib/team-metadata");

const BSD_API_BASE = "https://sports.bzzoiro.com/api/v2";
const WORLD_CUP = {
  leagueId: 27,
  seasonId: 188,
  name: "World Cup 2026",
};
const DEFAULT_TIMEOUT_MS = 9000;

async function buildWorldCupVoiceContext(question, options = {}) {
  const text = normalize(question);
  const analysis = options.analysis || {};
  const queryType = detectWorldCupQueryType(text);
  if (!queryType) return null;

  const token = getBsdApiToken();
  if (!token) return unavailable("BSD_API_TOKEN is missing.");

  const fetchImpl = options.fetchImpl || globalThis.fetch;
  if (typeof fetchImpl !== "function") return unavailable("fetch is not available in this Node runtime.");

  try {
    const teams = findMentionedTeams(text, analysis);
    const relevantEvent = findRelevantEvent({ text, queryType, teams, analysis });
    const wantsUpcoming = queryType === "prediction" || queryType === "odds";

    const jobs = {
      predictions:
        queryType === "prediction" || queryType === "odds"
          ? fetchPredictions({ fetchImpl, token, timeoutMs: options.timeoutMs })
          : Promise.resolve(null),
      bestOdds:
        queryType === "odds" || queryType === "prediction"
          ? fetchBestOdds({ fetchImpl, token, timeoutMs: options.timeoutMs })
          : Promise.resolve(null),
      event:
        relevantEvent?.id && queryType !== "tournament_prediction"
          ? fetchEvent(relevantEvent.id, { fetchImpl, token, timeoutMs: options.timeoutMs })
          : Promise.resolve(null),
      stats:
        relevantEvent?.id && ["match_stats", "shotmap", "summary", "incidents"].includes(queryType)
          ? fetchOptional(`/events/${relevantEvent.id}/stats/`, { fetchImpl, token, timeoutMs: options.timeoutMs })
          : Promise.resolve(null),
      incidents:
        relevantEvent?.id && ["incidents", "summary", "match_stats"].includes(queryType)
          ? fetchOptional(`/events/${relevantEvent.id}/incidents/`, { fetchImpl, token, timeoutMs: options.timeoutMs })
          : Promise.resolve(null),
      metadata:
        relevantEvent?.id
          ? fetchOptional(`/events/${relevantEvent.id}/metadata/`, { fetchImpl, token, timeoutMs: options.timeoutMs })
          : Promise.resolve(null),
      h2h:
        relevantEvent?.id
          ? fetchOptional(`/events/${relevantEvent.id}/h2h/`, { fetchImpl, token, timeoutMs: options.timeoutMs })
          : Promise.resolve(null),
      oddsComparison:
        relevantEvent?.id && queryType === "odds"
          ? fetchOptional(`/events/${relevantEvent.id}/odds/comparison/`, { fetchImpl, token, timeoutMs: options.timeoutMs })
          : Promise.resolve(null),
      upcoming: wantsUpcoming
        ? fetchEvents(
            {
              date_from: today(),
              date_to: addDays(today(), Number(process.env.VOICE_WC_LOOKAHEAD_DAYS || 14)),
              limit: 30,
            },
            { fetchImpl, token, timeoutMs: options.timeoutMs },
          )
        : Promise.resolve(null),
    };

    const result = await resolveObject(jobs);
    const predictions = extractPredictions(result.predictions);
    const bestOdds = extractBestOdds(result.bestOdds);
    const upcomingEvents = extractEvents(result.upcoming);
    const inferredEvent =
      relevantEvent ||
      findPredictionEventForTeams(predictions, teams) ||
      findEventForTeams(upcomingEvents, teams) ||
      null;
    const eventId = inferredEvent?.id || null;
    const eventPrediction = eventId ? predictions.find((prediction) => prediction.event?.id === eventId) : null;
    const eventBestOdds = eventId ? bestOdds.filter((odds) => odds.event_id === eventId).slice(0, 8) : [];

    return {
      intent: queryType,
      available: true,
      provider: "bsd-api",
      source_name: "BSD Football API",
      source_url: "https://sports.bzzoiro.com/docs/football/",
      competition: WORLD_CUP,
      question_scope: {
        query_type: queryType,
        teams,
        relevant_event_id: eventId,
        relevant_event_reason: inferredEvent?.reason || relevantEvent?.reason || null,
      },
      event: toPublicEvent(result.event || inferredEvent),
      match_prediction: toPublicPrediction(eventPrediction),
      upcoming_predictions: predictions.slice(0, 12).map(toPublicPrediction),
      best_odds: eventBestOdds.length ? eventBestOdds.map(toPublicOdds) : bestOdds.slice(0, 12).map(toPublicOdds),
      odds_comparison: summarizeOddsComparison(result.oddsComparison),
      form_candidates: buildFormCandidates(analysis),
      stats: summarizeStats(result.stats, result.event || relevantEvent),
      shotmap: summarizeShotmap(result.stats, result.event || relevantEvent),
      incidents: summarizeIncidents(result.incidents, result.event || relevantEvent),
      metadata: summarizeMetadata(result.metadata),
      h2h: summarizeH2h(result.h2h),
      upcoming_events: upcomingEvents.slice(0, 12).map(toPublicEvent),
      notes: buildCoverageNotes({ queryType, relevantEvent: inferredEvent, eventPrediction, stats: result.stats }),
    };
  } catch (error) {
    return unavailable(cleanErrorMessage(error));
  }
}

function answerWorldCupVoiceContext(context) {
  if (!context?.available) {
    return response(`No pude consultar la capa avanzada de BSD ahora mismo: ${context?.reason || "sin detalle"}.`, context, 0.45);
  }

  if (context.intent === "tournament_prediction") {
    const form = context.form_candidates || [];
    if (form.length) {
      const top = form.slice(0, 3).map((team) => {
        const extra = team.clean_sheets ? `, ${team.clean_sheets} arcos en cero` : "";
        return `${team.team} (${team.points} pts, ${signedNumber(team.goal_difference)} DG${extra})`;
      });
      return response(
        `BSD no trae campeon absoluto, pero por forma de torneo los candidatos mas fuertes son ${joinSpanish(top)}. Para cruces concretos si hay predicciones partido por partido.`,
        context,
        0.82,
      );
    }

    const predictions = context.upcoming_predictions || [];
    const next = predictions.slice(0, 3).map((prediction) => {
      const favorite = favoriteFromPrediction(prediction);
      return favorite ? `${favorite.team} sobre ${favorite.opponent} (${favorite.probability}%)` : null;
    }).filter(Boolean);
    return response(
      next.length
        ? `No hay prediccion seria de campeon absoluto en BSD; si hay predicciones por partido. En los proximos cruces, el modelo marca como favoritos a ${joinSpanish(next)}.`
        : "BSD no trae una prediccion directa de campeon absoluto en este contexto; para eso uso forma del torneo y predicciones partido por partido.",
      context,
      0.74,
    );
  }

  if (context.intent === "prediction") {
    const prediction = context.match_prediction || context.upcoming_predictions?.[0];
    const favorite = favoriteFromPrediction(prediction);
    if (favorite) {
      return response(
        `${favorite.team} aparece como favorito ante ${favorite.opponent}: ${favorite.probability}% de probabilidad y marcador mas probable ${prediction.score?.most_likely || "sin marcador claro"}.`,
        context,
        0.82,
      );
    }
  }

  if (context.intent === "odds" && context.best_odds?.length) {
    const market = context.best_odds[0];
    const outcomes = (market.best_odds || []).map((odd) => `${odd.outcome_name}: ${odd.decimal_odds}`).slice(0, 3);
    return response(`La mejor linea 1X2 que encontre para ${market.home_team} vs ${market.away_team}: ${outcomes.join(", ")}.`, context, 0.78);
  }

  if ((context.intent === "match_stats" || context.intent === "shotmap") && context.stats) {
    const s = context.stats;
    return response(
      `${s.home.team} tuvo ${s.home.possession}% de posesion, ${s.home.total_shots} remates y ${s.home.expected_goals} xG; ${s.away.team} registro ${s.away.total_shots} remates y ${s.away.expected_goals} xG.`,
      context,
      0.86,
    );
  }

  if (context.intent === "incidents" && context.incidents?.key_events?.length) {
    return response(`Los eventos clave fueron: ${context.incidents.key_events.slice(0, 4).map(formatIncident).join("; ")}.`, context, 0.82);
  }

  return response("Ya puedo consultar la capa avanzada de BSD para Mundial: predicciones, odds, stats, shotmap, incidencias e historial del partido.", context, 0.7);
}

function detectWorldCupQueryType(text) {
  if (!/(mundial|world cup|copa|partido|juego|brasil|mexico|argentina|francia|alemania|espana|portugal|inglaterra|holanda|paises bajos|japon|paraguay|uruguay|colombia|croacia|marruecos|suiza|usa|estados unidos)/.test(text)) {
    return null;
  }
  if (/(quien|quienes).*(ganar|gana|campeon|favorit|candidat).*(mundial|copa|torneo)|quien va a ganar/.test(text)) return "tournament_prediction";
  if (/(predic|probabilidad|pronostico|favorit|marcador probable|quien gana)/.test(text)) return "prediction";
  if (/(odds|cuota|cuotas|apuesta|linea|momio|momios|bookmaker)/.test(text)) return "odds";
  if (/(shotmap|xg por minuto|xg|minuto|remates|tiros|posesion|estadistica|estadisticas|ataques peligrosos|dangerous|oportunidades|claras|big chances|corners)/.test(text)) return "match_stats";
  if (/(incidencia|incidencias|tarjeta|var|cambio|sustitucion|gol|goles|lesion|expuls)/.test(text)) return "incidents";
  if (/(resumen|que paso|como quedo|analisis).*(partido|juego|vs|contra)/.test(text)) return "summary";
  return null;
}

function findMentionedTeams(text, analysis) {
  const teams = collectTeams(analysis);
  return teams
    .filter((team) => team.aliases.some((alias) => alias && text.includes(alias)))
    .slice(0, 4)
    .map((team) => team.rawTeam);
}

function collectTeams(analysis) {
  const map = new Map();
  const add = (team) => {
    const rawTeam = String(team || "").trim();
    if (!rawTeam || map.has(rawTeam)) return;
    const display = getDisplayTeamName(rawTeam);
    map.set(rawTeam, {
      rawTeam,
      display,
      aliases: [...new Set([normalize(rawTeam), normalize(display), normalize(display).replace(/seleccion de /g, "")])],
    });
  };
  for (const event of analysis?.events || []) {
    add(event.home);
    add(event.away);
  }
  return [...map.values()];
}

function findRelevantEvent({ text, queryType, teams, analysis }) {
  const events = Array.isArray(analysis?.events) ? analysis.events : [];
  if (!events.length) return null;

  const matches = events.filter((event) => {
    if (!teams.length) return false;
    const sides = [event.home, event.away];
    return teams.every((team) => sides.includes(team));
  });

  if (matches.length) {
    const sorted = matches.slice().sort((a, b) => new Date(b.date || 0) - new Date(a.date || 0));
    return { ...sorted[0], reason: "matched mentioned teams in local World Cup cache" };
  }

  if (teams.length === 1) {
    const teamMatches = events
      .filter((event) => event.home === teams[0] || event.away === teams[0])
      .sort((a, b) => new Date(b.date || 0) - new Date(a.date || 0));
    if (teamMatches[0]) return { ...teamMatches[0], reason: "matched mentioned team in latest cached event" };
  }

  if (queryType === "match_stats" || queryType === "incidents") {
    const latest = events.slice().sort((a, b) => new Date(b.date || 0) - new Date(a.date || 0))[0];
    return latest ? { ...latest, reason: "latest finished World Cup event in local cache" } : null;
  }

  return null;
}

function findPredictionEventForTeams(predictions, teams) {
  const prediction = predictions.find((item) => eventMatchesTeams(item.event, teams));
  return prediction?.event ? { ...prediction.event, reason: "matched mentioned teams in BSD predictions" } : null;
}

function findEventForTeams(events, teams) {
  const event = events.find((item) => eventMatchesTeams(item, teams));
  return event ? { ...event, reason: "matched mentioned teams in BSD events" } : null;
}

function eventMatchesTeams(event, teams) {
  if (!event || !teams?.length) return false;
  const sides = [event.home_team || event.home, event.away_team || event.away].map((team) => String(team || ""));
  return teams.every((team) => sides.includes(team));
}

async function fetchPredictions(options) {
  return bsdRequestJson(`/predictions/?league_id=${WORLD_CUP.leagueId}&season_id=${WORLD_CUP.seasonId}&limit=50`, options);
}

async function fetchBestOdds(options) {
  return bsdRequestJson(`/odds/best/?league_id=${WORLD_CUP.leagueId}&season_id=${WORLD_CUP.seasonId}&limit=50`, options);
}

async function fetchEvent(eventId, options) {
  return bsdRequestJson(`/events/${eventId}/`, options);
}

async function fetchEvents(params, options) {
  const query = new URLSearchParams({
    league_id: String(WORLD_CUP.leagueId),
    season_id: String(WORLD_CUP.seasonId),
    limit: String(params.limit || 20),
  });
  for (const key of ["date_from", "date_to", "status", "team_id", "team_name"]) {
    if (params[key] !== undefined && params[key] !== null && params[key] !== "") query.set(key, String(params[key]));
  }
  return bsdRequestJson(`/events/?${query.toString()}`, options);
}

async function fetchOptional(endpoint, options) {
  try {
    return await bsdRequestJson(endpoint, options);
  } catch (error) {
    return { unavailable: true, reason: cleanErrorMessage(error) };
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

async function resolveObject(jobs) {
  const entries = await Promise.all(Object.entries(jobs).map(async ([key, promise]) => [key, await promise]));
  return Object.fromEntries(entries);
}

function summarizeStats(payload, event) {
  if (!payload?.stats?.home || !payload?.stats?.away) return null;
  return {
    event_id: payload.event_id || event?.id || null,
    score: event ? `${event.home_team || event.home} ${event.home_score ?? ""}-${event.away_score ?? ""} ${event.away_team || event.away}` : null,
    home: statSide(payload.stats.home, event?.home_team || event?.home || "Home"),
    away: statSide(payload.stats.away, event?.away_team || event?.away || "Away"),
  };
}

function statSide(stats, team) {
  return {
    team: getDisplayTeamName(team),
    possession: stats.ball_possession ?? null,
    total_shots: stats.total_shots ?? null,
    shots_on_target: stats.shots_on_target ?? null,
    expected_goals: round(stats.expected_goals ?? stats.xg?.actual),
    big_chances: stats.big_chances ?? null,
    corner_kicks: stats.corner_kicks ?? null,
    dangerous_attack: stats.dangerous_attack ?? null,
    dangerous_attack_pct: stats.dangerous_attack_pct ?? null,
    attack: stats.attack ?? null,
    xg_actual: round(stats.xg?.actual),
  };
}

function summarizeShotmap(payload, event) {
  const shots = Array.isArray(payload?.shotmap) ? payload.shotmap : [];
  if (!shots.length) return null;
  const homeTeam = getDisplayTeamName(event?.home_team || event?.home || "Local");
  const awayTeam = getDisplayTeamName(event?.away_team || event?.away || "Visitante");
  const bySide = summarizeShotsBySide(shots, homeTeam, awayTeam);
  const highest = shots
    .slice()
    .sort((a, b) => Number(b.xg || 0) - Number(a.xg || 0))
    .slice(0, 5)
    .map((shot) => ({
      team: shot.home ? homeTeam : awayTeam,
      minute: shot.min,
      xg: round(shot.xg),
      type: shot.type,
      body: shot.body,
      situation: shot.sit,
      player_id: shot.player_id,
    }));
  return { total_shots: shots.length, by_side: bySide, highest_xg_shots: highest };
}

function summarizeShotsBySide(shots, homeTeam, awayTeam) {
  const sides = {
    home: { team: homeTeam, shots: 0, goals: 0, xg: 0 },
    away: { team: awayTeam, shots: 0, goals: 0, xg: 0 },
  };
  for (const shot of shots) {
    const side = shot.home ? sides.home : sides.away;
    side.shots += 1;
    side.xg += Number(shot.xg || 0);
    if (shot.type === "goal") side.goals += 1;
  }
  sides.home.xg = round(sides.home.xg);
  sides.away.xg = round(sides.away.xg);
  return sides;
}

function summarizeIncidents(payload, event) {
  const incidents = Array.isArray(payload?.incidents) ? payload.incidents : [];
  if (!incidents.length) return null;
  return {
    event_id: payload.event_id || event?.id || null,
    key_events: incidents
      .filter((incident) => ["goal", "card", "varDecision"].includes(incident.type))
      .slice(0, 12)
      .map((incident) => ({
        type: incident.type,
        minute: incident.minute,
        added_time: incident.added_time ?? null,
        player: incident.player || incident.player_name || null,
        team: incident.is_home === true ? getDisplayTeamName(event?.home_team || event?.home || "Local") : incident.is_home === false ? getDisplayTeamName(event?.away_team || event?.away || "Visitante") : null,
        card_type: incident.card_type || null,
        decision: incident.decision || null,
        home_score: incident.home_score ?? null,
        away_score: incident.away_score ?? null,
      })),
  };
}

function summarizeMetadata(payload) {
  if (!payload || payload.unavailable) return null;
  return {
    funfacts: (payload.funfacts || []).map((fact) => fact.sentence).filter(Boolean).slice(0, 5),
    ai_preview: payload.ai_preview || null,
  };
}

function summarizeH2h(payload) {
  if (!payload || payload.unavailable) return null;
  return {
    total_matches: payload.total_matches,
    home_wins: payload.home_wins,
    draws: payload.draws,
    away_wins: payload.away_wins,
    avg_total_goals: payload.avg_total_goals,
    recent_matches: (payload.recent_matches || []).slice(0, 5),
  };
}

function summarizeOddsComparison(payload) {
  if (!payload || payload.unavailable) return null;
  return {
    event_id: payload.event_id,
    bookmakers_count: payload.bookmakers_count,
    markets: Object.fromEntries(
      Object.entries(payload.markets || {})
        .slice(0, 4)
        .map(([market, outcomes]) => [
          market,
          Object.values(outcomes || {})
            .slice(0, 6)
            .map((outcome) => ({
              outcome: outcome.outcome,
              outcome_name: outcome.outcome_name,
              best_odds: outcome.best_odds,
              best_bookmaker_name: outcome.best_bookmaker_name,
            })),
        ]),
    ),
  };
}

function extractEvents(payload) {
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload?.results)) return payload.results;
  if (Array.isArray(payload?.data)) return payload.data;
  if (Array.isArray(payload?.events)) return payload.events;
  return [];
}

function extractPredictions(payload) {
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload?.results)) return payload.results;
  return [];
}

function extractBestOdds(payload) {
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload?.results)) return payload.results;
  return [];
}

function toPublicEvent(event) {
  if (!event) return null;
  return {
    id: event.id,
    date: event.event_date || event.date || null,
    status: event.status || "finished",
    round: event.round_name || event.round || null,
    group: event.group_name || event.group || null,
    home_team: getDisplayTeamName(event.home_team || event.home),
    away_team: getDisplayTeamName(event.away_team || event.away),
    home_score: event.home_score ?? parseScore(event.score)?.home ?? null,
    away_score: event.away_score ?? parseScore(event.score)?.away ?? null,
  };
}

function toPublicPrediction(prediction) {
  if (!prediction) return null;
  return {
    id: prediction.id,
    created_at: prediction.created_at,
    event: toPublicEvent(prediction.event),
    match_result: prediction.markets?.match_result || null,
    expected_goals: prediction.markets?.expected_goals || null,
    over_under: prediction.markets?.over_under || null,
    btts: prediction.markets?.btts || null,
    score: prediction.markets?.score || null,
    recommendations: prediction.recommendations || null,
    model: prediction.model || null,
  };
}

function toPublicOdds(odds) {
  return {
    event_id: odds.event_id,
    event_date: odds.event_date,
    home_team: getDisplayTeamName(odds.home_team),
    away_team: getDisplayTeamName(odds.away_team),
    market: odds.market,
    best_odds: (odds.best_odds || []).slice(0, 6).map((item) => ({
      outcome: item.outcome,
      outcome_name: item.outcome_name,
      decimal_odds: item.decimal_odds,
      bookmaker_name: item.bookmaker_name,
      updated_at: item.updated_at,
    })),
  };
}

function favoriteFromPrediction(prediction) {
  if (!prediction?.event || !prediction?.match_result) return null;
  const result = prediction.match_result;
  const home = prediction.event.home_team;
  const away = prediction.event.away_team;
  if (result.predicted === "H") return { team: home, opponent: away, probability: result.prob_home };
  if (result.predicted === "A") return { team: away, opponent: home, probability: result.prob_away };
  return { team: "Empate", opponent: `${home} vs ${away}`, probability: result.prob_draw };
}

function buildCoverageNotes({ queryType, relevantEvent, eventPrediction, stats }) {
  const notes = [];
  if (queryType === "tournament_prediction") notes.push("BSD predictions are match-level, not a direct champion forecast.");
  if (!relevantEvent && ["match_stats", "incidents", "odds", "prediction"].includes(queryType)) notes.push("No specific event was identified from the question.");
  if (relevantEvent && queryType === "prediction" && !eventPrediction) notes.push("No prediction row matched the identified event in the current predictions page.");
  if (relevantEvent && queryType === "match_stats" && !stats?.stats) notes.push("Stats endpoint did not return match stats for the identified event.");
  return notes;
}

function buildFormCandidates(analysis) {
  const teams = new Map();
  for (const event of analysis?.events || []) {
    const score = parseScore(event.score);
    if (!score) continue;
    recordTeam(teams, event.home, score.home, score.away, event.group);
    recordTeam(teams, event.away, score.away, score.home, event.group);
  }

  return [...teams.values()]
    .map((team) => ({
      ...team,
      goal_difference: team.goals_for - team.goals_against,
      undefeated: team.losses === 0,
      form_score:
        team.points * 3 +
        (team.goals_for - team.goals_against) * 1.1 +
        team.goals_for * 0.55 +
        team.clean_sheets * 0.8 +
        (team.losses === 0 ? 1.4 : 0),
    }))
    .sort((a, b) => b.form_score - a.form_score || b.points - a.points || b.goal_difference - a.goal_difference)
    .slice(0, 10)
    .map((team) => ({
      team: team.team,
      rawTeam: team.rawTeam,
      group: team.group,
      played: team.played,
      points: team.points,
      wins: team.wins,
      draws: team.draws,
      losses: team.losses,
      goals_for: team.goals_for,
      goals_against: team.goals_against,
      goal_difference: team.goal_difference,
      clean_sheets: team.clean_sheets,
      undefeated: team.undefeated,
      form_score: round(team.form_score),
    }));
}

function recordTeam(teams, rawTeam, goalsFor, goalsAgainst, group) {
  const key = String(rawTeam || "").trim();
  if (!key) return;
  const current =
    teams.get(key) ||
    {
      rawTeam: key,
      team: getDisplayTeamName(key),
      group: group || null,
      played: 0,
      points: 0,
      wins: 0,
      draws: 0,
      losses: 0,
      goals_for: 0,
      goals_against: 0,
      clean_sheets: 0,
    };

  current.played += 1;
  current.goals_for += Number(goalsFor || 0);
  current.goals_against += Number(goalsAgainst || 0);
  if (goalsFor > goalsAgainst) {
    current.wins += 1;
    current.points += 3;
  } else if (goalsFor === goalsAgainst) {
    current.draws += 1;
    current.points += 1;
  } else {
    current.losses += 1;
  }
  if (Number(goalsAgainst || 0) === 0) current.clean_sheets += 1;
  teams.set(key, current);
}

function formatIncident(incident) {
  const minute = incident.added_time ? `${incident.minute}+${incident.added_time}'` : `${incident.minute}'`;
  const who = incident.player ? ` ${incident.player}` : "";
  const team = incident.team ? ` (${incident.team})` : "";
  return `${minute} ${incident.type}${who}${team}`.trim();
}

function parseScore(score) {
  const match = String(score || "").match(/(\d+)\s*-\s*(\d+)/);
  if (!match) return null;
  return { home: Number(match[1]), away: Number(match[2]) };
}

function response(answer, context, confidence = 0.75) {
  return {
    intent: context?.intent || "world_cup_query",
    answer,
    confidence,
    source: "bsd-api",
    data: context,
  };
}

function unavailable(reason) {
  return {
    intent: "world_cup_query",
    available: false,
    provider: "bsd-api",
    reason,
  };
}

function normalize(value) {
  return String(value || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[¿?¡!,.;:()[\]{}"“”]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function getBsdApiToken() {
  return process.env.BSD_API_TOKEN || process.env.BZZOIRO_API_TOKEN || "";
}

function today() {
  return new Date().toISOString().slice(0, 10);
}

function addDays(dateString, days) {
  const date = new Date(`${dateString}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function round(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return null;
  return Math.round(number * 100) / 100;
}

function signedNumber(value) {
  const number = Number(value || 0);
  return number > 0 ? `+${number}` : String(number);
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

function joinSpanish(items) {
  const clean = (items || []).filter(Boolean);
  if (clean.length <= 1) return clean[0] || "";
  if (clean.length === 2) return `${clean[0]} y ${clean[1]}`;
  return `${clean.slice(0, -1).join(", ")} y ${clean[clean.length - 1]}`;
}

module.exports = {
  answerWorldCupVoiceContext,
  buildWorldCupVoiceContext,
};
