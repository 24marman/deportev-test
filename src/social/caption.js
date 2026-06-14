const TEAM_DISPLAY_NAMES = {
  Algeria: "Argelia",
  Brazil: "Brasil",
  Morocco: "Marruecos",
  Qatar: "Qatar",
  Switzerland: "Suiza",
  Argentina: "Argentina",
  Mexico: "México",
  USA: "Estados Unidos",
  Canada: "Canadá",
  Germany: "Alemania",
  Netherlands: "Países Bajos",
  "South Korea": "Corea del Sur",
  "South Africa": "Sudafrica",
  Australia: "Australia",
  Austria: "Austria",
  Belgium: "Bélgica",
  "Bosnia & Herzegovina": "Bosnia y Herzegovina",
  "Bosnia and Herzegovina": "Bosnia y Herzegovina",
  "Cabo Verde": "Cabo Verde",
  Colombia: "Colombia",
  Croatia: "Croacia",
  Curaçao: "Curazao",
  Curacao: "Curazao",
  Czechia: "Chequia",
  "Côte d'Ivoire": "Costa de Marfil",
  "Cote d'Ivoire": "Costa de Marfil",
  "DR Congo": "RD Congo",
  "Congo DR": "RD Congo",
  Ecuador: "Ecuador",
  Egypt: "Egipto",
  England: "Inglaterra",
  France: "Francia",
  Ghana: "Ghana",
  Haiti: "Haití",
  Iraq: "Irak",
  Iran: "Irán",
  "IR Iran": "Irán",
  Japan: "Japón",
  Jordan: "Jordania",
  "New Zealand": "Nueva Zelanda",
  Norway: "Noruega",
  Panama: "Panamá",
  Paraguay: "Paraguay",
  Portugal: "Portugal",
  "Saudi Arabia": "Arabia Saudita",
  Scotland: "Escocia",
  Senegal: "Senegal",
  Spain: "España",
  Sweden: "Suecia",
  Tunisia: "Túnez",
  Turkiye: "Turquía",
  Türkiye: "Turquía",
  Turkey: "Turquía",
  Uruguay: "Uruguay",
  Uzbekistan: "Uzbekistán",
};

const TEAM_FLAG_EMOJIS = {
  Algeria: "🇩🇿",
  Argentina: "🇦🇷",
  Australia: "🇦🇺",
  Austria: "🇦🇹",
  Belgium: "🇧🇪",
  "Bosnia & Herzegovina": "🇧🇦",
  "Bosnia and Herzegovina": "🇧🇦",
  Brazil: "🇧🇷",
  "Cabo Verde": "🇨🇻",
  Canada: "🇨🇦",
  Colombia: "🇨🇴",
  Croatia: "🇭🇷",
  Curacao: "🇨🇼",
  Curaçao: "🇨🇼",
  Czechia: "🇨🇿",
  "Cote d'Ivoire": "🇨🇮",
  "Côte d'Ivoire": "🇨🇮",
  "DR Congo": "🇨🇩",
  "Congo DR": "🇨🇩",
  Ecuador: "🇪🇨",
  Egypt: "🇪🇬",
  England: "🏴",
  France: "🇫🇷",
  Germany: "🇩🇪",
  Ghana: "🇬🇭",
  Haiti: "🇭🇹",
  Iran: "🇮🇷",
  "IR Iran": "🇮🇷",
  Iraq: "🇮🇶",
  Japan: "🇯🇵",
  Jordan: "🇯🇴",
  Mexico: "🇲🇽",
  Morocco: "🇲🇦",
  Netherlands: "🇳🇱",
  "New Zealand": "🇳🇿",
  Norway: "🇳🇴",
  Panama: "🇵🇦",
  Paraguay: "🇵🇾",
  Portugal: "🇵🇹",
  Qatar: "🇶🇦",
  "Saudi Arabia": "🇸🇦",
  Scotland: "🏴",
  Senegal: "🇸🇳",
  "South Africa": "🇿🇦",
  "South Korea": "🇰🇷",
  Spain: "🇪🇸",
  Sweden: "🇸🇪",
  Switzerland: "🇨🇭",
  Tunisia: "🇹🇳",
  Turkiye: "🇹🇷",
  Türkiye: "🇹🇷",
  Turkey: "🇹🇷",
  Uruguay: "🇺🇾",
  USA: "🇺🇸",
  Uzbekistan: "🇺🇿",
};

function normalizeTeamName(name) {
  const cleanName = String(name || "").trim();
  return TEAM_DISPLAY_NAMES[cleanName] || cleanName;
}

function getFlagEmoji(name) {
  const cleanName = String(name || "").trim();
  return TEAM_FLAG_EMOJIS[cleanName] || "";
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
