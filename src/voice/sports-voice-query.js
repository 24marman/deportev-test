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

const ANALYSIS_PATH = path.join(__dirname, "..", "..", "outputs", "analysis", "group-stage-best-xi.json");
const DEFAULT_GEMINI_MODEL = "gemini-2.5-flash-lite";
const DEFAULT_TIMEOUT_MS = 7000;

async function answerSportsVoiceQuery(question, options = {}) {
  const text = normalize(question);
  const analysis = loadAnalysis(options.analysisPath || ANALYSIS_PATH);
  const fetchImpl = options.fetchImpl || globalThis.fetch;
  const [historicalContext, leagueContext] = await Promise.all([
    buildHistoricalVoiceContext(question, {
      fetchImpl,
      timeoutMs: options.timeoutMs,
    }),
    buildLeagueVoiceContext(question, {
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

  if (!analysis && !historicalContext && !leagueContext) {
    return response({
      intent: "missing_data",
      answer: "Todavia no tengo cargada la cache de analisis. Primero necesito calcular la data del torneo.",
      confidence: 1,
      source: "voice-query-router",
    });
  }

  const fallback = answerSportsVoiceQueryFromData(text, analysis, historicalContext, leagueContext);

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

function answerSportsVoiceQueryFromData(text, analysis, historicalContext = null, leagueContext = null) {
  if (historicalContext) {
    return response(answerHistoricalVoiceContext(historicalContext));
  }

  if (leagueContext) {
    return response(answerLeagueVoiceContext(leagueContext));
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

  return response({
    intent: "unknown",
    answer:
      "Todavia no tengo esa consulta lista. Por ahora puedo responder sobre el XI ideal, el mejor rating y el portero con mas atajadas.",
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
                    data_context: buildVoiceDataContext(analysis, fallback, historicalContext, leagueContext),
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
    "Si hay ranking, menciona el lider y, si cabe, uno o dos perseguidores. No leas tablas largas en voz.",
    "Tono: natural, profesional, moderno, como una app deportiva o reportero mexicano informativo. Nada de narrador de TV ni frases infladas.",
    "Respuesta para voz: una o dos frases cortas, sin markdown, sin hashtags, sin emojis, sin bullets.",
    "Cuando no haya evidencia suficiente, dilo con honestidad y sugiere que dato si puedes responder con el contexto disponible.",
    "Devuelve SOLO JSON valido con: intent, answer, confidence, used_data y reasoning_summary.",
    "reasoning_summary debe ser un resumen breve del criterio usado, no una cadena de pensamiento paso a paso.",
  ].join("\n");
}

function buildVoiceDataContext(analysis, fallback, historicalContext = null, leagueContext = null) {
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

function joinSpanish(items) {
  const clean = (items || []).filter(Boolean);
  if (clean.length <= 1) return clean[0] || "";
  if (clean.length === 2) return `${clean[0]} y ${clean[1]}`;
  return `${clean.slice(0, -1).join(", ")} y ${clean[clean.length - 1]}`;
}

module.exports = {
  answerSportsVoiceQuery,
};
