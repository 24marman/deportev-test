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
  homeScorers = [],
  awayScorers = [],
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
      homeScorers,
      awayScorers,
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

function runCase({ name, matchData, expectSignature, expectIncludes, rejectIncludes, options }) {
  const context = getInternalContext(matchData, options);
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

  for (const fragment of rejectIncludes || []) {
    assert(
      !headline.toLowerCase().includes(fragment.toLowerCase()),
      `${name}: headline should not include "${fragment}"`,
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
  name: "qualification stays primary while adding exceptional stats",
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
  expectIncludes: ["primer clasificado", "pese al dominio rival"],
});

runCase({
  name: "qualification can combine with late decisive goal",
  matchData: baseMatch({
    eventId: 4003,
    home: "Mexico",
    away: "South Korea",
    homeScore: 1,
    awayScore: 0,
    group: "A",
    matchday: 2,
    homeScorers: [{ minute: "90+3'", player: "Lozano" }],
    tournament: {
      qualifiedBeforeCount: 0,
      qualifiedAfterCount: 1,
      newlyQualified: ["mexico"],
      newlyGuaranteedFirst: ["mexico"],
      firstQualifiedThisTournament: true,
    },
  }),
  expectSignature: "first-qualified-and-group-winner:leader-first-ticket+late-winner",
  expectIncludes: ["90+3'", "primer clasificado"],
});

runCase({
  name: "absolute consequence memory avoids exact repeated copy",
  matchData: baseMatch({
    eventId: 4004,
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
  }),
  options: {
    recentEditorialSignatures: [
      {
        signature: "first-qualified-and-group-winner:leader-first-ticket+winner-survives-opponent-clear-chances",
        headline:
          "Estados Unidos venció a Australia pese al dominio rival, asegura el liderato del Grupo D y se convierte en el primer clasificado del Mundial.",
      },
    ],
  },
  expectIncludes: ["Estados Unidos", "clasificad"],
  rejectIncludes: ["se convierte en el primer clasificado del Mundial"],
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

const brazilHaitiMatchdayTwo = baseMatch({
  eventId: 8001,
  home: "Brazil",
  away: "Haiti",
  homeScore: 3,
  awayScore: 0,
  group: "C",
  matchday: 2,
  priorGroup: {
    homePrior: { played: 1, wins: 0, draws: 1, losses: 0, points: 1, goalsFor: 1, goalsAgainst: 1 },
    awayPrior: { played: 1, wins: 0, draws: 0, losses: 1, points: 0, goalsFor: 0, goalsAgainst: 1 },
    homeAfter: { played: 2, wins: 1, draws: 1, losses: 0, points: 4, goalsFor: 4, goalsAgainst: 1 },
    awayAfter: { played: 2, wins: 0, draws: 0, losses: 2, points: 0, goalsFor: 0, goalsAgainst: 4 },
    groupOutlook: {
      home: { remainingGames: 1, guaranteedTopTwo: false, oneStepFromTopTwo: false },
      away: {
        remainingGames: 1,
        guaranteedTopTwo: false,
        oneStepFromTopTwo: false,
        noLongerControlsTopTwo: true,
        eliminatedTopTwo: false,
        eliminatedRoundOf32: false,
      },
    },
  },
});

runCase({
  name: "third-place route avoids premature elimination angle",
  matchData: brazilHaitiMatchdayTwo,
  expectIncludes: ["Brasil", "primera victoria", "mejores terceros"],
});

runNegativeCase({
  name: "third-place route does not call Haiti eliminated",
  matchData: brazilHaitiMatchdayTwo,
  rejectIncludes: ["eliminado", "eliminada", "ya no depende"],
});

const paraguayTurkeyMatchdayTwo = baseMatch({
  eventId: 8101,
  home: "Turkiye",
  away: "Paraguay",
  homeScore: 0,
  awayScore: 1,
  group: "D",
  matchday: 2,
  matchStats: [
    { name: "Big chances", home: 4, away: 1 },
    { name: "Expected goals", home: 1.9, away: 0.7 },
    { name: "Total shots", home: 16, away: 7 },
    { name: "Shots on target", home: 5, away: 2 },
  ],
  priorGroup: {
    homePrior: { played: 1, wins: 1, draws: 0, losses: 0, points: 3, goalsFor: 2, goalsAgainst: 1 },
    awayPrior: { played: 1, wins: 0, draws: 0, losses: 1, points: 0, goalsFor: 0, goalsAgainst: 2 },
    homeAfter: { played: 2, wins: 1, draws: 0, losses: 1, points: 3, goalsFor: 2, goalsAgainst: 2 },
    awayAfter: { played: 2, wins: 1, draws: 0, losses: 1, points: 3, goalsFor: 1, goalsAgainst: 2 },
    groupOutlook: {
      home: { remainingGames: 1, guaranteedTopTwo: false, oneStepFromTopTwo: false },
      away: { remainingGames: 1, guaranteedTopTwo: false, oneStepFromTopTwo: false },
    },
  },
});

runCase({
  name: "matchday two winner stakes beat loser chance dominance",
  matchData: paraguayTurkeyMatchdayTwo,
  expectSignature: "matchday-two-winner-enters-top-two-race:back-in-race+winner-survives-opponent-clear-chances",
  expectIncludes: ["Paraguay", "resistió el dominio de Turquía", "pelea por avanzar"],
  rejectIncludes: ["consigue tres puntos clave", "venció a Turquía pese al dominio de Turquía"],
});

runNegativeCase({
  name: "loser big chances cannot become headline",
  matchData: paraguayTurkeyMatchdayTwo,
  rejectIncludes: ["Turquía tuvo las ocasiones más claras"],
});

runCase({
  name: "recent editorial memory forces a different group-stakes variant",
  matchData: paraguayTurkeyMatchdayTwo,
  options: {
    recentEditorialSignatures: [
      {
        signature: "matchday-two-winner-enters-top-two-race:back-in-race+winner-survives-opponent-clear-chances",
        headline: "Paraguay resistió el dominio de Turquía y se mete de lleno en la pelea por avanzar en el Grupo D.",
      },
    ],
  },
  expectIncludes: ["Paraguay"],
  rejectIncludes: ["se mete de lleno en la pelea por avanzar", "consigue tres puntos clave"],
});

console.log("Editorial smoke tests passed.");
