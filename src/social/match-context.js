const fs = require("fs");
const path = require("path");
const { normalizeTeamName } = require("./caption");
const { normalizeTeamKey } = require("../lib/team-metadata");

const FACTS_PATH = path.join(__dirname, "..", "data", "world-cup-team-facts.json");

function readFacts() {
  try {
    return JSON.parse(fs.readFileSync(FACTS_PATH, "utf8"));
  } catch (error) {
    return {};
  }
}

const TEAM_FACTS = readFacts();

function getTeamFacts(name) {
  return TEAM_FACTS[normalizeTeamKey(name)] || {};
}

function getInternalContext(matchData) {
  const facts = buildFactCandidates(matchData);
  const warmed = matchData.context?.warmedEditorial?.context;

  if (warmed?.facts?.length) {
    facts.push(
      ...warmed.facts.map((fact) => ({
        ...fact,
        priority: Math.max(0, Number(fact.priority || 0) - 8),
        source: `${fact.source || "warmed-editorial"}:warmed`,
      })),
    );
    facts.sort((a, b) => b.priority - a.priority);
  }

  const headline = pickHeadline(facts, matchData);

  return {
    source: facts[0]?.source || "internal-editorial-engine",
    headline,
    facts,
  };
}

function buildFactCandidates(matchData) {
  const home = matchData.teams?.home || {};
  const away = matchData.teams?.away || {};
  const homeScore = Number(home.score || 0);
  const awayScore = Number(away.score || 0);
  const totalGoals = homeScore + awayScore;
  const margin = Math.abs(homeScore - awayScore);
  const group = matchData.competition?.groupLetter;
  const matchday = Number(matchData.competition?.matchdayNumber || 0);
  const homeName = normalizeTeamName(home.name);
  const awayName = normalizeTeamName(away.name);
  const homeFacts = getTeamFacts(home.providerName || home.name);
  const awayFacts = getTeamFacts(away.providerName || away.name);
  const prior = matchData.context?.priorGroup || {};
  const homePrior = prior.homePrior || {};
  const awayPrior = prior.awayPrior || {};
  const homeAfter = prior.homeAfter || projectStanding(homePrior, homeScore, awayScore);
  const awayAfter = prior.awayAfter || projectStanding(awayPrior, awayScore, homeScore);
  const stats = extractStatHighlights(matchData.context?.matchStats, homeName, awayName);
  const statSummary = summarizeStats(matchData.context?.matchStats);
  const scoring = getScoringStory(matchData);
  const decisiveLateGoal = getDecisiveLateGoalStory(matchData);
  const candidates = [];

  const isDraw = homeScore === awayScore;
  const winner = homeScore > awayScore ? home : away;
  const loser = homeScore > awayScore ? away : home;
  const winnerScore = Math.max(homeScore, awayScore);
  const loserScore = Math.min(homeScore, awayScore);
  const winnerName = normalizeTeamName(winner.name);
  const loserName = normalizeTeamName(loser.name);
  const winnerFacts = homeScore > awayScore ? homeFacts : awayFacts;
  const winnerPrior = homeScore > awayScore ? homePrior : awayPrior;
  const homeProfile = buildEditorialProfile(homeName, homeFacts, homePrior);
  const awayProfile = buildEditorialProfile(awayName, awayFacts, awayPrior);
  const winnerProfile = homeScore > awayScore ? homeProfile : awayProfile;
  const loserProfile = homeScore > awayScore ? awayProfile : homeProfile;
  const winnerAfter = homeScore > awayScore ? homeAfter : awayAfter;
  const loserAfter = homeScore > awayScore ? awayAfter : homeAfter;

  pushFirstGoalCandidate(candidates, homeName, homeScore, homeFacts, homePrior);
  pushFirstGoalCandidate(candidates, awayName, awayScore, awayFacts, awayPrior);
  pushHighScoringMatchCandidate(candidates, {
    homeName,
    awayName,
    homeScore,
    awayScore,
    totalGoals,
    isDraw,
    winnerName,
    group,
    statSummary,
  });
  pushDecisiveLateGoalCandidate(candidates, {
    story: decisiveLateGoal,
    homeName,
    awayName,
    homeScore,
    awayScore,
    group,
  });

  if (!isDraw) {
    pushUpsetWinCandidates(candidates, winnerProfile, loserProfile, winnerScore, loserScore);

    if (Number(winnerPrior.played || 0) > 0 && Number(winnerPrior.wins || 0) === 0) {
      candidates.push({
        priority: 95,
        source: "bsd-tournament-results",
        text: `${winnerName} consigue su primera victoria de este Mundial y toma aire en la fase de grupos.`,
      });
    }

    if (isHistoricFirstWin(winnerFacts, winnerPrior)) {
      candidates.push({
        priority: 94,
        source: "curated-world-cup-team-facts",
        text: `${winnerName} firma una noche histórica: su primera victoria mundialista llega con un ${winnerScore}-${loserScore} ante ${loserName}.`,
      });
    }

    if (isHistoricFirstGoal(winnerFacts, winnerPrior) && winnerScore > 0) {
      candidates.push({
        priority: 89,
        source: "curated-world-cup-team-facts",
        text: `${winnerName} rompe una barrera mundialista: marca por primera vez en el torneo y lo convierte en triunfo.`,
      });
    }

    if (Number(winnerFacts.worldCupTitlesBefore2026 || 0) > 0 && margin >= 2) {
      candidates.push({
        priority: 80,
        source: "curated-world-cup-team-facts",
        text: `${winnerName} impone jerarquía de campeón mundial y convierte el resultado en una declaración de autoridad.`,
      });
    }

    if (isDeepRunTeam(winnerFacts) && margin >= 2) {
      candidates.push({
        priority: 76,
        source: "curated-world-cup-team-facts",
        text: `${winnerName} recuerda por qué carga historia grande en Mundiales: triunfo sólido y mensaje competitivo.`,
      });
    }

    if (scoring.comebackWinner === normalizeTeamKey(winner.providerName || winner.name)) {
      candidates.push({
        priority: 88,
        source: "bsd-incidents",
        text: `${winnerName} transforma el golpe inicial en una remontada de carácter ante ${loserName}.`,
      });
    }

    if (margin >= 4) {
      candidates.push({
        priority: 84,
        source: "bsd-scoreline",
        text: `${winnerName} manda un mensaje fuerte: goleada de ${winnerScore}-${loserScore} y diferencia de peso para la tabla.`,
      });
    } else if (winnerScore >= 3) {
      candidates.push({
        priority: 78,
        source: "bsd-scoreline",
        text: `${winnerName} encuentra pegada en el momento justo y sale con tres puntos de alto valor ante ${loserName}.`,
      });
    } else if (margin === 1) {
      candidates.push({
        priority: 72,
        source: "bsd-scoreline",
        text: `${winnerName} gana un partido de detalles ante ${loserName} y suma tres puntos que pueden pesar mucho.`,
      });
    }

    if (loserScore === 0) {
      candidates.push({
        priority: 70,
        source: "bsd-scoreline",
        text: `${winnerName} combina eficacia y portería en cero para fortalecer su arranque mundialista.`,
      });
    }

    if (Number(winnerPrior.played || 0) > 0 && Number(winnerPrior.losses || 0) === 0) {
      candidates.push({
        priority: 68,
        source: "bsd-tournament-results",
        text: `${winnerName} mantiene el invicto y refuerza su posición en la pelea del grupo.`,
      });
    }
  } else {
    pushDrawHierarchyCandidates(candidates, homeProfile, awayProfile, homeScore, awayScore);

    if (totalGoals >= 4) {
      candidates.push({
        priority: 82,
        source: "bsd-scoreline",
        text: `${homeName} y ${awayName} entregan un empate de alto voltaje: goles, respuesta y reparto de puntos.`,
      });
    } else if (totalGoals === 0) {
      candidates.push({
        priority: 72,
        source: "bsd-scoreline",
        text: `${homeName} y ${awayName} se neutralizan en un empate cerrado que deja todo abierto.`,
      });
    } else {
      candidates.push({
        priority: 70,
        source: "bsd-scoreline",
        text: `${homeName} y ${awayName} reparten puntos en un duelo que aprieta el margen de error.`,
      });
    }
  }

  for (const highlight of stats) {
    candidates.push(highlight);
  }

  pushGroupStakesCandidates(candidates, {
    homeName,
    awayName,
    winnerName,
    loserName,
    isDraw,
    matchday,
    group,
    homeAfter,
    awayAfter,
    winnerAfter,
    loserAfter,
  });

  if (matchday === 1 && !isDraw) {
    candidates.push({
      priority: 58,
      source: "bsd-schedule",
      text: `${winnerName} abre su camino mundialista con una victoria que marca tono desde la primera jornada.`,
    });
  } else if (matchday === 2 && !isDraw) {
    candidates.push({
      priority: 55,
      source: "bsd-schedule",
      text: `${winnerName} da un paso importante en la segunda jornada y mete presión en su grupo.`,
    });
  } else if (matchday === 3 && !isDraw) {
    candidates.push({
      priority: 55,
      source: "bsd-schedule",
      text: `${winnerName} responde en el cierre de la fase de grupos con una victoria de máximo valor competitivo.`,
    });
  }

  if (group && candidates.length < 3) {
    candidates.push({
      priority: 40,
      source: "bsd-schedule",
      text: isDraw
        ? `${homeName} y ${awayName} dejan el Grupo ${group} más apretado tras el empate.`
        : `${winnerName} suma tres puntos que mueven la conversación del Grupo ${group}.`,
    });
  }

  candidates.push({
    priority: 10,
    source: "internal-fallback",
    text: isDraw
      ? `${homeName} y ${awayName} cierran un partido competido con reparto de puntos.`
      : `${winnerName} supera a ${loserName} y suma una victoria importante en su Mundial.`,
  });

  return candidates
    .filter((candidate) => candidate.text)
    .map((candidate) => ({
      ...candidate,
      text: compactEditorialText(candidate.text),
    }))
    .sort((a, b) => b.priority - a.priority);
}

function pickHeadline(candidates, matchData) {
  const topPriority = candidates[0]?.priority || 0;
  const spread = topPriority >= 90 ? 2 : 5;
  const topBand = candidates.filter((candidate) => candidate.priority >= topPriority - spread);
  const seed = Number(matchData.source?.eventId || 0);
  return (topBand[Math.abs(seed) % topBand.length] || candidates[0] || {}).text || "";
}

function isHistoricFirstWin(facts, prior) {
  return facts.worldCupWinsBefore2026 === 0 && Number(prior.wins || 0) === 0;
}

function isHistoricFirstGoal(facts, prior) {
  return facts.firstWorldCupAppearance === 2026 && Number(facts.worldCupGoalsBefore2026 || 0) === 0 && Number(prior.goalsFor || 0) === 0;
}

function projectStanding(prior, goalsFor, goalsAgainst) {
  const row = {
    played: Number(prior.played || 0) + 1,
    wins: Number(prior.wins || 0),
    draws: Number(prior.draws || 0),
    losses: Number(prior.losses || 0),
    points: Number(prior.points || 0),
    goalsFor: Number(prior.goalsFor || 0) + Number(goalsFor || 0),
    goalsAgainst: Number(prior.goalsAgainst || 0) + Number(goalsAgainst || 0),
  };

  if (goalsFor > goalsAgainst) {
    row.wins += 1;
    row.points += 3;
  } else if (goalsFor === goalsAgainst) {
    row.draws += 1;
    row.points += 1;
  } else {
    row.losses += 1;
  }

  return row;
}

function pushHighScoringMatchCandidate(candidates, context) {
  const { homeName, awayName, homeScore, awayScore, totalGoals, isDraw, winnerName, group, statSummary } = context;
  const bothTeamsMultipleGoals = homeScore >= 2 && awayScore >= 2;
  const dramaticScoreline = totalGoals >= 5 || bothTeamsMultipleGoals;

  if (!dramaticScoreline) return;

  const statsPhrase = getOpenGameStatsPhrase(statSummary);
  const groupPhrase = group ? ` en el Grupo ${group}` : "";

  if (isDraw) {
    candidates.push({
      priority: totalGoals >= 6 ? 93 : 91,
      source: "editorial-match-tempo",
      text: `${homeName} y ${awayName} firman un partidazo${groupPhrase}: goles, respuesta y tensión hasta el final${statsPhrase}.`,
    });
    return;
  }

  candidates.push({
    priority: totalGoals >= 6 ? 93 : 91,
    source: "editorial-match-tempo",
    text: `${winnerName} sale de pie de un partidazo${groupPhrase}: triunfo de alto voltaje y tres puntos enormes${statsPhrase}.`,
  });
}

function getOpenGameStatsPhrase(statSummary) {
  if (!statSummary) return "";

  if (statSummary.totalShots >= 28 && statSummary.totalShotsOnTarget >= 9) {
    return `, con ${statSummary.totalShots} remates y ${statSummary.totalShotsOnTarget} a puerta`;
  }

  if (statSummary.totalXg >= 3.5) {
    return `, con ${formatStatNumber(statSummary.totalXg)} xG combinados`;
  }

  if (statSummary.totalShots >= 24) {
    return `, con ${statSummary.totalShots} remates`;
  }

  return "";
}

function pushDecisiveLateGoalCandidate(candidates, context) {
  const { story, homeName, awayName, homeScore, awayScore, group } = context;
  if (!story) return;

  const teamName = story.side === "home" ? homeName : awayName;
  const opponentName = story.side === "home" ? awayName : homeName;
  const groupPhrase = group ? ` en el Grupo ${group}` : "";
  const minute = story.minuteLabel;

  if (homeScore === awayScore) {
    candidates.push({
      priority: 96,
      source: "bsd-incidents:late-decisive-goal",
      text: `${teamName} rescata el empate al ${minute}${groupPhrase}; golpe anímico para ${teamName} y frustración para ${opponentName}.`,
    });
    return;
  }

  candidates.push({
    priority: 96,
    source: "bsd-incidents:late-decisive-goal",
    text: `${teamName} decide el partido al ${minute}${groupPhrase}: victoria agónica y tres puntos que valen oro.`,
  });
}

function formatStatNumber(value) {
  return Number(value || 0).toFixed(1).replace(/\.0$/, "");
}

function pushGroupStakesCandidates(candidates, context) {
  const {
    homeName,
    awayName,
    winnerName,
    loserName,
    isDraw,
    matchday,
    group,
    homeAfter,
    awayAfter,
    winnerAfter,
    loserAfter,
  } = context;

  if (!group || matchday < 2) return;

  if (!isDraw && matchday === 2) {
    if (Number(winnerAfter.points || 0) >= 6) {
      candidates.push({
        priority: 87,
        source: "editorial-group-stakes",
        text: `${winnerName} queda muy bien perfilado en el Grupo ${group}: seis puntos de seis y la sensación de tener la clasificación encarrilada.`,
      });
    }

    if (Number(loserAfter.points || 0) <= 1) {
      candidates.push({
        priority: 86,
        source: "editorial-group-stakes",
        text: `${loserName} queda contra la pared en el Grupo ${group}: tendrá que ir por una victoria en la última jornada para sostener sus opciones.`,
      });
    }
  }

  if (isDraw && matchday === 2) {
    const homePoints = Number(homeAfter.points || 0);
    const awayPoints = Number(awayAfter.points || 0);

    if (homePoints <= 2 || awayPoints <= 2) {
      const pressured = homePoints <= awayPoints ? homeName : awayName;
      candidates.push({
        priority: 86,
        source: "editorial-group-stakes",
        text: `${pressured} suma, pero no respira: el empate deja el Grupo ${group} abierto y obliga a mirar la última jornada con presión real.`,
      });
    } else {
      candidates.push({
        priority: 82,
        source: "editorial-group-stakes",
        text: `${homeName} y ${awayName} dejan el Grupo ${group} al rojo vivo: el punto sirve, pero todavía no despeja el camino a la siguiente fase.`,
      });
    }
  }

  if (matchday === 3) {
    const winnerPoints = Number(winnerAfter.points || 0);
    const loserPoints = Number(loserAfter.points || 0);

    if (!isDraw && winnerPoints >= 6) {
      candidates.push({
        priority: 90,
        source: "editorial-group-stakes",
        text: `${winnerName} responde en el cierre del Grupo ${group} y deja prácticamente encaminado su boleto a la siguiente fase.`,
      });
    }

    if (!isDraw && loserPoints <= 3) {
      candidates.push({
        priority: 88,
        source: "editorial-group-stakes",
        text: `${loserName} se complica en el cierre del Grupo ${group}: la derrota lo deja pendiente de combinaciones y sin margen propio.`,
      });
    }

    if (isDraw) {
      candidates.push({
        priority: 84,
        source: "editorial-group-stakes",
        text: `${homeName} y ${awayName} cierran el Grupo ${group} con un empate que puede valer oro o quedarse corto según las combinaciones.`,
      });
    }
  }
}

function buildEditorialProfile(name, facts, prior) {
  const normalizedFacts = facts || {};
  const bestFinish = normalizedFacts.bestFinish || "unknown";
  const titles = Number(normalizedFacts.worldCupTitlesBefore2026 || 0);
  const debutant = normalizedFacts.firstWorldCupAppearance === 2026 || bestFinish === "debut";
  const powerScore = getEditorialPowerScore(normalizedFacts);

  return {
    name,
    facts: normalizedFacts,
    prior: prior || {},
    bestFinish,
    titles,
    debutant,
    powerScore,
    titleCandidate: powerScore >= 82,
    historicPower: titles > 0 || ["champion", "runner_up", "third_place", "semifinal"].includes(bestFinish),
  };
}

function getEditorialPowerScore(facts) {
  if (!facts || !Object.keys(facts).length) return 35;
  if (facts.firstWorldCupAppearance === 2026 || facts.bestFinish === "debut") return 8;

  const baseByFinish = {
    champion: 90,
    runner_up: 80,
    third_place: 74,
    semifinal: 70,
    quarterfinal: 58,
    round_of_16: 46,
    group_stage: 30,
  };
  const base = baseByFinish[facts.bestFinish] ?? 35;
  const titleBonus = Math.min(15, Number(facts.worldCupTitlesBefore2026 || 0) * 4);
  return base + titleBonus;
}

function getFavoriteUnderdog(left, right) {
  const delta = left.powerScore - right.powerScore;
  if (Math.abs(delta) < 24) return null;

  return delta > 0
    ? { favorite: left, underdog: right, delta }
    : { favorite: right, underdog: left, delta: Math.abs(delta) };
}

function getFavoriteDescription(profile) {
  if (profile.titleCandidate) return "una candidata de peso";
  if (profile.titles > 0) return "una campeona mundial";
  if (profile.historicPower) return "una selección de historia grande";
  return "una selección de mayor jerarquía";
}

function pushDrawHierarchyCandidates(candidates, homeProfile, awayProfile, homeScore, awayScore) {
  const matchup = getFavoriteUnderdog(homeProfile, awayProfile);
  if (!matchup) return;

  const { favorite, underdog, delta } = matchup;
  const scoreless = Number(homeScore || 0) + Number(awayScore || 0) === 0;
  const underdogFirstPoint = Number(underdog.prior.points || 0) === 0;
  const favoriteDescription = getFavoriteDescription(favorite);

  if (underdog.debutant && delta >= 60) {
    candidates.push({
      priority: 98,
      source: "editorial-hierarchy",
      text: scoreless
        ? `${underdog.name} firma un punto histórico en su debut mundialista: resiste a ${favorite.name}, ${favoriteDescription}, y deja dudas fuertes en la favorita.`
        : `${underdog.name} convierte su debut mundialista en un golpe de impacto: le saca un empate a ${favorite.name}, ${favoriteDescription}, y suma un punto histórico.`,
    });
    return;
  }

  if (underdog.debutant) {
    candidates.push({
      priority: 94,
      source: "editorial-hierarchy",
      text: `${underdog.name} suma un resultado enorme para su historia mundialista; ${favorite.name} se queda corto ante una debutante que jugó sin complejos.`,
    });
    return;
  }

  if (delta >= 45) {
    candidates.push({
      priority: 90,
      source: "editorial-hierarchy",
      text: `${underdog.name} cambia la lectura del grupo con un empate de mucho peso ante ${favorite.name}, un resultado que sabe a aviso para la favorita.`,
    });
  }

  if (underdogFirstPoint) {
    candidates.push({
      priority: 88,
      source: "editorial-hierarchy",
      text: `${underdog.name} suma su primer punto del torneo y transforma un partido cuesta arriba en una señal de carácter.`,
    });
  }
}

function pushUpsetWinCandidates(candidates, winnerProfile, loserProfile, winnerScore, loserScore) {
  const matchup = getFavoriteUnderdog(winnerProfile, loserProfile);
  if (!matchup || matchup.favorite !== loserProfile) return;

  const favoriteDescription = getFavoriteDescription(loserProfile);

  if (winnerProfile.debutant && matchup.delta >= 55) {
    candidates.push({
      priority: 99,
      source: "editorial-hierarchy",
      text: `${winnerProfile.name} escribe una página histórica: vence ${winnerScore}-${loserScore} a ${loserProfile.name}, ${favoriteDescription}, en una de las primeras grandes sorpresas del torneo.`,
    });
    return;
  }

  candidates.push({
    priority: 93,
    source: "editorial-hierarchy",
    text: `${winnerProfile.name} sacude el grupo con un triunfo de alta carga simbólica ante ${loserProfile.name}, una victoria que cambia expectativas y conversación.`,
  });
}

function pushFirstGoalCandidate(candidates, teamName, score, facts, prior) {
  if (score <= 0 || !isHistoricFirstGoal(facts, prior)) return;

  candidates.push({
    priority: 87,
    source: "curated-world-cup-team-facts",
    text: `${teamName} ya tiene su primer gol en la historia mundialista, una postal que queda por encima del marcador.`,
  });
}

function isDeepRunTeam(facts) {
  return ["champion", "runner_up", "third_place", "semifinal"].includes(facts.bestFinish);
}

function getScoringStory(matchData) {
  const events = [
    ...(matchData.events?.homeScorers || []).flatMap((event) => expandScorerEvent(event, "home")),
    ...(matchData.events?.awayScorers || []).flatMap((event) => expandScorerEvent(event, "away")),
  ].sort((a, b) => a.minuteValue - b.minuteValue);

  if (!events.length) return {};

  const firstSide = events[0].side;
  const homeScore = Number(matchData.teams?.home?.score || 0);
  const awayScore = Number(matchData.teams?.away?.score || 0);

  if (homeScore > awayScore && firstSide === "away") {
    return { comebackWinner: normalizeTeamKey(matchData.teams?.home?.providerName || matchData.teams?.home?.name) };
  }

  if (awayScore > homeScore && firstSide === "home") {
    return { comebackWinner: normalizeTeamKey(matchData.teams?.away?.providerName || matchData.teams?.away?.name) };
  }

  return {};
}

function getDecisiveLateGoalStory(matchData) {
  const events = getSortedGoalEvents(matchData);
  if (!events.length) return null;

  const finalHome = Number(matchData.teams?.home?.score || 0);
  const finalAway = Number(matchData.teams?.away?.score || 0);
  if (finalHome === 0 && finalAway === 0) return null;

  let homeScore = 0;
  let awayScore = 0;
  let decisive = null;

  for (const event of events) {
    const beforeHome = homeScore;
    const beforeAway = awayScore;

    if (event.side === "home") homeScore += 1;
    if (event.side === "away") awayScore += 1;

    if (!isLateGoal(event.minuteValue)) continue;

    const afterDraw = homeScore === awayScore;
    const afterLeader = homeScore > awayScore ? "home" : homeScore < awayScore ? "away" : null;
    const beforeLeader = beforeHome > beforeAway ? "home" : beforeHome < beforeAway ? "away" : null;

    if (afterDraw && beforeLeader && beforeLeader !== event.side) {
      decisive = event;
    } else if (afterLeader === event.side && beforeLeader !== event.side) {
      decisive = event;
    }
  }

  return decisive;
}

function getSortedGoalEvents(matchData) {
  return [
    ...(matchData.events?.homeScorers || []).flatMap((event) => expandScorerEvent(event, "home")),
    ...(matchData.events?.awayScorers || []).flatMap((event) => expandScorerEvent(event, "away")),
  ].sort((a, b) => a.minuteValue - b.minuteValue);
}

function isLateGoal(minuteValue) {
  return minuteValue >= 85;
}

function expandScorerEvent(event, side) {
  const minutes = Array.isArray(event.minutes) && event.minutes.length ? event.minutes : [event.minute];
  return minutes
    .filter(Boolean)
    .map((minute) => ({
      side,
      minuteLabel: normalizeMinuteLabel(minute),
      minuteValue: parseGoalMinuteValue(minute),
    }));
}

function parseGoalMinuteValue(minute) {
  const text = String(minute).replace(/[’']/g, "").trim();
  const added = text.match(/^(\d+)\s*\+\s*(\d+)$/);
  if (added) return Number(added[1]) + Number(added[2]);
  return parseInt(text, 10) || 0;
}

function normalizeMinuteLabel(minute) {
  const text = String(minute).replace(/[’']/g, "").trim();
  return `${text}'`;
}

function compactEditorialText(text) {
  const cleaned = String(text || "").replace(/\s+/g, " ").trim();
  if (cleaned.length <= 150) return cleaned;

  const sentences = cleaned.match(/[^.!?]+[.!?]/g) || [cleaned];
  const first = sentences[0].trim();
  if (first.length <= 150) return first;

  const shortened = first
    .replace(/, una victoria que cambia expectativas y conversación/g, "")
    .replace(/ y tres puntos que pesan más por la forma/g, "")
    .replace(/ para sostener sus opciones/g, "")
    .replace(/ con presión real/g, "")
    .replace(/ y deja dudas fuertes en la favorita/g, "")
    .replace(/, un resultado que sabe a aviso para la favorita/g, "");

  if (shortened.length <= 150) return shortened;
  return `${shortened.slice(0, 147).replace(/\s+\S*$/, "")}...`;
}

function extractStatHighlights(rawStats, homeName, awayName) {
  const statRows = flattenStats(rawStats);
  const highlights = [];
  const possession = findPair(statRows, ["possession", "ball possession", "posesion", "posesión"]);
  const shots = findPair(statRows, ["total shots", "shots", "disparos", "remates"]);
  const shotsOnTarget = findPair(statRows, ["shots on target", "on target", "tiros a puerta", "remates a puerta"]);
  const xg = findPair(statRows, ["expected goals", "xg"]);

  if (possession) {
    const dominant = getDominant(possession, 65);
    if (dominant) {
      highlights.push({
        priority: 76,
        source: "bsd-match-stats",
        text: `${dominant.side === "home" ? homeName : awayName} llevó el peso del juego con ${dominant.value}% de posesión, un dato que explica buena parte del pulso del partido.`,
      });
    }
  }

  if (shots) {
    const dominant = getDominant(shots, 18);
    if (dominant) {
      highlights.push({
        priority: 74,
        source: "bsd-match-stats",
        text: `${dominant.side === "home" ? homeName : awayName} sostuvo la presión con ${dominant.value} disparos, una producción ofensiva que marcó el ritmo del duelo.`,
      });
    }
  }

  if (shotsOnTarget) {
    const dominant = getDominant(shotsOnTarget, 8);
    if (dominant) {
      highlights.push({
        priority: 73,
        source: "bsd-match-stats",
        text: `${dominant.side === "home" ? homeName : awayName} exigió constantemente al arco rival con ${dominant.value} remates a puerta.`,
      });
    }
  }

  if (xg) {
    const dominant = getDominant(xg, 2.5);
    if (dominant) {
      highlights.push({
        priority: 72,
        source: "bsd-match-stats",
        text: `${dominant.side === "home" ? homeName : awayName} generó ocasiones de alto valor y cerró con ${dominant.value} xG.`,
      });
    }
  }

  return highlights;
}

function summarizeStats(rawStats) {
  const statRows = flattenStats(rawStats);
  const shots = findPair(statRows, ["total shots", "shots", "disparos", "remates"]);
  const shotsOnTarget = findPair(statRows, ["shots on target", "on target", "tiros a puerta", "remates a puerta"]);
  const xg = findPair(statRows, ["expected goals", "xg"]);

  return {
    totalShots: sumPair(shots),
    totalShotsOnTarget: sumPair(shotsOnTarget),
    totalXg: sumPair(xg),
  };
}

function sumPair(pair) {
  if (!pair) return 0;
  return Number(pair.home || 0) + Number(pair.away || 0);
}

function flattenStats(value, rows = []) {
  if (!value) return rows;

  if (Array.isArray(value)) {
    for (const item of value) flattenStats(item, rows);
    return rows;
  }

  if (typeof value !== "object") return rows;

  const name = value.name || value.type || value.key || value.stat || value.label || value.title;
  const home = value.home ?? value.home_value ?? value.homeValue ?? value.home_team ?? value.homeTeam;
  const away = value.away ?? value.away_value ?? value.awayValue ?? value.away_team ?? value.awayTeam;

  if (name && home !== undefined && away !== undefined) {
    rows.push({ name: String(name).toLowerCase(), home: toNumber(home), away: toNumber(away) });
  }

  for (const nested of Object.values(value)) {
    if (nested && typeof nested === "object") flattenStats(nested, rows);
  }

  return rows;
}

function findPair(rows, aliases) {
  return rows.find((row) => aliases.some((alias) => row.name.includes(alias)) && row.home != null && row.away != null);
}

function toNumber(value) {
  if (value === null || value === undefined) return null;
  const parsed = Number(String(value).replace("%", "").trim());
  return Number.isFinite(parsed) ? parsed : null;
}

function getDominant(pair, floor) {
  if (pair.home >= floor && pair.home > pair.away) return { side: "home", value: pair.home };
  if (pair.away >= floor && pair.away > pair.home) return { side: "away", value: pair.away };
  return null;
}

module.exports = {
  getInternalContext,
};
