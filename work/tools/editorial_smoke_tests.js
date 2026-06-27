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
  playerMilestones = null,
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
      playerMilestones,
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
  name: "historic underdog draw avoids reused title-candidate wording",
  matchData: baseMatch({
    eventId: 5002,
    home: "Cabo Verde",
    away: "Uruguay",
    homeScore: 0,
    awayScore: 0,
    group: "H",
    matchday: 1,
    newsDigest: {
      items: [
        {
          title: "Cabo Verde afronta una prueba de jerarquía ante Uruguay",
          summary: "Uruguay llega como una de las selecciones fuertes del grupo.",
        },
      ],
    },
  }),
  options: {
    recentEditorialSignatures: [
      {
        headline: "Cabo Verde empató con España y suma un punto histórico ante una de las candidatas al título.",
      },
    ],
  },
  expectIncludes: ["Cabo Verde", "histórico"],
  rejectIncludes: ["suma un punto histórico ante una de las candidatas al título"],
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
  expectIncludes: ["Paraguay", "resistió el dominio de Turquía", "reactiva su pelea por avanzar"],
  rejectIncludes: ["consigue tres puntos clave", "se mete de lleno en la pelea por avanzar", "venció a Turquía pese al dominio de Turquía"],
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
        headline: "Paraguay resistió el dominio de Turquía y reactiva su pelea por avanzar en el Grupo D.",
      },
    ],
  },
  expectIncludes: ["Paraguay"],
  rejectIncludes: ["se mete de lleno en la pelea por avanzar", "consigue tres puntos clave"],
});

runCase({
  name: "team historic nine points beats generic leader angle",
  matchData: baseMatch({
    eventId: 9001,
    home: "Czechia",
    away: "Mexico",
    homeScore: 0,
    awayScore: 3,
    group: "A",
    matchday: 3,
    priorGroup: {
      homePrior: { played: 2, wins: 0, draws: 0, losses: 2, points: 0, goalsFor: 1, goalsAgainst: 5 },
      awayPrior: { played: 2, wins: 2, draws: 0, losses: 0, points: 6, goalsFor: 4, goalsAgainst: 1 },
      homeAfter: { played: 3, wins: 0, draws: 0, losses: 3, points: 0, goalsFor: 1, goalsAgainst: 8 },
      awayAfter: { played: 3, wins: 3, draws: 0, losses: 0, points: 9, goalsFor: 7, goalsAgainst: 1 },
      groupOutlook: {
        home: { remainingGames: 0 },
        away: { remainingGames: 0, guaranteedTopTwo: true, guaranteedFirst: true },
      },
    },
  }),
  expectSignature: "team-first-perfect-group-stage",
  expectIncludes: ["México", "nueve puntos", "primera vez"],
  rejectIncludes: ["superioridad", "alto ritmo"],
});

runCase({
  name: "draw that decides first place beats high-scoring generic angle",
  matchData: baseMatch({
    eventId: 9010,
    home: "Colombia",
    away: "Portugal",
    homeScore: 4,
    awayScore: 4,
    group: "K",
    matchday: 3,
    priorGroup: {
      homePrior: { played: 2, wins: 2, draws: 0, losses: 0, points: 6, goalsFor: 6, goalsAgainst: 2 },
      awayPrior: { played: 2, wins: 1, draws: 1, losses: 0, points: 4, goalsFor: 5, goalsAgainst: 2 },
      homeAfter: { played: 3, wins: 2, draws: 1, losses: 0, points: 7, goalsFor: 10, goalsAgainst: 6 },
      awayAfter: { played: 3, wins: 1, draws: 2, losses: 0, points: 5, goalsFor: 9, goalsAgainst: 6 },
      tableAfter: [
        { team: "colombia", played: 3, wins: 2, draws: 1, losses: 0, points: 7, goalsFor: 10, goalsAgainst: 6, goalDifference: 4 },
        { team: "portugal", played: 3, wins: 1, draws: 2, losses: 0, points: 5, goalsFor: 9, goalsAgainst: 6, goalDifference: 3 },
      ],
      groupOutlook: {
        home: { played: 3, points: 7, rank: 1, remainingGames: 0, guaranteedFirst: true, guaranteedTopTwo: true },
        away: { played: 3, points: 5, rank: 2, remainingGames: 0, guaranteedTopTwo: true },
        teams: {
          colombia: { played: 3, points: 7, rank: 1, remainingGames: 0, guaranteedFirst: true, guaranteedTopTwo: true },
          portugal: { played: 3, points: 5, rank: 2, remainingGames: 0, guaranteedTopTwo: true },
        },
      },
    },
  }),
  expectSignature: "draw-leader-finishes-first",
  expectIncludes: ["Colombia", "primer lugar", "4-4"],
  rejectIncludes: ["partidos más abiertos", "partido abierto"],
});

runCase({
  name: "player all-time scorer record beats match description",
  matchData: baseMatch({
    eventId: 9002,
    home: "Argentina",
    away: "Ghana",
    homeScore: 2,
    awayScore: 1,
    group: "J",
    matchday: 2,
    playerMilestones: {
      facts: [
        {
          priority: 132,
          level: 1,
          source: "editorial-player-milestone",
          signature: "player-all-time-world-cup-goal-record",
          text: "Messi se convierte en el máximo goleador histórico de los Mundiales.",
        },
      ],
    },
  }),
  expectSignature: "player-all-time-world-cup-goal-record",
  expectIncludes: ["Messi", "máximo goleador histórico"],
});

runCase({
  name: "six world cups scoring record beats generic Portugal win",
  matchData: baseMatch({
    eventId: 9003,
    home: "Portugal",
    away: "Tunisia",
    homeScore: 1,
    awayScore: 0,
    group: "F",
    matchday: 2,
    playerMilestones: {
      facts: [
        {
          priority: 131,
          level: 1,
          source: "editorial-player-milestone",
          signature: "player-first-to-score-in-six-world-cups",
          text: "Cristiano Ronaldo se convierte en el primer jugador en anotar en seis Mundiales distintos.",
        },
      ],
    },
  }),
  expectSignature: "player-first-to-score-in-six-world-cups",
  expectIncludes: ["Cristiano Ronaldo", "seis Mundiales"],
});

console.log("Editorial smoke tests passed.");
