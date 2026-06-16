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
    day: matchData.context?.day,
  });

  if (!isDraw) {
    pushUpsetWinCandidates(candidates, winnerProfile, loserProfile, winnerScore, loserScore);

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
        text: `${winnerName} impuso su jerarquía y suma una victoria importante para afirmarse en el grupo.`,
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
        text: `${winnerName} aprovechó mejor sus oportunidades y suma tres puntos ante ${loserName}.`,
      });
    } else if (margin === 1) {
      candidates.push({
        priority: 72,
        source: "bsd-scoreline",
        text: `${winnerName} superó por margen mínimo a ${loserName} y suma tres puntos que pueden pesar en el grupo.`,
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
  });

  if (matchday === 1 && !isDraw) {
    candidates.push({
      priority: 58,
      source: "bsd-schedule",
      text: `${winnerName} inició su Mundial con una victoria y suma tres puntos desde la primera jornada.`,
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
        : `${winnerName} sumó tres puntos y mejora su posición en el Grupo ${group}.`,
    });
  }

  candidates.push({
    priority: 10,
    source: "internal-fallback",
    text: isDraw
      ? `${homeName} y ${awayName} repartieron puntos en un partido cerrado.`
      : `${winnerName} venció a ${loserName} y suma tres puntos en el grupo.`,
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
  const { homeName, awayName, homeScore, awayScore, totalGoals, isDraw, winnerName, loserName, group, statSummary } = context;
  const bothTeamsMultipleGoals = homeScore >= 2 && awayScore >= 2;
  const dramaticScoreline = totalGoals >= 5 || bothTeamsMultipleGoals;

  if (!dramaticScoreline) return;

  const statsPhrase = getOpenGameStatsPhrase(statSummary);
  const groupPhrase = group ? ` en el Grupo ${group}` : "";

  if (isDraw) {
    candidates.push({
      priority: totalGoals >= 6 ? 93 : 91,
      source: "editorial-match-tempo",
      text: `${homeName} y ${awayName} empataron en un partido de alto ritmo${groupPhrase} y mantienen abierta la pelea${statsPhrase}.`,
    });
    return;
  }

  candidates.push({
    priority: totalGoals >= 6 ? 93 : 91,
    source: "editorial-match-tempo",
    text: `${winnerName} venció a ${loserName} en un partido de ${totalGoals} goles${groupPhrase} y suma tres puntos para la tabla${statsPhrase}.`,
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
    text: `${teamName} decidió el partido en el ${minute}${groupPhrase} y suma tres puntos en el cierre.`,
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
  const { homeName, awayName, day } = context;
  if (!day?.currentIsDraw || Number(day.drawRunCount || 0) < 2) return;

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
        text: `${winnerName} llega a seis puntos en el Grupo ${group} tras vencer a ${loserName}.`,
      });
    }

    if (Number(loserAfter.points || 0) <= 1) {
      candidates.push({
        priority: 86,
        source: "editorial-group-stakes",
        text: `${loserName} se complicó en el Grupo ${group} y necesita sumar en la última jornada para seguir con opciones.`,
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
        text: `${pressured} sumó un punto, pero el Grupo ${group} sigue abierto de cara a la última jornada.`,
      });
    } else {
      candidates.push({
        priority: 82,
        source: "editorial-group-stakes",
        text: `${homeName} y ${awayName} empataron y dejan el Grupo ${group} abierto de cara a la siguiente jornada.`,
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
        text: `${winnerName} ganó en el cierre del Grupo ${group} y fortalece sus opciones de avanzar.`,
      });
    }

    if (!isDraw && loserPoints <= 3) {
      candidates.push({
        priority: 88,
        source: "editorial-group-stakes",
        text: `${loserName} perdió en el cierre del Grupo ${group} y queda pendiente de otros resultados para avanzar.`,
      });
    }

    if (isDraw) {
      candidates.push({
        priority: 84,
        source: "editorial-group-stakes",
        text: `${homeName} y ${awayName} cerraron el Grupo ${group} con un empate que deja todo sujeto a combinaciones.`,
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
    text: `${winnerProfile.name} venció a ${loserProfile.name} y cambia la lectura del grupo con tres puntos valiosos.`,
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
    .replace(/ y tres puntos que pesan más por la forma/g, "")
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
