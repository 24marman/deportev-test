const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const { pathToFileURL } = require("url");
const { ensureBucket, getSupabaseClient, uploadBufferToStorage } = require("./storage");
const { normalizeTeamKey } = require("./team-metadata");

const PLAYER_ASSET_BUCKET = process.env.SUPABASE_PLAYER_ASSET_BUCKET || "player-assets";
const PLAYER_ASSET_PREFIX = process.env.SUPABASE_PLAYER_ASSET_PREFIX || "portraits";

function slug(value) {
  return String(value || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function shortHash(value) {
  return crypto.createHash("sha1").update(String(value || "")).digest("hex").slice(0, 10);
}

function getPlayerAssetKey(player = {}) {
  if (player.playerId) return `bsd-${player.playerId}`;

  const teamKey = normalizeTeamKey(player.country || player.teamName || player.team || "");
  const nameKey = slug(player.fullName || player.name || player.playerName || "player");
  return `${slug(teamKey || "team")}-${nameKey}-${shortHash(`${teamKey}:${nameKey}`)}`;
}

async function ensurePlayerAssetBucket(client) {
  await ensureBucket(client, PLAYER_ASSET_BUCKET, {
    public: true,
    fileSizeLimit: 10485760,
    allowedMimeTypes: ["image/webp", "image/jpeg", "image/png", "application/json"],
  });
}

async function listPlayerAssetObjects(client, playerKey) {
  await ensurePlayerAssetBucket(client);
  const prefix = `${PLAYER_ASSET_PREFIX}/${playerKey}`;
  const { data, error } = await client.storage.from(PLAYER_ASSET_BUCKET).list(prefix, {
    limit: 100,
    sortBy: {
      column: "name",
      order: "asc",
    },
  });

  if (error) {
    throw error;
  }

  return new Set((data || []).map((item) => item.name));
}

function publicUrl(client, objectPath) {
  return client.storage.from(PLAYER_ASSET_BUCKET).getPublicUrl(objectPath).data.publicUrl;
}

async function getApprovedPlayerPortraits(player = {}) {
  const client = getSupabaseClient();
  const playerKey = getPlayerAssetKey(player);
  const localHeroPath = path.join("outputs", "player-assets", "portraits", playerKey, "approved-hero.webp");
  const localManifestPath = path.join("outputs", "player-assets", "portraits", playerKey, "manifest.json");

  if (!client) {
    if (fs.existsSync(localHeroPath)) {
      return {
        approved: true,
        playerKey,
        hero: pathToFileURL(path.resolve(localHeroPath)).href,
        manifest: fs.existsSync(localManifestPath) ? pathToFileURL(path.resolve(localManifestPath)).href : null,
        source: "local-cache",
      };
    }

    return {
      approved: false,
      playerKey,
      hero: null,
      reason: "Supabase variables are not configured.",
    };
  }

  const objects = await listPlayerAssetObjects(client, playerKey);
  const heroName = "approved-hero.webp";

  if (!objects.has(heroName)) {
    return {
      approved: false,
      playerKey,
      hero: null,
      reason: `No approved portrait found for ${playerKey}.`,
    };
  }

  return {
    approved: true,
    playerKey,
    hero: publicUrl(client, `${PLAYER_ASSET_PREFIX}/${playerKey}/${heroName}`),
    manifest: objects.has("manifest.json")
      ? publicUrl(client, `${PLAYER_ASSET_PREFIX}/${playerKey}/manifest.json`)
      : null,
  };
}

async function savePlayerPortraitManifest(player = {}, manifest = {}) {
  const playerKey = getPlayerAssetKey(player);
  const payload = {
    ...manifest,
    playerKey,
    player,
    status: manifest.status || "pending",
    source: manifest.source || null,
    processingVersion: manifest.processingVersion || "portrait-face-grunge-v2",
    cropProfile: manifest.cropProfile || "face-neck-tight",
    orientation: manifest.orientation || "faces-left",
    framing: manifest.framing || "face-neck-minimal-shoulder",
    notes: manifest.notes || "",
    updatedAt: new Date().toISOString(),
  };
  const body = Buffer.from(
    `${JSON.stringify(payload, null, 2)}\n`,
  );

  return uploadBufferToStorage({
    bucket: PLAYER_ASSET_BUCKET,
    objectPath: `${PLAYER_ASSET_PREFIX}/${playerKey}/manifest.json`,
    buffer: body,
    contentType: "application/json",
    publicBucket: true,
    allowedMimeTypes: ["image/webp", "image/jpeg", "image/png", "application/json"],
  });
}

async function saveApprovedPlayerPortrait(player = {}, filePath, manifest = {}) {
  if (!filePath || !fs.existsSync(filePath)) {
    throw new Error(`Approved portrait file not found: ${filePath}`);
  }

  const playerKey = getPlayerAssetKey(player);
  const body = fs.readFileSync(filePath);
  const portraitUpload = await uploadBufferToStorage({
    bucket: PLAYER_ASSET_BUCKET,
    objectPath: `${PLAYER_ASSET_PREFIX}/${playerKey}/approved-hero.webp`,
    buffer: body,
    contentType: "image/webp",
    publicBucket: true,
    allowedMimeTypes: ["image/webp", "image/jpeg", "image/png", "application/json"],
  });

  const manifestUpload = await savePlayerPortraitManifest(player, {
    ...manifest,
    status: manifest.status || "approved",
    approvedHero: portraitUpload.publicUrl || null,
  });

  return {
    ...portraitUpload,
    manifestUrl: manifestUpload.publicUrl || null,
    playerKey,
  };
}

async function resolvePlayerPortraitAssets(player = {}) {
  try {
    return await getApprovedPlayerPortraits(player);
  } catch (error) {
    return {
      approved: false,
      playerKey: getPlayerAssetKey(player),
      hero: null,
      reason: error.message,
    };
  }
}

module.exports = {
  getApprovedPlayerPortraits,
  getPlayerAssetKey,
  resolvePlayerPortraitAssets,
  saveApprovedPlayerPortrait,
  savePlayerPortraitManifest,
};
