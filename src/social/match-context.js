const { normalizeTeamName } = require("./caption");

function getInternalContext(matchData) {
  const home = matchData.teams?.home || {};
  const away = matchData.teams?.away || {};
  const group = matchData.competition?.groupLetter;
  const matchday = Number(matchData.competition?.matchdayNumber || 0);
  const homeScore = Number(home.score || 0);
  const awayScore = Number(away.score || 0);
  const totalGoals = homeScore + awayScore;
  const margin = Math.abs(homeScore - awayScore);
  const homeName = normalizeTeamName(home.name);
  const awayName = normalizeTeamName(away.name);
  const groupText = group ? ` en el Grupo ${group}` : "";
  const prior = matchData.context?.priorGroup || {};
  const homePrior = prior.homePrior || {};
  const awayPrior = prior.awayPrior || {};

  const variants = [];

  if (homeScore === awayScore) {
    variants.push(`${homeName} y ${awayName} reparten puntos${groupText}.`);
    variants.push(`Empate entre ${homeName} y ${awayName}${groupText}.`);
    if (totalGoals >= 4) {
      variants.push(`${homeName} y ${awayName} firman un empate con goles${groupText}.`);
    }
    return {
      source: "internal-summary",
      headline: pickVariant(variants, matchData),
    };
  }

  const winner = homeScore > awayScore ? home : away;
  const loser = homeScore > awayScore ? away : home;
  const winnerName = normalizeTeamName(winner.name);
  const loserName = normalizeTeamName(loser.name);
  const winnerPrior = homeScore > awayScore ? homePrior : awayPrior;

  if (margin >= 4) {
    variants.push(`${winnerName} golea a ${loserName}${groupText}.`);
    variants.push(`${winnerName} firma una victoria contundente${groupText}.`);
  } else if (margin === 1) {
    variants.push(`${winnerName} gana por la mínima ante ${loserName}${groupText}.`);
    variants.push(`${winnerName} rescata un triunfo cerrado${groupText}.`);
  } else {
    variants.push(`${winnerName} supera a ${loserName}${groupText}.`);
    variants.push(`${winnerName} suma una victoria importante${groupText}.`);
  }

  if (matchday === 1) {
    variants.push(`${winnerName} abre su Mundial con triunfo${groupText}.`);
  } else if (matchday === 2) {
    variants.push(`${winnerName} da un paso importante en la segunda jornada${groupText}.`);
  } else if (matchday === 3) {
    variants.push(`${winnerName} cierra la fase de grupos con una victoria clave${groupText}.`);
  }

  if (Number(winnerPrior.played || 0) > 0 && Number(winnerPrior.wins || 0) === 0) {
    return {
      source: "internal-summary",
      headline: `${winnerName} consigue su primera victoria del torneo${groupText}.`,
    };
  }

  if (Number(winnerPrior.played || 0) > 0 && Number(winnerPrior.losses || 0) === 0) {
    return {
      source: "internal-summary",
      headline: `${winnerName} mantiene el invicto${groupText}.`,
    };
  }

  return {
    source: "internal-summary",
    headline: pickVariant(variants, matchData),
  };
}

function pickVariant(variants, matchData) {
  const seed = Number(matchData.source?.eventId || 0);
  return variants[Math.abs(seed) % variants.length] || variants[0] || "";
}

module.exports = {
  getInternalContext,
};
