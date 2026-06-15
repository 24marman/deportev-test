const TEAM_METADATA = [
  { keys: ["algeria"], displayName: "Argelia", iso2: "dz", emoji: "🇩🇿" },
  { keys: ["argentina"], displayName: "Argentina", iso2: "ar", emoji: "🇦🇷" },
  { keys: ["australia"], displayName: "Australia", iso2: "au", emoji: "🇦🇺" },
  { keys: ["austria"], displayName: "Austria", iso2: "at", emoji: "🇦🇹" },
  { keys: ["belgium"], displayName: "Bélgica", iso2: "be", emoji: "🇧🇪" },
  { keys: ["bosnia & herzegovina", "bosnia and herzegovina"], displayName: "Bosnia y Herzegovina", iso2: "ba", emoji: "🇧🇦" },
  { keys: ["brazil"], displayName: "Brasil", iso2: "br", emoji: "🇧🇷" },
  { keys: ["cabo verde", "cape verde"], displayName: "Cabo Verde", iso2: "cv", emoji: "🇨🇻" },
  { keys: ["canada"], displayName: "Canadá", iso2: "ca", emoji: "🇨🇦" },
  { keys: ["colombia"], displayName: "Colombia", iso2: "co", emoji: "🇨🇴" },
  { keys: ["croatia"], displayName: "Croacia", iso2: "hr", emoji: "🇭🇷" },
  { keys: ["curacao", "curaçao"], displayName: "Curazao", iso2: "cw", emoji: "🇨🇼" },
  { keys: ["czechia", "czech republic"], displayName: "Chequia", iso2: "cz", emoji: "🇨🇿" },
  { keys: ["cote d'ivoire", "côte d'ivoire", "cote divoire", "cote d ivoire"], displayName: "Costa de Marfil", iso2: "ci", emoji: "🇨🇮" },
  { keys: ["dr congo", "congo dr", "congo"], displayName: "RD Congo", iso2: "cd", emoji: "🇨🇩" },
  { keys: ["ecuador"], displayName: "Ecuador", iso2: "ec", emoji: "🇪🇨" },
  { keys: ["egypt"], displayName: "Egipto", iso2: "eg", emoji: "🇪🇬" },
  { keys: ["england"], displayName: "Inglaterra", iso2: "gb-eng", emoji: "🏴" },
  { keys: ["france"], displayName: "Francia", iso2: "fr", emoji: "🇫🇷" },
  { keys: ["germany"], displayName: "Alemania", iso2: "de", emoji: "🇩🇪" },
  { keys: ["ghana"], displayName: "Ghana", iso2: "gh", emoji: "🇬🇭" },
  { keys: ["haiti"], displayName: "Haití", iso2: "ht", emoji: "🇭🇹" },
  { keys: ["iran", "ir iran"], displayName: "Irán", iso2: "ir", emoji: "🇮🇷" },
  { keys: ["iraq"], displayName: "Irak", iso2: "iq", emoji: "🇮🇶" },
  { keys: ["japan"], displayName: "Japón", iso2: "jp", emoji: "🇯🇵" },
  { keys: ["jordan"], displayName: "Jordania", iso2: "jo", emoji: "🇯🇴" },
  { keys: ["mexico"], displayName: "México", iso2: "mx", emoji: "🇲🇽" },
  { keys: ["morocco"], displayName: "Marruecos", iso2: "ma", emoji: "🇲🇦" },
  { keys: ["netherlands"], displayName: "Países Bajos", iso2: "nl", emoji: "🇳🇱" },
  { keys: ["new zealand"], displayName: "Nueva Zelanda", iso2: "nz", emoji: "🇳🇿" },
  { keys: ["norway"], displayName: "Noruega", iso2: "no", emoji: "🇳🇴" },
  { keys: ["panama"], displayName: "Panamá", iso2: "pa", emoji: "🇵🇦" },
  { keys: ["paraguay"], displayName: "Paraguay", iso2: "py", emoji: "🇵🇾" },
  { keys: ["portugal"], displayName: "Portugal", iso2: "pt", emoji: "🇵🇹" },
  { keys: ["qatar"], displayName: "Qatar", iso2: "qa", emoji: "🇶🇦" },
  { keys: ["saudi arabia"], displayName: "Arabia Saudita", iso2: "sa", emoji: "🇸🇦" },
  { keys: ["scotland"], displayName: "Escocia", iso2: "gb-sct", emoji: "🏴" },
  { keys: ["senegal"], displayName: "Senegal", iso2: "sn", emoji: "🇸🇳" },
  { keys: ["south africa"], displayName: "Sudáfrica", iso2: "za", emoji: "🇿🇦" },
  { keys: ["south korea", "korea republic"], displayName: "Corea del Sur", iso2: "kr", emoji: "🇰🇷" },
  { keys: ["spain"], displayName: "España", iso2: "es", emoji: "🇪🇸" },
  { keys: ["sweden"], displayName: "Suecia", iso2: "se", emoji: "🇸🇪" },
  { keys: ["switzerland"], displayName: "Suiza", iso2: "ch", emoji: "🇨🇭" },
  { keys: ["tunisia"], displayName: "Túnez", iso2: "tn", emoji: "🇹🇳" },
  { keys: ["turkiye", "türkiye", "turkey"], displayName: "Turquía", iso2: "tr", emoji: "🇹🇷" },
  { keys: ["uruguay"], displayName: "Uruguay", iso2: "uy", emoji: "🇺🇾" },
  { keys: ["usa", "us", "united states"], displayName: "Estados Unidos", iso2: "us", emoji: "🇺🇸" },
  { keys: ["uzbekistan"], displayName: "Uzbekistán", iso2: "uz", emoji: "🇺🇿" },
];

function normalizeTeamKey(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

const TEAM_INDEX = new Map();
for (const team of TEAM_METADATA) {
  TEAM_INDEX.set(normalizeTeamKey(team.displayName), team);
  for (const key of team.keys) {
    TEAM_INDEX.set(normalizeTeamKey(key), team);
  }
}

function getTeamMetadata(name) {
  const fallbackName = String(name || "").trim();
  return TEAM_INDEX.get(normalizeTeamKey(fallbackName)) || {
    displayName: fallbackName,
    iso2: "",
    emoji: "",
  };
}

function getDisplayTeamName(name) {
  return getTeamMetadata(name).displayName;
}

function getFlagEmoji(name) {
  return getTeamMetadata(name).emoji;
}

function getFlagAssetUrl(name) {
  const { iso2 } = getTeamMetadata(name);
  if (!iso2) return "./assets/home-flag.svg";
  return `./assets/flags/${iso2}.svg`;
}

module.exports = {
  getDisplayTeamName,
  getFlagAssetUrl,
  getFlagEmoji,
  getTeamMetadata,
  normalizeTeamKey,
};
