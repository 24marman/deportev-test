const BSD_API_BASE = "https://sports.bzzoiro.com/api/v2";
const DEFAULT_TIMEOUT_MS = 7000;

async function buildLeagueVoiceContext(question, options = {}) {
  const text = normalize(question);
  if (!isLeagueQuestion(text)) return null;

  const token = getBsdApiToken();
  if (!token) {
    return unavailable("BSD_API_TOKEN is missing.", { requested_league: "Liga MX" });
  }

  const fetchImpl = options.fetchImpl || globalThis.fetch;
  if (typeof fetchImpl !== "function") {
    return unavailable("fetch is not available in this Node runtime.", { requested_league: "Liga MX" });
  }

  try {
    const detectedQueryType = detectLeagueQueryType(text);
    const leagues = await fetchMexicanLeagues({ fetchImpl, token, timeoutMs: options.timeoutMs });
    const league = selectLeague(leagues, text);
    if (!league) {
      return unavailable("BSD did not return Liga MX leagues.", { requested_league: "Liga MX" });
    }

    const seasonCatalog = await fetchSeasonCatalog(leagues, { fetchImpl, token, timeoutMs: options.timeoutMs });
    const seasons = seasonCatalog.find((entry) => entry.league.id === league.id)?.seasons || [];
    const selectedSeason = selectSeason(league, seasons, text);
    const seasonId = selectedSeason?.id || league.current_season?.id || league.currentSeason?.id || null;

    if (detectedQueryType === "seasons") {
      return {
        intent: "league_query",
        available: true,
        provider: "bsd-api",
        source_name: "BSD Football API",
        source_url: "https://sports.bzzoiro.com/docs/football/",
        requested_league: "Liga MX",
        detected_query_type: detectedQueryType,
        league: {
          id: league.id,
          name: league.name,
          country: league.country,
          season: toPublicSeason(selectedSeason || league.current_season || league.currentSeason || null),
        },
        seasons_available: seasonCatalog.map(toPublicSeasonCatalog),
        summary: summarizeLeagueContext({
          league,
          season: selectedSeason,
          table: [],
          recent: [],
          upcoming: [],
          live: [],
          seasonCatalog,
        }),
        standings: [],
        recent_events: [],
        upcoming_events: [],
        live_events: [],
      };
    }

    const [standings, recentEvents, upcomingEvents, liveEvents] = await Promise.all([
      fetchLeagueStandings(league.id, seasonId, { fetchImpl, token, timeoutMs: options.timeoutMs }),
      fetchLeagueEvents(league.id, seasonId, { fetchImpl, token, status: "finished", limit: 12, timeoutMs: options.timeoutMs }),
      fetchUpcomingLeagueEvents(league.id, seasonId, { fetchImpl, token, timeoutMs: options.timeoutMs }),
      fetchLiveLeagueEvents(league.id, seasonId, { fetchImpl, token, timeoutMs: options.timeoutMs }),
    ]);

    const table = extractStandings(standings).slice(0, 18).map(toPublicStanding);
    const recent = extractEvents(recentEvents).slice(0, 8).map(toPublicEvent);
    const upcoming = extractEvents(upcomingEvents).slice(0, 8).map(toPublicEvent);
    const live = extractEvents(liveEvents).slice(0, 8).map(toPublicEvent);

    return {
      intent: "league_query",
      available: true,
      provider: "bsd-api",
      source_name: "BSD Football API",
      source_url: "https://sports.bzzoiro.com/docs/football/",
      requested_league: "Liga MX",
      detected_query_type: detectedQueryType,
      league: {
        id: league.id,
        name: league.name,
        country: league.country,
        season: toPublicSeason(selectedSeason || league.current_season || league.currentSeason || null),
      },
      seasons_available: seasonCatalog.map(toPublicSeasonCatalog),
      summary: summarizeLeagueContext({ league, season: selectedSeason, table, recent, upcoming, live, seasonCatalog }),
      standings: table,
      recent_events: recent,
      upcoming_events: upcoming,
      live_events: live,
    };
  } catch (error) {
    return unavailable(cleanErrorMessage(error), { requested_league: "Liga MX" });
  }
}

function answerLeagueVoiceContext(context) {
  if (!context?.available) {
    return {
      intent: "league_query",
      answer: `No pude consultar Liga MX en el API ahora mismo: ${context?.reason || "sin detalle"}.`,
      confidence: 0.55,
      source: "bsd-api",
      data: context || null,
    };
  }

  const type = context.detected_query_type;
  const { championish_event: championishEvent, leader, runner_up: runnerUp, next_event: nextEvent } = context.summary;

  if (type === "seasons") {
    const catalogs = context.seasons_available || [];
    const parts = catalogs
      .filter((catalog) => catalog.count)
      .map(
        (catalog) =>
          `${catalog.league_name} trae ${catalog.count} torneos, de ${catalog.oldest?.name || "temporadas anteriores"} a ${catalog.newest?.name || "la actual"}`,
      );

    return response(
      parts.length
        ? `Si, BSD lista el catalogo de temporadas pasadas: ${parts.join("; ")}. Para resultados o tablas, depende de que el endpoint devuelva datos de esa temporada.`
        : "Si deberia traer temporadas pasadas, pero BSD no devolvio el catalogo de temporadas en esta consulta.",
      context,
    );
  }

  if (type === "standings" && leader) {
    const tied = runnerUp && Number(runnerUp.points) === Number(leader.points);
    return response(
      `En ${context.league.season?.name || context.league.name}, ${leader.team} aparece primero con ${leader.points} puntos${
        tied ? `, empatado con ${runnerUp.team}` : ""
      }.`,
      context,
    );
  }

  if (type === "schedule") {
    return response(
      nextEvent
        ? `El siguiente partido de ${context.league.name} que encontre es ${nextEvent.home} contra ${nextEvent.away}, el ${formatShortDate(nextEvent.date)}.`
        : `No encontre partidos proximos de ${context.league.name} en el API para la ventana actual.`,
      context,
    );
  }

  if (type === "live") {
    return response(
      context.live_events.length
        ? `Ahora mismo encontre ${context.live_events.length} partido en vivo de ${context.league.name}.`
        : `No encontre partidos en vivo de ${context.league.name} en este momento.`,
      context,
    );
  }

  if (championishEvent && leader) {
    return response(
      `${context.league.season?.name || context.league.name}: ${championishEvent.away} vencio ${championishEvent.awayScore}-${championishEvent.homeScore} a ${championishEvent.home} en la final; en fase regular, ${leader.team} termino arriba con ${leader.points} puntos.`,
      context,
    );
  }

  if (leader) {
    return response(
      `${context.league.season?.name || context.league.name}: ${leader.team} lidera la tabla con ${leader.points} puntos, seguido por ${runnerUp?.team || "su perseguidor inmediato"}.`,
      context,
    );
  }

  return response(`Ya puedo consultar ${context.league.name} desde BSD, pero no encontre suficiente tabla o partidos para resumirla.`, context);
}

function response(answer, context) {
  return {
    intent: "league_query",
    answer,
    confidence: 0.86,
    source: "bsd-api",
    data: context,
  };
}

function isLeagueQuestion(text) {
  return /(liga mx|ligamx|liga mexicana|futbol mexicano|clausura|apertura|temporadas? pasad|torneos? pasad|temporada anterior|torneo anterior)/.test(text);
}

function detectLeagueQueryType(text) {
  if (/(temporadas?|torneos?|campanas?|anos?|historial).*(pasad|anteriores|disponibles)|pasad[ao]s?|anterior/.test(text)) return "seasons";
  if (/(tabla|posicion|posiciones|lider|clasificacion|general)/.test(text)) return "standings";
  if (/(proximo|siguiente|calendario|juega|juegan|partidos|hoy|manana)/.test(text)) return "schedule";
  if (/(vivo|directo|jugando|ahora)/.test(text)) return "live";
  if (/(campeon|final|liguilla|playoff)/.test(text)) return "finals";
  return "summary";
}

async function fetchMexicanLeagues(options) {
  const payload = await bsdRequestJson("/leagues/?country=Mexico&include_inactive=true&limit=100", options);
  return extractLeagues(payload).filter((league) => /liga mx/i.test(league.name || ""));
}

async function fetchSeasonCatalog(leagues, options) {
  const entries = await Promise.all(
    (leagues || []).map(async (league) => {
      try {
        const payload = await bsdRequestJson(`/leagues/${league.id}/seasons/?limit=50`, options);
        return {
          league,
          seasons: extractSeasons(payload),
        };
      } catch (error) {
        return {
          league,
          seasons: [],
          error: cleanErrorMessage(error),
        };
      }
    }),
  );

  return entries;
}

async function fetchLeagueStandings(leagueId, seasonId, options) {
  const query = new URLSearchParams();
  if (seasonId) query.set("season_id", String(seasonId));
  return bsdRequestJson(`/leagues/${leagueId}/standings/?${query.toString()}`, options);
}

async function fetchLeagueEvents(leagueId, seasonId, options) {
  const query = new URLSearchParams({
    league_id: String(leagueId),
    limit: String(options.limit || 10),
  });
  if (seasonId) query.set("season_id", String(seasonId));
  if (options.status) query.set("status", options.status);
  return bsdRequestJson(`/events/?${query.toString()}`, options);
}

async function fetchUpcomingLeagueEvents(leagueId, seasonId, options) {
  const from = process.env.VOICE_LEAGUE_DATE_FROM || new Date().toISOString().slice(0, 10);
  const to = process.env.VOICE_LEAGUE_DATE_TO || addDays(from, Number(process.env.VOICE_LEAGUE_LOOKAHEAD_DAYS || 45));
  const query = new URLSearchParams({
    league_id: String(leagueId),
    date_from: from,
    date_to: to,
    limit: "12",
  });
  if (seasonId) query.set("season_id", String(seasonId));
  return bsdRequestJson(`/events/?${query.toString()}`, options);
}

async function fetchLiveLeagueEvents(leagueId, seasonId, options) {
  const query = new URLSearchParams({
    league_id: String(leagueId),
  });
  if (seasonId) query.set("season_id", String(seasonId));
  return bsdRequestJson(`/events/live/?${query.toString()}`, options);
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

function selectLeague(leagues, text) {
  if (!Array.isArray(leagues) || !leagues.length) return null;
  if (/apertura/.test(text)) return leagues.find((league) => /apertura/i.test(league.name || "")) || leagues[0];
  if (/clausura/.test(text)) return leagues.find((league) => /clausura/i.test(league.name || "")) || leagues[0];
  return leagues.find((league) => /clausura/i.test(league.name || "")) || leagues[0];
}

function selectSeason(league, seasons, text) {
  const currentSeason = league.current_season || league.currentSeason || null;
  if (!Array.isArray(seasons) || !seasons.length) return currentSeason;

  const explicitYear = text.match(/\b(20\d{2}|19\d{2}|\d{2}\/\d{2})\b/)?.[1] || "";
  if (explicitYear) {
    const byYear =
      seasons.find((season) => String(season?.name || "").includes(explicitYear)) ||
      seasons.find((season) => seasonMatchesYear(season, explicitYear));
    if (byYear) return byYear;
  }

  if (/(temporada|torneo|campana).*(pasad|anterior)|\bpasad[ao]\b|\banterior\b/.test(text)) {
    const currentIndex = seasons.findIndex((season) => season.id === currentSeason?.id || season.is_current);
    if (currentIndex >= 0 && seasons[currentIndex + 1]) return seasons[currentIndex + 1];
    return seasons[1] || seasons[0] || currentSeason;
  }

  return seasons.find((season) => season.id === currentSeason?.id || season.is_current) || seasons[0] || currentSeason;
}

function seasonMatchesYear(season, yearText) {
  const name = String(season?.name || "");
  const year = String(season?.year || "");
  if (!yearText) return false;
  if (name.includes(yearText)) return true;
  if (year === yearText) return true;

  if (/^\d{2}\/\d{2}$/.test(yearText)) {
    return name.includes(yearText);
  }

  const numericYear = Number(yearText);
  return Number.isFinite(numericYear) && Number(year) === numericYear;
}

function summarizeLeagueContext({ league, season, table, recent, upcoming, live, seasonCatalog }) {
  const leader = table[0] || null;
  const runnerUp = table[1] || null;
  const championishEvent =
    recent.find((event) => /final/i.test(event.round || "") && event.homeScore !== event.awayScore) ||
    recent.find((event) => event.homeScore !== event.awayScore) ||
    null;

  return {
    league_name: league.name,
    season_name: season?.name || league.current_season?.name || league.currentSeason?.name || "",
    seasons_catalog_count: (seasonCatalog || []).reduce((sum, entry) => sum + (entry.seasons?.length || 0), 0),
    leader,
    runner_up: runnerUp,
    championish_event: championishEvent,
    next_event: upcoming[0] || null,
    live_count: live.length,
    recent_count: recent.length,
  };
}

function toPublicSeasonCatalog(entry) {
  const seasons = entry.seasons || [];
  return {
    league_id: entry.league.id,
    league_name: entry.league.name,
    count: seasons.length,
    newest: toPublicSeason(seasons[0] || null),
    oldest: toPublicSeason(seasons[seasons.length - 1] || null),
    seasons: seasons.map(toPublicSeason),
    error: entry.error || null,
  };
}

function toPublicSeason(season) {
  if (!season) return null;
  return {
    id: season.id,
    name: season.name,
    year: season.year,
    start_date: season.start_date,
    end_date: season.end_date,
    is_current: Boolean(season.is_current),
  };
}

function toPublicStanding(row) {
  return {
    position: row.position,
    team: row.team_name,
    played: row.played,
    won: row.won,
    drawn: row.drawn,
    lost: row.lost,
    goals_for: row.gf,
    goals_against: row.ga,
    goal_difference: row.gd,
    points: row.pts,
    xg_for: row.xgf,
    xg_against: row.xga,
    form: row.form,
  };
}

function toPublicEvent(event) {
  return {
    eventId: event.id,
    date: event.event_date || event.start_time || event.date || null,
    round: event.round_name || "",
    roundNumber: event.round_number || null,
    status: event.status || "",
    home: event.home_team,
    away: event.away_team,
    homeScore: Number(event.home_score ?? 0),
    awayScore: Number(event.away_score ?? 0),
    score: `${event.home_team} ${Number(event.home_score ?? 0)}-${Number(event.away_score ?? 0)} ${event.away_team}`,
  };
}

function extractLeagues(payload) {
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload?.results)) return payload.results;
  if (Array.isArray(payload?.data)) return payload.data;
  if (Array.isArray(payload?.leagues)) return payload.leagues;
  return [];
}

function extractStandings(payload) {
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload?.standings)) return payload.standings;
  if (payload?.groups && typeof payload.groups === "object") {
    return Object.values(payload.groups).flatMap((group) => (Array.isArray(group) ? group : []));
  }
  return [];
}

function extractSeasons(payload) {
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload?.seasons)) return payload.seasons;
  if (Array.isArray(payload?.results)) return payload.results;
  if (Array.isArray(payload?.data)) return payload.data;
  return [];
}

function extractEvents(payload) {
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload?.results)) return payload.results;
  if (Array.isArray(payload?.data)) return payload.data;
  if (Array.isArray(payload?.events)) return payload.events;
  return [];
}

function unavailable(reason, extra = {}) {
  return {
    intent: "league_query",
    available: false,
    provider: "bsd-api",
    reason,
    ...extra,
  };
}

function normalize(value) {
  return String(value || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function addDays(dateString, days) {
  const date = new Date(`${dateString}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function formatShortDate(value) {
  if (!value) return "fecha por confirmar";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString("es-MX", { day: "numeric", month: "short" });
}

function getBsdApiToken() {
  return process.env.BSD_API_TOKEN || process.env.BZZOIRO_API_TOKEN || "";
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

module.exports = {
  answerLeagueVoiceContext,
  buildLeagueVoiceContext,
};
