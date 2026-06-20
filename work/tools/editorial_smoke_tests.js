#!/usr/bin/env node

const assert = require("assert");
const { getInternalContext } = require("../../src/social/match-context");
const { buildEditorialSignalsForMatchData } = require("../../src/social/editorial-signals");

function baseMatch({
  eventId = 1001,
  home,
  away,
  homeScore,
  awayScore,
  group = "A",
  matchday = 1,
  matchStats = null,
  tournament = null,
  priorGroup = null,
  newsDigest = null,
}) {
  const matchData = {
    source: {
      eventId,
      eventDate: "2026-06-19",
    },
    match: {
      status: "FINAL",
    },
    competition: {
      groupLetter: group,
      matchdayNumber: matchday,
    },
    teams: {
      home: {
        name: home,
        providerName: home,
        score: homeScore,
      },
      away: {
        name: away,
        providerName: away,
        score: awayScore,
      },
    },
    events: {
      homeScorers: [],
      awayScorers: [],
    },
    context: {
      matchStats,
      tournament,
      priorGroup,
    },
  };

  matchData.context.editorialSignals = buildEditorialSignalsForMatchData(matchData, { newsDigest });
  return matchData;
}

function runCase({ name, matchData, expectSignature, expectIncludes }) {
  const context = getInternalContext(matchData);
  const headline = context.headline;
  console.log(`${name}: ${headline}`);
  console.log(`  source=${context.source} signature=${context.signature}`);

  if (expectSignature) {
    assert.strictEqual(context.signature, expectSignature, `${name}: expected signature ${expectSignature}`);
  }

  for (const fragment of expectIncludes || []) {
    assert(
      headline.toLowerCase().includes(fragment.toLowerCase()),
      `${name}: expected headline to include "${fragment}"`,
    );
  }
}

function runNegativeCase({ name, matchData, rejectIncludes }) {
  const context = getInternalContext(matchData);
  const headline = context.headline;
  console.log(`${name}: ${headline}`);
  console.log(`  source=${context.source} signature=${context.signature}`);

  for (const fragment of rejectIncludes || []) {
    assert(
      !headline.toLowerCase().includes(fragment.toLowerCase()),
      `${name}: headline should not include "${fragment}"`,
    );
  }
}

runCase({
  name: "qualification beats stats",
  matchData: baseMatch({
    eventId: 4002,
    home: "USA",
    away: "Australia",
    homeScore: 2,
    awayScore: 0,
    group: "D",
    matchday: 2,
    matchStats: [
      { name: "Total shots", home: 6, away: 24 },
      { name: "Shots on target", home: 3, away: 11 },
      { name: "Expected goals", home: 0.9, away: 2.6 },
    ],
    tournament: {
      qualifiedBeforeCount: 0,
      qualifiedAfterCount: 1,
      newlyQualified: ["usa"],
      newlyGuaranteedFirst: ["usa"],
      firstQualifiedThisTournament: true,
    },
    newsDigest: {
      items: [
        {
          title: "Estados Unidos busca asegurar clasificación y liderato de grupo",
          summary: "La selección estadounidense puede avanzar a la siguiente ronda.",
        },
      ],
    },
  }),
  expectSignature: "first-qualified-and-group-winner",
  expectIncludes: ["primer clasificado"],
});

runCase({
  name: "debutant resists favorite dominance",
  matchData: baseMatch({
    eventId: 5001,
    home: "Spain",
    away: "Cabo Verde",
    homeScore: 0,
    awayScore: 0,
    group: "H",
    matchday: 1,
    matchStats: [
      { name: "Ball possession", home: 74, away: 26 },
      { name: "Expected goals", home: 2.29, away: 0.3 },
      { name: "Total shots", home: 27, away: 6 },
      { name: "Shots on target", home: 7, away: 1 },
    ],
    newsDigest: {
      items: [
        {
          title: "España llega como candidata y Cabo Verde afronta su debut mundialista",
          summary: "La Roja parte como favorita ante una selección debutante.",
        },
      ],
    },
  }),
  expectIncludes: ["Cabo Verde", "resistió"],
});

runCase({
  name: "defending champion context",
  matchData: baseMatch({
    eventId: 6001,
    home: "Argentina",
    away: "Algeria",
    homeScore: 1,
    awayScore: 0,
    group: "J",
    matchday: 1,
    newsDigest: {
      items: [
        {
          title: "Argentina inicia la defensa del título mundial",
          summary: "El campeón vigente debuta en la Copa del Mundo 2026.",
        },
      ],
    },
  }),
  expectIncludes: ["campeón vigente", "debuta"],
});

runNegativeCase({
  name: "news does not invent qualification",
  matchData: baseMatch({
    eventId: 7001,
    home: "Mexico",
    away: "South Korea",
    homeScore: 1,
    awayScore: 0,
    group: "A",
    matchday: 2,
    newsDigest: {
      items: [
        {
          title: "México sueña con clasificación en el Mundial",
          summary: "El Tri llega con presión para la segunda jornada.",
        },
      ],
    },
  }),
  rejectIncludes: ["asegura", "clasificación", "clasificado"],
});

console.log("Editorial smoke tests passed.");
