const { getFlagEmoji, normalizeTeamName } = require("./caption");

const DEFAULT_OPENAI_MODEL = "gpt-4o-mini";
const DEFAULT_GEMINI_MODEL = "gemini-2.5-flash-lite";
const DEFAULT_TIMEOUT_MS = 3200;
const DEFAULT_MAX_ATTEMPTS = 2;

const BANNED_TEMPLATE_FRAGMENTS = [
  "consigue tres puntos clave",
  "consigue tres puntos claves",
  "tres puntos clave para meterse",
  "tres puntos claves",
  "tres puntos vitales",
  "tres puntos importantes",
  "suma tres puntos",
  "suma tres puntos para la tabla",
  "se mete de lleno en la pelea por avanzar",
  "con una victoria clara",
  "suma un punto histórico ante una de las candidatas al título",
  "suma un punto historico ante una de las candidatas al titulo",
  "suma un punto histórico frente a una de las candidatas al título",
  "suma un punto historico frente a una de las candidatas al titulo",
  "en un partido de alto ritmo",
  "partido de alto ritmo",
  "partido abierto y de mucho ritmo",
];

function isEditorialAiEnabled() {
  if (process.env.EDITORIAL_AI_ENABLED === "false") return false;
  return Boolean(getEditorialProvider());
}

async function writeEditorialHeadline({
  matchData,
  context,
  recentEditorialSignatures = [],
  fetchImpl = global.fetch,
  maxAttempts = Number(process.env.EDITORIAL_AI_MAX_ATTEMPTS || DEFAULT_MAX_ATTEMPTS),
  timeoutMs = Number(process.env.EDITORIAL_AI_TIMEOUT_MS || DEFAULT_TIMEOUT_MS),
} = {}) {
  if (!context?.headline) return context;

  const validationRules = buildValidationRules(matchData, context, recentEditorialSignatures);

  if (!isEditorialAiEnabled()) {
    const fallback = pickMemorySafeFallback(context, validationRules);
    return withWriterMeta(fallback.context, {
      used: false,
      reason: process.env.EDITORIAL_AI_ENABLED === "false" ? "Editorial AI disabled." : "Editorial AI provider key is missing.",
      fallbackAdjusted: fallback.adjusted,
      fallbackReason: fallback.reason,
    });
  }

  if (typeof fetchImpl !== "function") {
    const fallback = pickMemorySafeFallback(context, validationRules);
    return withWriterMeta(fallback.context, {
      used: false,
      reason: "fetch is unavailable.",
      fallbackAdjusted: fallback.adjusted,
      fallbackReason: fallback.reason,
    });
  }

  const payload = buildWriterPayload(matchData, context, recentEditorialSignatures);
  const attempts = Math.max(1, Math.min(3, Number(maxAttempts || DEFAULT_MAX_ATTEMPTS)));
  const provider = getEditorialProvider();
  let lastError = "";

  if (isEditorialReasonerEnabled()) {
    try {
      const reasoned = await requestAiEditorialDecision({
        provider,
        payload,
        feedback: "",
        fetchImpl,
        timeoutMs,
      });
      const reasonerRules = buildReasonerValidationRules(validationRules, context, reasoned);
      const validation = validateEditorialHeadline(reasoned.headline, reasonerRules);

      if (validation.ok) {
        return withWriterMeta(
          {
            ...context,
            headline: validation.headline,
            source: `${provider}-editorial-reasoner:${getEditorialModel(provider)}+${context.source}`,
            decision: {
              ...(context.decision || {}),
              editorialReasoner: {
                used: true,
                provider,
                model: getEditorialModel(provider),
                primaryAngle: reasoned.primary_angle || "",
                secondaryAngle: reasoned.secondary_angle || "",
                mustIncludeNarratives: reasoned.must_include_narratives || [],
                rationale: reasoned.rationale || "",
                baseHeadline: context.headline,
              },
            },
          },
          {
            used: true,
            provider,
            model: getEditorialModel(provider),
            reasonerUsed: true,
            primaryAngle: reasoned.primary_angle || "",
            secondaryAngle: reasoned.secondary_angle || "",
            mustIncludeNarratives: reasoned.must_include_narratives || [],
            rationale: reasoned.rationale || "",
            baseHeadline: context.headline,
          },
        );
      }

      lastError = `reasoner rejected: ${validation.reason}`;
    } catch (error) {
      lastError = `reasoner failed: ${error.message}`;
    }
  }

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      const generated = await requestAiHeadline({
        provider,
        payload,
        feedback: lastError,
        fetchImpl,
        timeoutMs,
      });
      const validation = validateEditorialHeadline(generated, validationRules);

      if (validation.ok) {
        return withWriterMeta(
          {
            ...context,
            headline: validation.headline,
            source: `${provider}-editorial-writer:${getEditorialModel(provider)}+${context.source}`,
            decision: {
              ...(context.decision || {}),
              aiWriter: {
                used: true,
                provider,
                model: getEditorialModel(provider),
                attempt,
                baseHeadline: context.headline,
              },
            },
          },
          {
            used: true,
            provider,
            model: getEditorialModel(provider),
            attempt,
            baseHeadline: context.headline,
          },
        );
      }

      lastError = validation.reason;
    } catch (error) {
      lastError = error.message;
      break;
    }
  }

  const fallback = pickMemorySafeFallback(context, validationRules);
  return withWriterMeta(fallback.context, {
    used: false,
    reason: lastError || "Generated headline did not pass validation.",
    baseHeadline: context.headline,
    fallbackAdjusted: fallback.adjusted,
    fallbackReason: fallback.reason,
  });
}

function withWriterMeta(context, aiWriter) {
  return {
    ...context,
    decision: {
      ...(context?.decision || {}),
      aiWriter,
    },
    aiWriter,
  };
}

function pickMemorySafeFallback(context, validationRules) {
  const rules = { ...validationRules, baseHeadline: "" };
  const current = validateEditorialHeadline(context.headline, rules);

  if (current.ok) {
    return {
      context,
      adjusted: false,
      reason: "fallback headline passed memory validation",
    };
  }

  const alternatives = (context.facts || [])
    .filter((candidate) => candidate?.text && candidate.text !== context.headline)
    .sort((a, b) => Number(b.priority || 0) - Number(a.priority || 0));

  for (const candidate of alternatives) {
    const validation = validateEditorialHeadline(candidate.text, rules);
    if (!validation.ok) continue;

    return {
      context: {
        ...context,
        headline: validation.headline,
        source: `memory-safe-fallback+${candidate.source || context.source}`,
        signature: candidate.signature || context.signature,
        decision: {
          ...(context.decision || {}),
          memorySafeFallback: {
            used: true,
            rejectedHeadline: context.headline,
            rejectedReason: current.reason,
          },
        },
      },
      adjusted: true,
      reason: current.reason,
    };
  }

  return {
    context: {
      ...context,
      headline: "",
      source: `memory-guard:no-safe-headline+${context.source || "unknown"}`,
      decision: {
        ...(context.decision || {}),
        memorySafeFallback: {
          used: true,
          rejectedHeadline: context.headline,
          rejectedReason: current.reason,
          noSafeAlternative: true,
        },
      },
    },
    adjusted: true,
    reason: `No non-repeated fallback headline available: ${current.reason}`,
  };
}

async function requestAiHeadline({
  provider,
  payload,
  feedback,
  fetchImpl,
  timeoutMs,
  systemPrompt = buildSystemPrompt(),
  maxTokens = 90,
  responseMimeType = "text/plain",
}) {
  if (provider === "gemini") {
    return requestGeminiHeadline({
      payload,
      feedback,
      fetchImpl,
      timeoutMs,
      systemPrompt,
      maxTokens,
      responseMimeType,
    });
  }

  if (provider === "openai") {
    return requestOpenAIHeadline({
      payload,
      feedback,
      fetchImpl,
      timeoutMs,
      systemPrompt,
      maxTokens,
    });
  }

  throw new Error("No editorial AI provider is configured.");
}

async function requestAiEditorialDecision({ provider, payload, feedback, fetchImpl, timeoutMs }) {
  const reasonerPayload = {
    ...payload,
    task: "Actua como editor jefe: decide la noticia mas relevante del partido y redacta el titular final.",
    relevance_contract: {
      do_not_follow_fixed_priority: true,
      choose_by_editorial_relevance: true,
      combine_up_to_two_angles_when_both_matter: true,
      never_invent_facts: true,
    },
    output_schema: {
      primary_angle: "classification | group-lead | elimination | record | historic-milestone | upset | late-goal | high-scoring-match | dominance | poor-match | day-context | scoreline | other",
      secondary_angle: "same list or null",
      must_include_narratives: "array of required narratives, e.g. qualification, group-lead, elimination, record, late-goal, dominance, third-place-route",
      rationale: "short explanation of why this angle matters most",
      headline: "final Spanish headline, 15-35 words, no hashtags, no emojis",
    },
  };
  const raw = await requestAiHeadline({
    provider,
    payload: reasonerPayload,
    feedback,
    fetchImpl,
    timeoutMs: Math.max(Number(timeoutMs || DEFAULT_TIMEOUT_MS), Number(process.env.EDITORIAL_REASONER_TIMEOUT_MS || 4500)),
    systemPrompt: buildReasonerPrompt(),
    maxTokens: 420,
    responseMimeType: provider === "gemini" ? "application/json" : "text/plain",
  });

  return parseEditorialDecision(raw);
}

async function requestOpenAIHeadline({
  payload,
  feedback,
  fetchImpl,
  timeoutMs,
  systemPrompt = buildSystemPrompt(),
  maxTokens = 90,
}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), Math.max(1000, Number(timeoutMs || DEFAULT_TIMEOUT_MS)));

  try {
    const response = await fetchImpl("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      signal: controller.signal,
      headers: {
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: getEditorialModel("openai"),
        temperature: Number(process.env.EDITORIAL_AI_TEMPERATURE || 0.72),
        messages: [
          {
            role: "system",
            content: systemPrompt,
          },
          {
            role: "user",
            content: JSON.stringify(
              {
                ...payload,
                retry_feedback: feedback || null,
              },
              null,
              2,
            ),
          },
        ],
        max_tokens: maxTokens,
      }),
    });

    if (!response.ok) {
      const body = await safeResponseText(response);
      throw new Error(`OpenAI editorial writer failed (${response.status}): ${body.slice(0, 180)}`);
    }

    const data = await response.json();
    return data?.choices?.[0]?.message?.content || "";
  } finally {
    clearTimeout(timeout);
  }
}

async function requestGeminiHeadline({
  payload,
  feedback,
  fetchImpl,
  timeoutMs,
  systemPrompt = buildSystemPrompt(),
  maxTokens = 90,
  responseMimeType = "text/plain",
}) {
  const apiKey = getGeminiApiKey();
  if (!apiKey) {
    throw new Error("GEMINI_API_KEY is missing.");
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), Math.max(1000, Number(timeoutMs || DEFAULT_TIMEOUT_MS)));
  const model = getEditorialModel("gemini");
  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`;

  try {
    const response = await fetchImpl(endpoint, {
      method: "POST",
      signal: controller.signal,
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        systemInstruction: {
          parts: [{ text: systemPrompt }],
        },
        contents: [
          {
            role: "user",
            parts: [
              {
                text: JSON.stringify(
                  {
                    ...payload,
                    retry_feedback: feedback || null,
                  },
                  null,
                  2,
                ),
              },
            ],
          },
        ],
        generationConfig: {
          temperature: Number(process.env.EDITORIAL_AI_TEMPERATURE || 0.72),
          maxOutputTokens: maxTokens,
          responseMimeType,
        },
      }),
    });

    if (!response.ok) {
      const body = await safeResponseText(response);
      throw new Error(`Gemini editorial writer failed (${response.status}): ${body.slice(0, 180)}`);
    }

    const data = await response.json();
    return (data?.candidates?.[0]?.content?.parts || [])
      .map((part) => part?.text || "")
      .join("")
      .trim();
  } finally {
    clearTimeout(timeout);
  }
}

function getEditorialProvider() {
  const requested = String(process.env.EDITORIAL_AI_PROVIDER || "auto").trim().toLowerCase();

  if (requested === "gemini" || requested === "google") {
    return getGeminiApiKey() ? "gemini" : "";
  }

  if (requested === "openai") {
    return process.env.OPENAI_API_KEY ? "openai" : "";
  }

  if (requested && requested !== "auto") {
    return "";
  }

  if (getGeminiApiKey()) return "gemini";
  if (process.env.OPENAI_API_KEY) return "openai";
  return "";
}

function getGeminiApiKey() {
  return process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY || process.env.GOOGLE_GENERATIVE_AI_API_KEY || "";
}

function getEditorialModel(provider = getEditorialProvider()) {
  if (provider === "gemini") {
    return process.env.EDITORIAL_AI_MODEL || process.env.GEMINI_TEXT_MODEL || DEFAULT_GEMINI_MODEL;
  }

  return process.env.EDITORIAL_AI_MODEL || process.env.OPENAI_TEXT_MODEL || DEFAULT_OPENAI_MODEL;
}

function isEditorialReasonerEnabled() {
  return process.env.EDITORIAL_REASONER_ENABLED !== "false";
}

function buildSystemPrompt() {
  return [
    "Eres un editor deportivo para una app moderna de futbol.",
    "Escribe SOLO una frase en español, sin comillas, sin hashtags, sin emojis y sin marcador separado.",
    "Objetivo: responder qué ocurrió y por qué importa.",
    "Longitud ideal: 15 a 35 palabras. Máximo dos oraciones si es indispensable.",
    "Tono: humano, natural, informativo, neutral, con criterio editorial. No suenes a narrador de TV ni a aficionado.",
    "Antes de escribir, revisa la tabla despues del partido: quien queda primero, segundo o tercero; quien asegura liderato; quien clasifica; quien queda condicionado.",
    "Prioriza consecuencias competitivas: clasificación, eliminación, liderato, primer lugar, boleto, récord o cambio fuerte del grupo.",
    "Si hay una consecuencia competitiva importante, debe aparecer antes que estadísticas o lectura táctica.",
    "Puedes combinar una estadística relevante si explica el partido, por ejemplo dominio, ocasiones claras, xG, gol tardío o partido pobre.",
    "No inventes datos. Usa exclusivamente los hechos enviados.",
    "No repitas ni parafrasees titulares recientes. Evita frases de plantilla.",
    "No uses estas frases: consigue tres puntos clave, suma tres puntos, tres puntos vitales, suma tres puntos para la tabla, con una victoria clara, suma un punto histórico ante una de las candidatas al título.",
  ].join("\n");
}

function buildReasonerPrompt() {
  return [
    "Eres el editor jefe de una app moderna de futbol. Tu trabajo NO es aplicar una regla fija.",
    "Debes razonar como periodista deportivo: identifica la noticia mas importante que deja el partido para la audiencia.",
    "Evalua todos los angulos disponibles: tabla, clasificacion, eliminacion, liderato, record, hito historico, sorpresa, gol tardio, remontada, partido de muchos goles, dominio estadistico, mal partido, contexto del dia y contexto de selecciones.",
    "A veces la tabla manda; a veces manda un record; a veces manda un partido historico; a veces dos angulos tienen peso parecido y deben convivir en una sola frase.",
    "Si hay clasificacion, eliminacion, liderato asegurado o record historico, solo puedes omitirlo si otro hecho de igual o mayor peso aparece claramente en los datos; si caben ambos, combinalos.",
    "No inventes. Usa exclusivamente los datos del payload.",
    "No redactes con plantillas ni frases repetidas. No uses 'suma tres puntos' ni 'en un partido de alto ritmo'.",
    "Devuelve SOLO JSON valido, sin markdown.",
  ].join("\n");
}

function buildWriterPayload(matchData, context, recentEditorialSignatures = []) {
  const home = matchData?.teams?.home || {};
  const away = matchData?.teams?.away || {};
  const homeName = normalizeTeamName(home.name);
  const awayName = normalizeTeamName(away.name);
  const homeScore = Number(home.score || 0);
  const awayScore = Number(away.score || 0);
  const candidates = (context?.facts || []).slice(0, 8).map((candidate) => ({
    priority: Number(candidate.priority || 0),
    level: Number(candidate.level || 0),
    source: candidate.source || "",
    signature: candidate.signature || "",
    text: candidate.text || "",
  }));

  return {
    task: "Redacta una linea editorial nueva para encabezar un tweet con imagen de marcador final.",
    hard_facts: {
      match_status: matchData?.match?.status || "",
      group: matchData?.competition?.groupLetter || null,
      matchday: matchData?.competition?.matchdayNumber || null,
      home: {
        name: homeName,
        flag: getFlagEmoji(home.name),
        score: homeScore,
      },
      away: {
        name: awayName,
        flag: getFlagEmoji(away.name),
        score: awayScore,
      },
      result: homeScore === awayScore ? "draw" : homeScore > awayScore ? `${homeName} win` : `${awayName} win`,
      scorers: {
        home: matchData?.events?.homeScorers || [],
        away: matchData?.events?.awayScorers || [],
      },
    },
    editorial_priority: {
      selected_base_headline: context?.headline || "",
      selected_source: context?.source || "",
      selected_signature: context?.signature || "",
      decision: context?.decision || null,
      signal_summary: context?.signalSummary || null,
    },
    tournament_context: summarizeTournamentContext(matchData),
    player_milestones: summarizePlayerMilestones(matchData),
    stats_context: summarizeStatsForWriter(matchData?.context?.matchStats, homeName, awayName),
    news_context: summarizeNewsForWriter(matchData?.context?.editorialSignals),
    candidate_angles: candidates,
    recent_headlines: normalizeRecentHeadlines(recentEditorialSignatures).slice(0, 30),
    output_contract: {
      language: "Spanish",
      form: "single short editorial sentence",
      min_words: 12,
      max_words: 35,
      no_hashtags: true,
      no_emojis: true,
      no_fixed_scoreline: true,
    },
  };
}

function summarizePlayerMilestones(matchData) {
  return (matchData?.context?.playerMilestones?.facts || []).slice(0, 5).map((fact) => ({
    priority: fact.priority || null,
    signature: fact.signature || "",
    text: fact.text || "",
    playerKey: fact.playerKey || "",
  }));
}

function summarizeTournamentContext(matchData) {
  const tournament = matchData?.context?.tournament || {};
  const priorGroup = matchData?.context?.priorGroup || {};
  const groupOutlook = priorGroup.groupOutlook || {};
  const tableBefore = summarizeGroupTable(priorGroup.tableBefore);
  const tableAfter = summarizeGroupTable(priorGroup.tableAfter);
  return {
    newlyQualified: tournament.newlyQualified || [],
    newlyGuaranteedFirst: tournament.newlyGuaranteedFirst || [],
    firstQualifiedThisTournament: Boolean(tournament.firstQualifiedThisTournament),
    qualifiedBeforeCount: tournament.qualifiedBeforeCount ?? null,
    qualifiedAfterCount: tournament.qualifiedAfterCount ?? null,
    groupBefore: {
      home: priorGroup.homePrior || null,
      away: priorGroup.awayPrior || null,
    },
    groupAfter: {
      home: priorGroup.homeAfter || null,
      away: priorGroup.awayAfter || null,
    },
    groupTableBefore: tableBefore,
    groupTableAfter: tableAfter,
    groupLeaderAfter: tableAfter[0] || null,
    currentTeamRanksAfter: {
      home: groupOutlook.home || null,
      away: groupOutlook.away || null,
    },
    groupOutlook: priorGroup.groupOutlook || null,
  };
}

function summarizeGroupTable(rows = []) {
  return (rows || []).slice(0, 6).map((row, index) => ({
    rank: row.rank || index + 1,
    team: normalizeTeamName(row.team),
    teamKey: row.team,
    played: row.played,
    points: row.points,
    goalDifference: row.goalDifference,
    goalsFor: row.goalsFor,
    goalsAgainst: row.goalsAgainst,
  }));
}

function summarizeNewsForWriter(signals) {
  return {
    favoriteSide: signals?.matchup?.favoriteSide || null,
    favoriteGap: signals?.matchup?.favoriteGap || 0,
    debutantVsFavorite: Boolean(signals?.matchup?.debutantVsFavorite),
    defendingChampionSide: signals?.matchup?.defendingChampionSide || null,
    themes: signals?.news?.themes || {},
    items: (signals?.news?.relevantItems || []).slice(0, 5).map((item) => ({
      title: item.title,
      themes: item.themes || [],
      teams: item.teams || [],
    })),
  };
}

function summarizeStatsForWriter(matchStats, homeName, awayName) {
  const rows = flattenStatRows(matchStats).slice(0, 24);
  const important = [];

  for (const row of rows) {
    const name = normalizeStatName(row.name);
    if (!/(xg|expected|shot|disparo|remate|possession|posesion|posesión|big chance|clear chance|ocasion|ocasión|momentum)/i.test(name)) {
      continue;
    }

    important.push({
      stat: row.name,
      [homeName]: row.home,
      [awayName]: row.away,
    });
  }

  return important.slice(0, 8);
}

function flattenStatRows(value, rows = []) {
  if (!value) return rows;

  if (Array.isArray(value)) {
    for (const item of value) flattenStatRows(item, rows);
    return rows;
  }

  if (typeof value !== "object") return rows;

  const name = value.name || value.title || value.key || value.stat;
  const home = value.home ?? value.homeValue ?? value.home_value;
  const away = value.away ?? value.awayValue ?? value.away_value;
  if (name && home !== undefined && away !== undefined) {
    rows.push({ name: String(name), home, away });
  }

  for (const nested of Object.values(value)) {
    if (nested && typeof nested === "object") flattenStatRows(nested, rows);
  }

  return rows;
}

function buildValidationRules(matchData, context, recentEditorialSignatures = []) {
  const homeName = normalizeTeamName(matchData?.teams?.home?.name);
  const awayName = normalizeTeamName(matchData?.teams?.away?.name);
  const signature = String(context?.signature || "");
  const baseHeadline = String(context?.headline || "");
  const source = String(context?.source || "");

  return {
    teamNames: [homeName, awayName].filter(Boolean),
    group: matchData?.competition?.groupLetter || null,
    requiredNarratives: getRequiredNarratives({ signature, source, baseHeadline }),
    recentHeadlines: normalizeRecentHeadlines(recentEditorialSignatures),
    baseHeadline,
  };
}

function buildReasonerValidationRules(baseRules, context, reasoned) {
  const requiredNarratives = new Set();

  for (const narrative of getHighImpactNarratives(context)) {
    requiredNarratives.add(narrative);
  }

  for (const narrative of normalizeNarrativeList(reasoned?.must_include_narratives)) {
    requiredNarratives.add(narrative);
  }

  return {
    ...baseRules,
    requiredNarratives: Array.from(requiredNarratives),
  };
}

function getHighImpactNarratives(context) {
  const facts = (context?.facts || []).filter((fact) => fact?.text || fact?.signature || fact?.source);
  if (!facts.length) {
    return getRequiredNarratives({
      signature: context?.signature || "",
      source: context?.source || "",
      baseHeadline: context?.headline || "",
    });
  }

  const highImpact = facts.filter((fact) => {
    const level = Number(fact.level || 0);
    const priority = Number(fact.priority || 0);
    const text = `${fact.signature || ""} ${fact.source || ""} ${fact.text || ""}`.toLowerCase();
    const absoluteSignal = /(qualified|clasific|elimin|guaranteed-first|group-winner|primer lugar|liderato|record|récord|maximo goleador|maximo anotador|seis mundiales|marca historica|first-qualified|boleto|siguiente fase)/i.test(text);
    return absoluteSignal && (level === 1 || priority >= 96);
  });

  const narratives = [];
  for (const fact of highImpact) {
    narratives.push(
      ...getRequiredNarratives({
        signature: fact.signature || "",
        source: fact.source || "",
        baseHeadline: fact.text || "",
      }),
    );
  }

  return Array.from(new Set(narratives));
}

function parseEditorialDecision(raw) {
  const cleaned = String(raw || "")
    .trim()
    .replace(/^```(?:json)?/i, "")
    .replace(/```$/i, "")
    .trim();

  let parsed;
  try {
    parsed = JSON.parse(cleaned);
  } catch (error) {
    const match = cleaned.match(/\{[\s\S]*\}/);
    if (!match) {
      throw new Error(`Reasoner did not return JSON: ${cleaned.slice(0, 120)}`);
    }
    parsed = JSON.parse(match[0]);
  }

  const decision = Array.isArray(parsed) ? parsed[0] : parsed;
  if (!decision || typeof decision !== "object") {
    throw new Error("Reasoner returned an invalid editorial decision.");
  }

  const headline = cleanGeneratedHeadline(decision.headline || decision.text || decision.titular);
  if (!headline) {
    throw new Error("Reasoner returned JSON without a headline.");
  }

  return {
    primary_angle: String(decision.primary_angle || decision.primaryAngle || decision.angle || "").trim(),
    secondary_angle: String(decision.secondary_angle || decision.secondaryAngle || "").trim(),
    must_include_narratives: normalizeNarrativeList(
      decision.must_include_narratives || decision.mustIncludeNarratives || decision.required_narratives || [],
    ),
    rationale: String(decision.rationale || decision.reason || decision.why || "").trim(),
    headline,
  };
}

function normalizeNarrativeList(value) {
  const entries = Array.isArray(value) ? value : String(value || "").split(/[,;|]/);
  const aliases = {
    classification: "qualification",
    classified: "qualification",
    qualified: "qualification",
    clasificacion: "qualification",
    clasificación: "qualification",
    clasifica: "qualification",
    avance: "qualification",
    leader: "group-lead",
    liderato: "group-lead",
    liderazgo: "group-lead",
    "primer lugar": "group-lead",
    elimination: "elimination",
    eliminacion: "elimination",
    eliminación: "elimination",
    record: "record",
    récord: "record",
    milestone: "record",
    hito: "record",
    "historic-milestone": "record",
    late: "late-goal",
    "late goal": "late-goal",
    "late-goal": "late-goal",
    dominance: "dominance",
    dominio: "dominance",
    "third place": "third-place-route",
    "third-place": "third-place-route",
    "third-place-route": "third-place-route",
    "mejores terceros": "third-place-route",
  };

  return Array.from(
    new Set(
      entries
        .map((entry) => normalizeText(entry).replace(/\s+/g, " ").trim())
        .filter(Boolean)
        .map((entry) => aliases[entry] || entry.replace(/\s+/g, "-"))
        .filter((entry) =>
          [
            "qualification",
            "group-lead",
            "elimination",
            "record",
            "third-place-route",
            "late-goal",
            "dominance",
          ].includes(entry),
        ),
    ),
  );
}

function getRequiredNarratives({ signature, source, baseHeadline }) {
  const text = `${signature} ${source} ${baseHeadline}`.toLowerCase();
  const narratives = [];

  if (/qualified|clasific|avanz|siguiente fase|primer clasificado|boleto|first-qualified|guaranteed-top-two/.test(text)) {
    narratives.push("qualification");
  }
  if (/lider|primer lugar|guaranteed-first|group-winner/.test(text)) {
    narratives.push("group-lead");
  }
  if (/elimin|fuera/.test(text)) {
    narratives.push("elimination");
  }
  if (/record|récord|maximo goleador|maximo anotador|seis mundiales|marca historica|player-all-time|player-first-to-score/.test(text)) {
    narratives.push("record");
  }
  if (/best-third|mejores terceros|third-place/.test(text)) {
    narratives.push("third-place-route");
  }
  if (/late|90\+|tiempo añadido|minutos finales|ultimo minuto|último minuto/.test(text)) {
    narratives.push("late-goal");
  }
  if (/domin|xg|remates|shots|ocasiones|resisti/.test(text)) {
    narratives.push("dominance");
  }

  return Array.from(new Set(narratives));
}

function validateEditorialHeadline(rawHeadline, rules) {
  const headline = cleanGeneratedHeadline(rawHeadline);
  if (!headline) return { ok: false, reason: "empty headline" };

  const words = wordCount(headline);
  if (words < 8) return { ok: false, reason: "headline is too short" };
  if (words > 38 || headline.length > 210) return { ok: false, reason: "headline is too long" };
  if (headline.includes("\n")) return { ok: false, reason: "headline contains multiple lines" };
  if (/[#]/.test(headline)) return { ok: false, reason: "headline contains hashtags" };
  if (/[🇦-🇿]/u.test(headline)) return { ok: false, reason: "headline contains emoji flags" };
  if (BANNED_TEMPLATE_FRAGMENTS.some((fragment) => includesNormalized(headline, fragment))) {
    return { ok: false, reason: "headline repeats a banned template phrase" };
  }

  if (!rules.teamNames.some((team) => includesNormalized(headline, team))) {
    return { ok: false, reason: "headline does not mention either team" };
  }

  for (const narrative of rules.requiredNarratives || []) {
    if (!headlineCoversNarrative(headline, narrative)) {
      return { ok: false, reason: `headline misses required narrative: ${narrative}` };
    }
  }

  for (const recent of rules.recentHeadlines || []) {
    if (isTooSimilar(headline, recent)) {
      return { ok: false, reason: "headline is too similar to a recent post" };
    }
  }

  if (rules.baseHeadline && isTooSimilar(headline, rules.baseHeadline, 0.92)) {
    return { ok: false, reason: "headline is only a copy of the fallback headline" };
  }

  return { ok: true, headline };
}

function headlineCoversNarrative(headline, narrative) {
  const text = normalizeText(headline);
  const patterns = {
    qualification: /(clasific|avanza|avanzar|avanzan|siguiente fase|boleto|pase)/i,
    "group-lead": /(lider|liderato|primer lugar|grupo|amarra)/i,
    elimination: /(elimin|fuera)/i,
    record: /(record|récord|marca|histor|maximo|maxima|goleador|anotar en seis mundiales|seis mundiales)/i,
    "third-place-route": /(mejores terceros|terceros|aspirar|opciones|espera)/i,
    "late-goal": /(90\+|tiempo anadido|agregado|minutos finales|ultimo minuto|cierre)/i,
    dominance: /(domini|remates|ocasiones|xg|resisti|resiste|pese|eficaz)/i,
  };

  return patterns[narrative]?.test(text) ?? true;
}

function cleanGeneratedHeadline(value) {
  return String(value || "")
    .replace(/^```(?:json|text)?/i, "")
    .replace(/```$/i, "")
    .replace(/^["“”']+|["“”']+$/g, "")
    .split(/\n+/)
    .map((line) => line.trim())
    .find(Boolean) || "";
}

function normalizeRecentHeadlines(entries = []) {
  return (entries || [])
    .map((entry) => (typeof entry === "string" ? entry : entry?.headline))
    .filter(Boolean)
    .map((headline) => String(headline).trim())
    .filter(Boolean);
}

function isTooSimilar(left, right, threshold = 0.78) {
  const a = normalizeText(left);
  const b = normalizeText(right);
  if (!a || !b) return false;
  if (a === b) return true;
  if (a.includes(b) || b.includes(a)) return true;

  const leftTokens = tokenSet(a);
  const rightTokens = tokenSet(b);
  if (!leftTokens.size || !rightTokens.size) return false;

  let overlap = 0;
  for (const token of leftTokens) {
    if (rightTokens.has(token)) overlap += 1;
  }

  return overlap / Math.max(leftTokens.size, rightTokens.size) >= threshold;
}

function tokenSet(value) {
  return new Set(
    normalizeText(value)
      .split(/\s+/)
      .filter((token) => token.length > 2),
  );
}

function includesNormalized(text, fragment) {
  return normalizeText(text).includes(normalizeText(fragment));
}

function normalizeText(value) {
  return String(value || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\w+']+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeStatName(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/_/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function wordCount(value) {
  return String(value || "")
    .trim()
    .split(/\s+/)
    .filter(Boolean).length;
}

async function safeResponseText(response) {
  try {
    return await response.text();
  } catch (error) {
    return error.message;
  }
}

module.exports = {
  buildWriterPayload,
  validateEditorialHeadline,
  writeEditorialHeadline,
};
