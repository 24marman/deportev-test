const fs = require("fs");
const path = require("path");
const sharp = require("sharp");

const DEFAULT_IMAGE_MODEL = process.env.OPENAI_IMAGE_MODEL || "gpt-image-1.5";
const DEFAULT_SIZE = process.env.PLAYER_PORTRAIT_IMAGE_SIZE || "1024x1024";
const DEFAULT_QUALITY = process.env.PLAYER_PORTRAIT_IMAGE_QUALITY || "medium";
const DEFAULT_CANVAS_SIZE = Number(process.env.PLAYER_PORTRAIT_CANVAS_SIZE || "1440");

function slug(value) {
  return String(value || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}

function guessMimeType(filePath) {
  const extension = path.extname(filePath).toLowerCase();
  if (extension === ".jpg" || extension === ".jpeg") return "image/jpeg";
  if (extension === ".webp") return "image/webp";
  return "image/png";
}

function clamp(value) {
  return Math.max(0, Math.min(255, Math.round(value)));
}

function hashNoise(x, y, seed = 29) {
  let value = (x + 1) * 374761393 + (y + 1) * 668265263 + seed * 2147483647;
  value = (value ^ (value >> 13)) * 1274126177;
  value = value ^ (value >> 16);
  return (value >>> 0) / 4294967295;
}

function buildPortraitPrompt({
  direction = "left",
  intensity = "extra-extra-grunge",
  preserveIdentity = true,
  subject = "footballer",
} = {}) {
  const primaryRequest = preserveIdentity
    ? "Primary request: preserve the exact face, facial geometry, hair, beard, expression, angle and recognizability from the input image. Do not invent a new person. Only change crop, background and graphic style."
    : "Primary request: use the input image only as a visual reference for the face, hair, beard, expression, and general angle; regenerate it as an original editorial sports portrait, not as a cleaned-up copy of the input photo.";

  return [
    "Use case: style-transfer",
    "Asset type: reusable football player portrait cutout for a 1080x1350 sports graphic template",
    primaryRequest,
    "Scene/backdrop: perfectly flat solid #00ff00 chroma-key background for background removal.",
    `Subject: ${subject}; close crop on face and neck only, with at most a tiny amount of shoulder.`,
    "Style/medium: realistic black-and-white editorial football portrait, desaturated, harsh contrast, gritty print grain, scratched grunge texture, dirty photocopy feel, tournament poster look.",
    `Composition/framing: very tight head-and-neck close-up, vertical face fills the frame, no empty space above or below, profile or three-quarter profile facing ${direction}, crop may cut a little hair if needed.`,
    "Lighting/mood: dramatic stadium editorial lighting, strong shadows, intense but readable eyes, nose, mouth and beard detail.",
    "Color palette: black, white, grey only for the subject; background must be pure #00ff00.",
    "Constraints: no text, no watermark, no badge, no logo, no readable jersey, no team crest, no shirt as a main visual element, no second person.",
    "Avoid: clean studio portrait, soft beauty retouch, colorful subject, full body, torso crop, smooth plastic skin, cartoon face, distorted anatomy, extra fingers, invented typography.",
    "Reject condition: if the output looks like a different person than the input image, the candidate is invalid.",
    `Processing target: ${intensity}; the result must look rough, textured, aggressive and easy to cut out from the green background.`,
  ].join("\n");
}

function getResizePosition(focus) {
  const key = String(focus || "").toLowerCase();
  if (key === "left") return "left";
  if (key === "right") return "right";
  if (key === "top") return "top";
  if (key === "bottom") return "bottom";
  return "center";
}

function getMaskAlpha(nx, ny, profile = "right-profile") {
  const isRightProfile = String(profile || "").includes("right");
  const headCx = isRightProfile ? 0.58 : 0.42;
  const jawCx = isRightProfile ? 0.58 : 0.42;
  const neckCx = isRightProfile ? 0.39 : 0.61;
  const rightProfileLimit =
    0.64 +
    0.18 * Math.exp(-((ny - 0.43) ** 2) / 0.018) +
    0.09 * Math.exp(-((ny - 0.62) ** 2) / 0.014);
  const leftProfileLimit = 1 - rightProfileLimit;
  if (isRightProfile && nx > rightProfileLimit) return 0;
  if (!isRightProfile && nx < leftProfileLimit) return 0;

  const head = ((nx - headCx) ** 2) / 0.082 + ((ny - 0.38) ** 2) / 0.105;
  const jaw = ((nx - jawCx) ** 2) / 0.074 + ((ny - 0.57) ** 2) / 0.075;
  const neck = ((nx - neckCx) ** 2) / 0.038 + ((ny - 0.73) ** 2) / 0.11;
  const edge = Math.min(head, jaw, neck);

  if (edge < 0.88) return 255;
  if (edge < 1.08) return clamp((1.08 - edge) * 1275);
  return 0;
}

async function preserveInputPortrait({
  inputPath,
  outputPath,
  greenSourcePath,
  size = DEFAULT_CANVAS_SIZE,
  focus = "right",
  profile = "right-profile",
  seed = 91,
} = {}) {
  ensureDir(path.dirname(outputPath));
  if (greenSourcePath) ensureDir(path.dirname(greenSourcePath));

  const { data, info } = await sharp(inputPath)
    .resize(size, size, {
      fit: "cover",
      position: getResizePosition(focus),
    })
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  const alphaData = Buffer.from(data);
  const greenData = Buffer.from(data);

  for (let index = 0; index < data.length; index += 4) {
    const pixel = index / 4;
    const x = pixel % info.width;
    const y = Math.floor(pixel / info.width);
    const nx = x / (info.width - 1);
    const ny = y / (info.height - 1);
    const r = data[index];
    const g = data[index + 1];
    const b = data[index + 2];
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    const luma = 0.2126 * r + 0.7152 * g + 0.0722 * b;
    const n1 = hashNoise(x, y, seed);
    const n2 = hashNoise(Math.floor(x / 4), Math.floor(y / 4), seed + 11);
    const coolBackground = b > r + 18 && b > g + 8 && luma > 55 && max - min > 26;
    const lowerJersey = ny > 0.78 && (luma > 132 || b > r + 12);
    let alpha = getMaskAlpha(nx, ny, profile);

    if (coolBackground || lowerJersey) {
      alpha = Math.min(alpha, 18);
    }

    let gray = 128 + (luma - 128) * 2.1 - 26;
    gray += (n1 - 0.5) * 76;
    if (n2 < 0.085) gray *= 0.36;
    if (n2 > 0.95) gray += 54;

    const value = clamp(gray);
    alphaData[index] = value;
    alphaData[index + 1] = value;
    alphaData[index + 2] = value;
    alphaData[index + 3] = clamp(alpha);

    if (alpha < 8) {
      greenData[index] = 0;
      greenData[index + 1] = 255;
      greenData[index + 2] = 0;
      greenData[index + 3] = 255;
    } else {
      greenData[index] = value;
      greenData[index + 1] = value;
      greenData[index + 2] = value;
      greenData[index + 3] = 255;
    }
  }

  await sharp(alphaData, {
    raw: {
      width: info.width,
      height: info.height,
      channels: info.channels,
    },
  })
    .sharpen({
      sigma: 1.1,
      m1: 1.45,
      m2: 0.95,
    })
    .webp({
      quality: 88,
      alphaQuality: 84,
      effort: 4,
    })
    .toFile(outputPath);

  if (greenSourcePath) {
    await sharp(greenData, {
      raw: {
        width: info.width,
        height: info.height,
        channels: info.channels,
      },
    })
      .png({
        compressionLevel: 9,
      })
      .toFile(greenSourcePath);
  }

  return outputPath;
}

async function callOpenAIImageEdit({
  inputPath,
  outputPath,
  prompt,
  model = DEFAULT_IMAGE_MODEL,
  size = DEFAULT_SIZE,
  quality = DEFAULT_QUALITY,
} = {}) {
  if (!process.env.OPENAI_API_KEY) {
    throw new Error("OPENAI_API_KEY is not configured.");
  }

  const imageBuffer = fs.readFileSync(inputPath);
  const form = new FormData();
  form.append("model", model);
  form.append("prompt", prompt);
  form.append("size", size);
  form.append("quality", quality);
  form.append("output_format", "png");
  form.append("image[]", new Blob([imageBuffer], { type: guessMimeType(inputPath) }), path.basename(inputPath));

  const response = await fetch("https://api.openai.com/v1/images/edits", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
    },
    body: form,
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(payload.error?.message || `OpenAI image edit failed with HTTP ${response.status}.`);
  }

  const firstImage = payload.data?.[0];
  if (!firstImage?.b64_json && !firstImage?.url) {
    throw new Error("OpenAI image edit response did not include an image.");
  }

  ensureDir(path.dirname(outputPath));

  if (firstImage.b64_json) {
    fs.writeFileSync(outputPath, Buffer.from(firstImage.b64_json, "base64"));
    return outputPath;
  }

  const imageResponse = await fetch(firstImage.url);
  if (!imageResponse.ok) {
    throw new Error(`Could not download generated image: HTTP ${imageResponse.status}.`);
  }

  const arrayBuffer = await imageResponse.arrayBuffer();
  fs.writeFileSync(outputPath, Buffer.from(arrayBuffer));
  return outputPath;
}

async function removeChromaAndApplyGrunge({
  inputPath,
  outputPath,
  size = DEFAULT_CANVAS_SIZE,
  seed = 42,
} = {}) {
  ensureDir(path.dirname(outputPath));

  const { data, info } = await sharp(inputPath)
    .resize(size, size, {
      fit: "cover",
      position: "center",
    })
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  for (let index = 0; index < data.length; index += 4) {
    const pixel = index / 4;
    const x = pixel % info.width;
    const y = Math.floor(pixel / info.width);
    const r = data[index];
    const g = data[index + 1];
    const b = data[index + 2];
    const maxRB = Math.max(r, b);
    const greenScore = g - maxRB;
    const isLikelyGreen = g > 105 && greenScore > 18 && g > r * 1.18 && g > b * 1.18;

    if (isLikelyGreen) {
      let alpha = 0;
      if (greenScore < 58) alpha = clamp((58 - greenScore) * 6);
      data[index + 3] = Math.min(data[index + 3], alpha);
      data[index] = 0;
      data[index + 1] = 0;
      data[index + 2] = 0;
      continue;
    }

    const luma = 0.2126 * r + 0.7152 * g + 0.0722 * b;
    const n1 = hashNoise(x, y, seed);
    const n2 = hashNoise(Math.floor(x / 3), Math.floor(y / 3), seed + 17);
    const n3 = hashNoise(Math.floor(x / 17), Math.floor(y / 17), seed + 39);
    let gray = 128 + (luma - 128) * 1.92 - 20;
    gray += (n1 - 0.5) * 62;

    if (n2 < 0.075) gray *= 0.43;
    if (n2 > 0.955) gray += 46;
    if (n3 < 0.16) gray -= 22;

    data[index] = clamp(gray);
    data[index + 1] = clamp(gray);
    data[index + 2] = clamp(gray);
    data[index + 3] = clamp(data[index + 3] * (n1 < 0.035 ? 0.75 : 1));
  }

  await sharp(data, {
    raw: {
      width: info.width,
      height: info.height,
      channels: info.channels,
    },
  })
    .sharpen({
      sigma: 1.05,
      m1: 1.35,
      m2: 0.9,
    })
    .webp({
      quality: 88,
      alphaQuality: 84,
      effort: 4,
    })
    .toFile(outputPath);

  return outputPath;
}

function buildPortraitManifest({
  inputPath,
  generatedPath,
  outputPath,
  prompt,
  playerKey,
  provider = "openai-images",
  status = "candidate",
} = {}) {
  return {
    playerKey,
    status,
    provider,
    processingVersion: "portrait-ai-chromakey-grunge-v1",
    inputPath,
    generatedPath,
    outputPath,
    cropProfile: "face-neck-extra-tight",
    backgroundContract: "solid-00ff00-chroma-key",
    visualContract: [
      "black-and-white",
      "extra-extra-grunge",
      "face-neck-closeup",
      "minimal-shoulder",
      "no-logo",
      "no-readable-jersey",
    ],
    prompt,
    updatedAt: new Date().toISOString(),
  };
}

module.exports = {
  buildPortraitManifest,
  buildPortraitPrompt,
  callOpenAIImageEdit,
  preserveInputPortrait,
  removeChromaAndApplyGrunge,
  slug,
};
