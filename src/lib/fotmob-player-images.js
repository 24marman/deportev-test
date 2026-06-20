const fs = require("fs");
const path = require("path");

const FOTMOB_PLAYER_API = "https://www.fotmob.com/api/data/playerData";
const FOTMOB_IMAGE_BASE = "https://images.fotmob.com/image_resources/playerimages";

function slug(value) {
  return String(value || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function extractFotmobPlayerId(value) {
  const input = String(value || "").trim();
  if (!input) return "";

  const queryMatch = input.match(/[?&]id=(\d+)/);
  if (queryMatch) return queryMatch[1];

  const pathMatch = input.match(/\/players\/(\d+)(?:\/|$)/);
  if (pathMatch) return pathMatch[1];

  const numericMatch = input.match(/^\d+$/);
  if (numericMatch) return numericMatch[0];

  return "";
}

function getFotmobImageCandidates(playerId) {
  return [
    `${FOTMOB_IMAGE_BASE}/${playerId}.png`,
    `${FOTMOB_IMAGE_BASE}/${playerId}.jpg`,
    `${FOTMOB_IMAGE_BASE}/${playerId}.webp`,
  ];
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

async function fetchFotmobPlayerData(playerId) {
  return fetchJson(`${FOTMOB_PLAYER_API}?id=${encodeURIComponent(playerId)}`);
}

async function findWorkingImageUrl(playerId) {
  const candidates = getFotmobImageCandidates(playerId);

  for (const url of candidates) {
    const response = await fetch(url, {
      method: "HEAD",
      headers: {
        "user-agent": "Mozilla/5.0 (compatible; DeportevContentBot/1.0)",
      },
    });

    if (response.ok) {
      return {
        url,
        contentType: response.headers.get("content-type") || "application/octet-stream",
        contentLength: Number(response.headers.get("content-length") || 0),
      };
    }
  }

  throw new Error(`No FotMob player image found for playerId ${playerId}.`);
}

function getPrimaryCountry(playerData = {}) {
  const countryInfo = (playerData.playerInformation || []).find((item) => item.title === "Country");
  return {
    name: countryInfo?.value?.fallback || "",
    code: countryInfo?.countryCode || countryInfo?.value?.icon?.id || "",
  };
}

function getPlayerReferenceFilename(playerData = {}, playerId, extension = "png") {
  const name = slug(playerData.name || `fotmob-${playerId}`);
  return `${name || `fotmob-${playerId}`}-${playerId}.${extension}`;
}

async function downloadFotmobPlayerImage({
  input,
  outputDir = path.join("outputs", "player-assets", "references", "fotmob"),
  outputPath,
} = {}) {
  const playerId = extractFotmobPlayerId(input);
  if (!playerId) {
    throw new Error(`Could not extract FotMob player id from "${input || ""}".`);
  }

  const [playerData, image] = await Promise.all([
    fetchFotmobPlayerData(playerId),
    findWorkingImageUrl(playerId),
  ]);

  const extension = image.contentType.includes("jpeg")
    ? "jpg"
    : image.contentType.includes("webp")
      ? "webp"
      : "png";
  const finalOutputPath =
    outputPath || path.join(outputDir, getPlayerReferenceFilename(playerData, playerId, extension));

  fs.mkdirSync(path.dirname(finalOutputPath), { recursive: true });

  const response = await fetch(image.url, {
    headers: {
      "user-agent": "Mozilla/5.0 (compatible; DeportevContentBot/1.0)",
    },
  });

  if (!response.ok) {
    throw new Error(`Image download failed ${response.status} for ${image.url}`);
  }

  fs.writeFileSync(finalOutputPath, Buffer.from(await response.arrayBuffer()));

  const country = getPrimaryCountry(playerData);
  return {
    playerId,
    name: playerData.name || "",
    slug: slug(playerData.name || ""),
    country,
    team: playerData.primaryTeam?.teamName || "",
    pageUrl: `https://www.fotmob.com/en/players/${playerId}/${slug(playerData.name || "")}`,
    apiUrl: `${FOTMOB_PLAYER_API}?id=${playerId}`,
    imageUrl: image.url,
    imageContentType: image.contentType,
    imageContentLength: image.contentLength,
    outputPath: finalOutputPath,
  };
}

module.exports = {
  downloadFotmobPlayerImage,
  extractFotmobPlayerId,
  fetchFotmobPlayerData,
  findWorkingImageUrl,
  getFotmobImageCandidates,
};
