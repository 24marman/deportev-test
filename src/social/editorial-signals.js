const { getDisplayTeamName, normalizeTeamKey } = require("../lib/team-metadata");
const teamFacts = require("../data/world-cup-team-facts.json");

const SPECIAL_ALIASES = {
  argentina: ["argentina", "albiceleste", "campeon vigente", "campeón vigente"],
  brazil: ["brasil", "brazil", "canarinha", "seleção", "seleccion brasileña", "selección brasileña"],
  canada: ["canada", "canadá"],
  "cabo verde": ["cabo verde", "cape verde"],
  curacao: ["curazao", "curaçao", "curacao"],
  england: ["inglaterra", "england"],
  france: ["francia", "france"],
  germany: ["alemania", "germany"],
  mexico: ["mexico", "méxico", "tri", "el tri", "seleccion mexicana", "selección mexicana"],
  morocco: ["marruecos", "morocco"],
  netherlands: ["paises bajos", "países bajos", "netherlands", "holanda"],
  "south korea": ["corea del sur", "south korea", "korea republic"],
  spain: ["españa", "espana", "spain", "la roja"],
  usa: ["estados unidos", "united states", "usa", "usmnt"],
  uruguay: ["uruguay", "celeste", "la celeste"],
};

const THEME_PATTERNS = {
  qualification: /\b(clasific|clasifica|clasificado|avanz|siguiente ronda|octavos|dieciseisavos|knockout|round of|pase)\b/i,
  elimination: /\b(elimin|eliminado|fuera|despedid|out)\b/i,
  favorite: /\b(favorit|candidat|aspirante|potencia|contender|jerarquia|jerarquía)\b/i,
  champion: /\b(campeon vigente|campeón vigente|campeon del mundo|campeón del mundo|defiende titulo|defiende título)\b/i,
  debut: /\b(debut|debutante|estreno|primer mundial|primera copa del mundo)\b/i,
  pressure: /\b(presion|presión|obligad|necesita|dudas|complica|urgencia|must win)\b/i,
  upset: /\b(sorpresa|histori|histórico|historico|hazaña|shock|batacazo)\b/i,
  dominance: /\b(domin|posesion|posesión|xg|remates|disparos|ocasiones|tiros|llegadas)\b/i,
  late: /\b(ultimo minuto|último minuto|tiempo añadido|agregad|90\+|late|stoppage)\b/i,
  injury: /\b(lesion|lesión|baja|duda|injur)\b/i,
};

function normalizeForSearch(value) {
  return String(value || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function getFacts(name) {
  return teamFacts[normalizeTeamKey(name)] || {};
}

function getPowerScore(facts) {
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

  return (baseByFinish[facts.bestFinish] ?? 35) + Math.min(15, Number(facts.worldCupTitlesBefore2026 || 0) * 4);
}

function buildTeamAliases(name) {
  const displayName = getDisplayTeamName(name);
  const key = normalizeTeamKey(name);
  const displayKey = normalizeTeamKey(displayName);
  const aliases = new Set([name, displayName, key, displayKey, ...(SPECIAL_ALIASES[key] || []), ...(SPECIAL_ALIASES[displayKey] || [])]);

  return Array.from(aliases)
    .map(normalizeForSearch)
    .filter((alias) => alias.length >= 3);
}

function findThemes(text) {
  const themes = [];
  for (const [theme, pattern] of Object.entries(THEME_PATTERNS)) {
    if (pattern.test(text)) themes.push(theme);
  }
  return themes;
}

function increment(map, key, by = 1) {
  map[key] = Number(map[key] || 0) + by;
}

function buildTeamSignal(name, side, newsItems = []) {
  const facts = getFacts(name);
  const key = normalizeTeamKey(name);
  const displayName = getDisplayTeamName(name);
  const themeCounts = {};

  for (const item of newsItems) {
    for (const theme of item.themes || []) increment(themeCounts, theme);
  }

  return {
    side,
    key,
    name: displayName,
    aliases: buildTeamAliases(name).slice(0, 8),
    facts: {
      defendingChampion: Boolean(facts.defendingChampion),
      debutant: facts.firstWorldCupAppearance === 2026 || facts.bestFinish === "debut",
      titleCandidate: getPowerScore(facts) >= 82,
      historicPower: Number(facts.worldCupTitlesBefore2026 || 0) > 0 || ["champion", "runner_up", "third_place", "semifinal"].includes(facts.bestFinish),
      bestFinish: facts.bestFinish || null,
      worldCupTitlesBefore2026: Number(facts.worldCupTitlesBefore2026 || 0),
      firstWorldCupAppearance: facts.firstWorldCupAppearance || null,
    },
    powerScore: getPowerScore(facts),
    newsThemeCounts: themeCounts,
  };
}

function itemMentionsAliases(itemText, aliases) {
  return aliases.some((alias) => {
    if (!alias) return false;
    return itemText.includes(alias);
  });
}

function normalizeNewsItem(item) {
  const title = String(item?.title || "").trim();
  const summary = String(item?.summary || "").trim();
  const text = normalizeForSearch(`${title} ${summary}`);
  const themes = findThemes(`${title} ${summary}`);

  return {
    title,
    sourceUrl: item?.sourceUrl || item?.link || "",
    publishedAt: item?.publishedAt || "",
    themes,
    searchText: text,
  };
}

function pickRelevantNewsItems(newsDigest, homeName, awayName) {
  const rawItems = (newsDigest?.items || []).map(normalizeNewsItem).filter((item) => item.title);
  const homeAliases = buildTeamAliases(homeName);
  const awayAliases = buildTeamAliases(awayName);

  return rawItems
    .map((item) => {
      const teams = [];
      if (itemMentionsAliases(item.searchText, homeAliases)) teams.push("home");
      if (itemMentionsAliases(item.searchText, awayAliases)) teams.push("away");
      return { ...item, teams };
    })
    .filter((item) => item.teams.length || item.themes.length)
    .slice(0, 12);
}

function aggregateThemes(items) {
  const counts = {};
  for (const item of items) {
    for (const theme of item.themes || []) increment(counts, theme);
  }
  return counts;
}

function buildEditorialSignals({ homeTeam, awayTeam, group, matchday, newsDigest, researchedAt }) {
  const newsItems = pickRelevantNewsItems(newsDigest, homeTeam, awayTeam);
  const homeNews = newsItems.filter((item) => item.teams.includes("home"));
  const awayNews = newsItems.filter((item) => item.teams.includes("away"));
  const home = buildTeamSignal(homeTeam, "home", homeNews);
  const away = buildTeamSignal(awayTeam, "away", awayNews);
  const teamNewsItems = newsItems.filter((item) => item.teams.length);
  const favorite = home.powerScore >= away.powerScore ? home : away;
  const underdog = favorite === home ? away : home;
  const favoriteGap = Math.abs(home.powerScore - away.powerScore);
  const themes = aggregateThemes(teamNewsItems);

  return {
    source: "editorial-signals",
    updatedAt: researchedAt || new Date().toISOString(),
    match: {
      group: group || null,
      matchday: matchday || null,
    },
    teams: {
      home,
      away,
    },
    matchup: {
      favoriteSide: favoriteGap >= 24 ? favorite.side : null,
      underdogSide: favoriteGap >= 24 ? underdog.side : null,
      favoriteGap,
      debutantVsFavorite: favoriteGap >= 45 && Boolean(underdog.facts.debutant),
      defendingChampionSide: home.facts.defendingChampion ? "home" : away.facts.defendingChampion ? "away" : null,
    },
    news: {
      itemCount: newsItems.length,
      themes,
      relevantItems: newsItems.map((item) => ({
        title: item.title,
        sourceUrl: item.sourceUrl,
        themes: item.themes,
        teams: item.teams,
      })),
    },
  };
}

function buildEditorialSignalsForEvent(event, scheduledMatch, newsDigest) {
  return buildEditorialSignals({
    homeTeam: event?.home_team || scheduledMatch?.home,
    awayTeam: event?.away_team || scheduledMatch?.away,
    group: scheduledMatch?.group || event?.group_name,
    matchday: scheduledMatch?.matchday || event?.round_number,
    newsDigest,
  });
}

function buildEditorialSignalsForMatchData(matchData, { newsDigest, researchProfile } = {}) {
  const profileSignals = researchProfile?.editorialSignals;
  const built = buildEditorialSignals({
    homeTeam: matchData.teams?.home?.providerName || matchData.teams?.home?.name,
    awayTeam: matchData.teams?.away?.providerName || matchData.teams?.away?.name,
    group: matchData.competition?.groupLetter,
    matchday: matchData.competition?.matchdayNumber,
    newsDigest,
    researchedAt: profileSignals?.updatedAt || researchProfile?.researchedAt,
  });

  return {
    ...built,
    news: {
      ...built.news,
      itemCount: Math.max(Number(built.news?.itemCount || 0), Number(profileSignals?.news?.itemCount || 0)),
      themes: {
        ...(profileSignals?.news?.themes || {}),
        ...(built.news?.themes || {}),
      },
      relevantItems: built.news?.relevantItems?.length ? built.news.relevantItems : profileSignals?.news?.relevantItems || [],
    },
  };
}

function summarizeEditorialSignals(signals) {
  if (!signals) return null;

  return {
    source: signals.source,
    updatedAt: signals.updatedAt,
    group: signals.match?.group || null,
    matchday: signals.match?.matchday || null,
    favoriteSide: signals.matchup?.favoriteSide || null,
    favoriteGap: signals.matchup?.favoriteGap || 0,
    debutantVsFavorite: Boolean(signals.matchup?.debutantVsFavorite),
    defendingChampionSide: signals.matchup?.defendingChampionSide || null,
    newsItemCount: signals.news?.itemCount || 0,
    newsThemes: signals.news?.themes || {},
  };
}

module.exports = {
  buildEditorialSignalsForEvent,
  buildEditorialSignalsForMatchData,
  summarizeEditorialSignals,
};
