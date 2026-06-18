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

function getInternalContext(matchData, options = {}) {
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

  const rankedFacts = rankCandidatesForRecentUsage(facts, options.recentEditorialSignatures);
  const picked = pickHeadlineCandidate(rankedFacts, matchData);

  return {
    source: picked?.source || "internal-editorial-engine",
    headline: picked?.text || "",
    signature: picked?.signature || getEditorialSignature(picked?.text),
    facts: rankedFacts,
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
  const matchIntelligence = analyzeMatchIntelligence(matchData.context?.matchStats);
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
    loserName,
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
  pushTeamFormCandidates(candidates, {
    homeName,
    awayName,
    winnerName,
    loserName,
    isDraw,
    teamForm: matchData.context?.teamForm,
  });
  pushDayContextCandidates(candidates, {
    homeName,
    awayName,
    winnerName,
    loserName,
    isDraw,
    day: matchData.context?.day,
  });
  pushDominantFavoriteDrawCandidate(candidates, {
    homeName,
    awayName,
    homeProfile,
    awayProfile,
    homeScore,
    awayScore,
    statSummary,
  });
  pushMatchIntelligenceCandidates(candidates, {
    homeName,
    awayName,
    homeProfile,
    awayProfile,
    homeScore,
    awayScore,
    totalGoals,
    statSummary,
    matchIntelligence,
    group,
  });

  if (!isDraw) {
    pushUpsetWinCandidates(candidates, winnerProfile, loserProfile, winnerScore, loserScore);
    pushDefendingChampionDebutCandidate(candidates, {
      winnerName,
      loserName,
      winnerFacts,
      winnerPrior,
      winnerScore,
      loserScore,
      matchday,
    });

    if (Number(winnerPrior.played || 0) > 0 && Number(winnerPrior.wins || 0) === 0) {
      candidates.push({
        priority: 95,
        source: "bsd-tournament-results",
        text: `${winnerName} consiguió su primera victoria del Mundial y toma aire en la pelea del grupo.`,
      });
    }

    if (isHistoricFirstWin(winnerFacts, winnerPrior)) {
      candidates.push({
        priority: 94,
        source: "curated-world-cup-team-facts",
        text: `${winnerName} consiguió su primera victoria mundialista y firma un resultado histórico ante ${loserName}.`,
      });
    }

    if (isHistoricFirstGoal(winnerFacts, winnerPrior) && winnerScore > 0) {
      candidates.push({
        priority: 89,
        source: "curated-world-cup-team-facts",
        text: `${winnerName} marcó su primer gol mundialista y lo convierte en una victoria de valor histórico.`,
      });
    }

    if (Number(winnerFacts.worldCupTitlesBefore2026 || 0) > 0 && margin >= 2) {
      candidates.push({
        priority: 80,
        source: "curated-world-cup-team-facts",
        text: `${winnerName} impuso su jerarquía y firma una victoria importante para afirmarse en el grupo.`,
      });
    }

    if (isDeepRunTeam(winnerFacts) && margin >= 2) {
      candidates.push({
        priority: 76,
        source: "curated-world-cup-team-facts",
        text: `${winnerName} sostuvo su peso histórico con una victoria sólida y gana margen en el grupo.`,
      });
    }

    if (scoring.comebackWinner === normalizeTeamKey(winner.providerName || winner.name)) {
      candidates.push({
        priority: 88,
        source: "bsd-incidents",
        text: `${winnerName} remontó ante ${loserName} y convierte un inicio adverso en una victoria importante.`,
      });
    }

    if (margin >= 4) {
      candidates.push({
        priority: 84,
        source: "bsd-scoreline",
        text: `${winnerName} ganó con claridad y suma una diferencia de goles importante para la tabla.`,
      });
    } else if (winnerScore >= 3) {
      candidates.push({
        priority: 78,
        source: "bsd-scoreline",
        text: `${winnerName} aprovechó mejor sus oportunidades y resolvió un partido exigente ante ${loserName}.`,
      });
    } else if (margin === 1) {
      candidates.push({
        priority: 72,
        source: "bsd-scoreline",
        text: `${winnerName} superó por margen mínimo a ${loserName} y gana margen en la pelea del grupo.`,
      });
    }

    if (loserScore === 0) {
      candidates.push({
        priority: 70,
        source: "bsd-scoreline",
        text: `${winnerName} combinó eficacia y portería en cero para fortalecer su posición en el grupo.`,
      });
    }

    if (Number(winnerPrior.played || 0) > 0 && Number(winnerPrior.losses || 0) === 0) {
      candidates.push({
        priority: 68,
        source: "bsd-tournament-results",
        text: `${winnerName} mantuvo el invicto y refuerza su posición en la pelea del grupo.`,
      });
    }
  } else {
    pushDrawHierarchyCandidates(candidates, homeProfile, awayProfile, homeScore, awayScore, { group, matchday });
    pushDefendingChampionDrawCandidate(candidates, {
      homeName,
      awayName,
      homeFacts,
      awayFacts,
      homePrior,
      awayPrior,
      matchday,
    });

    if (totalGoals >= 4) {
      candidates.push({
        priority: 82,
        source: "bsd-scoreline",
        text: `${homeName} y ${awayName} empataron en un partido abierto y mantienen vivo el margen de ambos en el grupo.`,
      });
    } else if (totalGoals === 0) {
      candidates.push({
        priority: 72,
        source: "bsd-scoreline",
        text: `${homeName} y ${awayName} empataron sin goles y dejan poco margen en la pelea del grupo.`,
      });
    } else {
      candidates.push({
        priority: 70,
        source: "bsd-scoreline",
        text: `${homeName} y ${awayName} repartieron puntos y dejan abierta la pelea en el grupo.`,
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
    groupOutlook: prior.groupOutlook,
  });

  if (matchday === 1 && !isDraw) {
    candidates.push({
      priority: 58,
      source: "bsd-schedule",
      text: `${winnerName} inició su Mundial con victoria y evita presión temprana en el grupo.`,
    });
  } else if (matchday === 2 && !isDraw) {
    candidates.push({
      priority: 55,
      source: "bsd-schedule",
      text: `${winnerName} ganó en la Jornada 2 y da un paso importante en la pelea por avanzar.`,
    });
  } else if (matchday === 3 && !isDraw) {
    candidates.push({
      priority: 55,
      source: "bsd-schedule",
      text: `${winnerName} ganó en el cierre de la fase de grupos y fortalece sus opciones de avanzar.`,
    });
  }

  if (group && candidates.length < 3) {
    candidates.push({
      priority: 40,
      source: "bsd-schedule",
      text: isDraw
        ? `${homeName} y ${awayName} empataron y dejan más apretado el Grupo ${group}.`
        : `${winnerName} ganó y mejora su posición en el Grupo ${group}.`,
    });
  }

  candidates.push({
    priority: 10,
    source: "internal-fallback",
    text: isDraw
      ? `${homeName} y ${awayName} repartieron puntos en un partido cerrado.`
      : `${winnerName} venció a ${loserName} y toma impulso en el grupo.`,
  });

  return candidates
    .filter((candidate) => candidate.text)
    .map((candidate) => ({
      ...candidate,
      text: polishEditorialText(candidate.text),
    }))
    .sort((a, b) => b.priority - a.priority);
}

function pickHeadline(candidates, matchData) {
  return pickHeadlineCandidate(candidates, matchData)?.text || "";
}

function pickHeadlineCandidate(candidates, matchData) {
  const topPriority = candidates[0]?.priority || 0;
  const spread = topPriority >= 85 ? 0 : 5;
  const topBand = candidates.filter((candidate) => candidate.priority >= topPriority - spread);
  const seed = Number(matchData.source?.eventId || 0);
  return topBand[Math.abs(seed) % topBand.length] || candidates[0] || null;
}

function rankCandidatesForRecentUsage(candidates, recentEditorialSignatures = []) {
  const recent = new Set((recentEditorialSignatures || []).filter(Boolean));

  return candidates
    .map((candidate) => {
      const signature = candidate.signature || getEditorialSignature(candidate.text);
      const repeatPenalty = recent.has(signature) ? 18 : 0;

      return {
        ...candidate,
        signature,
        priority: Number(candidate.priority || 0) - repeatPenalty,
        originalPriority: candidate.priority,
        repeatPenalty,
      };
    })
    .sort((a, b) => b.priority - a.priority);
}

function getEditorialSignature(text) {
  return String(text || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[0-9]+(?:\+[0-9]+)?'/g, "MIN")
    .replace(/[0-9]+-[0-9]+/g, "SCORE")
    .replace(/\b(grupo)\s+[a-z]\b/g, "$1 X")
    .replace(/\b[a-záéíóúñü]{4,}\b/g, (word) => {
      if (["punto", "empate", "triunfo", "victoria", "partidazo", "debut", "mundialista", "candidata", "favorita", "grupo", "rescate", "rescata", "historico", "historica", "dudas", "presion"].includes(word)) {
        return word;
      }
      return "TEAM";
    })
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 120);
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
  const { homeName, awayName, homeScore, awayScore, totalGoals, isDraw, winnerName, loserName, group } = context;
  const bothTeamsMultipleGoals = homeScore >= 2 && awayScore >= 2;
  const dramaticScoreline = totalGoals >= 5 || bothTeamsMultipleGoals;

  if (!dramaticScoreline) return;

  const groupPhrase = group ? ` en el Grupo ${group}` : "";

  if (isDraw) {
    candidates.push({
      priority: totalGoals >= 6 ? 93 : 91,
      source: "editorial-match-tempo",
      text: `${homeName} y ${awayName} firmaron un empate de alto ritmo${groupPhrase}.`,
    });
    return;
  }

  candidates.push({
    priority: totalGoals >= 6 ? 93 : 91,
    source: "editorial-match-tempo",
    text: `${winnerName} venció a ${loserName} en un partido abierto y de mucho ritmo${groupPhrase}.`,
  });
}

function pushDecisiveLateGoalCandidate(candidates, context) {
  const { story, homeName, awayName, homeScore, awayScore, group } = context;
  if (!story) return;

  const teamName = story.side === "home" ? homeName : awayName;
  const opponentName = story.side === "home" ? awayName : homeName;
  const groupPhrase = group ? ` del Grupo ${group}` : "";
  const minute = story.minuteLabel;

  if (homeScore === awayScore) {
    candidates.push({
      priority: 96,
      source: "bsd-incidents:late-decisive-goal",
      text: `${teamName} igualó en el ${minute}${groupPhrase} y evita la derrota en un cierre que deja a ${opponentName} sin una victoria clave.`,
    });
    return;
  }

  candidates.push({
    priority: 96,
    source: "bsd-incidents:late-decisive-goal",
    text: `${teamName} decidió el partido en el ${minute}${groupPhrase} y cambia el cierre con un golpe clave.`,
  });
}

function getOrdinalFemale(count) {
  const ordinals = {
    2: "segunda",
    3: "tercera",
    4: "cuarta",
    5: "quinta",
  };

  return ordinals[count] || `${count}.ª`;
}

function pushTeamFormCandidates(candidates, context) {
  const { homeName, awayName, winnerName, loserName, isDraw, teamForm } = context;
  if (!teamForm) return;

  if (isDraw) {
    const homeDraws = teamForm.home?.result === "D" ? Number(teamForm.home.consecutive || 0) : 0;
    const awayDraws = teamForm.away?.result === "D" ? Number(teamForm.away.consecutive || 0) : 0;

    if (homeDraws >= 2 && awayDraws >= 2) {
      candidates.push({
        priority: 84,
        source: "editorial-team-form",
        text: `${homeName} y ${awayName} empataron y suman su ${getOrdinalFemale(Math.min(homeDraws, awayDraws))} igualdad consecutiva en el grupo.`,
      });
      return;
    }

    if (homeDraws >= 2) {
      candidates.push({
        priority: 83,
        source: "editorial-team-form",
        text: `${homeName} empató con ${awayName} y suma su ${getOrdinalFemale(homeDraws)} igualdad consecutiva en el grupo.`,
      });
    }

    if (awayDraws >= 2) {
      candidates.push({
        priority: 83,
        source: "editorial-team-form",
        text: `${awayName} empató con ${homeName} y suma su ${getOrdinalFemale(awayDraws)} igualdad consecutiva en el grupo.`,
      });
    }

    return;
  }

  const winnerIsHome = winnerName === homeName;
  const winnerForm = winnerIsHome ? teamForm.home : teamForm.away;
  const loserForm = winnerIsHome ? teamForm.away : teamForm.home;
  const winnerWins = winnerForm?.result === "W" ? Number(winnerForm.consecutive || 0) : 0;
  const loserLosses = loserForm?.result === "L" ? Number(loserForm.consecutive || 0) : 0;

  if (loserLosses >= 2) {
    candidates.push({
      priority: 89,
      source: "editorial-team-form",
      text: `${loserName} perdió ante ${winnerName} y suma su ${getOrdinalFemale(loserLosses)} derrota consecutiva en el grupo.`,
    });
  }

  if (winnerWins >= 2) {
    candidates.push({
      priority: 86,
      source: "editorial-team-form",
      text: `${winnerName} venció a ${loserName} y suma su ${getOrdinalFemale(winnerWins)} victoria consecutiva en el grupo.`,
    });
  }
}

function pushDayContextCandidates(candidates, context) {
  const { homeName, awayName, winnerName, loserName, isDraw, day } = context;
  if (!day) return;

  if (day.isFirstScheduledMatch && !isDraw) {
    candidates.push({
      priority: 76,
      source: "editorial-day-context",
      signature: "winner-opens-day-with-win",
      text: `${winnerName} abrió la jornada con victoria ante ${loserName}.`,
    });
  }

  if (day.isLastScheduledMatch && !isDraw) {
    candidates.push({
      priority: 78,
      source: "editorial-day-context",
      signature: "winner-closes-day-with-win",
      text: `${winnerName} cerró la jornada con victoria ante ${loserName}.`,
    });
  }

  if (day.isFirstScheduledMatch && isDraw) {
    candidates.push({
      priority: 75,
      source: "editorial-day-context",
      signature: "draw-opens-day",
      text: `${homeName} y ${awayName} abrieron la jornada con un empate.`,
    });
  }

  if (day.isLastScheduledMatch && isDraw) {
    candidates.push({
      priority: 77,
      source: "editorial-day-context",
      signature: "draw-closes-day",
      text: `${homeName} y ${awayName} cerraron la jornada con un empate.`,
    });
  }

  if (!day.currentIsDraw || Number(day.drawRunCount || 0) < 2) return;

  if (day.allFinishedDrawDay && Number(day.scheduledCount || 0) >= 3) {
    candidates.push({
      priority: 94,
      source: "editorial-day-context",
      text: `${homeName} y ${awayName} empataron y completan una jornada marcada por empates.`,
    });
    return;
  }

  if (Number(day.drawRunCount || 0) >= 3) {
    candidates.push({
      priority: 85,
      source: "editorial-day-context",
      text: `${homeName} y ${awayName} empataron y se suman a una jornada marcada por empates.`,
    });
    return;
  }

  candidates.push({
    priority: 79,
    source: "editorial-day-context",
    text: `${homeName} y ${awayName} empataron y mantienen la tendencia de igualdades del día.`,
  });
}

function pushDominantFavoriteDrawCandidate(candidates, context) {
  const { homeName, awayName, homeProfile, awayProfile, homeScore, awayScore, statSummary } = context;
  if (homeScore !== awayScore || !statSummary) return;

  const matchup = getFavoriteUnderdog(homeProfile, awayProfile);
  if (!matchup) return;

  const favoriteSide = matchup.favorite.name === homeName ? "home" : "away";
  const dominance = getStatDominance(statSummary, favoriteSide);
  if (!dominance) return;

  const scoreless = Number(homeScore || 0) + Number(awayScore || 0) === 0;
  const statPhrase = getFavoriteDominancePhrase(dominance);
  const resultPhrase = matchup.underdog.debutant
    ? "suma un empate histórico"
    : "rescata un punto de gran valor";

  candidates.push({
    priority: scoreless ? 99 : 96,
    source: "editorial-stats-dominance",
    signature: scoreless ? "favorite-dominates-stats-underdog-scoreless-draw" : "favorite-dominates-stats-underdog-draw",
    text: `${matchup.favorite.name} dominó${statPhrase}, pero ${matchup.underdog.name} resistió y ${resultPhrase}.`,
  });
}

function getStatDominance(statSummary, side) {
  const signals = [];

  function addSignal(name, pair, isDominant) {
    if (!pair || !isDominant(pair)) return;
    signals.push({ name, pair, value: pair[side], diff: Math.abs(Number(pair.home || 0) - Number(pair.away || 0)) });
  }

  addSignal("possession", statSummary.possession, (pair) => pair[side] >= 65 && pair[side] - pair[oppositeSide(side)] >= 18);
  addSignal("xg", statSummary.xg, (pair) => pair[side] >= 1.8 && pair[side] - pair[oppositeSide(side)] >= 1.1);
  addSignal("shots", statSummary.shots, (pair) => pair[side] >= 18 && pair[side] - pair[oppositeSide(side)] >= 10);
  addSignal(
    "shotsOnTarget",
    statSummary.shotsOnTarget,
    (pair) => pair[side] >= 6 && pair[side] - pair[oppositeSide(side)] >= 4,
  );

  if (signals.length < 2) return null;

  return {
    side,
    signals,
    possession: statSummary.possession,
    xg: statSummary.xg,
    shots: statSummary.shots,
    shotsOnTarget: statSummary.shotsOnTarget,
  };
}

function oppositeSide(side) {
  return side === "home" ? "away" : "home";
}

function getFavoriteDominancePhrase(dominance) {
  const side = dominance.side;

  if (dominance.xg?.[side] >= 1.8 && dominance.shots?.[side] >= 18) {
    return " el volumen ofensivo";
  }

  if (dominance.xg?.[side] >= 1.8) {
    return " las ocasiones más claras";
  }

  if (dominance.possession?.[side] >= 65) {
    return " la posesión";
  }

  return " el peso del partido";
}

function pushMatchIntelligenceCandidates(candidates, context) {
  const {
    homeName,
    awayName,
    homeProfile,
    awayProfile,
    homeScore,
    awayScore,
    totalGoals,
    statSummary,
    matchIntelligence,
    group,
  } = context;

  if (!matchIntelligence) return;

  const isDraw = homeScore === awayScore;
  const winnerSide = homeScore > awayScore ? "home" : awayScore > homeScore ? "away" : null;
  const winnerName = winnerSide === "home" ? homeName : awayName;
  const loserName = winnerSide === "home" ? awayName : homeName;
  const chanceLeader = matchIntelligence.chanceLeader;
  const latePressure = matchIntelligence.latePressureLeader;
  const lowTempo = matchIntelligence.lowTempo;
  const groupPhrase = group ? ` en el Grupo ${group}` : "";

  if (lowTempo?.strong && totalGoals <= 1) {
    const text = isDraw
      ? `${homeName} y ${awayName} empataron en un partido de pocas llegadas y poco margen ofensivo.`
      : `${winnerName} venció a ${loserName} en un partido cerrado, con pocas llegadas claras.`;

    candidates.push({
      priority: isDraw ? 96 : 74,
      source: "bsd-advanced-stats:low-tempo",
      signature: isDraw ? "low-tempo-draw" : "low-tempo-narrow-win",
      text,
    });
  }

  if (isDraw && chanceLeader?.strong) {
    const dominantName = chanceLeader.side === "home" ? homeName : awayName;
    const resistantName = chanceLeader.side === "home" ? awayName : homeName;
    const dominantProfile = chanceLeader.side === "home" ? homeProfile : awayProfile;
    const resistantProfile = chanceLeader.side === "home" ? awayProfile : homeProfile;
    const matchup = getFavoriteUnderdog(dominantProfile, resistantProfile);
    const resistantIsUnderdog = matchup?.underdog === resistantProfile;
    const consequence = resistantIsUnderdog
      ? resistantProfile.debutant
        ? "suma un punto histórico"
        : "suma un punto valioso"
      : "rescata un empate valioso";
    const contextPhrase = resistantIsUnderdog
      ? ` ante ${getFavoriteDescription(dominantProfile)}`
      : ` ante ${dominantName}`;

    candidates.push({
      priority: resistantIsUnderdog ? 101 : 94,
      source: "bsd-advanced-stats:chance-quality",
      signature: resistantIsUnderdog ? "underdog-resists-clear-chances-draw" : "team-resists-clear-chances-draw",
      text: `${resistantName} resistió el dominio de ${dominantName} y ${consequence}${contextPhrase}.`,
    });
  }

  if (!isDraw && chanceLeader?.strong && chanceLeader.side === winnerSide) {
    const winnerScore = Math.max(homeScore, awayScore);
    const loserScore = Math.min(homeScore, awayScore);
    const margin = winnerScore - loserScore;
    const text =
      margin === 1
        ? `${winnerName} generó las mejores ocasiones y encontró premio en un partido cerrado${groupPhrase}.`
        : `${winnerName} respaldó su superioridad con una victoria sólida${groupPhrase}.`;

    candidates.push({
      priority: 90,
      source: "bsd-advanced-stats:chance-quality",
      signature: "winner-creates-clearer-chances",
      text,
    });
  }

  if (!isDraw && chanceLeader?.strong && chanceLeader.side !== winnerSide) {
    const dominantName = chanceLeader.side === "home" ? homeName : awayName;
    candidates.push({
      priority: 92,
      source: "bsd-advanced-stats:efficiency",
      signature: "winner-survives-opponent-clear-chances",
      text: `${dominantName} llevó el peso del partido, pero ${winnerName} fue más eficaz y se queda con la victoria.`,
    });
  }

  if (latePressure?.strong && isDraw && totalGoals <= 2) {
    const pressureName = latePressure.side === "home" ? homeName : awayName;
    const resistantName = latePressure.side === "home" ? awayName : homeName;

    candidates.push({
      priority: 91,
      source: "bsd-advanced-stats:late-pressure",
      signature: "late-pressure-draw",
      text: `${pressureName} empujó en el tramo final, pero ${resistantName} resistió y sostiene un punto importante.`,
    });
  }

  if (latePressure?.strong && !isDraw && latePressure.side === winnerSide) {
    candidates.push({
      priority: 87,
      source: "bsd-advanced-stats:late-pressure",
      signature: "winner-closes-with-pressure",
      text: `${winnerName} cerró con más peligro y terminó asegurando una victoria importante ante ${loserName}.`,
    });
  }

  if (matchIntelligence.bigChancePair) {
    const dominant = getDominant(matchIntelligence.bigChancePair, 3);
    if (dominant) {
      const teamName = dominant.side === "home" ? homeName : awayName;
      candidates.push({
        priority: 86,
        source: "bsd-advanced-stats:big-chances",
        signature: "big-chances-domination",
        text: `${teamName} tuvo las ocasiones más claras y marcó el ritmo ofensivo del partido.`,
      });
    }
  }
}

function analyzeMatchIntelligence(rawStats) {
  if (!rawStats) return null;

  const statRows = flattenStats(rawStats);
  const statSummary = summarizeStats(rawStats);
  const bigChancePair = findPair(statRows, [
    "big chances",
    "clear chances",
    "big chance",
    "occasiones claras",
    "chances claras",
    "grandes ocasiones",
  ]);
  const shotEvents = extractShotEvents(rawStats);
  const xgTimeline = extractTimelinePairs(rawStats, ["xg", "expected goals"]);
  const momentumTimeline = extractTimelinePairs(rawStats, ["momentum", "pressure"]);
  const shotSummary = summarizeShotEvents(shotEvents);

  return {
    shotEvents,
    xgTimeline,
    momentumTimeline,
    bigChancePair,
    shotSummary,
    chanceLeader: getChanceLeader({ statSummary, bigChancePair, shotSummary, xgTimeline }),
    latePressureLeader: getLatePressureLeader({ shotSummary, xgTimeline, momentumTimeline }),
    lowTempo: getLowEventTempo({ statSummary, bigChancePair, shotSummary }),
  };
}

function getLowEventTempo({ statSummary, bigChancePair, shotSummary }) {
  const totalShots = Number(statSummary?.totalShots || 0) || sumShotSummary(shotSummary, "shots");
  const totalShotsOnTarget =
    Number(statSummary?.totalShotsOnTarget || 0) || sumShotSummary(shotSummary, "shotsOnTarget");
  const totalXg = Number(statSummary?.totalXg || 0) || sumShotSummary(shotSummary, "xg");
  const totalBigChances = sumPair(bigChancePair) || sumShotSummary(shotSummary, "clearChances");

  const hasAnySignal = [totalShots, totalShotsOnTarget, totalXg, totalBigChances].some((value) => Number(value || 0) > 0);
  if (!hasAnySignal) return null;

  const strong =
    totalShots <= 16 &&
    totalShotsOnTarget <= 4 &&
    totalXg <= 1.4 &&
    totalBigChances <= 1;

  if (!strong) return null;

  return {
    strong,
    totalShots,
    totalShotsOnTarget,
    totalXg,
    totalBigChances,
  };
}

function sumShotSummary(shotSummary, key) {
  if (!shotSummary) return 0;
  return Number(shotSummary.home?.[key] || 0) + Number(shotSummary.away?.[key] || 0);
}

function getChanceLeader({ statSummary, bigChancePair, shotSummary, xgTimeline }) {
  const scores = {
    home: 0,
    away: 0,
  };
  const clearChances = {
    home: 0,
    away: 0,
  };

  for (const side of ["home", "away"]) {
    const opposite = oppositeSide(side);

    if (bigChancePair?.[side] != null) {
      scores[side] += Number(bigChancePair[side] || 0) * 3;
      clearChances[side] += Number(bigChancePair[side] || 0);
    }

    if (shotSummary?.[side]) {
      scores[side] += Number(shotSummary[side].xg || 0) * 2.8;
      scores[side] += Number(shotSummary[side].clearChances || 0) * 3;
      scores[side] += Number(shotSummary[side].shotsOnTarget || 0) * 0.8;
      clearChances[side] += Number(shotSummary[side].clearChances || 0);
    }

    if (statSummary?.xg?.[side] != null) {
      const xgDiff = Number(statSummary.xg[side] || 0) - Number(statSummary.xg[opposite] || 0);
      if (xgDiff > 0) scores[side] += xgDiff * 3;
    }

    if (statSummary?.shotsOnTarget?.[side] != null) {
      const sotDiff = Number(statSummary.shotsOnTarget[side] || 0) - Number(statSummary.shotsOnTarget[opposite] || 0);
      if (sotDiff > 0) scores[side] += sotDiff * 0.9;
    }

    if (statSummary?.dangerousAttacks?.[side] != null) {
      const dangerDiff = Number(statSummary.dangerousAttacks[side] || 0) - Number(statSummary.dangerousAttacks[opposite] || 0);
      if (dangerDiff > 0) scores[side] += Math.min(6, dangerDiff * 0.08);
    }

    if (statSummary?.touchesInPenaltyArea?.[side] != null) {
      const areaDiff =
        Number(statSummary.touchesInPenaltyArea[side] || 0) - Number(statSummary.touchesInPenaltyArea[opposite] || 0);
      if (areaDiff > 0) scores[side] += Math.min(5, areaDiff * 0.18);
    }

    const xgTimelineTotal = sumTimelineSide(xgTimeline, side);
    const xgTimelineOpposite = sumTimelineSide(xgTimeline, opposite);
    if (xgTimelineTotal > xgTimelineOpposite) {
      scores[side] += (xgTimelineTotal - xgTimelineOpposite) * 2.2;
    }
  }

  const side = scores.home >= scores.away ? "home" : "away";
  const opposite = oppositeSide(side);
  const diff = scores[side] - scores[opposite];
  const strong =
    diff >= 4 ||
    clearChances[side] >= clearChances[opposite] + 2 ||
    (statSummary?.xg?.[side] >= 1.8 && statSummary.xg[side] - statSummary.xg[opposite] >= 1) ||
    (statSummary?.dangerousAttacks?.[side] >= 55 &&
      statSummary.dangerousAttacks[side] - statSummary.dangerousAttacks[opposite] >= 30);

  if (!strong) return null;

  return {
    side,
    score: scores[side],
    diff,
    clearChances: clearChances[side],
    strong,
  };
}

function getLatePressureLeader({ shotSummary, xgTimeline, momentumTimeline }) {
  const late = {
    home: 0,
    away: 0,
  };

  for (const side of ["home", "away"]) {
    const shots = shotSummary?.[side]?.late || {};
    late[side] += Number(shots.xg || 0) * 3;
    late[side] += Number(shots.shots || 0) * 0.8;
    late[side] += Number(shots.shotsOnTarget || 0) * 1.2;
    late[side] += sumTimelineSide(xgTimeline, side, 75) * 2.5;
    late[side] += positiveMomentumScore(momentumTimeline, side, 75) * 0.15;
  }

  const side = late.home >= late.away ? "home" : "away";
  const diff = late[side] - late[oppositeSide(side)];
  if (diff < 2.5) return null;

  return {
    side,
    score: late[side],
    diff,
    strong: true,
  };
}

function summarizeShotEvents(events = []) {
  const summary = {
    home: emptyShotSideSummary(),
    away: emptyShotSideSummary(),
  };

  for (const event of events) {
    if (!event.side || !summary[event.side]) continue;
    const target = summary[event.side];
    const xg = Number(event.xg || 0);

    target.shots += 1;
    target.xg += xg;
    if (event.onTarget) target.shotsOnTarget += 1;
    if (event.bigChance || xg >= 0.25) target.clearChances += 1;

    if (event.minuteValue >= 75) {
      target.late.shots += 1;
      target.late.xg += xg;
      if (event.onTarget) target.late.shotsOnTarget += 1;
    }
  }

  return summary;
}

function emptyShotSideSummary() {
  return {
    shots: 0,
    shotsOnTarget: 0,
    xg: 0,
    clearChances: 0,
    late: {
      shots: 0,
      shotsOnTarget: 0,
      xg: 0,
    },
  };
}

function extractShotEvents(rawStats) {
  const events = [];
  collectShotEvents(rawStats, [], events);
  return events;
}

function collectShotEvents(value, pathParts, events) {
  if (!value) return;

  if (Array.isArray(value)) {
    value.forEach((item, index) => collectShotEvents(item, pathParts.concat(String(index)), events));
    return;
  }

  if (typeof value !== "object") return;

  const pathText = pathParts.join(" ").toLowerCase();
  const hasShotContext =
    pathText.includes("shot") ||
    pathText.includes("tiro") ||
    pathText.includes("remate") ||
    value.shot_type ||
    value.shotType ||
    value.is_shot ||
    value.xg != null ||
    value.expected_goals != null ||
    value.expectedGoals != null;

  if (hasShotContext) {
    const side = inferSide(value, pathParts);
    const xg = firstNumber(value.xg, value.expected_goals, value.expectedGoals, value.expected_goal, value.expectedGoal);
    const minuteValue = firstNumber(value.minute, value.min, value.time, value.match_minute, value.matchMinute, value.period_minute);
    const outcome = String(value.outcome || value.result || value.shot_result || value.shotResult || value.type || "").toLowerCase();
    const onTarget = /goal|saved|on target|target|blocked on line|a puerta/.test(outcome);
    const bigChance = Boolean(value.big_chance || value.bigChance || value.is_big_chance || value.isBigChance);

    if (side && (xg != null || minuteValue != null || outcome || bigChance)) {
      events.push({
        side,
        xg: xg || 0,
        minuteValue: Number(minuteValue || 0),
        outcome,
        onTarget,
        bigChance,
      });
    }
  }

  for (const [key, nested] of Object.entries(value)) {
    if (nested && typeof nested === "object") collectShotEvents(nested, pathParts.concat(key), events);
  }
}

function extractTimelinePairs(rawStats, aliases) {
  const rows = [];
  collectTimelinePairs(rawStats, [], aliases, rows);
  return rows;
}

function collectTimelinePairs(value, pathParts, aliases, rows) {
  if (!value) return;

  if (Array.isArray(value)) {
    value.forEach((item, index) => collectTimelinePairs(item, pathParts.concat(String(index)), aliases, rows));
    return;
  }

  if (typeof value !== "object") return;

  const pathText = pathParts.join(" ").toLowerCase();
  const isRelevantPath = aliases.some((alias) => pathText.includes(alias));
  const minute = firstNumber(value.minute, value.min, value.time, value.match_minute, value.matchMinute);
  const home = value.home ?? value.home_value ?? value.homeValue ?? value.home_team ?? value.homeTeam;
  const away = value.away ?? value.away_value ?? value.awayValue ?? value.away_team ?? value.awayTeam;

  if (isRelevantPath && minute != null && home !== undefined && away !== undefined) {
    rows.push({
      minute: Number(minute),
      home: toNumber(home) || 0,
      away: toNumber(away) || 0,
    });
  }

  for (const [key, nested] of Object.entries(value)) {
    if (nested && typeof nested === "object") collectTimelinePairs(nested, pathParts.concat(key), aliases, rows);
  }
}

function inferSide(value, pathParts) {
  if (value.is_home === true || value.isHome === true) return "home";
  if (value.is_home === false || value.isHome === false) return "away";
  if (value.home === true) return "home";
  if (value.home === false) return "away";

  const rawSide = String(
    value.side || value.team_side || value.teamSide || value.home_away || value.homeAway || value.location || "",
  ).toLowerCase();
  if (/\bhome\b|local|casa/.test(rawSide)) return "home";
  if (/\baway\b|visitor|visitante|fuera/.test(rawSide)) return "away";

  const pathText = pathParts.join(" ").toLowerCase();
  if (/\bhome\b|local|casa/.test(pathText)) return "home";
  if (/\baway\b|visitor|visitante|fuera/.test(pathText)) return "away";

  return null;
}

function firstNumber(...values) {
  for (const value of values) {
    if (value === null || value === undefined || value === "") continue;
    const parsed = Number(String(value).replace("%", "").trim());
    if (Number.isFinite(parsed)) return parsed;
  }

  return null;
}

function sumTimelineSide(rows = [], side, minMinute = null) {
  return rows
    .filter((row) => minMinute == null || Number(row.minute || 0) >= minMinute)
    .reduce((total, row) => total + Number(row[side] || 0), 0);
}

function positiveMomentumScore(rows = [], side, minMinute = null) {
  return rows
    .filter((row) => minMinute == null || Number(row.minute || 0) >= minMinute)
    .reduce((total, row) => {
      const diff = Number(row[side] || 0) - Number(row[oppositeSide(side)] || 0);
      return total + Math.max(0, diff);
    }, 0);
}

function formatStatNumber(value) {
  return Number(value || 0).toFixed(1).replace(/\.0$/, "");
}

function formatXgNumber(value) {
  return Number(value || 0).toFixed(2).replace(/0$/, "").replace(/\.0$/, "");
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
    groupOutlook,
  } = context;

  if (!group || matchday < 2) return;

  const homeOutlook = groupOutlook?.home || null;
  const awayOutlook = groupOutlook?.away || null;
  const winnerOutlook = winnerName === homeName ? homeOutlook : awayOutlook;
  const loserOutlook = winnerName === homeName ? awayOutlook : homeOutlook;

  if (!isDraw) {
    pushWinnerClassificationCandidates(candidates, {
      winnerName,
      loserName,
      group,
      winnerOutlook,
    });

    pushLoserClassificationRiskCandidates(candidates, {
      winnerName,
      loserName,
      loserOutlook,
    });
  } else {
    pushDrawGroupOutlookCandidates(candidates, {
      homeName,
      awayName,
      group,
      matchday,
      groupOutlook,
      homeOutlook,
      awayOutlook,
    });
  }

  if (!isDraw && matchday === 2) {
    if (Number(winnerAfter.points || 0) >= 6) {
      candidates.push({
        priority: 101,
        source: "editorial-group-stakes",
        signature: "matchday-two-winner-near-qualification",
        text: `${winnerName} venció a ${loserName} y queda muy cerca de avanzar en el Grupo ${group}.`,
      });
    }

    if (Number(loserAfter.points || 0) <= 1) {
      candidates.push({
        priority: 100,
        source: "editorial-group-stakes",
        signature: "matchday-two-loser-under-pressure",
        text: `${loserName} queda bajo presión en el Grupo ${group} y necesita reaccionar en la última jornada.`,
      });
    }
  }

  if (isDraw && matchday === 2) {
    const homePoints = Number(homeAfter.points || 0);
    const awayPoints = Number(awayAfter.points || 0);

    if (homePoints <= 2 || awayPoints <= 2) {
      const pressured = homePoints <= awayPoints ? homeName : awayName;
      candidates.push({
        priority: 99,
        source: "editorial-group-stakes",
        signature: "matchday-two-draw-group-open",
        text: `${pressured} rescató un punto, pero el Grupo ${group} sigue abierto de cara a la última jornada.`,
      });
    } else {
      candidates.push({
        priority: 95,
        source: "editorial-group-stakes",
        signature: "matchday-two-draw-group-open",
        text: `${homeName} y ${awayName} empataron y dejan el Grupo ${group} abierto de cara a la siguiente jornada.`,
      });
    }
  }

  if (matchday === 3) {
    const winnerPoints = Number(winnerAfter.points || 0);
    const loserPoints = Number(loserAfter.points || 0);

    if (!isDraw && winnerPoints >= 6) {
      candidates.push({
        priority: 101,
        source: "editorial-group-stakes",
        signature: "matchday-three-winner-qualification-pressure",
        text: `${winnerName} ganó en el cierre del Grupo ${group} y fortalece sus opciones de avanzar.`,
      });
    }

    if (!isDraw && loserPoints <= 3) {
      candidates.push({
        priority: 100,
        source: "editorial-group-stakes",
        signature: "matchday-three-loser-needs-results",
        text: `${loserName} perdió en el cierre del Grupo ${group} y queda pendiente de otros resultados para avanzar.`,
      });
    }

    if (isDraw) {
      candidates.push({
        priority: 96,
        source: "editorial-group-stakes",
        signature: "matchday-three-draw-combinations",
        text: `${homeName} y ${awayName} cerraron el Grupo ${group} con un empate que deja todo sujeto a combinaciones.`,
      });
    }
  }
}

function pushWinnerClassificationCandidates(candidates, context) {
  const { winnerName, loserName, group, winnerOutlook } = context;
  if (!winnerOutlook) return;

  if (winnerOutlook.guaranteedFirst) {
    candidates.push({
      priority: 115,
      source: "editorial-group-qualification",
      signature: "winner-guaranteed-first",
      text: `${winnerName} venció a ${loserName} y asegura el primer lugar del Grupo ${group}.`,
    });
    return;
  }

  if (winnerOutlook.guaranteedTopTwo) {
    candidates.push({
      priority: 114,
      source: "editorial-group-qualification",
      signature: "winner-guaranteed-top-two",
      text: `${winnerName} venció a ${loserName} y asegura matemáticamente su clasificación a la siguiente fase.`,
    });
    return;
  }

  if (winnerOutlook.oneStepFromTopTwo) {
    candidates.push({
      priority: 106,
      source: "editorial-group-qualification",
      signature: "winner-one-step-from-top-two",
      text: `${winnerName} derrotó a ${loserName} y queda a un paso de avanzar en el Grupo ${group}.`,
    });
  }
}

function pushLoserClassificationRiskCandidates(candidates, context) {
  const { winnerName, loserName, loserOutlook } = context;
  if (!loserOutlook) return;

  if (loserOutlook.eliminatedTopTwo) {
    candidates.push({
      priority: 113,
      source: "editorial-group-qualification",
      signature: "loser-eliminated-top-two",
      text: `${loserName} cayó ante ${winnerName} y queda fuera de la pelea directa por avanzar.`,
    });
    return;
  }

  if (loserOutlook.noLongerControlsTopTwo) {
    candidates.push({
      priority: 112,
      source: "editorial-group-qualification",
      signature: "loser-no-longer-controls-top-two",
      text: `${loserName} cayó ante ${winnerName} y ya no depende de sí mismo para avanzar.`,
    });
  }
}

function pushDrawGroupOutlookCandidates(candidates, context) {
  const { homeName, awayName, group, matchday, groupOutlook, homeOutlook, awayOutlook } = context;
  if (!groupOutlook) return;

  if (matchday === 2 && groupOutlook.openForFinalDay) {
    candidates.push({
      priority: 105,
      source: "editorial-group-qualification",
      signature: "group-open-final-matchday",
      text: `${homeName} y ${awayName} empataron y dejan el Grupo ${group} completamente abierto para la última jornada.`,
    });
    return;
  }

  const homeKeepsOptions = homeOutlook && homeOutlook.remainingGames > 0 && !homeOutlook.noLongerControlsTopTwo;
  const awayKeepsOptions = awayOutlook && awayOutlook.remainingGames > 0 && !awayOutlook.noLongerControlsTopTwo;

  if (matchday >= 2 && (homeKeepsOptions || awayKeepsOptions)) {
    const teamName = homeKeepsOptions && !awayKeepsOptions ? homeName : awayKeepsOptions && !homeKeepsOptions ? awayName : null;

    candidates.push({
      priority: 102,
      source: "editorial-group-qualification",
      signature: teamName ? "team-keeps-qualification-options" : "both-keep-qualification-options",
      text: teamName
        ? `${teamName} sumó un punto y mantiene opciones de avanzar en el Grupo ${group}.`
        : `${homeName} y ${awayName} empataron y mantienen opciones de avanzar en el Grupo ${group}.`,
    });
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
  if (profile.titleCandidate) return "una de las candidatas al título";
  if (profile.titles > 0) return "una campeona mundial";
  if (profile.historicPower) return "una selección de historia grande";
  return "una selección de mayor jerarquía";
}

function pushDrawHierarchyCandidates(candidates, homeProfile, awayProfile, homeScore, awayScore, context = {}) {
  const matchup = getFavoriteUnderdog(homeProfile, awayProfile);
  if (!matchup) return;

  const { favorite, underdog, delta } = matchup;
  const scoreless = Number(homeScore || 0) + Number(awayScore || 0) === 0;
  const underdogFirstPoint = Number(underdog.prior.points || 0) === 0;
  const favoriteDescription = getFavoriteDescription(favorite);
  const groupPhrase = context.group ? ` en el Grupo ${context.group}` : "";

  if (underdog.debutant && delta >= 60) {
    candidates.push({
      priority: 98,
      source: "editorial-hierarchy",
      signature: scoreless ? "debutant-historic-scoreless-draw-vs-favorite" : "debutant-historic-scoring-draw-vs-favorite",
      text: scoreless
        ? `${underdog.name} empató sin goles ante ${favorite.name} y suma un punto histórico frente a ${favoriteDescription}.`
        : `${underdog.name} empató con ${favorite.name} y suma un punto histórico ante ${favoriteDescription}.`,
    });
    return;
  }

  if (underdog.debutant) {
    candidates.push({
      priority: 94,
      source: "editorial-hierarchy",
      signature: "debutant-draw-vs-stronger-team",
      text: `${underdog.name} sumó un resultado valioso en su debut y deja a ${favorite.name} sin una victoria esperada.`,
    });
    return;
  }

  if (delta >= 45) {
    candidates.push({
      priority: 90,
      source: "editorial-hierarchy",
      signature: "underdog-heavy-draw-vs-favorite",
      text: `${underdog.name} empató con ${favorite.name}${groupPhrase} y suma un punto valioso ante uno de los favoritos del grupo.`,
    });
  }

  if (underdogFirstPoint) {
    const variants = [
      {
        signature: "first-point-underdog-steals-point-from-favorite",
        text: `${underdog.name} empató con ${favorite.name}${groupPhrase} y suma un punto valioso ante uno de los favoritos del grupo.`,
      },
      {
        signature: "first-point-underdog-favorite-doubts",
        text: `${underdog.name} sumó su primer punto ante ${favorite.name}${groupPhrase}, un resultado que deja dudas para el favorito.`,
      },
      {
        signature: "first-point-underdog-group-alive",
        text: `${underdog.name} sumó su primer punto${groupPhrase} y se mantiene en la pelea por avanzar.`,
      },
    ];
    const variant = variants[Math.abs(hashText(`${underdog.name}:${favorite.name}:${context.group || ""}`)) % variants.length];

    candidates.push({
      priority: 88,
      source: "editorial-hierarchy",
      ...variant,
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
      text: `${winnerProfile.name} venció ${winnerScore}-${loserScore} a ${loserProfile.name} y firma una de las sorpresas importantes del grupo.`,
    });
    return;
  }

  candidates.push({
    priority: 93,
    source: "editorial-hierarchy",
    text: `${winnerProfile.name} venció a ${loserProfile.name} y cambia la lectura del grupo con una victoria de peso.`,
  });
}

function pushDefendingChampionDebutCandidate(candidates, context) {
  const { winnerName, loserName, winnerFacts, winnerPrior, winnerScore, loserScore, matchday } = context;
  if (!winnerFacts?.defendingChampion) return;
  if (Number(matchday || 0) !== 1 || Number(winnerPrior.played || 0) > 0) return;

  const cleanSheet = Number(loserScore || 0) === 0;
  const margin = Number(winnerScore || 0) - Number(loserScore || 0);

  if (margin >= 2) {
    candidates.push({
      priority: 98,
      source: "curated-world-cup-team-facts:defending-champion",
      signature: "defending-champion-opens-solid-win",
      text: `El campeón vigente debuta con una victoria sólida ante ${loserName} y marca el tono desde el arranque.`,
    });
    return;
  }

  candidates.push({
    priority: cleanSheet ? 96 : 94,
    source: "curated-world-cup-team-facts:defending-champion",
    signature: "defending-champion-opens-with-win",
    text: `El campeón vigente debuta con victoria ante ${loserName} y arranca sin sobresaltos.`,
  });
}

function pushDefendingChampionDrawCandidate(candidates, context) {
  const { homeName, awayName, homeFacts, awayFacts, homePrior, awayPrior, matchday } = context;
  if (Number(matchday || 0) !== 1) return;

  const championSide = homeFacts?.defendingChampion
    ? { name: homeName, opponent: awayName, prior: homePrior }
    : awayFacts?.defendingChampion
      ? { name: awayName, opponent: homeName, prior: awayPrior }
      : null;

  if (!championSide || Number(championSide.prior?.played || 0) > 0) return;

  candidates.push({
    priority: 97,
    source: "curated-world-cup-team-facts:defending-champion",
    signature: "defending-champion-opens-with-draw",
    text: `El campeón vigente debuta con empate ante ${championSide.opponent} y deja puntos en el camino desde el arranque.`,
  });
}

function pushFirstGoalCandidate(candidates, teamName, score, facts, prior) {
  if (score <= 0 || !isHistoricFirstGoal(facts, prior)) return;

  candidates.push({
    priority: 87,
    source: "curated-world-cup-team-facts",
    text: `${teamName} marcó su primer gol mundialista, un hito importante más allá del resultado final.`,
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

function hashText(value) {
  return String(value || "").split("").reduce((hash, char) => {
    return (hash * 31 + char.charCodeAt(0)) | 0;
  }, 0);
}

function polishEditorialText(text) {
  return compactEditorialText(removeExaggeratedLanguage(text));
}

function removeExaggeratedLanguage(text) {
  return String(text || "")
    .replace(/\bpartidazo\b/gi, "partido destacado")
    .replace(/\bbatacazo\b/gi, "sorpresa")
    .replace(/\bagónica\b/gi, "en el cierre")
    .replace(/\bagónico\b/gi, "en el cierre")
    .replace(/\bgolpazo\b/gi, "resultado importante")
    .replace(/\bbrutal\b/gi, "importante")
    .replace(/\bincreíble\b/gi, "destacado")
    .replace(/\bépica\b/gi, "importante")
    .replace(/\bépico\b/gi, "importante")
    .replace(/\bespectáculo inolvidable\b/gi, "partido destacado")
    .replace(/\bfracaso absoluto\b/gi, "resultado negativo");
}

function compactEditorialText(text) {
  const cleaned = String(text || "").replace(/\s+/g, " ").trim();
  if (wordCount(cleaned) <= 35 && cleaned.length <= 185) return cleaned;

  const sentences = cleaned.match(/[^.!?]+[.!?]/g) || [cleaned];
  const first = sentences[0].trim();
  if (wordCount(first) <= 35 && first.length <= 185) return first;

  const shortened = first
    .replace(/, una victoria que cambia expectativas y conversación/g, "")
    .replace(/ para sostener sus opciones/g, "")
    .replace(/ con presión real/g, "")
    .replace(/ y deja dudas fuertes en la favorita/g, "")
    .replace(/, un resultado que sabe a aviso para la favorita/g, "");

  if (wordCount(shortened) <= 35 && shortened.length <= 185) return shortened;
  return trimWords(shortened, 35);
}

function wordCount(text) {
  return String(text || "").split(/\s+/).filter(Boolean).length;
}

function trimWords(text, maxWords) {
  const words = String(text || "").split(/\s+/).filter(Boolean);
  if (words.length <= maxWords) return words.join(" ");
  return `${words.slice(0, maxWords).join(" ").replace(/[,:;]$/, "")}.`;
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
        text: `${dominant.side === "home" ? homeName : awayName} generó ocasiones de mayor peligro y cerró con ${dominant.value} xG.`,
      });
    }
  }

  return highlights;
}

function summarizeStats(rawStats) {
  const statRows = flattenStats(rawStats);
  const possession = findPair(statRows, ["possession", "ball possession", "posesion", "posesión"]);
  const shots = findPair(statRows, ["total shots", "shots", "disparos", "remates"]);
  const shotsOnTarget = findPair(statRows, ["shots on target", "on target", "tiros a puerta", "remates a puerta"]);
  const xg = findPair(statRows, ["expected goals", "xg"]);
  const bigChances = findPair(statRows, ["big chances", "clear chances", "occasiones claras", "chances claras"]);
  const dangerousAttacks = findPair(statRows, ["dangerous attack", "dangerous attacks", "ataques peligrosos"]);
  const touchesInPenaltyArea = findPair(statRows, [
    "touches in penalty area",
    "touches penalty area",
    "toques en area",
    "toques en el area",
  ]);

  return {
    possession,
    shots,
    shotsOnTarget,
    xg,
    bigChances,
    dangerousAttacks,
    touchesInPenaltyArea,
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

  collectTeamBucketRows(value, rows);

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

function collectTeamBucketRows(value, rows) {
  const homeBucket = value.home;
  const awayBucket = value.away;

  if (!isPlainObject(homeBucket) || !isPlainObject(awayBucket)) return;

  const pairs = extractSharedNumericStats(homeBucket, awayBucket);
  for (const pair of pairs) {
    rows.push(pair);
  }
}

function extractSharedNumericStats(homeBucket, awayBucket, prefix = "") {
  const rows = [];
  const keys = new Set([...Object.keys(homeBucket || {}), ...Object.keys(awayBucket || {})]);

  for (const key of keys) {
    const homeValue = homeBucket[key];
    const awayValue = awayBucket[key];
    const name = prefix ? `${prefix} ${key}` : key;

    if (isPlainObject(homeValue) && isPlainObject(awayValue)) {
      rows.push(...extractSharedNumericStats(homeValue, awayValue, name));
      continue;
    }

    const homeNumber = toNumber(homeValue);
    const awayNumber = toNumber(awayValue);
    if (homeNumber == null || awayNumber == null) continue;

    rows.push({
      name: normalizeStatName(name),
      home: homeNumber,
      away: awayNumber,
    });
  }

  return rows;
}

function isPlainObject(value) {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function normalizeStatName(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/_/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function findPair(rows, aliases) {
  const normalizedAliases = aliases.map(normalizeStatName);
  return rows.find(
    (row) => normalizedAliases.some((alias) => normalizeStatName(row.name).includes(alias)) && row.home != null && row.away != null,
  );
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
