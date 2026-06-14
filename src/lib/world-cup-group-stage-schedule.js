const GROUP_STAGE_SCHEDULE = [
  { date: "2026-06-11", group: "A", matchday: "1", home: "Mexico", away: "South Africa", venue: "Mexico City Stadium" },
  { date: "2026-06-11", group: "A", matchday: "1", home: "South Korea", away: "Czechia", venue: "Guadalajara Stadium" },
  { date: "2026-06-12", group: "B", matchday: "1", home: "Canada", away: "Bosnia & Herzegovina", venue: "Toronto Stadium" },
  { date: "2026-06-12", group: "D", matchday: "1", home: "USA", away: "Paraguay", venue: "Los Angeles Stadium" },
  { date: "2026-06-13", group: "C", matchday: "1", home: "Haiti", away: "Scotland", venue: "Boston Stadium" },
  { date: "2026-06-13", group: "D", matchday: "1", home: "Australia", away: "Turkiye", venue: "Vancouver Stadium" },
  { date: "2026-06-13", group: "C", matchday: "1", home: "Brazil", away: "Morocco", venue: "New York New Jersey Stadium" },
  { date: "2026-06-13", group: "B", matchday: "1", home: "Qatar", away: "Switzerland", venue: "San Francisco Bay Area Stadium" },
  { date: "2026-06-14", group: "E", matchday: "1", home: "Cote d'Ivoire", away: "Ecuador", venue: "Philadelphia Stadium" },
  { date: "2026-06-14", group: "E", matchday: "1", home: "Germany", away: "Curacao", venue: "Houston Stadium" },
  { date: "2026-06-14", group: "F", matchday: "1", home: "Netherlands", away: "Japan", venue: "Dallas Stadium" },
  { date: "2026-06-14", group: "F", matchday: "1", home: "Sweden", away: "Tunisia", venue: "Monterrey Stadium" },
  { date: "2026-06-15", group: "H", matchday: "1", home: "Saudi Arabia", away: "Uruguay", venue: "Miami Stadium" },
  { date: "2026-06-15", group: "H", matchday: "1", home: "Spain", away: "Cabo Verde", venue: "Atlanta Stadium" },
  { date: "2026-06-15", group: "G", matchday: "1", home: "IR Iran", away: "New Zealand", venue: "Los Angeles Stadium" },
  { date: "2026-06-15", group: "G", matchday: "1", home: "Belgium", away: "Egypt", venue: "Seattle Stadium" },
  { date: "2026-06-16", group: "I", matchday: "1", home: "France", away: "Senegal", venue: "New York New Jersey Stadium" },
  { date: "2026-06-16", group: "I", matchday: "1", home: "Iraq", away: "Norway", venue: "Boston Stadium" },
  { date: "2026-06-16", group: "J", matchday: "1", home: "Argentina", away: "Algeria", venue: "Kansas City Stadium" },
  { date: "2026-06-16", group: "J", matchday: "1", home: "Austria", away: "Jordan", venue: "San Francisco Bay Area Stadium" },
  { date: "2026-06-17", group: "L", matchday: "1", home: "Ghana", away: "Panama", venue: "Toronto Stadium" },
  { date: "2026-06-17", group: "L", matchday: "1", home: "England", away: "Croatia", venue: "Dallas Stadium" },
  { date: "2026-06-17", group: "K", matchday: "1", home: "Portugal", away: "DR Congo", venue: "Houston Stadium" },
  { date: "2026-06-17", group: "K", matchday: "1", home: "Uzbekistan", away: "Colombia", venue: "Mexico City Stadium" },
  { date: "2026-06-18", group: "A", matchday: "2", home: "Czechia", away: "South Africa", venue: "Atlanta Stadium" },
  { date: "2026-06-18", group: "B", matchday: "2", home: "Switzerland", away: "Bosnia & Herzegovina", venue: "Los Angeles Stadium" },
  { date: "2026-06-18", group: "B", matchday: "2", home: "Canada", away: "Qatar", venue: "Vancouver Stadium" },
  { date: "2026-06-18", group: "A", matchday: "2", home: "Mexico", away: "South Korea", venue: "Guadalajara Stadium" },
  { date: "2026-06-19", group: "C", matchday: "2", home: "Brazil", away: "Haiti", venue: "Philadelphia Stadium" },
  { date: "2026-06-19", group: "C", matchday: "2", home: "Scotland", away: "Morocco", venue: "Boston Stadium" },
  { date: "2026-06-19", group: "D", matchday: "2", home: "Turkiye", away: "Paraguay", venue: "San Francisco Bay Area Stadium" },
  { date: "2026-06-19", group: "D", matchday: "2", home: "USA", away: "Australia", venue: "Seattle Stadium" },
  { date: "2026-06-20", group: "E", matchday: "2", home: "Germany", away: "Cote d'Ivoire", venue: "Toronto Stadium" },
  { date: "2026-06-20", group: "E", matchday: "2", home: "Ecuador", away: "Curacao", venue: "Kansas City Stadium" },
  { date: "2026-06-20", group: "F", matchday: "2", home: "Netherlands", away: "Sweden", venue: "Houston Stadium" },
  { date: "2026-06-20", group: "F", matchday: "2", home: "Tunisia", away: "Japan", venue: "Monterrey Stadium" },
  { date: "2026-06-21", group: "H", matchday: "2", home: "Uruguay", away: "Cabo Verde", venue: "Miami Stadium" },
  { date: "2026-06-21", group: "H", matchday: "2", home: "Spain", away: "Saudi Arabia", venue: "Atlanta Stadium" },
  { date: "2026-06-21", group: "G", matchday: "2", home: "Belgium", away: "IR Iran", venue: "Los Angeles Stadium" },
  { date: "2026-06-21", group: "G", matchday: "2", home: "New Zealand", away: "Egypt", venue: "Vancouver Stadium" },
  { date: "2026-06-22", group: "I", matchday: "2", home: "Norway", away: "Senegal", venue: "New York New Jersey Stadium" },
  { date: "2026-06-22", group: "I", matchday: "2", home: "France", away: "Iraq", venue: "Philadelphia Stadium" },
  { date: "2026-06-22", group: "J", matchday: "2", home: "Argentina", away: "Austria", venue: "Dallas Stadium" },
  { date: "2026-06-22", group: "J", matchday: "2", home: "Jordan", away: "Algeria", venue: "San Francisco Bay Area Stadium" },
  { date: "2026-06-23", group: "L", matchday: "2", home: "England", away: "Ghana", venue: "Boston Stadium" },
  { date: "2026-06-23", group: "L", matchday: "2", home: "Panama", away: "Croatia", venue: "Toronto Stadium" },
  { date: "2026-06-23", group: "K", matchday: "2", home: "Portugal", away: "Uzbekistan", venue: "Houston Stadium" },
  { date: "2026-06-23", group: "K", matchday: "2", home: "Colombia", away: "DR Congo", venue: "Guadalajara Stadium" },
  { date: "2026-06-24", group: "C", matchday: "3", home: "Scotland", away: "Brazil", venue: "Miami Stadium" },
  { date: "2026-06-24", group: "C", matchday: "3", home: "Morocco", away: "Haiti", venue: "Atlanta Stadium" },
  { date: "2026-06-24", group: "B", matchday: "3", home: "Switzerland", away: "Canada", venue: "Vancouver Stadium" },
  { date: "2026-06-24", group: "B", matchday: "3", home: "Bosnia & Herzegovina", away: "Qatar", venue: "Seattle Stadium" },
  { date: "2026-06-24", group: "A", matchday: "3", home: "Czechia", away: "Mexico", venue: "Mexico City Stadium" },
  { date: "2026-06-24", group: "A", matchday: "3", home: "South Africa", away: "South Korea", venue: "Monterrey Stadium" },
  { date: "2026-06-25", group: "E", matchday: "3", home: "Curacao", away: "Cote d'Ivoire", venue: "Philadelphia Stadium" },
  { date: "2026-06-25", group: "E", matchday: "3", home: "Ecuador", away: "Germany", venue: "New York New Jersey Stadium" },
  { date: "2026-06-25", group: "F", matchday: "3", home: "Japan", away: "Sweden", venue: "Dallas Stadium" },
  { date: "2026-06-25", group: "F", matchday: "3", home: "Tunisia", away: "Netherlands", venue: "Kansas City Stadium" },
  { date: "2026-06-25", group: "D", matchday: "3", home: "Turkiye", away: "USA", venue: "Los Angeles Stadium" },
  { date: "2026-06-25", group: "D", matchday: "3", home: "Paraguay", away: "Australia", venue: "San Francisco Bay Area Stadium" },
  { date: "2026-06-26", group: "I", matchday: "3", home: "Norway", away: "France", venue: "Boston Stadium" },
  { date: "2026-06-26", group: "I", matchday: "3", home: "Senegal", away: "Iraq", venue: "Toronto Stadium" },
  { date: "2026-06-26", group: "G", matchday: "3", home: "Egypt", away: "IR Iran", venue: "Seattle Stadium" },
  { date: "2026-06-26", group: "G", matchday: "3", home: "New Zealand", away: "Belgium", venue: "Vancouver Stadium" },
  { date: "2026-06-26", group: "H", matchday: "3", home: "Cabo Verde", away: "Saudi Arabia", venue: "Houston Stadium" },
  { date: "2026-06-26", group: "H", matchday: "3", home: "Uruguay", away: "Spain", venue: "Guadalajara Stadium" },
  { date: "2026-06-27", group: "L", matchday: "3", home: "Panama", away: "England", venue: "New York New Jersey Stadium" },
  { date: "2026-06-27", group: "L", matchday: "3", home: "Croatia", away: "Ghana", venue: "Philadelphia Stadium" },
  { date: "2026-06-27", group: "J", matchday: "3", home: "Algeria", away: "Austria", venue: "Kansas City Stadium" },
  { date: "2026-06-27", group: "J", matchday: "3", home: "Jordan", away: "Argentina", venue: "Dallas Stadium" },
  { date: "2026-06-27", group: "K", matchday: "3", home: "Colombia", away: "Portugal", venue: "Miami Stadium" },
  { date: "2026-06-27", group: "K", matchday: "3", home: "DR Congo", away: "Uzbekistan", venue: "Atlanta Stadium" },
];

const TEAM_ALIASES = {
  "bosnia and herzegovina": "bosnia & herzegovina",
  "cabo verde": "cabo verde",
  "cape verde": "cabo verde",
  congo: "dr congo",
  "congo dr": "dr congo",
  "cote divoire": "cote d'ivoire",
  "cote d ivoire": "cote d'ivoire",
  "côte d'ivoire": "cote d'ivoire",
  curacao: "curacao",
  "curaçao": "curacao",
  iran: "ir iran",
  "ir iran": "ir iran",
  "korea republic": "south korea",
  "south korea": "south korea",
  turkey: "turkiye",
  turkiye: "turkiye",
  "türkiye": "turkiye",
  "united states": "usa",
  us: "usa",
  usa: "usa",
};

function normalizeTeamKey(value) {
  const clean = String(value || "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  return TEAM_ALIASES[clean] || clean;
}

function getGroupLetter(groupName) {
  const match = String(groupName || "").match(/[A-L]$/i);
  return match ? match[0].toUpperCase() : String(groupName || "").toUpperCase();
}

function findScheduledGroupStageMatch(event) {
  const eventGroup = getGroupLetter(event.group_name || event.group || event.competition?.groupLetter);
  const home = normalizeTeamKey(event.home_team || event.teams?.home?.name);
  const away = normalizeTeamKey(event.away_team || event.teams?.away?.name);

  return GROUP_STAGE_SCHEDULE.find((match) => {
    if (match.group !== eventGroup) return false;

    const scheduledHome = normalizeTeamKey(match.home);
    const scheduledAway = normalizeTeamKey(match.away);
    const sameOrder = scheduledHome === home && scheduledAway === away;
    const reversed = scheduledHome === away && scheduledAway === home;

    return sameOrder || reversed;
  });
}

function isScheduledGroupStageMatch(event) {
  return Boolean(findScheduledGroupStageMatch(event));
}

module.exports = {
  GROUP_STAGE_SCHEDULE,
  findScheduledGroupStageMatch,
  isScheduledGroupStageMatch,
  normalizeTeamKey,
};
