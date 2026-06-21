const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawn } = require("child_process");
const { removeChromaAndApplyGrunge } = require("./portrait-ai-pipeline");
const {
  TOP_SCORER_HIGGSFIELD_ASPECT_RATIO,
  TOP_SCORER_HIGGSFIELD_MODEL,
  buildTopScorerHiggsfieldPrompt,
} = require("./higgsfield-portrait-preset");

function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}

function resolveHiggsfieldCli() {
  if (process.env.HIGGSFIELD_CLI) return process.env.HIGGSFIELD_CLI;

  const localCli = path.join(process.cwd(), "node_modules", ".bin", "higgsfield");
  if (fs.existsSync(localCli)) return localCli;

  return "higgsfield";
}

function parseDurationMs(value, fallbackMs = 12 * 60 * 1000) {
  const clean = String(value || "").trim().toLowerCase();
  const match = clean.match(/^(\d+)(ms|s|m)?$/);
  if (!match) return fallbackMs;

  const amount = Number(match[1]);
  const unit = match[2] || "ms";
  if (unit === "m") return amount * 60 * 1000 + 30 * 1000;
  if (unit === "s") return amount * 1000 + 30 * 1000;
  return amount;
}

function trimForError(value) {
  const clean = String(value || "").trim();
  if (clean.length <= 1400) return clean;
  return `${clean.slice(0, 1400)}...`;
}

function redactKnownSecrets(value) {
  let clean = String(value || "");
  const secrets = [
    process.env.HIGGSFIELD_ACCESS_TOKEN,
    process.env.HIGGSFIELD_TOKEN,
    process.env.HIGGSFIELD_REFRESH_TOKEN,
  ].filter((secret) => typeof secret === "string" && secret.length > 8);

  for (const secret of secrets) {
    clean = clean.split(secret).join("[redacted]");
  }

  return clean;
}

function getHiggsfieldCredentials() {
  const credentialsJson = String(process.env.HIGGSFIELD_CREDENTIALS_JSON || "").trim();
  if (credentialsJson) {
    try {
      const parsed = JSON.parse(credentialsJson);
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
        throw new Error("credentials must be a JSON object");
      }
      return parsed;
    } catch (error) {
      throw new Error(`HIGGSFIELD_CREDENTIALS_JSON is not valid JSON: ${error.message}`);
    }
  }

  const accessToken = String(process.env.HIGGSFIELD_ACCESS_TOKEN || process.env.HIGGSFIELD_TOKEN || "").trim();
  if (!accessToken) return null;

  const credentials = {
    access_token: accessToken,
  };

  const refreshToken = String(process.env.HIGGSFIELD_REFRESH_TOKEN || "").trim();
  if (refreshToken) {
    credentials.refresh_token = refreshToken;
  }

  return credentials;
}

function buildHiggsfieldProcessEnv() {
  const credentials = getHiggsfieldCredentials();
  if (!credentials) return process.env;

  const runtimeHome =
    process.env.HIGGSFIELD_RUNTIME_HOME ||
    path.join(os.tmpdir(), "deportev-higgsfield-runtime");
  const configRoot = path.join(runtimeHome, ".config");
  const credentialsDir = path.join(configRoot, "higgsfield");
  const credentialsPath = path.join(credentialsDir, "credentials.json");

  ensureDir(credentialsDir);
  fs.writeFileSync(credentialsPath, JSON.stringify(credentials, null, 2), { mode: 0o600 });

  return {
    ...process.env,
    HOME: runtimeHome,
    XDG_CONFIG_HOME: configRoot,
  };
}

function runHiggsfieldCli(args, options = {}) {
  const command = resolveHiggsfieldCli();
  const timeoutMs = options.timeoutMs || parseDurationMs(process.env.HIGGSFIELD_WAIT_TIMEOUT || "10m");
  const env = buildHiggsfieldProcessEnv();

  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: process.cwd(),
      env,
      stdio: ["ignore", "pipe", "pipe"],
    });

    let stdout = "";
    let stderr = "";
    const timer = setTimeout(() => {
      child.kill("SIGTERM");
      reject(new Error(`Higgsfield CLI timed out after ${timeoutMs}ms.`));
    }, timeoutMs);

    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString();
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });
    child.on("error", (error) => {
      clearTimeout(timer);
      reject(error);
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      if (code !== 0) {
        reject(new Error(`Higgsfield CLI failed (${code}): ${trimForError(redactKnownSecrets(stderr || stdout))}`));
        return;
      }

      resolve({ stdout, stderr });
    });
  });
}

function parseJsonFromOutput(output) {
  const raw = String(output || "").trim();
  if (!raw) return null;

  try {
    return JSON.parse(raw);
  } catch {
    const start = raw.indexOf("{");
    const end = raw.lastIndexOf("}");
    if (start !== -1 && end !== -1 && end > start) {
      return JSON.parse(raw.slice(start, end + 1));
    }
  }

  return null;
}

function findResultUrl(payload) {
  if (!payload) return "";
  if (typeof payload === "string") {
    if (/^https?:\/\//i.test(payload) && /\.(png|jpe?g|webp)(\?|$)/i.test(payload)) return payload;
    if (/^https?:\/\/.*(cloudfront|higgsfield|image|cdn)/i.test(payload)) return payload;
    return "";
  }

  if (Array.isArray(payload)) {
    for (const item of payload) {
      const url = findResultUrl(item);
      if (url) return url;
    }
    return "";
  }

  if (typeof payload === "object") {
    const preferredKeys = ["url", "image_url", "result_url", "output_url", "download_url"];
    for (const key of preferredKeys) {
      const url = findResultUrl(payload[key]);
      if (url) return url;
    }

    for (const value of Object.values(payload)) {
      const url = findResultUrl(value);
      if (url) return url;
    }
  }

  return "";
}

async function downloadFile(url, outputPath) {
  const response = await fetch(url, {
    headers: {
      "user-agent": "Mozilla/5.0 (compatible; DeportevContentBot/1.0)",
    },
  });

  if (!response.ok) {
    throw new Error(`Could not download Higgsfield output: HTTP ${response.status}`);
  }

  ensureDir(path.dirname(outputPath));
  fs.writeFileSync(outputPath, Buffer.from(await response.arrayBuffer()));
  return outputPath;
}

async function uploadHiggsfieldImage(inputPath) {
  const { stdout } = await runHiggsfieldCli(["upload", "create", inputPath, "--json"], {
    timeoutMs: parseDurationMs(process.env.HIGGSFIELD_UPLOAD_TIMEOUT || "2m"),
  });
  const payload = parseJsonFromOutput(stdout);

  if (!payload?.id) {
    throw new Error(`Higgsfield upload did not return a media id: ${trimForError(stdout)}`);
  }

  return payload;
}

async function generateHiggsfieldPortrait({
  inputPath,
  outputPath,
  rawOutputPath,
  prompt = buildTopScorerHiggsfieldPrompt(),
  model = TOP_SCORER_HIGGSFIELD_MODEL,
  aspectRatio = TOP_SCORER_HIGGSFIELD_ASPECT_RATIO,
  direction = "left",
} = {}) {
  if (!inputPath || !fs.existsSync(inputPath)) {
    throw new Error(`Input image not found: ${inputPath}`);
  }
  if (!outputPath) {
    throw new Error("outputPath is required for Higgsfield portrait generation.");
  }

  const finalPrompt = prompt || buildTopScorerHiggsfieldPrompt({ direction });
  const upload = await uploadHiggsfieldImage(inputPath);
  const medias = JSON.stringify([
    {
      id: upload.id,
      type: "media_input",
      url: upload.url,
    },
  ]);
  const waitTimeout = process.env.HIGGSFIELD_WAIT_TIMEOUT || "10m";
  const waitInterval = process.env.HIGGSFIELD_WAIT_INTERVAL || "5s";
  const { stdout } = await runHiggsfieldCli(
    [
      "generate",
      "create",
      model,
      "--input_images",
      medias,
      "--aspect_ratio",
      aspectRatio,
      "--prompt",
      finalPrompt,
      "--wait",
      "--wait-timeout",
      waitTimeout,
      "--wait-interval",
      waitInterval,
      "--json",
    ],
    {
      timeoutMs: parseDurationMs(waitTimeout),
    },
  );

  const payload = parseJsonFromOutput(stdout);
  const resultUrl = findResultUrl(payload);
  if (!resultUrl) {
    throw new Error(`Higgsfield generation did not return an image URL: ${trimForError(stdout)}`);
  }

  const rawPath = rawOutputPath || outputPath.replace(/\.webp$/i, ".higgsfield.png");
  await downloadFile(resultUrl, rawPath);
  await removeChromaAndApplyGrunge({
    inputPath: rawPath,
    outputPath,
  });

  return {
    provider: "higgsfield",
    model,
    aspectRatio,
    prompt: finalPrompt,
    inputPath,
    outputPath,
    rawOutputPath: rawPath,
    mediaId: upload.id,
    mediaUrl: upload.url || null,
    resultUrl,
    response: payload,
  };
}

module.exports = {
  downloadFile,
  findResultUrl,
  generateHiggsfieldPortrait,
  parseJsonFromOutput,
  resolveHiggsfieldCli,
  runHiggsfieldCli,
  buildHiggsfieldProcessEnv,
  getHiggsfieldCredentials,
  uploadHiggsfieldImage,
};
