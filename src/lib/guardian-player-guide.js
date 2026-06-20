const fs = require("fs");
const path = require("path");

const GUARDIAN_GUIDE_URL =
  "https://www.theguardian.com/football/ng-interactive/2026/jun/04/world-cup-2026-complete-player-guide";
const GUARDIAN_TEAMS_DATA_URL =
  "https://interactive.guim.co.uk/docsdata/1_ZAfmUkTZ4BvDgvhEGaEruakfu4aWIIjjzXaMAiT1yc.json";
const GUARDIAN_TEAM_DATA_BASE = "https://interactive.guim.co.uk/docsdata";

function slug(value) {
  return String(value || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function normalize(value) {
  return slug(value).replace(/-/g, " ").trim();
}

async function fetchJson(url) {
  const response = await fetch(url, {
    headers: {
      "user-agent": "Mozilla/5.0 (compatible; DeportevContentBot/1.0)",
      accept: "application/json,text/plain,*/*",
    },
  });

  if (!response.ok) {
    throw new Error(`Fetch failed ${response.status} for ${url}`);
  }

  return response.json();
}

async function fetchGuardianTeams() {
  const data = await fetchJson(GUARDIAN_TEAMS_DATA_URL);
  return data.sheets?.Teams || [];
}

function matchTeam(teams, teamName) {
  const wanted = normalize(teamName);
  if (!wanted) return null;

  return (
    teams.find((team) => normalize(team.Team) === wanted) ||
    teams.find((team) => normalize(team.Team).includes(wanted) || wanted.includes(normalize(team.Team))) ||
    null
  );
}

async function fetchGuardianTeamPlayers(spreadsheet) {
  const data = await fetchJson(`${GUARDIAN_TEAM_DATA_BASE}/${encodeURIComponent(spreadsheet)}.json`);
  return data.sheets?.Players || [];
}

function playerSearchText(player = {}) {
  return normalize(
    [
      player.name,
      player.paNameToOverride,
      player.uefa_name,
      player["special player? (eg. key player, promising talent, etc) OPTIONAL"],
    ]
      .filter(Boolean)
      .join(" ")
  );
}

function matchPlayer(players, playerName) {
  const wanted = normalize(playerName);
  if (!wanted) return null;
  const wantedTokens = wanted.split(/\s+/).filter(Boolean);

  return (
    players.find((player) => normalize(player.name) === wanted) ||
    players.find((player) => {
      const text = playerSearchText(player);
      return wantedTokens.length > 0 && wantedTokens.every((token) => text.includes(token));
    }) ||
    null
  );
}

function getGuardianImageUrl(player = {}) {
  const candidates = [player.grid_image, player.image_reference].filter(Boolean);
  return candidates.find((value) => /^https?:\/\//i.test(value)) || "";
}

function extensionFromContentType(contentType = "") {
  if (contentType.includes("jpeg")) return "jpg";
  if (contentType.includes("webp")) return "webp";
  if (contentType.includes("png")) return "png";
  return "jpg";
}

async function findGuardianPlayer({ playerName, teamName } = {}) {
  if (!playerName) {
    throw new Error("Provide a playerName.");
  }

  const teams = await fetchGuardianTeams();
  const candidateTeams = teamName ? [matchTeam(teams, teamName)].filter(Boolean) : teams;

  if (teamName && candidateTeams.length === 0) {
    throw new Error(`Guardian team not found for "${teamName}".`);
  }

  for (const team of candidateTeams) {
    const players = await fetchGuardianTeamPlayers(team.spreadsheet);
    const player = matchPlayer(players, playerName);

    if (player) {
      return {
        guideUrl: GUARDIAN_GUIDE_URL,
        team,
        player,
        imageUrl: getGuardianImageUrl(player),
        teamDataUrl: `${GUARDIAN_TEAM_DATA_BASE}/${team.spreadsheet}.json`,
      };
    }
  }

  throw new Error(
    `Guardian player not found for "${playerName}"${teamName ? ` in "${teamName}"` : ""}.`
  );
}

async function downloadGuardianPlayerImage({
  playerName,
  teamName,
  outputDir = path.join("outputs", "player-assets", "references", "guardian"),
  outputPath,
} = {}) {
  const result = await findGuardianPlayer({ playerName, teamName });

  if (!result.imageUrl) {
    throw new Error(`Guardian player found but no image URL is available for "${playerName}".`);
  }

  const response = await fetch(result.imageUrl, {
    headers: {
      "user-agent": "Mozilla/5.0 (compatible; DeportevContentBot/1.0)",
    },
  });

  if (!response.ok) {
    throw new Error(`Image download failed ${response.status} for ${result.imageUrl}`);
  }

  const contentType = response.headers.get("content-type") || "image/jpeg";
  const extension = extensionFromContentType(contentType);
  const filename = `${slug(result.team.Team)}-${slug(result.player.name)}.${extension}`;
  const finalOutputPath = outputPath || path.join(outputDir, filename);

  fs.mkdirSync(path.dirname(finalOutputPath), { recursive: true });
  fs.writeFileSync(finalOutputPath, Buffer.from(await response.arrayBuffer()));

  return {
    source: "guardian-player-guide",
    playerName: result.player.name,
    teamName: result.team.Team,
    position: result.player.position || "",
    number: result.player.number || "",
    club: result.player.club || "",
    specialPlayer: result.player["special player? (eg. key player, promising talent, etc) OPTIONAL"] || "",
    bio: result.player.bio || "",
    guideUrl: result.guideUrl,
    teamDataUrl: result.teamDataUrl,
    imageUrl: result.imageUrl,
    imageContentType: contentType,
    outputPath: finalOutputPath,
  };
}

module.exports = {
  GUARDIAN_GUIDE_URL,
  GUARDIAN_TEAMS_DATA_URL,
  downloadGuardianPlayerImage,
  fetchGuardianTeamPlayers,
  fetchGuardianTeams,
  findGuardianPlayer,
};
