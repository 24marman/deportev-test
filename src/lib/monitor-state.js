const fs = require("fs");
const path = require("path");
const { getSupabaseClient } = require("./storage");

const localStatePath = path.join("outputs", "monitor-state.json");
const stateBucket = process.env.SUPABASE_STATE_BUCKET || "automation-state";
const stateObjectPath = process.env.MONITOR_STATE_PATH || "monitor-state.json";

function emptyState() {
  return {
    matches: {},
    editorialResearch: {
      runs: [],
      updatedAt: null,
    },
    updatedAt: null,
  };
}

function parseState(raw) {
  try {
    const parsed = JSON.parse(raw);
    return {
      matches: parsed.matches || {},
      editorialResearch: parsed.editorialResearch || emptyState().editorialResearch,
      updatedAt: parsed.updatedAt || null,
    };
  } catch {
    return emptyState();
  }
}

async function ensureStateBucket(client) {
  const { data: buckets, error: listError } = await client.storage.listBuckets();
  if (listError) throw listError;

  if (buckets.some((item) => item.name === stateBucket)) return;

  const { error: createError } = await client.storage.createBucket(stateBucket, {
    public: false,
    fileSizeLimit: 1048576,
    allowedMimeTypes: ["application/json"],
  });

  if (createError) throw createError;
}

function readLocalState() {
  if (!fs.existsSync(localStatePath)) return emptyState();
  return parseState(fs.readFileSync(localStatePath, "utf8"));
}

function writeLocalState(state) {
  fs.mkdirSync(path.dirname(localStatePath), { recursive: true });
  fs.writeFileSync(localStatePath, `${JSON.stringify(state, null, 2)}\n`);
}

async function loadMonitorState() {
  const client = getSupabaseClient();
  if (!client) return readLocalState();

  try {
    await ensureStateBucket(client);
    const { data, error } = await client.storage.from(stateBucket).download(stateObjectPath);
    if (error) return emptyState();
    return parseState(await data.text());
  } catch (error) {
    console.warn(`Falling back to local monitor state: ${error.message}`);
    return readLocalState();
  }
}

async function saveMonitorState(state) {
  const nextState = {
    ...state,
    updatedAt: new Date().toISOString(),
  };
  writeLocalState(nextState);

  const client = getSupabaseClient();
  if (!client) return nextState;

  try {
    await ensureStateBucket(client);
    const body = Buffer.from(`${JSON.stringify(nextState, null, 2)}\n`);
    const { error } = await client.storage.from(stateBucket).upload(stateObjectPath, body, {
      contentType: "application/json",
      upsert: true,
    });
    if (error) throw error;
  } catch (error) {
    console.warn(`Could not persist monitor state to Supabase: ${error.message}`);
  }

  return nextState;
}

module.exports = {
  loadMonitorState,
  saveMonitorState,
};
