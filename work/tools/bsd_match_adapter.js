#!/usr/bin/env node

const fs = require("fs");
const path = require("path");
const https = require("https");
const { getDisplayTeamName, getFlagAssetUrl } = require("../../src/lib/team-metadata");

const API_BASE = "https://sports.bzzoiro.com/api/v2";
const REQUEST_TIMEOUT_MS = Number(process.env.BSD_REQUEST_TIMEOUT_MS || "8000");
const OPTIONAL_REQUEST_TIMEOUT_MS = Number(process.env.BSD_OPTIONAL_REQUEST_TIMEOUT_MS || "1800");
const WORLD_CUP = {
  leagueId: 27,
  seasonId: 188,
};

const FIFA_VENUE_NAMES = {
  265: "Atlanta Stadium",
  266: "Vancouver Stadium",
  273: "Boston Stadium",
  275: "Toronto Stadium",
  290: "Seattle Stadium",
  295: "Mexico City Stadium",
  304: "Monterrey Stadium",
  307: "Guadalajara Stadium",
  1180: "Los Angeles Stadium",
  1181: "San Francisco Bay Area Stadium",
  1182: "New York New Jersey Stadium",
  1183: "Houston Stadium",
  1184: "Dallas Stadium",
  1185: "Philadelphia Stadium",
  1186: "Miami Stadium",
  1187: "Kansas City Stadium",
};

const VENUE_BACKGROUND_SLUGS = {
  265: "atlanta",
  266: "vancouver",
  273: "boston",
  275: "toronto",
  290: "seattle",
  295: "mexico-city",
  304: "monterrey",
  307: "guadalajara",
  1180: "los-angeles",
  1181: "san-francisco",
  1182: "new-jersey-new-york",
  1183: "houston",
  1184: "dallas",
  1185: "philadelphia",
  1186: "miami",
  1187: "kansas",
};

const VENUE_BACKGROUND_FALLBACK = "generic";

function requestJson(endpoint, token, timeoutMs = REQUEST_TIMEOUT_MS) {
  const url = `${API_BASE}${endpoint}`;
  return new Promise((resolve, reject) => {
    const req = https.get(
      url,
      {
        headers: {
          Accept: "application/json",
          Authorization: `Token ${token}`,
        },
      },
      (res) => {
        let body = "";
        res.setEncoding("utf8");
        res.on("data", (chunk) => {
          body += chunk;
        });
        res.on("end", () => {
          if (res.statusCode < 200 || res.statusCode >= 300) {
            reject(new Error(`BSD API ${res.statusCode}: ${body}`));
            return;
          }

          try {
            resolve(JSON.parse(body));
          } catch (error) {
            reject(new Error(`Invalid JSON from ${url}: ${error.message}`));
          }
        });
      },
    );

    req.setTimeout(timeoutMs, () => {
      req.destroy(new Error(`BSD API timeout after ${timeoutMs}ms: ${endpoint}`));
    });
    req.on("error", reject);
    req.end();
  });
}

async function requestOptionalJson(endpoint, token, fallback = null) {
  try {
    return await requestJson(endpoint, token, OPTIONAL_REQUEST_TIMEOUT_MS);
  } catch (error) {
    return fallback;
  }
}

function getGroupLetter(groupName) {
  const match = String(groupName || "").match(/[A-L]$/i);
  return match ? match[0].toUpperCase() : "";
}

function getStatusLabel(status) {
  const labels = {
    "1st_half": "EN VIVO",
    "2nd_half": "EN VIVO",
    finished: "FINAL",
    inprogress: "EN VIVO",
    halftime: "MEDIO TIEMPO",
    notstarted: "PREVIA",
    penalties: "PENALES",
    postponed: "POSPUESTO",
    cancelled: "CANCELADO",
  };
  return labels[status] || String(status || "").toUpperCase();
}

function getGoalType(goalType) {
  if (goalType === "penalty") return "penalty";
  if (goalType === "own_goal" || goalType === "ownGoal") return "ownGoal";
  return undefined;
}

function getMinute(incident) {
  const base = Number(incident.minute || 0);
  if (!base) return "";
  const added = Number(incident.added_time || 0);
  return added > 0 ? `${base}+${added}'` : `${base}'`;
}

function teamFlag(teamName) {
  return getFlagAssetUrl(teamName);
}

function getDisplayName(playerName) {
  const cleanName = String(playerName || "").trim();
  if (!cleanName) return "";
  const parts = cleanName.split(/\s+/);
  const suffixes = new Set(["Jr.", "Jr", "Junior", "Júnior"]);
  if (parts.length > 1 && suffixes.has(parts[parts.length - 1])) {
    return `${parts[parts.length - 2]} ${parts[parts.length - 1]}`;
  }
  return parts[parts.length - 1];
}

function getVenueName(venue) {
  return FIFA_VENUE_NAMES[venue.id] || venue.name || "";
}

function normalizeVenueText(value) {
  return String(value || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function inferVenueBackgroundSlug(venue = {}) {
  const text = normalizeVenueText(
    [venue.name, venue.city, venue.country, getVenueName(venue)].filter(Boolean).join(" "),
  );

  if (!text) return VENUE_BACKGROUND_FALLBACK;

  const rules = [
    ["new-jersey-new-york", ["new york", "new jersey", "metlife", "east rutherford"]],
    ["san-francisco", ["san francisco", "bay area", "santa clara", "levi"]],
    ["los-angeles", ["los angeles", "inglewood", "sofi"]],
    ["kansas", ["kansas", "arrowhead"]],
    ["mexico-city", ["mexico city", "ciudad de mexico", "azteca"]],
    ["guadalajara", ["guadalajara", "akron"]],
    ["monterrey", ["monterrey", "bbva"]],
    ["atlanta", ["atlanta", "mercedes benz"]],
    ["boston", ["boston", "foxborough", "gillette"]],
    ["dallas", ["dallas", "arlington", "at t", "att stadium"]],
    ["houston", ["houston", "nrg"]],
    ["miami", ["miami", "hard rock"]],
    ["philadelphia", ["philadelphia", "lincoln financial"]],
    ["seattle", ["seattle", "lumen"]],
    ["toronto", ["toronto", "bmo"]],
    ["vancouver", ["vancouver", "bc place"]],
  ];

  for (const [slug, needles] of rules) {
    if (needles.some((needle) => text.includes(needle))) return slug;
  }

  return VENUE_BACKGROUND_FALLBACK;
}

function getVenueBackground(venue = {}) {
  const slug = VENUE_BACKGROUND_SLUGS[venue.id] || inferVenueBackgroundSlug(venue);
  return `./assets/backgrounds/${slug || VENUE_BACKGROUND_FALLBACK}.webp`;
}

function toScorer(incident) {
  return {
    minute: getMinute(incident),
    player: getDisplayName(incident.player),
    goalType: getGoalType(incident.goal_type),
  };
}

function splitScorers(incidents) {
  const homeScorers = [];
  const awayScorers = [];
  const homeGroups = new Map();
  const awayGroups = new Map();

  function pushGrouped(target, groups, scorer) {
    const key = [scorer.player, scorer.goalType || ""].join("::");
    const group = groups.get(key);
    if (group) {
      group.minutes.push(scorer.minute);
      group.minute = group.minutes.join(", ");
      return;
    }

    const next = {
      ...scorer,
      minutes: [scorer.minute].filter(Boolean),
    };
    next.minute = next.minutes.join(", ");
    groups.set(key, next);
    target.push(next);
  }

  for (const incident of incidents) {
    if (incident.type !== "goal") continue;
    const target = incident.is_home ? homeScorers : awayScorers;
    const groups = incident.is_home ? homeGroups : awayGroups;
    pushGrouped(target, groups, toScorer(incident));
  }

  homeScorers.sort((a, b) => parseInt(a.minutes[0], 10) - parseInt(b.minutes[0], 10));
  awayScorers.sort((a, b) => parseInt(a.minutes[0], 10) - parseInt(b.minutes[0], 10));

  return { homeScorers, awayScorers };
}

function toMatchData(event, incidents, venue, extras = {}) {
  const scorers = splitScorers(incidents.incidents || []);

  return {
    source: {
      provider: "bsd-football-api",
      eventId: event.id,
      leagueId: WORLD_CUP.leagueId,
      seasonId: WORLD_CUP.seasonId,
      eventDate: event.event_date || event.start_time || null,
      fetchedAt: new Date().toISOString(),
    },
    competition: {
      name: "COPA MUNDIAL",
      year: "2026",
      phase: event.round_name || "FASE DE GRUPOS",
      groupLetter: getGroupLetter(event.group_name),
      matchdayNumber: event.round_number ? String(event.round_number) : "",
    },
    match: {
      status: getStatusLabel(event.status),
      venue: {
        name: getVenueName(venue),
        providerName: venue.name || "",
        city: venue.city || "",
        country: venue.country || "",
        image: getVenueBackground(venue),
      },
    },
    teams: {
      home: {
        name: getDisplayTeamName(event.home_team),
        providerName: event.home_team,
        score: event.home_score ?? 0,
        id: event.home_team_id,
        flag: teamFlag(event.home_team),
      },
      away: {
        name: getDisplayTeamName(event.away_team),
        providerName: event.away_team,
        score: event.away_score ?? 0,
        id: event.away_team_id,
        flag: teamFlag(event.away_team),
      },
    },
    events: scorers,
    context: {
      ...(extras.context || {}),
      matchStats: extras.stats || null,
      metadata: extras.metadata || null,
      h2h: extras.h2h || null,
    },
  };
}

async function main() {
  const token = process.env.BSD_API_TOKEN;
  const eventId = process.argv[2] || "8292";
  const outFile = process.argv[3] || path.join("work", "templates", "figma_match_card", "data", "current-match.json");

  if (!token) {
    throw new Error("Missing BSD_API_TOKEN environment variable.");
  }

  const event = await requestJson(`/events/${eventId}/`, token);
  const [incidents, venue, stats, metadata, h2h] = await Promise.all([
    requestJson(`/events/${eventId}/incidents/`, token),
    event.venue_id ? requestJson(`/venues/${event.venue_id}/`, token) : Promise.resolve({}),
    requestOptionalJson(`/events/${eventId}/stats/`, token),
    requestOptionalJson(`/events/${eventId}/metadata/`, token),
    requestOptionalJson(`/events/${eventId}/h2h/`, token),
  ]);
  const matchData = toMatchData(event, incidents, venue, { stats, metadata, h2h });

  fs.mkdirSync(path.dirname(outFile), { recursive: true });
  fs.writeFileSync(outFile, `${JSON.stringify(matchData, null, 2)}\n`);
  console.log(`Wrote ${outFile}`);
}

async function fetchMatchData(eventId, options = {}) {
  const token = process.env.BSD_API_TOKEN;

  if (!token) {
    throw new Error("Missing BSD_API_TOKEN environment variable.");
  }

  const event = await requestJson(`/events/${eventId}/`, token);
  const skipEditorialExtras = Boolean(options.skipEditorialExtras);
  const [incidents, venue, stats, metadata, h2h] = await Promise.all([
    requestJson(`/events/${eventId}/incidents/`, token),
    event.venue_id ? requestJson(`/venues/${event.venue_id}/`, token) : Promise.resolve({}),
    requestOptionalJson(`/events/${eventId}/stats/`, token),
    skipEditorialExtras ? Promise.resolve(null) : requestOptionalJson(`/events/${eventId}/metadata/`, token),
    skipEditorialExtras ? Promise.resolve(null) : requestOptionalJson(`/events/${eventId}/h2h/`, token),
  ]);

  return toMatchData(event, incidents, venue, { stats, metadata, h2h });
}

async function fetchEvent(eventId) {
  const token = process.env.BSD_API_TOKEN;

  if (!token) {
    throw new Error("Missing BSD_API_TOKEN environment variable.");
  }

  return requestJson(`/events/${eventId}/`, token);
}

function extractEvents(payload) {
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload.results)) return payload.results;
  if (Array.isArray(payload.data)) return payload.data;
  if (Array.isArray(payload.events)) return payload.events;
  return [];
}

async function fetchLiveEvents() {
  const token = process.env.BSD_API_TOKEN;

  if (!token) {
    throw new Error("Missing BSD_API_TOKEN environment variable.");
  }

  const payload = await requestJson(
    `/events/live/?league_id=${WORLD_CUP.leagueId}&season_id=${WORLD_CUP.seasonId}`,
    token,
  );

  return extractEvents(payload);
}

async function fetchEvents(params = {}) {
  const token = process.env.BSD_API_TOKEN;

  if (!token) {
    throw new Error("Missing BSD_API_TOKEN environment variable.");
  }

  const query = new URLSearchParams({
    league_id: String(WORLD_CUP.leagueId),
    season_id: String(WORLD_CUP.seasonId),
    limit: String(params.limit || 100),
  });

  for (const key of ["date_from", "date_to", "status", "team_id", "team_name", "offset"]) {
    if (params[key] !== undefined && params[key] !== null && params[key] !== "") {
      query.set(key, String(params[key]));
    }
  }

  const payload = await requestJson(`/events/?${query.toString()}`, token);
  return extractEvents(payload);
}

if (require.main === module) {
  main().catch((error) => {
    console.error(error.message);
    process.exit(1);
  });
}

module.exports = {
  WORLD_CUP,
  requestJson,
  fetchEvent,
  fetchEvents,
  fetchLiveEvents,
  fetchMatchData,
  toMatchData,
  getVenueName,
  getVenueBackground,
};
