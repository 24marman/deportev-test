const { getDisplayTeamName, getFlagEmoji } = require("../lib/team-metadata");

function normalizeTeamName(name) {
  return getDisplayTeamName(name);
}

function buildFinalScoreCaption(matchData) {
  const group = matchData.competition?.groupLetter || "";
  const matchday = matchData.competition?.matchdayNumber || "";
  const home = matchData.teams?.home || {};
  const away = matchData.teams?.away || {};
  const status = matchData.match?.status || "FINAL";
  const homeName = normalizeTeamName(home.name);
  const awayName = normalizeTeamName(away.name);
  const headlineParts = [status];

  if (group) {
    headlineParts.push(`Grupo ${group}`);
  }

  if (matchday) {
    headlineParts.push(`Jornada ${matchday}`);
  }

  return [
    headlineParts.join(" | "),
    "",
    `${getFlagEmoji(home.name)} ${homeName} ${home.score ?? 0}-${away.score ?? 0} ${awayName} ${getFlagEmoji(away.name)}`.trim(),
    "",
    "#Mundial2026 #WC2026",
  ].join("\n");
}

function buildContextualFinalScoreCaption(matchData, context) {
  const base = buildFinalScoreCaption(matchData);
  const headline = String(context?.headline || "").trim();

  if (!headline) return base;

  return `${headline}\n\n${base}`;
}

module.exports = {
  buildFinalScoreCaption,
  buildContextualFinalScoreCaption,
  getFlagEmoji,
  normalizeTeamName,
};
