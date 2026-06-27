#!/usr/bin/env node

const assert = require("assert");
const { getInternalContext } = require("../../src/social/match-context");
const { buildEditorialSignalsForMatchData } = require("../../src/social/editorial-signals");
const { validateEditorialHeadline, writeEditorialHeadline } = require("../../src/social/editorial-writer");

function baseMatch({
  eventId = 9001,
  home,
  away,
  homeScore,
  awayScore,
  group = "D",
  matchday = 2,
  matchStats = null,
  tournament = null,
  priorGroup = null,
}) {
  const matchData = {
    source: { eventId, eventDate: "2026-06-21" },
    match: { status: "FINAL" },
    competition: { groupLetter: group, matchdayNumber: matchday },
    teams: {
      home: { name: home, providerName: home, score: homeScore },
      away: { name: away, providerName: away, score: awayScore },
    },
    events: { homeScorers: [], awayScorers: [] },
    context: {
      matchStats,
      tournament,
      priorGroup,
    },
  };

  matchData.context.editorialSignals = buildEditorialSignalsForMatchData(matchData, {
    newsDigest: {
      items: [
        {
          title: "Paraguay llega con presión a la segunda jornada",
          summary: "La selección necesita sumar para seguir en la pelea del grupo.",
        },
      ],
    },
  });

  return matchData;
}

function fakeOpenAIResponse(headlines) {
  const queue = [...headlines];
  return async () => ({
    ok: true,
    async json() {
      return {
        choices: [
          {
            message: {
              content: queue.shift() || "",
            },
          },
        ],
      };
    },
  });
}

function fakeGeminiResponse(headlines) {
  const queue = [...headlines];
  return async (url) => {
    assert(String(url).includes("generativelanguage.googleapis.com"), "Gemini provider should call Google Generative Language API");

    return {
      ok: true,
      async json() {
        return {
          candidates: [
            {
              content: {
                parts: [
                  {
                    text: queue.shift() || "",
                  },
                ],
              },
            },
          ],
        };
      },
    };
  };
}

async function withEnv(vars, callback) {
  const previous = {};
  for (const [key, value] of Object.entries(vars)) {
    previous[key] = process.env[key];
    process.env[key] = value;
  }

  try {
    await callback();
  } finally {
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
}

async function main() {
  const matchData = baseMatch({
    home: "Turkiye",
    away: "Paraguay",
    homeScore: 0,
    awayScore: 1,
    matchStats: [
      { name: "Big chances", home: 4, away: 1 },
      { name: "Expected goals", home: 1.9, away: 0.7 },
      { name: "Total shots", home: 16, away: 7 },
    ],
    priorGroup: {
      homePrior: { played: 1, wins: 1, points: 3 },
      awayPrior: { played: 1, wins: 0, points: 0 },
      homeAfter: { played: 2, wins: 1, losses: 1, points: 3 },
      awayAfter: { played: 2, wins: 1, losses: 1, points: 3 },
      groupOutlook: {
        home: { remainingGames: 1 },
        away: { remainingGames: 1 },
      },
    },
  });
  const context = getInternalContext(matchData);

  await withEnv(
    {
      OPENAI_API_KEY: "test-key",
      GEMINI_API_KEY: "",
      EDITORIAL_AI_PROVIDER: "openai",
      EDITORIAL_AI_ENABLED: "true",
      EDITORIAL_AI_MODEL: "test-model",
      EDITORIAL_REASONER_ENABLED: "false",
    },
    async () => {
      const accepted = await writeEditorialHeadline({
        matchData,
        context,
        recentEditorialSignatures: [],
        fetchImpl: fakeOpenAIResponse([
          "Paraguay resistió el dominio de Turquía y mantiene viva su pelea por avanzar en el Grupo D.",
        ]),
      });

      assert.strictEqual(accepted.aiWriter.used, true, "valid generated headline should be used");
      assert(accepted.headline.includes("Paraguay"), "accepted headline should mention the team");
      assert(accepted.headline.includes("avanzar"), "accepted headline should keep the group consequence");

      const repeated = await writeEditorialHeadline({
        matchData,
        context,
        recentEditorialSignatures: [
          {
            headline: "Paraguay resistió el dominio de Turquía y mantiene viva su pelea por avanzar en el Grupo D.",
          },
        ],
        fetchImpl: fakeOpenAIResponse([
          "Paraguay resistió el dominio de Turquía y mantiene viva su pelea por avanzar en el Grupo D.",
        ]),
        maxAttempts: 1,
      });

      assert.strictEqual(repeated.aiWriter.used, false, "repeated generated headline should fall back");
      assert.notStrictEqual(repeated.headline, "Paraguay resistió el dominio de Turquía y mantiene viva su pelea por avanzar en el Grupo D.");

      const validation = validateEditorialHeadline("Paraguay jugó mejor y ganó el partido.", {
        teamNames: ["Paraguay", "Turquía"],
        requiredNarratives: ["qualification"],
        recentHeadlines: [],
        baseHeadline: context.headline,
      });

      assert.strictEqual(validation.ok, false, "headline missing qualification context should be rejected");

      const repeatedCaboVerdeTemplate = validateEditorialHeadline(
        "Cabo Verde empató con Uruguay y suma un punto histórico ante una de las candidatas al título.",
        {
          teamNames: ["Cabo Verde", "Uruguay"],
          requiredNarratives: [],
          recentHeadlines: [
            "Cabo Verde empató con España y suma un punto histórico ante una de las candidatas al título.",
          ],
          baseHeadline: "",
        },
      );

      assert.strictEqual(repeatedCaboVerdeTemplate.ok, false, "reused Cabo Verde historic-point template should be rejected");

      const repeatedPointsTemplate = validateEditorialHeadline(
        "Paraguay consiguió su primera victoria del Mundial y suma tres puntos vitales en la pelea del Grupo D.",
        {
          teamNames: ["Paraguay", "Turquía"],
          requiredNarratives: [],
          recentHeadlines: [],
          baseHeadline: "",
        },
      );

      assert.strictEqual(repeatedPointsTemplate.ok, false, "generic three-points template should be rejected");

      const awkwardWeightPhrase = validateEditorialHeadline(
        "Portugal conserva el liderato, pero Colombia rescata un 4-4 que deja peso real en la pelea por avanzar.",
        {
          teamNames: ["Portugal", "Colombia"],
          requiredNarratives: [],
          recentHeadlines: [],
          baseHeadline: "",
        },
      );

      assert.strictEqual(awkwardWeightPhrase.ok, false, "awkward weight phrasing should be rejected");
    },
  );

  await withEnv(
    {
      OPENAI_API_KEY: "",
      GEMINI_API_KEY: "test-gemini-key",
      EDITORIAL_AI_PROVIDER: "gemini",
      EDITORIAL_AI_ENABLED: "true",
      EDITORIAL_AI_MODEL: "",
      GEMINI_TEXT_MODEL: "test-gemini-model",
      EDITORIAL_REASONER_ENABLED: "false",
    },
    async () => {
      const accepted = await writeEditorialHeadline({
        matchData,
        context,
        recentEditorialSignatures: [],
        fetchImpl: fakeGeminiResponse([
          "Paraguay aguantó las mejores ocasiones de Turquía y mantiene viva su ruta para avanzar en el Grupo D.",
        ]),
      });

      assert.strictEqual(accepted.aiWriter.used, true, "valid Gemini headline should be used");
      assert.strictEqual(accepted.aiWriter.provider, "gemini", "Gemini provider should be marked in metadata");
      assert.strictEqual(accepted.aiWriter.model, "test-gemini-model", "Gemini model should be marked in metadata");
      assert(accepted.headline.includes("Paraguay"), "accepted Gemini headline should mention the team");
      assert(accepted.headline.includes("Grupo D"), "accepted Gemini headline should keep the group consequence");
    },
  );

  await withEnv(
    {
      OPENAI_API_KEY: "",
      GEMINI_API_KEY: "test-gemini-key",
      EDITORIAL_AI_PROVIDER: "gemini",
      EDITORIAL_AI_ENABLED: "true",
      EDITORIAL_AI_MODEL: "",
      GEMINI_TEXT_MODEL: "test-gemini-model",
      EDITORIAL_REASONER_ENABLED: "true",
    },
    async () => {
      const accepted = await writeEditorialHeadline({
        matchData,
        context,
        recentEditorialSignatures: [],
        fetchImpl: fakeGeminiResponse([
          JSON.stringify({
            primary_angle: "dominance",
            secondary_angle: "qualification",
            must_include_narratives: ["dominance", "qualification"],
            rationale: "Paraguay won despite Turkey creating better chances, so the best short angle combines resistance with group consequence.",
            headline: "Paraguay resistió las ocasiones más claras de Turquía y mantiene viva su ruta para avanzar en el Grupo D.",
          }),
        ]),
      });

      assert.strictEqual(accepted.aiWriter.used, true, "valid reasoned Gemini headline should be used");
      assert.strictEqual(accepted.aiWriter.reasonerUsed, true, "reasoner path should be marked in metadata");
      assert.strictEqual(accepted.aiWriter.provider, "gemini", "Gemini provider should be marked in reasoner metadata");
      assert(accepted.headline.includes("Paraguay"), "reasoned headline should mention the team");
      assert(accepted.headline.includes("avanzar"), "reasoned headline should keep the group consequence");
      assert(/ocasiones|resisti/i.test(accepted.headline), "reasoned headline should keep the dominance context it selected");
    },
  );

  await withEnv(
    {
      OPENAI_API_KEY: "",
      GEMINI_API_KEY: "",
      EDITORIAL_AI_ENABLED: "true",
    },
    async () => {
      const fallbackContext = {
        headline: "Cabo Verde empató con Uruguay y suma un punto histórico ante una de las candidatas al título.",
        source: "test",
        signature: "test-repeat",
        facts: [
          {
            priority: 99,
            source: "test",
            signature: "test-repeat",
            text: "Cabo Verde empató con Uruguay y suma un punto histórico ante una de las candidatas al título.",
          },
          {
            priority: 98,
            source: "test",
            signature: "test-alternative",
            text: "Cabo Verde le cerró el camino a Uruguay y convierte el empate en un resultado histórico.",
          },
        ],
      };
      const fallbackMatch = baseMatch({
        eventId: 9002,
        home: "Cabo Verde",
        away: "Uruguay",
        homeScore: 0,
        awayScore: 0,
        group: "H",
        matchday: 1,
      });

      const guarded = await writeEditorialHeadline({
        matchData: fallbackMatch,
        context: fallbackContext,
        recentEditorialSignatures: [
          {
            headline: "Cabo Verde empató con España y suma un punto histórico ante una de las candidatas al título.",
          },
        ],
      });

      assert.strictEqual(guarded.aiWriter.used, false, "fallback path should not use AI without a key");
      assert.strictEqual(guarded.headline, "Cabo Verde le cerró el camino a Uruguay y convierte el empate en un resultado histórico.");
      assert.strictEqual(guarded.aiWriter.fallbackAdjusted, true, "fallback should be adjusted away from repeated text");
    },
  );

  console.log("Editorial writer smoke tests passed.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
