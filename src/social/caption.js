const TEAM_DISPLAY_NAMES = {
  Brazil: "Brasil",
  Morocco: "Marruecos",
  Qatar: "Qatar",
  Switzerland: "Suiza",
  Argentina: "Argentina",
  Mexico: "Mexico",
  USA: "Estados Unidos",
  Canada: "Canada",
  Germany: "Alemania",
  Netherlands: "Paises Bajos",
  "South Korea": "Corea del Sur",
  "South Africa": "Sudafrica",
};

function normalizeTeamName(name) {
  const cleanName = String(name || "").trim();
  return TEAM_DISPLAY_NAMES[cleanName] || cleanName;
}

function buildFinalScoreCaption(matchData) {
  const group = matchData.competition?.groupLetter || "";
  const matchday = matchData.competition?.matchdayNumber || "";
  const home = matchData.teams?.home || {};
  const away = matchData.teams?.away || {};
  const status = matchData.match?.status || "FINAL";
  const headlineParts = [status];

  if (group) {
    headlineParts.push(`Grupo ${group}`);
  }

  if (matchday) {
    headlineParts.push(`Jornada ${matchday}`);
  }

  return [
    headlineParts.join(" | "),
    `${normalizeTeamName(home.name)} ${home.score ?? 0}-${away.score ?? 0} ${normalizeTeamName(away.name)}`,
    "",
    "#CopaMundial2026",
  ].join("\n");
}

module.exports = {
  buildFinalScoreCaption,
};
