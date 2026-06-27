const fs = require("fs");
const path = require("path");
const { normalizeTeamName } = require("./caption");
const { normalizeTeamKey } = require("../lib/team-metadata");
const { summarizeEditorialSignals } = require("./editorial-signals");

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

  const signalSummary = summarizeEditorialSignals(matchData.context?.editorialSignals);
  const rankedFacts = rankCandidatesForRecentUsage(facts, options.recentEditorialSignatures);
  const picked = pickHeadlineCandidate(rankedFacts, matchData);

  return {
    source: picked?.source || "internal-editorial-engine",
    headline: picked?.text || "",
    signature: picked?.signature || getEditorialSignature(picked?.text),
    facts: rankedFacts,
    signalSummary,
    decision: buildEditorialDecisionAudit(picked, rankedFacts, signalSummary),
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
  const homeKey = normalizeTeamKey(home.providerName || home.name);
  const awayKey = normalizeTeamKey(away.providerName || away.name);
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

  pushPlayerMilestoneCandidates(candidates, matchData.context?.playerMilestones);
  const isDraw = homeScore === awayScore;
  const winner = homeScore > awayScore ? home : away;
  const loser = homeScore > awayScore ? away : home;
  const winnerScore = Math.max(homeScore, awayScore);
  const loserScore = Math.min(homeScore, awayScore);
  const winnerName = normalizeTeamName(winner.name);
  const loserName = normalizeTeamName(loser.name);
  const winnerKey = homeScore > awayScore ? homeKey : awayKey;
  const loserKey = homeScore > awayScore ? awayKey : homeKey;
  const winnerFacts = homeScore > awayScore ? homeFacts : awayFacts;
  const winnerPrior = homeScore > awayScore ? homePrior : awayPrior;
  const homeProfile = buildEditorialProfile(homeName, homeFacts, homePrior);
  const awayProfile = buildEditorialProfile(awayName, awayFacts, awayPrior);
  const winnerProfile = homeScore > awayScore ? homeProfile : awayProfile;
  const loserProfile = homeScore > awayScore ? awayProfile : homeProfile;
  const winnerAfter = homeScore > awayScore ? homeAfter : awayAfter;
  const loserAfter = homeScore > awayScore ? awayAfter : homeAfter;

  pushTeamHistoricalMilestoneCandidates(candidates, {
    homeName,
    awayName,
    homeFacts,
    awayFacts,
    homeAfter,
    awayAfter,
    group,
    matchday,
  });

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
    homeKey,
    awayKey,
    winnerName,
    loserName,
    winnerKey,
    loserKey,
    isDraw,
    matchday,
    group,
    homeAfter,
    awayAfter,
    winnerAfter,
    loserAfter,
    groupOutlook: prior.groupOutlook,
  });
  pushTournamentConsequenceCandidates(candidates, {
    homeName,
    awayName,
    homeKey,
    awayKey,
    winnerName,
    loserName,
    winnerKey,
    loserKey,
    isDraw,
    group,
    tournament: matchData.context?.tournament,
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

  return applyEditorialSignalBoosts(
    candidates
    .filter((candidate) => candidate.text)
    .map((candidate) => ({
      ...candidate,
      text: polishEditorialText(candidate.text),
    })),
    matchData.context?.editorialSignals,
  ).sort((a, b) => b.priority - a.priority);
}

function pickHeadline(candidates, matchData) {
  return pickHeadlineCandidate(candidates, matchData)?.text || "";
}

function pickHeadlineCandidate(candidates, matchData) {
  const absoluteCandidates = candidates.filter(isAbsoluteNarrativeCandidate);
  if (absoluteCandidates.length) {
    return combinePrimaryWithExceptionalSecondary(absoluteCandidates[0], candidates);
  }

  const combinedPrimary = combinePrimaryWithExceptionalSecondary(candidates[0], candidates);
  if (combinedPrimary && combinedPrimary !== candidates[0]) return combinedPrimary;

  const topPriority = candidates[0]?.priority || 0;
  const spread = getEditorialSelectionSpread(topPriority);
  const topBand = candidates.filter((candidate) => candidate.priority >= topPriority - spread);
  const seed = Number(matchData.source?.eventId || 0);
  return topBand[Math.abs(seed) % topBand.length] || candidates[0] || null;
}

function pushVariantCandidates(candidates, variants, context = {}) {
  const seed = hashText(
    [
      context.seed,
      context.homeName,
      context.awayName,
      context.winnerName,
      context.loserName,
      context.group,
      context.matchday,
    ].filter(Boolean).join(":"),
  );

  variants
    .map((variant, index) => ({
      ...variant,
      priority: Number(variant.priority || context.priority || 0) - index * 0.25,
      variantIndex: index,
      variantSeed: seed,
    }))
    .sort((a, b) => {
      const left = Math.abs(seed + a.variantIndex * 17) % variants.length;
      const right = Math.abs(seed + b.variantIndex * 17) % variants.length;
      return left - right;
    })
    .forEach((variant, index) => {
      candidates.push({
        ...variant,
        priority: Number(variant.priority || 0) - index * 0.05,
      });
    });
}

function combinePrimaryWithExceptionalSecondary(primaryCandidate, candidates) {
  if (!primaryCandidate || !canCombinePrimaryCandidate(primaryCandidate)) return primaryCandidate;

  const secondary = candidates.find((candidate) => {
    if (candidate === primaryCandidate || isAbsoluteNarrativeCandidate(candidate)) return false;
    return isExceptionalSecondaryNarrative(candidate);
  });

  if (!secondary) return primaryCandidate;

  const clause = getExceptionalSecondaryClause(secondary);
  if (!clause) return primaryCandidate;

  const combinedText = insertSecondaryClause(primaryCandidate.text, clause);
  if (!combinedText || combinedText === primaryCandidate.text) return primaryCandidate;
  if (wordCount(combinedText) > 35 || combinedText.length > 190) return primaryCandidate;

  return {
    ...primaryCandidate,
    text: combinedText,
    priority: Number(primaryCandidate.priority || 0) + 1,
    source: `${primaryCandidate.source}+${secondary.source}`,
    signature: `${primaryCandidate.signature || getEditorialSignature(primaryCandidate.text)}+${secondary.signature || getEditorialSignature(secondary.text)}`,
    combinedWith: {
      source: secondary.source,
      signature: secondary.signature || getEditorialSignature(secondary.text),
      text: secondary.text,
    },
  };
}

function canCombinePrimaryCandidate(candidate) {
  if (isAbsoluteNarrativeCandidate(candidate)) return true;
  return Number(candidate?.level || getCandidateNarrativeLevel(candidate)) <= 2;
}

function isExceptionalSecondaryNarrative(candidate) {
  const source = String(candidate?.source || "");
  const signature = String(candidate?.signature || "");
  const priority = Number(candidate?.basePriority ?? candidate?.originalPriority ?? candidate?.priority ?? 0);

  if (source === "bsd-incidents:late-decisive-goal") return true;
  if (source === "editorial-match-tempo" && priority >= 91) return true;
  if (source === "editorial-hierarchy" && priority >= 93) return true;
  if (source === "editorial-stats-dominance" && priority >= 96) return true;
  if (source.includes("advanced-stats:chance-quality") && priority >= 94) return true;
  if (source.includes("advanced-stats:efficiency") && priority >= 92) return true;
  if (source === "bsd-scoreline" && priority >= 84 && /claridad|diferencia de goles/.test(candidate.text || "")) return true;
  if (signature.includes("late") || signature.includes("upset")) return true;

  return false;
}

function getExceptionalSecondaryClause(candidate) {
  const source = String(candidate?.source || "");
  const signature = String(candidate?.signature || "");
  const text = String(candidate?.text || "");

  if (source === "bsd-incidents:late-decisive-goal" || signature.includes("late")) {
    const minute = (text.match(/\ben el\s+([0-9]+(?:\+[0-9]+)?')/i) || [])[1];
    return minute ? `con un gol en el ${minute}` : "en el cierre";
  }

  if (source === "editorial-match-tempo") return "";
  if (source === "editorial-hierarchy") return "con un resultado de peso";
  if (source === "editorial-stats-dominance") return "tras resistir el dominio rival";
  if (source.includes("advanced-stats:efficiency")) {
    const dominantTeam = (text.match(/resistió el dominio de ([^,]+?) y/i) || [])[1];
    return dominantTeam ? `pese al dominio de ${dominantTeam}` : "pese al dominio rival";
  }
  if (source.includes("advanced-stats:chance-quality")) {
    return signature.includes("winner-creates") ? "con las ocasiones más claras" : "tras resistir el dominio rival";
  }
  if (source === "bsd-scoreline") {
    const clauses = ["por margen amplio", "con autoridad", "sin dejar dudas", "con margen en el marcador"];
    return clauses[Math.abs(hashText(`${text}:${signature}`)) % clauses.length];
  }

  return "";
}

function insertSecondaryClause(text, clause) {
  const cleaned = String(text || "").trim();
  if (!cleaned || !clause) return cleaned;

  const concreteDominance = clause.match(/^pese al dominio de (.+)$/i);
  if (concreteDominance) {
    const team = concreteDominance[1];
    const dominancePatterns = [
      new RegExp(`^(.*?)( venció a ${escapeRegExp(team)})( y (?:consigue|suma|fortalece|queda|asegura|llega|toma|da|mantiene|se convierte)\\b)`, "i"),
      new RegExp(`^(.*?)( derrotó a ${escapeRegExp(team)})( y (?:consigue|suma|fortalece|queda|asegura|llega|toma|da|mantiene|se convierte)\\b)`, "i"),
      new RegExp(`^(.*?)( superó a ${escapeRegExp(team)})( y (?:consigue|suma|fortalece|queda|asegura|llega|toma|da|mantiene|se convierte)\\b)`, "i"),
    ];

    for (const pattern of dominancePatterns) {
      if (pattern.test(cleaned)) {
        return cleaned.replace(pattern, `$1 resistió el dominio de ${team}$3`);
      }
    }

    const namedOpponentBeforeConsequence = [
      new RegExp(`^(.*?)( venció a ${escapeRegExp(team)})( y )`, "i"),
      new RegExp(`^(.*?)( derrotó a ${escapeRegExp(team)})( y )`, "i"),
      new RegExp(`^(.*?)( superó a ${escapeRegExp(team)})( y )`, "i"),
      new RegExp(`^(.*?)( se impuso a ${escapeRegExp(team)})( y )`, "i"),
    ];

    for (const pattern of namedOpponentBeforeConsequence) {
      if (pattern.test(cleaned)) {
        return cleaned.replace(pattern, `$1 resistió el dominio de ${team}$3`);
      }
    }

    const namedOpponentBeforeComma = [
      new RegExp(`( venció a ${escapeRegExp(team)})(,)`, "i"),
      new RegExp(`( derrotó a ${escapeRegExp(team)})(,)`, "i"),
      new RegExp(`( superó a ${escapeRegExp(team)})(,)`, "i"),
      new RegExp(`( cayó ante ${escapeRegExp(team)})(,)`, "i"),
    ];

    for (const pattern of namedOpponentBeforeComma) {
      if (pattern.test(cleaned)) {
        return cleaned.replace(pattern, "$1 pese al dominio rival$2");
      }
    }
  }

  const patterns = [
    /( venció a [^,]+?)( y )/i,
    /( derrotó a [^,]+?)( y )/i,
    /( superó a [^,]+?)( y )/i,
    /( se impuso a [^,]+?)( y )/i,
    /( venció a [^,]+)(,)/i,
    /( derrotó a [^,]+)(,)/i,
    /( superó a [^,]+)(,)/i,
    /( cayó ante [^,]+)(,)/i,
  ];

  for (const pattern of patterns) {
    if (pattern.test(cleaned)) {
      return cleaned.replace(pattern, `$1 ${clause}$2`);
    }
  }

  return cleaned.replace(/\.$/, ` ${clause}.`);
}

function escapeRegExp(value) {
  return String(value || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function isAbsoluteNarrativeCandidate(candidate) {
  if (Number(candidate?.level || 0) === 1) return true;

  return new Set([
    "first-qualified-and-group-winner",
    "first-qualified-tournament",
    "newly-qualified-and-group-winner",
    "newly-qualified-tournament",
    "winner-guaranteed-first",
    "winner-guaranteed-top-two",
    "loser-eliminated-round-of-32",
  ]).has(candidate?.signature);
}

function getEditorialSelectionSpread(topPriority) {
  if (topPriority >= 110) return 0;
  if (topPriority >= 95) return 0;
  if (topPriority >= 85) return 5;
  return 6;
}

function rankCandidatesForRecentUsage(candidates, recentEditorialSignatures = []) {
  const recent = buildRecentEditorialMemory(recentEditorialSignatures);

  return candidates
    .map((candidate) => {
      const signature = candidate.signature || getEditorialSignature(candidate.text);
      const level = Number(candidate.level || getCandidateNarrativeLevel(candidate));
      const repeatPenalty = getRecentUsagePenalty(candidate, signature, recent, { level });

      return {
        ...candidate,
        signature,
        level,
        priority: Number(candidate.priority || 0) - repeatPenalty,
        originalPriority: candidate.priority,
        repeatPenalty,
      };
    })
    .sort((a, b) => {
      if (a.level === 1 && b.level !== 1) return -1;
      if (b.level === 1 && a.level !== 1) return 1;
      return b.priority - a.priority;
    });
}

function buildRecentEditorialMemory(entries = []) {
  const exact = new Set();
  const components = new Set();
  const families = new Set();
  const textSignatures = new Set();

  for (const entry of entries || []) {
    const signature = typeof entry === "string" ? entry : entry?.signature;
    const headline = typeof entry === "string" ? "" : entry?.headline;

    if (signature) {
      exact.add(signature);
      for (const component of getSignatureComponents(signature)) {
        components.add(component);
        families.add(getSignatureFamily(component));
      }
    }

    if (headline) {
      textSignatures.add(getEditorialSignature(headline));
      textSignatures.add(getNarrativeFingerprint(headline));
    }
  }

  return { exact, components, families, textSignatures };
}

function getRecentUsagePenalty(candidate, signature, recent, { level = 0 } = {}) {
  const textSignature = getEditorialSignature(candidate.text);
  const narrativeFingerprint = getNarrativeFingerprint(candidate.text);
  const components = getSignatureComponents(signature);
  const families = components.map(getSignatureFamily);

  if (recent.exact.has(signature) || recent.textSignatures.has(textSignature) || recent.textSignatures.has(narrativeFingerprint)) {
    return 90;
  }

  if (components.some((component) => recent.components.has(component))) {
    return level === 1 ? 12 : 48;
  }

  if (families.some((family) => recent.families.has(family))) {
    return 0;
  }

  return 0;
}

function getSignatureComponents(signature) {
  return String(signature || "")
    .split("+")
    .map((part) => part.trim())
    .filter(Boolean);
}

function getSignatureFamily(signature) {
  return String(signature || "").split(":")[0];
}

function applyEditorialSignalBoosts(candidates, signals) {
  if (!signals) return candidates;

  return candidates.map((candidate) => {
    const signal = getEditorialSignalBoost(candidate, signals);
    const basePriority = Number(candidate.priority || 0);

    return {
      ...candidate,
      basePriority,
      priority: basePriority + signal.boost,
      editorialSignalBoost: signal.boost,
      editorialSignalReasons: signal.reasons,
    };
  });
}

function getEditorialSignalBoost(candidate, signals) {
  const source = String(candidate?.source || "");
  const signature = String(candidate?.signature || "");
  const level = Number(candidate?.level || getCandidateNarrativeLevel(candidate));
  const reasons = [];
  let boost = 0;

  if (level === 1) {
    return { boost: 0, reasons };
  }

  function add(value, reason) {
    boost += value;
    reasons.push(reason);
  }

  if (hasNewsTheme(signals, "qualification") || hasNewsTheme(signals, "pressure")) {
    if (source.includes("group") || source.includes("qualification") || source.includes("tournament")) {
      add(6, "research-confirms-table-stakes");
    }
  }

  if (signals.matchup?.defendingChampionSide && source.includes("defending-champion")) {
    add(5, "research-confirms-defending-champion");
  }

  if (signals.matchup?.debutantVsFavorite && (source.includes("hierarchy") || source.includes("stats-dominance") || source.includes("chance-quality"))) {
    add(5, "research-confirms-debutant-vs-favorite");
  }

  if (hasNewsTheme(signals, "favorite") && source.includes("hierarchy")) {
    add(3, "research-confirms-team-hierarchy");
  }

  if (hasNewsTheme(signals, "upset") && source.includes("hierarchy")) {
    add(3, "research-confirms-upset-angle");
  }

  if (hasNewsTheme(signals, "dominance") && (source.includes("stats") || source.includes("advanced-stats"))) {
    add(3, "research-confirms-stat-angle");
  }

  if (hasNewsTheme(signals, "late") && (source.includes("late") || signature.includes("late"))) {
    add(3, "research-confirms-late-game-angle");
  }

  if (source === "bsd-match-stats") {
    boost = Math.min(boost, 3);
  }

  return {
    boost: Math.min(boost, 8),
    reasons: reasons.slice(0, 3),
  };
}

function hasNewsTheme(signals, theme) {
  if (!signals) return false;
  if (Number(signals.news?.themes?.[theme] || 0) > 0) return true;

  return ["home", "away"].some((side) => Number(signals.teams?.[side]?.newsThemeCounts?.[theme] || 0) > 0);
}

function buildEditorialDecisionAudit(picked, rankedFacts, signalSummary) {
  return {
    picked: picked
      ? {
          source: picked.source,
          signature: picked.signature || getEditorialSignature(picked.text),
          priority: picked.priority,
          basePriority: picked.basePriority ?? picked.originalPriority ?? picked.priority,
          level: picked.level || getCandidateNarrativeLevel(picked),
          editorialSignalBoost: picked.editorialSignalBoost || 0,
          editorialSignalReasons: picked.editorialSignalReasons || [],
          combinedWith: picked.combinedWith || null,
          text: picked.text,
        }
      : null,
    signalSummary,
    topCandidates: (rankedFacts || []).slice(0, 7).map((candidate) => ({
      source: candidate.source,
      signature: candidate.signature || getEditorialSignature(candidate.text),
      priority: candidate.priority,
      basePriority: candidate.basePriority ?? candidate.originalPriority ?? candidate.priority,
      level: candidate.level || getCandidateNarrativeLevel(candidate),
      editorialSignalBoost: candidate.editorialSignalBoost || 0,
      editorialSignalReasons: candidate.editorialSignalReasons || [],
      repeatPenalty: candidate.repeatPenalty || 0,
      text: candidate.text,
    })),
  };
}

function getCandidateNarrativeLevel(candidate) {
  if (isAbsoluteNarrativeCandidate(candidate)) return 1;

  const signature = candidate?.signature || "";
  const source = candidate?.source || "";

  if (
    source === "editorial-group-stakes" ||
    signature === "winner-one-step-from-top-two" ||
    signature === "group-open-final-matchday" ||
    signature === "matchday-two-winner-near-qualification" ||
    signature === "matchday-two-winner-six-points" ||
    signature === "matchday-two-loser-under-pressure" ||
    signature === "loser-misses-top-two" ||
    signature === "loser-no-longer-controls-top-two"
  ) {
    return 2;
  }

  if (
    source === "bsd-incidents:late-decisive-goal" ||
    source === "editorial-match-tempo" ||
    source === "bsd-scoreline" ||
    source === "bsd-tournament-results" ||
    source === "editorial-hierarchy"
  ) {
    return 3;
  }

  if (source.includes("world-cup-team-facts") || source === "editorial-team-form") return 4;
  if (source.includes("stats") || source.includes("advanced-stats")) return 5;
  return 6;
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

function getNarrativeFingerprint(text) {
  const keep = new Set([
    "asegura",
    "avanzar",
    "cerca",
    "clasificado",
    "clasificacion",
    "clara",
    "complica",
    "consigue",
    "control",
    "dominio",
    "empata",
    "eliminado",
    "favorito",
    "fortalece",
    "grupo",
    "historico",
    "importante",
    "invicto",
    "jornada",
    "liderato",
    "mantiene",
    "mejores",
    "pelea",
    "puntos",
    "reacciona",
    "resiste",
    "siguiente",
    "terceros",
    "victoria",
  ]);

  return String(text || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[0-9]+(?:\+[0-9]+)?'/g, "MIN")
    .replace(/[0-9]+-[0-9]+/g, "SCORE")
    .replace(/\bgrupo\s+[a-z]\b/g, "grupo X")
    .replace(/\b[a-z]{4,}\b/g, (word) => (keep.has(word) ? word : "TEAM"))
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 160);
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

function pushPlayerMilestoneCandidates(candidates, milestoneContext) {
  for (const fact of milestoneContext?.facts || []) {
    if (!fact?.text) continue;
    candidates.push({
      priority: Number(fact.priority || 128),
      level: Number(fact.level || 1),
      source: fact.source || "editorial-player-milestone",
      signature: fact.signature || getEditorialSignature(fact.text),
      text: fact.text,
      milestone: fact,
    });
  }
}

function pushTeamHistoricalMilestoneCandidates(candidates, context) {
  const { homeName, awayName, homeFacts, awayFacts, homeAfter, awayAfter, group, matchday } = context;
  if (Number(matchday || 0) !== 3) return;

  const teams = [
    { name: homeName, facts: homeFacts, after: homeAfter },
    { name: awayName, facts: awayFacts, after: awayAfter },
  ];

  for (const team of teams) {
    const maxPointsBefore = Number(team.facts?.maxGroupStagePointsBefore2026);
    if (!Number.isFinite(maxPointsBefore) || maxPointsBefore >= 9) continue;
    if (Number(team.after?.points || 0) !== 9) continue;

    candidates.push({
      priority: 127,
      level: 1,
      source: "curated-world-cup-team-facts",
      signature: "team-first-perfect-group-stage",
      text: group
        ? `${team.name} cierra el Grupo ${group} con nueve puntos por primera vez en su historia mundialista.`
        : `${team.name} cierra la fase de grupos con nueve puntos por primera vez en su historia mundialista.`,
    });
  }
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
      text: `${homeName} y ${awayName} firmaron un empate con margen mínimo y mucho intercambio${groupPhrase}.`,
    });
    return;
  }

  candidates.push({
    priority: totalGoals >= 6 ? 93 : 91,
    source: "editorial-match-tempo",
    text: `${winnerName} venció a ${loserName} en un cruce de ida y vuelta${groupPhrase}.`,
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
      signature: "late-equalizer",
      text: `${teamName} igualó en el ${minute}${groupPhrase} y evita la derrota en un cierre que deja a ${opponentName} sin una victoria clave.`,
    });
    return;
  }

  candidates.push({
    priority: 96,
    source: "bsd-incidents:late-decisive-goal",
    signature: "late-winner",
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
        ? "convierte el empate en un resultado histórico"
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
      text: `${winnerName} resistió el dominio de ${dominantName} y fue más eficaz para llevarse la victoria.`,
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
      const dominantTeamWon = !winnerSide || dominant.side === winnerSide;
      candidates.push({
        priority: dominantTeamWon ? 86 : 61,
        source: "bsd-advanced-stats:big-chances",
        signature: dominantTeamWon ? "big-chances-domination" : "loser-big-chances-domination",
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
    if (Number(winnerAfter.points || 0) >= 3 && Number(winnerAfter.points || 0) < 6) {
      const winnerWasUnderPressure = Number(winnerAfter.wins || 0) === 1;
      const basePriority = winnerWasUnderPressure ? 97 : 92;
      const baseSignature = winnerWasUnderPressure
        ? "matchday-two-winner-enters-top-two-race"
        : "matchday-two-winner-strengthens-top-two-race";
      const variants = winnerWasUnderPressure
        ? [
            {
              priority: basePriority,
              source: "editorial-group-stakes",
              signature: `${baseSignature}:back-in-race`,
              text: `${winnerName} venció a ${loserName} y reactiva su pelea por avanzar en el Grupo ${group}.`,
            },
            {
              priority: basePriority - 0.5,
              source: "editorial-group-stakes",
              signature: `${baseSignature}:route-open`,
              text: `${winnerName} superó a ${loserName} y mantiene abierta su ruta hacia la siguiente fase en el Grupo ${group}.`,
            },
            {
              priority: basePriority - 1,
              source: "editorial-group-stakes",
              signature: `${baseSignature}:group-tightens`,
              text: `${winnerName} se impuso a ${loserName} y aprieta la pelea por avanzar en el Grupo ${group}.`,
            },
            {
              priority: basePriority - 1.5,
              source: "editorial-group-stakes",
              signature: `${baseSignature}:final-day-alive`,
              text: `${winnerName} derrotó a ${loserName} y llega con vida a la última jornada del Grupo ${group}.`,
            },
          ]
        : [
            {
              priority: basePriority,
              source: "editorial-group-stakes",
              signature: `${baseSignature}:gains-ground`,
              text: `${winnerName} venció a ${loserName} y gana margen en la lucha por avanzar en el Grupo ${group}.`,
            },
            {
              priority: basePriority - 0.5,
              source: "editorial-group-stakes",
              signature: `${baseSignature}:holds-place`,
              text: `${winnerName} superó a ${loserName} y refuerza su lugar en la pelea del Grupo ${group}.`,
            },
            {
              priority: basePriority - 1,
              source: "editorial-group-stakes",
              signature: `${baseSignature}:keeps-control`,
              text: `${winnerName} derrotó a ${loserName} y conserva una posición favorable en el Grupo ${group}.`,
            },
          ];

      pushVariantCandidates(candidates, variants, {
        seed: "matchday-two-winner-stakes",
        winnerName,
        loserName,
        group,
        matchday,
      });
    }

    if (Number(winnerAfter.points || 0) >= 6) {
      candidates.push({
        priority: 93,
        source: "editorial-group-stakes",
        signature: "matchday-two-winner-near-qualification",
        text: `${winnerName} venció a ${loserName} y queda muy cerca de avanzar en el Grupo ${group}.`,
      });

      candidates.push({
        priority: 91,
        source: "editorial-group-stakes",
        signature: "matchday-two-winner-six-points",
        text: `${winnerName} llega a seis puntos y toma control de su camino en el Grupo ${group}.`,
      });
    }

    if (Number(loserAfter.points || 0) <= 1) {
      candidates.push({
        priority: 89,
        source: "editorial-group-stakes",
        signature: "matchday-two-loser-under-pressure",
        text: `${loserName} queda bajo presión en el Grupo ${group} y necesita reaccionar en la última jornada.`,
      });
    }

    if (Number(loserAfter.points || 0) === 0 && loserOutlook?.remainingGames > 0) {
      const winnerFirstWin = Number(winnerAfter.wins || 0) === 1;
      candidates.push({
        priority: 99,
        source: "editorial-group-stakes",
        signature: "matchday-two-loser-best-third-route",
        text: winnerFirstWin
          ? `${winnerName} consiguió su primera victoria y deja a ${loserName} obligado a ganar para aspirar a avanzar como uno de los mejores terceros.`
          : `${winnerName} venció a ${loserName}, que queda obligado a ganar para aspirar a avanzar como uno de los mejores terceros.`,
      });
    }
  }

  if (isDraw && matchday === 2) {
    const homePoints = Number(homeAfter.points || 0);
    const awayPoints = Number(awayAfter.points || 0);

    if (homePoints <= 2 || awayPoints <= 2) {
      const pressured = homePoints <= awayPoints ? homeName : awayName;
      candidates.push({
        priority: 90,
        source: "editorial-group-stakes",
        signature: "matchday-two-draw-group-open",
        text: `${pressured} rescató un punto, pero el Grupo ${group} sigue abierto de cara a la última jornada.`,
      });
    } else {
      candidates.push({
        priority: 88,
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
        priority: 94,
        source: "editorial-group-stakes",
        signature: "matchday-three-winner-qualification-pressure",
        text: `${winnerName} ganó en el cierre del Grupo ${group} y fortalece sus opciones de avanzar.`,
      });
    }

    if (!isDraw && loserPoints <= 3) {
      candidates.push({
        priority: 93,
        source: "editorial-group-stakes",
        signature: "matchday-three-loser-needs-results",
        text: `${loserName} perdió en el cierre del Grupo ${group} y queda pendiente de otros resultados para avanzar.`,
      });
    }

    if (isDraw) {
      candidates.push({
        priority: 91,
        source: "editorial-group-stakes",
        signature: "matchday-three-draw-combinations",
        text: `${homeName} y ${awayName} cerraron el Grupo ${group} con un empate que deja todo sujeto a combinaciones.`,
      });
    }
  }
}

function pushTournamentConsequenceCandidates(candidates, context) {
  const {
    homeName,
    awayName,
    homeKey,
    awayKey,
    winnerName,
    loserName,
    winnerKey,
    isDraw,
    group,
    tournament,
  } = context;

  if (!group || !tournament) return;

  const newlyQualified = new Set(tournament.newlyQualified || []);
  const newlyGuaranteedFirst = new Set(tournament.newlyGuaranteedFirst || []);
  const teamNameByKey = {
    [homeKey]: homeName,
    [awayKey]: awayName,
  };
  const newlyQualifiedCurrentTeams = [homeKey, awayKey].filter((team) => newlyQualified.has(team));

  for (const teamKey of newlyQualifiedCurrentTeams) {
    const teamName = teamNameByKey[teamKey];
    const opponentName = teamKey === homeKey ? awayName : homeName;
    const won = !isDraw && teamKey === winnerKey;
    const firstQualified = Boolean(tournament.firstQualifiedThisTournament);
    const guaranteedFirst = newlyGuaranteedFirst.has(teamKey);

    if (firstQualified && guaranteedFirst && won) {
      pushVariantCandidates(
        candidates,
        [
          {
            priority: 130,
            level: 1,
            source: "editorial-tournament-consequence",
            signature: "first-qualified-and-group-winner:leader-first-ticket",
            text: `${teamName} venció a ${opponentName}, asegura el liderato del Grupo ${group} y se convierte en el primer clasificado del Mundial.`,
          },
          {
            priority: 129.5,
            level: 1,
            source: "editorial-tournament-consequence",
            signature: "first-qualified-and-group-winner:first-through",
            text: `${teamName} venció a ${opponentName}, amarra el Grupo ${group} y abre la lista de clasificados del Mundial.`,
          },
          {
            priority: 129,
            level: 1,
            source: "editorial-tournament-consequence",
            signature: "first-qualified-and-group-winner:group-sealed",
            text: `${teamName} venció a ${opponentName}, queda como líder del Grupo ${group} y firma el primer boleto a la siguiente fase.`,
          },
        ],
        { seed: "first-qualified-and-group-winner", winnerName: teamName, loserName: opponentName, group },
      );
      continue;
    }

    if (firstQualified) {
      pushVariantCandidates(
        candidates,
        won
          ? [
              {
                priority: 128,
                level: 1,
                source: "editorial-tournament-consequence",
                signature: "first-qualified-tournament:first-through",
                text: `${teamName} venció a ${opponentName} y se convierte en el primer clasificado del Mundial.`,
              },
              {
                priority: 127.5,
                level: 1,
                source: "editorial-tournament-consequence",
                signature: "first-qualified-tournament:first-ticket",
                text: `${teamName} venció a ${opponentName} y firma el primer boleto a la siguiente fase.`,
              },
              {
                priority: 127,
                level: 1,
                source: "editorial-tournament-consequence",
                signature: "first-qualified-tournament:opens-qualified-list",
                text: `${teamName} venció a ${opponentName} y abre la lista de clasificados del Mundial.`,
              },
            ]
          : [
              {
                priority: 128,
                level: 1,
                source: "editorial-tournament-consequence",
                signature: "first-qualified-tournament:first-through-no-win",
                text: `${teamName} asegura su clasificación y se convierte en el primer clasificado del Mundial.`,
              },
              {
                priority: 127.5,
                level: 1,
                source: "editorial-tournament-consequence",
                signature: "first-qualified-tournament:first-ticket-no-win",
                text: `${teamName} asegura el primer boleto a la siguiente fase del Mundial.`,
              },
            ],
        { seed: "first-qualified-tournament", winnerName: teamName, loserName: opponentName, group },
      );
      continue;
    }

    if (guaranteedFirst && won) {
      pushVariantCandidates(
        candidates,
        [
          {
            priority: 124,
            level: 1,
            source: "editorial-tournament-consequence",
            signature: "newly-qualified-and-group-winner:leader-and-through",
            text: `${teamName} venció a ${opponentName}, asegura el liderato del Grupo ${group} y avanza a la siguiente fase.`,
          },
          {
            priority: 123.5,
            level: 1,
            source: "editorial-tournament-consequence",
            signature: "newly-qualified-and-group-winner:group-sealed",
            text: `${teamName} venció a ${opponentName} y deja asegurados el primer lugar del Grupo ${group} y la clasificación.`,
          },
          {
            priority: 123,
            level: 1,
            source: "editorial-tournament-consequence",
            signature: "newly-qualified-and-group-winner:next-round-leader",
            text: `${teamName} venció a ${opponentName}, avanza como líder del Grupo ${group} y ya piensa en la siguiente fase.`,
          },
        ],
        { seed: "newly-qualified-and-group-winner", winnerName: teamName, loserName: opponentName, group },
      );
      continue;
    }

    pushVariantCandidates(
      candidates,
      won
        ? [
            {
              priority: 121,
              level: 1,
              source: "editorial-tournament-consequence",
              signature: "newly-qualified-tournament:through-with-win",
              text: `${teamName} venció a ${opponentName} y asegura su clasificación a la siguiente fase.`,
            },
            {
              priority: 120.5,
              level: 1,
              source: "editorial-tournament-consequence",
              signature: "newly-qualified-tournament:ticket-with-win",
              text: `${teamName} superó a ${opponentName} y ya tiene boleto para la siguiente fase.`,
            },
            {
              priority: 120,
              level: 1,
              source: "editorial-tournament-consequence",
              signature: "newly-qualified-tournament:group-step-with-win",
              text: `${teamName} venció a ${opponentName} y convierte el resultado en clasificación dentro del Grupo ${group}.`,
            },
          ]
        : [
            {
              priority: 121,
              level: 1,
              source: "editorial-tournament-consequence",
              signature: "newly-qualified-tournament:through-no-win",
              text: `${teamName} asegura su clasificación a la siguiente fase tras el resultado del Grupo ${group}.`,
            },
            {
              priority: 120.5,
              level: 1,
              source: "editorial-tournament-consequence",
              signature: "newly-qualified-tournament:ticket-no-win",
              text: `${teamName} ya tiene boleto a la siguiente fase después de lo ocurrido en el Grupo ${group}.`,
            },
          ],
      { seed: "newly-qualified-tournament", winnerName: teamName, loserName: opponentName, group },
    );
  }

  for (const teamKey of [homeKey, awayKey]) {
    if (!newlyGuaranteedFirst.has(teamKey) || newlyQualified.has(teamKey)) continue;

    const teamName = teamNameByKey[teamKey];
    const opponentName = teamKey === homeKey ? awayName : homeName;
    const won = !isDraw && teamKey === winnerKey;

    pushVariantCandidates(
      candidates,
      won
        ? [
            {
              priority: 120,
              level: 1,
              source: "editorial-tournament-consequence",
              signature: "newly-guaranteed-first:win-seals-first",
              text: `${teamName} venció a ${opponentName} y asegura el primer lugar del Grupo ${group}.`,
            },
            {
              priority: 119.5,
              level: 1,
              source: "editorial-tournament-consequence",
              signature: "newly-guaranteed-first:win-locks-group",
              text: `${teamName} superó a ${opponentName} y ya nadie le quita el liderato del Grupo ${group}.`,
            },
          ]
        : [
            {
              priority: 120,
              level: 1,
              source: "editorial-tournament-consequence",
              signature: "newly-guaranteed-first:no-win-seals-first",
              text: `${teamName} asegura el primer lugar del Grupo ${group}.`,
            },
            {
              priority: 119.5,
              level: 1,
              source: "editorial-tournament-consequence",
              signature: "newly-guaranteed-first:no-win-locks-group",
              text: `${teamName} ya tiene asegurado el liderato del Grupo ${group}.`,
            },
          ],
      { seed: "newly-guaranteed-first", winnerName: teamName, loserName: opponentName, group },
    );
  }
}

function pushWinnerClassificationCandidates(candidates, context) {
  const { winnerName, loserName, group, winnerOutlook } = context;
  if (!winnerOutlook) return;

  if (winnerOutlook.guaranteedFirst) {
    pushVariantCandidates(
      candidates,
      [
        {
          priority: 115,
          level: 1,
          source: "editorial-group-qualification",
          signature: "winner-guaranteed-first:seals-first",
          text: `${winnerName} venció a ${loserName} y asegura el primer lugar del Grupo ${group}.`,
        },
        {
          priority: 114.5,
          level: 1,
          source: "editorial-group-qualification",
          signature: "winner-guaranteed-first:locks-lead",
          text: `${winnerName} superó a ${loserName} y deja asegurado el liderato del Grupo ${group}.`,
        },
      ],
      { seed: "winner-guaranteed-first", winnerName, loserName, group },
    );
    return;
  }

  if (winnerOutlook.guaranteedTopTwo) {
    pushVariantCandidates(
      candidates,
      [
        {
          priority: 114,
          level: 1,
          source: "editorial-group-qualification",
          signature: "winner-guaranteed-top-two:math-through",
          text: `${winnerName} venció a ${loserName} y asegura matemáticamente su clasificación a la siguiente fase.`,
        },
        {
          priority: 113.5,
          level: 1,
          source: "editorial-group-qualification",
          signature: "winner-guaranteed-top-two:ticket",
          text: `${winnerName} superó a ${loserName} y ya tiene boleto para la siguiente fase.`,
        },
      ],
      { seed: "winner-guaranteed-top-two", winnerName, loserName, group },
    );
    return;
  }

  if (winnerOutlook.oneStepFromTopTwo) {
    candidates.push({
      priority: 94,
      source: "editorial-group-qualification",
      signature: "winner-one-step-from-top-two",
      text: `${winnerName} derrotó a ${loserName} y queda a un paso de avanzar en el Grupo ${group}.`,
    });
  }
}

function pushLoserClassificationRiskCandidates(candidates, context) {
  const { winnerName, loserName, loserOutlook } = context;
  if (!loserOutlook) return;

  if (loserOutlook.eliminatedRoundOf32) {
    candidates.push({
      priority: 113,
      level: 1,
      source: "editorial-group-qualification",
      signature: "loser-eliminated-round-of-32",
      text: `${loserName} cayó ante ${winnerName} y queda eliminado del Mundial.`,
    });
    return;
  }

  if (loserOutlook.eliminatedTopTwo) {
    candidates.push({
      priority: 96,
      source: "editorial-group-qualification",
      signature: "loser-misses-top-two",
      text: loserOutlook.thirdPlacePending
        ? `${loserName} queda fuera de los dos primeros puestos y a la espera de la tabla de mejores terceros.`
        : `${loserName} queda fuera de los dos primeros puestos del grupo.`,
    });
    return;
  }

  if (loserOutlook.noLongerControlsTopTwo) {
    candidates.push({
      priority: 90,
      source: "editorial-group-qualification",
      signature: "loser-no-longer-controls-top-two",
      text: `${loserName} queda al límite y necesita ganar para aspirar a avanzar como uno de los mejores terceros.`,
    });
  }
}

function pushDrawGroupOutlookCandidates(candidates, context) {
  const { homeName, awayName, group, matchday, groupOutlook, homeOutlook, awayOutlook } = context;
  if (!groupOutlook) return;

  if (matchday === 2 && groupOutlook.openForFinalDay) {
    candidates.push({
      priority: 94,
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
      priority: 87,
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
        ? `${underdog.name} le cerró el camino a ${favorite.name} y convierte el empate sin goles en un resultado histórico.`
        : `${underdog.name} igualó con ${favorite.name} y firma un resultado histórico frente a ${favoriteDescription}.`,
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
