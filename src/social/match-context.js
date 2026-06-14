const { normalizeTeamName } = require("./caption");

function getInternalContext(matchData) {
  const home = matchData.teams?.home || {};
  const away = matchData.teams?.away || {};
  const group = matchData.competition?.groupLetter;
  const homeScore = Number(home.score || 0);
  const awayScore = Number(away.score || 0);

  if (homeScore === awayScore) {
    return {
      source: "internal-summary",
      headline: `${normalizeTeamName(home.name)} y ${normalizeTeamName(away.name)} reparten puntos${group ? ` en el Grupo ${group}` : ""}.`,
    };
  }

  const winner = homeScore > awayScore ? home : away;
  return {
    source: "internal-summary",
    headline: `${normalizeTeamName(winner.name)} arranca con triunfo${group ? ` en el Grupo ${group}` : ""}.`,
  };
}

module.exports = {
  getInternalContext,
};
