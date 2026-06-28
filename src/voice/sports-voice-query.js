const fs = require("fs");
const path = require("path");
const { getDisplayTeamName } = require("../lib/team-metadata");

const ANALYSIS_PATH = path.join(__dirname, "..", "..", "outputs", "analysis", "group-stage-best-xi.json");

function answerSportsVoiceQuery(question, options = {}) {
  const text = normalize(question);
  const analysis = loadAnalysis(options.analysisPath || ANALYSIS_PATH);

  if (!text) {
    return response({
      intent: "empty",
      answer: "Preguntame algo de la data, por ejemplo: quien es el portero con mas atajadas.",
      confidence: 1,
      source: "voice-query-router",
    });
  }

  if (!analysis) {
    return response({
      intent: "missing_data",
      answer: "Todavia no tengo cargada la cache de analisis. Primero necesito calcular la data del torneo.",
      confidence: 1,
      source: "voice-query-router",
    });
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

  if (isTopGoalkeepersQuestion(text)) {
    return answerTopGoalkeepers(analysis);
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
  return /(mejor|mayor|top).*(rating|calificacion|calificacion|nota)|rating.*(alto|mejor|mayor)/.test(text);
}

function response(payload) {
  return {
    ok: true,
    speak: true,
    generatedAt: new Date().toISOString(),
    ...payload,
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
