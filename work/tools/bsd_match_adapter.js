#!/usr/bin/env node

const fs = require("fs");
const path = require("path");
const https = require("https");

const API_BASE = "https://sports.bzzoiro.com/api/v2";
const WORLD_CUP = {
  leagueId: 27,
  seasonId: 188,
};

const TEAM_ISO2 = {
  Argentina: "ar",
  Australia: "au",
  Brazil: "br",
  Canada: "ca",
  Czechia: "cz",
  Germany: "de",
  Haiti: "ht",
  Mexico: "mx",
  Morocco: "ma",
  Netherlands: "nl",
  Paraguay: "py",
  Qatar: "qa",
  Scotland: "gb-sct",
  "South Africa": "za",
  "South Korea": "kr",
  Sweden: "se",
  Switzerland: "ch",
  "Türkiye": "tr",
  USA: "us",
  "Bosnia & Herzegovina": "ba",
  "Côte d'Ivoire": "ci",
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

function requestJson(endpoint, token) {
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

    req.on("error", reject);
    req.end();
  });
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
  return `${base + added}'`;
}

function teamFlag(teamName) {
  const iso2 = TEAM_ISO2[teamName];
  return iso2 ? `./assets/flags/${iso2}.svg` : "./assets/home-flag.svg";
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

  for (const incident of incidents) {
    if (incident.type !== "goal") continue;
    const target = incident.is_home ? homeScorers : awayScorers;
    target.push(toScorer(incident));
  }

  homeScorers.sort((a, b) => parseInt(a.minute, 10) - parseInt(b.minute, 10));
  awayScorers.sort((a, b) => parseInt(a.minute, 10) - parseInt(b.minute, 10));

  return { homeScorers, awayScorers };
}

function toMatchData(event, incidents, venue) {
  const scorers = splitScorers(incidents.incidents || []);

  return {
    source: {
      provider: "bsd-football-api",
      eventId: event.id,
      leagueId: WORLD_CUP.leagueId,
      seasonId: WORLD_CUP.seasonId,
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
        image: "./assets/stadium.png",
      },
    },
    teams: {
      home: {
        name: event.home_team,
        score: event.home_score ?? 0,
        id: event.home_team_id,
        flag: teamFlag(event.home_team),
      },
      away: {
        name: event.away_team,
        score: event.away_score ?? 0,
        id: event.away_team_id,
        flag: teamFlag(event.away_team),
      },
    },
    events: scorers,
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
  const incidents = await requestJson(`/events/${eventId}/incidents/`, token);
  const venue = event.venue_id ? await requestJson(`/venues/${event.venue_id}/`, token) : {};
  const matchData = toMatchData(event, incidents, venue);

  fs.mkdirSync(path.dirname(outFile), { recursive: true });
  fs.writeFileSync(outFile, `${JSON.stringify(matchData, null, 2)}\n`);
  console.log(`Wrote ${outFile}`);
}

async function fetchMatchData(eventId) {
  const token = process.env.BSD_API_TOKEN;

  if (!token) {
    throw new Error("Missing BSD_API_TOKEN environment variable.");
  }

  const event = await requestJson(`/events/${eventId}/`, token);
  const incidents = await requestJson(`/events/${eventId}/incidents/`, token);
  const venue = event.venue_id ? await requestJson(`/venues/${event.venue_id}/`, token) : {};

  return toMatchData(event, incidents, venue);
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

if (require.main === module) {
  main().catch((error) => {
    console.error(error.message);
    process.exit(1);
  });
}

module.exports = {
  WORLD_CUP,
  requestJson,
  fetchLiveEvents,
  fetchMatchData,
  toMatchData,
  getVenueName,
};
