const crypto = require("crypto");
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

  if (!client) {
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
  const body = Buffer.from(
    `${JSON.stringify(
      {
        playerKey,
        player,
        status: manifest.status || "pending",
        source: manifest.source || null,
        processingVersion: manifest.processingVersion || "portrait-grunge-v1",
        notes: manifest.notes || "",
        updatedAt: new Date().toISOString(),
      },
      null,
      2,
    )}\n`,
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
  savePlayerPortraitManifest,
};
