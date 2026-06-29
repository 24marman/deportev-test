const fs = require("fs");
const path = require("path");
const { getDisplayTeamName } = require("../lib/team-metadata");
const {
  answerHistoricalVoiceContext,
  buildHistoricalVoiceContext,
} = require("./historical-football-data");
const {
  answerLeagueVoiceContext,
  buildLeagueVoiceContext,
} = require("./league-football-data");
const {
  answerWorldCupVoiceContext,
  buildWorldCupVoiceContext,
} = require("./world-cup-football-data");

const ANALYSIS_PATH = path.join(__dirname, "..", "..", "outputs", "analysis", "group-stage-best-xi.json");
const DEFAULT_GEMINI_MODEL = "gemini-2.5-flash-lite";
const DEFAULT_TIMEOUT_MS = 12000;

async function answerSportsVoiceQuery(question, options = {}) {
  const text = normalize(question);
  const analysis = loadAnalysis(options.analysisPath || ANALYSIS_PATH);
  const fetchImpl = options.fetchImpl || globalThis.fetch;
  const [historicalContext, leagueContext, worldCupContext] = await Promise.all([
    buildHistoricalVoiceContext(question, {
      fetchImpl,
      timeoutMs: options.timeoutMs,
    }),
    buildLeagueVoiceContext(question, {
      fetchImpl,
      timeoutMs: options.timeoutMs,
    }),
    buildWorldCupVoiceContext(question, {
      analysis,
      fetchImpl,
      timeoutMs: options.timeoutMs,
    }),
  ]);

  if (!text) {
    return response({
      intent: "empty",
      answer: "Preguntame algo de la data, por ejemplo: quien es el portero con mas atajadas.",
      confidence: 1,
      source: "voice-query-router",
    });
  }

  if (!analysis && !historicalContext && !leagueContext && !worldCupContext) {
    return response({
      intent: "missing_data",
      answer: "Todavia no tengo cargada la cache de analisis. Primero necesito calcular la data del torneo.",
      confidence: 1,
      source: "voice-query-router",
    });
  }

  const fallback = answerSportsVoiceQueryFromData(text, analysis, historicalContext, leagueContext, worldCupContext);

  if (historicalContext && !historicalContext.available) {
    return withAiStatus(fallback, {
      used: false,
      provider: "gemini",
      reason: historicalContext.reason || "historical_context unavailable",
    });
  }

  if (leagueContext && !leagueContext.available) {
    return withAiStatus(fallback, {
      used: false,
      provider: "gemini",
      reason: leagueContext.reason || "league_context unavailable",
    });
  }

  if (worldCupContext && !worldCupContext.available) {
    return withAiStatus(fallback, {
      used: false,
      provider: "gemini",
      reason: worldCupContext.reason || "world_cup_context unavailable",
    });
  }

  if (!isVoiceAiEnabled()) {
    return withAiStatus(fallback, {
      used: false,
      provider: "gemini",
      reason: "VOICE_AI_ENABLED=false",
    });
  }

  if (!getGeminiApiKey()) {
    return withAiStatus(fallback, {
      used: false,
      provider: "gemini",
      reason: "GEMINI_API_KEY is missing",
    });
  }

  try {
    return await answerWithGemini({
      question,
      normalizedQuestion: text,
      analysis,
      fallback,
      historicalContext,
      leagueContext,
      worldCupContext,
      fetchImpl,
      timeoutMs: options.timeoutMs,
    });
  } catch (error) {
    return withAiStatus(fallback, {
      used: false,
      provider: "gemini",
      error: cleanErrorMessage(error),
    });
  }
}

function answerSportsVoiceQueryFromData(
  text,
  analysis,
  historicalContext = null,
  leagueContext = null,
  worldCupContext = null,
) {
  if (historicalContext) {
    return response(answerHistoricalVoiceContext(historicalContext));
  }

  if (leagueContext) {
    return response(answerLeagueVoiceContext(leagueContext));
  }

  if (worldCupContext) {
    return response(answerWorldCupVoiceContext(worldCupContext));
  }

  if (!analysis) {
    return response({
      intent: "missing_data",
      answer: "Todavia no tengo cargada la cache de analisis para responder esa consulta.",
      confidence: 1,
      source: "voice-query-router",
    });
  }

  if (isTopGoalkeepersQuestion(text)) {
    return answerTopGoalkeepers(analysis);
  }

  if (isGoalkeeperSavesQuestion(text)) {
    return answerGoalkeeperSaves(analysis);
  }

  if (isBestXiQuestion(text)) {
    return answerBestXi(analysis);
  }

  if (isTopRatingQuestion(text)) {
    return answerTopRating(analysis);
  }

  if (isPredictionQuestion(text)) {
    return answerPredictionQuestion(analysis);
  }

  return response({
    intent: "unknown",
    answer:
      "Puedo razonar con la data cargada del Mundial 2026, pero necesito una pregunta mas especifica para darte una respuesta precisa.",
    confidence: 0.35,
    source: "voice-query-router",
    suggestions: [
      "Quien es el portero con mas atajadas?",
      "Dame el once ideal de la fase de grupos.",
      "Quien tiene el mejor rating?",
    ],
  });
}

async function answerWithGemini({
  question,
  normalizedQuestion,
  analysis,
  fallback,
  historicalContext,
  leagueContext,
  worldCupContext,
  fetchImpl,
  timeoutMs = DEFAULT_TIMEOUT_MS,
}) {
  if (typeof fetchImpl !== "function") {
    throw new Error("fetch is not available in this Node runtime.");
  }

  const model = getVoiceGeminiModel();
  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(getGeminiApiKey())}`;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), Math.max(1000, Number(timeoutMs || DEFAULT_TIMEOUT_MS)));

  try {
    const geminiResponse = await fetchImpl(endpoint, {
      method: "POST",
      signal: controller.signal,
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        systemInstruction: {
          parts: [{ text: buildVoiceGeminiPrompt() }],
        },
        contents: [
          {
            role: "user",
            parts: [
              {
                text: JSON.stringify(
                  {
                    question,
                    normalized_question: normalizedQuestion,
                    data_context: buildVoiceDataContext(
                      analysis,
                      fallback,
                      historicalContext,
                      leagueContext,
                      worldCupContext,
                    ),
                    required_output_json: {
                      intent: "string",
                      answer: "string, respuesta natural en espanol de Mexico, lista para voz",
                      confidence: "number 0-1",
                      used_data: "array corto con los datos concretos usados",
                      reasoning_summary: "explicacion breve del criterio, sin cadena de pensamiento",
                    },
                  },
                  null,
                  2,
                ),
              },
            ],
          },
        ],
        generationConfig: {
          temperature: Number(process.env.VOICE_AI_TEMPERATURE || 0.35),
          maxOutputTokens: Number(process.env.VOICE_AI_MAX_OUTPUT_TOKENS || 320),
          responseMimeType: "application/json",
        },
      }),
    });

    if (!geminiResponse.ok) {
      const body = await safeResponseText(geminiResponse);
      throw new Error(`Gemini voice reasoner failed (${geminiResponse.status}): ${body.slice(0, 180)}`);
    }

    const data = await geminiResponse.json();
    const rawText = (data?.candidates?.[0]?.content?.parts || [])
      .map((part) => part?.text || "")
      .join("")
      .trim();
    const parsed = parseJsonResponse(rawText);
    const answer = cleanAnswer(parsed.answer);

    if (!answer) {
      throw new Error("Gemini returned an empty answer.");
    }

    return response({
      intent: parsed.intent || fallback.intent || "sports_data_question",
      answer,
      confidence: clampConfidence(parsed.confidence ?? fallback.confidence ?? 0.75),
      source: "gemini-voice-data-reasoner",
      dataSource: fallback.source,
      data: fallback.data || null,
      used_data: Array.isArray(parsed.used_data) ? parsed.used_data.slice(0, 6) : [],
      reasoning_summary: cleanAnswer(parsed.reasoning_summary || ""),
      ai: {
        used: true,
        provider: "gemini",
        model,
      },
    });
  } finally {
    clearTimeout(timeout);
  }
}

function answerGoalkeeperSaves(analysis) {
  const keeper = analysis.goalkeeperMostSaves;
  if (!keeper) {
    return response({
      intent: "top_goalkeeper_saves",
      answer: "No encontre datos suficientes de atajadas de porteros.",
      confidence: 1,
      source: "group-stage-best-xi-cache",
    });
  }

  const chasers = (analysis.topGoalkeepersBySaves || [])
    .filter((player) => player.playerId !== keeper.playerId)
    .slice(0, 2)
    .map((player) => `${spokenName(player.name)}, con ${player.saves}`)
    .join("; ");

  return response({
    intent: "top_goalkeeper_saves",
    answer: `El portero con mas atajadas hasta ahora es ${spokenName(keeper.name)}, de ${spokenTeam(keeper.team)}, con ${keeper.saves} atajadas.${chasers ? ` Le siguen ${chasers}.` : ""}`,
    confidence: 0.98,
    source: "group-stage-best-xi-cache",
    data: keeper,
  });
}

function answerBestXi(analysis) {
  const xi = analysis.bestXI || [];
  if (!xi.length) {
    return response({
      intent: "best_xi_by_rating",
      answer: "No encontre suficientes calificaciones para armar el once ideal.",
      confidence: 1,
      source: "group-stage-best-xi-cache",
    });
  }

  const names = xi.map((player) => `${spokenName(player.name)} de ${spokenTeam(player.team)}`);
  return response({
    intent: "best_xi_by_rating",
    answer: `El once ideal por rating queda con ${joinSpanish(names)}.`,
    confidence: 0.95,
    source: "group-stage-best-xi-cache",
    data: xi,
  });
}

function answerTopRating(analysis) {
  const players = analysis.bestXI || [];
  const top = [...players].sort((a, b) => Number(b.weightedRating || 0) - Number(a.weightedRating || 0))[0];
  if (!top) {
    return response({
      intent: "top_rating",
      answer: "No encontre suficientes calificaciones para detectar el mejor rating.",
      confidence: 1,
      source: "group-stage-best-xi-cache",
    });
  }

  return response({
    intent: "top_rating",
    answer: `El mejor rating hasta ahora es de ${spokenName(top.name)}, de ${spokenTeam(top.team)}, con ${formatRating(top.weightedRating)} de calificacion promedio ponderada.`,
    confidence: 0.95,
    source: "group-stage-best-xi-cache",
    data: top,
  });
}

function answerTopGoalkeepers(analysis) {
  const keepers = (analysis.topGoalkeepersBySaves || []).slice(0, 5);
  if (!keepers.length) {
    return response({
      intent: "top_goalkeepers_saves",
      answer: "No encontre ranking de atajadas de porteros.",
      confidence: 1,
      source: "group-stage-best-xi-cache",
    });
  }

  return response({
    intent: "top_goalkeepers_saves",
    answer: `Los porteros con mas atajadas son ${joinSpanish(
      keepers.map((player) => `${spokenName(player.name)}, de ${spokenTeam(player.team)}, con ${player.saves}`),
    )}.`,
    confidence: 0.95,
    source: "group-stage-best-xi-cache",
    data: keepers,
  });
}

function answerPredictionQuestion(analysis) {
  const tournament = buildTournamentVoiceSnapshot(analysis);
  const candidates = tournament.favorite_candidates.slice(0, 4);
  if (!candidates.length) {
    return response({
      intent: "prediction_request",
      answer: "No puedo dar un favorito con la data actual porque no encontre suficiente forma de equipos en la cache.",
      confidence: 0.6,
      source: "group-stage-analysis-cache",
      data: tournament,
    });
  }

  const [first, second, third] = candidates;
  const supporting = [
    `${first.team} por su fase perfecta y diferencia de ${signedNumber(first.goal_difference)}`,
    second ? `${second.team} por equilibrio y produccion ofensiva` : "",
    third ? `${third.team} tambien entra en la conversacion` : "",
  ].filter(Boolean);

  return response({
    intent: "prediction_request",
    answer: `No hay forma seria de asegurarlo, pero con la data de fase de grupos pondria arriba a ${joinSpanish(supporting)}.`,
    confidence: 0.72,
    source: "group-stage-analysis-cache",
    data: tournament,
  });
}

function loadAnalysis(filePath) {
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch (error) {
    return null;
  }
}

function isGoalkeeperSavesQuestion(text) {
  return /(portero|arquero|guardameta).*(ataj|salvad|saves)|ataj.*(portero|arquero|guardameta)/.test(text);
}

function isTopGoalkeepersQuestion(text) {
  return /(top|ranking|lista|mejores).*(porteros|arqueros|guardametas).*(ataj|saves)/.test(text);
}

function isBestXiQuestion(text) {
  return /(xi|once|11).*(ideal|mejor)|ideal.*(xi|once|11)/.test(text);
}

function isTopRatingQuestion(text) {
  return /(mejor|mayor|top).*(rating|calificacion|nota)|rating.*(alto|mejor|mayor)/.test(text);
}

function isPredictionQuestion(text) {
  return (
    /(quien|quienes).*(ganar|gana|campeon|favorit|candidat).*(mundial|copa|torneo)/.test(text) ||
    /(favorit|candidat).*(mundial|copa|torneo)/.test(text) ||
    /(quien va a ganar|quien gana|quien sale campeon|quien sera campeon)/.test(text)
  );
}

function response(payload) {
  return {
    ok: true,
    speak: true,
    generatedAt: new Date().toISOString(),
    ...payload,
  };
}

function withAiStatus(payload, ai) {
  return {
    ...payload,
    ai: {
      model: getVoiceGeminiModel(),
      ...ai,
    },
  };
}

function buildVoiceGeminiPrompt() {
  return [
    "Eres el cerebro de voz de DeporteV: un analista deportivo mexicano que responde preguntas con criterio, claridad y cero relleno.",
    "Tu tarea es razonar usando exclusivamente el JSON data_context que recibes. No inventes nombres, numeros, marcas, rankings ni contexto que no este en la evidencia.",
    "Si la pregunta pide un dato puntual, responde directo y agrega solo el contexto mas util.",
    "Si data_context trae historical_context, dale prioridad para preguntas de historial, enfrentamientos, duelos o cara a cara.",
    "Si historical_context.coverage.complete es false, aclara que el API solo devolvio esos partidos y no afirmes que es el historial completo.",
    "Si historical_context no esta disponible por falta de cobertura del API, explica esa limitacion sin inventar resultados.",
    "Si data_context trae league_context, usalo para preguntas de Liga MX, Apertura, Clausura, tabla, calendario, finales o temporadas pasadas.",
    "Si la pregunta es sobre temporadas pasadas, usa league_context.seasons_available y explica de forma natural que cobertura trae el API.",
    "Importante: seasons_available solo confirma el catalogo de temporadas. No prometas resultados, partidos o tablas de una temporada si standings y recent_events estan vacios.",
    "En preguntas de temporadas pasadas, usa frases como 'el catalogo trae' o 'BSD lista esas temporadas'; evita decir 'todos los datos disponibles' o 'puedo consultar cualquiera' si no hay tabla o partidos.",
    "Si league_context.detected_query_type es 'seasons', sigue casi literal candidate_data_answer y no agregues promesas de consulta.",
    "Para Liga MX, no digas que no tienes informacion si league_context trae standings, recent_events, live_events o seasons_available.",
    "Si data_context trae world_cup_context, usalo para preguntas del Mundial sobre predicciones, favoritos, odds, stats, xG, shotmap, incidencias, h2h o resumen de partido.",
    "Para predicciones del Mundial, distingue entre prediccion partido por partido de BSD y una lectura de candidato al titulo. No prometas certeza ni inventes mercado de campeon si solo hay predicciones de partidos.",
    "Cuando hables de predicciones de BSD, di 'modelo de BSD' o 'modelo de la API', nunca 'nuestro modelo'.",
    "Para preguntas de stats usa xG, remates, posesion, ataques peligrosos, big chances y shotmap si vienen en world_cup_context.",
    "tournament_context.candidate_score es un indicador calculado localmente desde la data disponible, no un campo directo de la API; si lo usas, llamalo 'lectura de forma' o 'indicador interno'.",
    "Si hay ranking, menciona el lider y, si cabe, uno o dos perseguidores. No leas tablas largas en voz.",
    "candidate_data_answer es solo un respaldo local, no una restriccion. Si el JSON trae datos suficientes para responder mejor, ignora el fallback.",
    "Si la pregunta pide una prediccion o favorito del Mundial y tournament_context existe, no digas que no puedes responder. Da una lectura probabilistica y honesta, sin garantizar el futuro.",
    "Para predicciones usa forma de equipos, puntos, diferencia de goles, goles a favor, goles recibidos, invicto, arcos en cero y jugadores destacados. Responde con 'favoritos' o 'candidatos', no con certeza absoluta.",
    "Tono: natural, profesional, moderno, como una app deportiva o reportero mexicano informativo. Nada de narrador de TV ni frases infladas.",
    "Respuesta para voz: una o dos frases cortas, sin markdown, sin hashtags, sin emojis, sin bullets.",
    "Cuando no haya evidencia suficiente, dilo con honestidad y sugiere que dato si puedes responder con el contexto disponible.",
    "Devuelve SOLO JSON valido con: intent, answer, confidence, used_data y reasoning_summary.",
    "reasoning_summary debe ser un resumen breve del criterio usado, no una cadena de pensamiento paso a paso.",
  ].join("\n");
}

function buildVoiceDataContext(
  analysis,
  fallback,
  historicalContext = null,
  leagueContext = null,
  worldCupContext = null,
) {
  const safeAnalysis = analysis || {};
  const bestXI = (safeAnalysis.bestXI || []).map(toPublicPlayer);
  const topGoalkeepersBySaves = (safeAnalysis.topGoalkeepersBySaves || []).slice(0, 10).map(toPublicPlayer);
  const topByPosition = {};

  for (const [position, players] of Object.entries(safeAnalysis.topByPosition || {})) {
    topByPosition[position] = (players || []).slice(0, 8).map(toPublicPlayer);
  }

  return {
    source: safeAnalysis.source || "bsd-api-analysis-cache",
    scope: safeAnalysis.scope || "Mundial 2026, fase de grupos",
    generated_at: safeAnalysis.generatedAt || null,
    events_count: safeAnalysis.eventsCount || (safeAnalysis.events || []).length || null,
    methodology: safeAnalysis.methodology || null,
    detected_intent: fallback.intent || "unknown",
    candidate_data_answer: fallback.answer || "",
    historical_context: historicalContext,
    league_context: leagueContext,
    world_cup_context: worldCupContext,
    tournament_context: buildTournamentVoiceSnapshot(safeAnalysis),
    facts: {
      goalkeeper_most_saves: toPublicPlayer(safeAnalysis.goalkeeperMostSaves),
      top_goalkeepers_by_saves: topGoalkeepersBySaves,
      best_xi_by_weighted_rating: bestXI,
      top_rating_from_best_xi: bestXI
        .slice()
        .sort((a, b) => Number(b.weightedRating || 0) - Number(a.weightedRating || 0))[0] || null,
      top_by_position: topByPosition,
    },
  };
}

function buildTournamentVoiceSnapshot(analysis) {
  const events = Array.isArray(analysis?.events) ? analysis.events : [];
  const teams = new Map();

  for (const event of events) {
    const score = parseScore(event.score);
    if (!score) continue;
    recordTeamMatch(teams, event.home, score.home, score.away, event);
    recordTeamMatch(teams, event.away, score.away, score.home, event);
  }

  const playerImpact = buildPlayerImpactByTeam(analysis);
  const standings = [...teams.values()]
    .map((team) => {
      const impact = playerImpact.get(team.rawTeam) || playerImpact.get(team.team) || emptyPlayerImpact(team.rawTeam);
      const goalDifference = team.goals_for - team.goals_against;
      const undefeated = team.losses === 0;
      const candidateScore =
        team.points * 3 +
        goalDifference * 1.15 +
        team.goals_for * 0.65 +
        team.clean_sheets * 0.85 +
        (undefeated ? 1.5 : 0) +
        impact.top_player_count * 0.7 +
        impact.best_weighted_rating * 0.35;

      return {
        ...team,
        goal_difference: goalDifference,
        undefeated,
        candidate_score: Number(candidateScore.toFixed(2)),
        player_signal: impact,
      };
    })
    .sort((a, b) => b.points - a.points || b.goal_difference - a.goal_difference || b.goals_for - a.goals_for);

  const favoriteCandidates = standings
    .slice()
    .sort((a, b) => b.candidate_score - a.candidate_score)
    .slice(0, 8)
    .map(toPublicTeamSnapshot);

  return {
    source: analysis?.source || "group-stage-analysis-cache",
    scope: analysis?.scope || "Mundial 2026",
    generated_at: analysis?.generatedAt || null,
    events_count: analysis?.eventsCount || events.length || 0,
    prediction_policy:
      "No garantiza resultados futuros; ordena candidatos usando forma de fase de grupos y senales individuales disponibles.",
    standings_top: standings.slice(0, 12).map(toPublicTeamSnapshot),
    favorite_candidates: favoriteCandidates,
  };
}

function recordTeamMatch(teams, rawTeam, goalsFor, goalsAgainst, event) {
  const team = String(rawTeam || "").trim();
  if (!team) return;
  const current =
    teams.get(team) ||
    {
      rawTeam: team,
      team: getDisplayTeamName(team),
      played: 0,
      wins: 0,
      draws: 0,
      losses: 0,
      goals_for: 0,
      goals_against: 0,
      points: 0,
      clean_sheets: 0,
      groups: new Set(),
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
  if (event?.group) current.groups.add(event.group);

  teams.set(team, current);
}

function buildPlayerImpactByTeam(analysis) {
  const impact = new Map();
  const players = [
    ...(Array.isArray(analysis?.bestXI) ? analysis.bestXI : []),
    ...Object.values(analysis?.topByPosition || {}).flatMap((list) => (Array.isArray(list) ? list.slice(0, 5) : [])),
  ];

  for (const player of players) {
    const team = String(player?.team || "").trim();
    if (!team) continue;
    const current = impact.get(team) || emptyPlayerImpact(team);
    current.top_player_count += 1;
    current.best_weighted_rating = Math.max(current.best_weighted_rating, Number(player.weightedRating || 0));
    if (current.highlight_players.length < 4) {
      current.highlight_players.push({
        name: player.name,
        position: player.position,
        weightedRating: player.weightedRating,
        goals: player.goals,
        assists: player.assists,
        saves: player.saves,
      });
    }
    impact.set(team, current);
  }

  return impact;
}

function emptyPlayerImpact(team) {
  return {
    team: getDisplayTeamName(team),
    top_player_count: 0,
    best_weighted_rating: 0,
    highlight_players: [],
  };
}

function toPublicTeamSnapshot(team) {
  return {
    team: team.team,
    rawTeam: team.rawTeam,
    group: Array.from(team.groups || [])[0] || null,
    played: team.played,
    wins: team.wins,
    draws: team.draws,
    losses: team.losses,
    points: team.points,
    goals_for: team.goals_for,
    goals_against: team.goals_against,
    goal_difference: team.goal_difference,
    clean_sheets: team.clean_sheets,
    undefeated: team.undefeated,
    candidate_score: team.candidate_score,
    player_signal: team.player_signal,
  };
}

function parseScore(score) {
  const match = String(score || "").match(/(\d+)\s*-\s*(\d+)/);
  if (!match) return null;
  return {
    home: Number(match[1]),
    away: Number(match[2]),
  };
}

function toPublicPlayer(player) {
  if (!player) return null;
  return {
    playerId: player.playerId,
    name: player.name,
    team: getDisplayTeamName(player.team),
    rawTeam: player.team,
    position: player.position,
    weightedRating: player.weightedRating,
    avgRating: player.avgRating,
    appearances: player.appearances,
    minutes: player.minutes,
    goals: player.goals,
    assists: player.assists,
    saves: player.saves,
    cleanSheets: player.cleanSheets,
    goalsConceded: player.goalsConceded,
  };
}

function getGeminiApiKey() {
  return process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY || process.env.GOOGLE_GENERATIVE_AI_API_KEY || "";
}

function getVoiceGeminiModel() {
  return process.env.VOICE_AI_MODEL || process.env.GEMINI_TEXT_MODEL || DEFAULT_GEMINI_MODEL;
}

function isVoiceAiEnabled() {
  return process.env.VOICE_AI_ENABLED !== "false";
}

function parseJsonResponse(value) {
  const text = String(value || "").trim();
  if (!text) return {};

  try {
    return JSON.parse(text);
  } catch (error) {
    const match = text.match(/\{[\s\S]*\}/);
    if (!match) return {};
    try {
      return JSON.parse(match[0]);
    } catch (innerError) {
      return {};
    }
  }
}

async function safeResponseText(responseValue) {
  try {
    return await responseValue.text();
  } catch (error) {
    return "";
  }
}

function cleanAnswer(value) {
  return String(value || "")
    .replace(/```(?:json)?/gi, "")
    .replace(/```/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function cleanErrorMessage(error) {
  return String(error?.message || error || "Unknown Gemini error").slice(0, 220);
}

function clampConfidence(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return 0.75;
  return Math.max(0, Math.min(1, number));
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

function spokenName(value) {
  return String(value || "").trim();
}

function spokenTeam(value) {
  return getDisplayTeamName(value);
}

function formatRating(value) {
  return Number(value || 0).toFixed(2);
}

function signedNumber(value) {
  const number = Number(value || 0);
  return number > 0 ? `+${number}` : String(number);
}

function joinSpanish(items) {
  const clean = (items || []).filter(Boolean);
  if (clean.length <= 1) return clean[0] || "";
  if (clean.length === 2) return `${clean[0]} y ${clean[1]}`;
  return `${clean.slice(0, -1).join(", ")} y ${clean[clean.length - 1]}`;
}

module.exports = {
  answerSportsVoiceQuery,
};
