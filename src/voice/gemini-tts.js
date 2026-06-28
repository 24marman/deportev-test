const DEFAULT_TTS_MODEL = "gemini-3.1-flash-tts-preview";
const DEFAULT_TTS_VOICE = "Kore";
const DEFAULT_SAMPLE_RATE = 24000;
const DEFAULT_CHANNELS = 1;
const DEFAULT_SAMPLE_WIDTH = 2;
const DEFAULT_TIMEOUT_MS = 12000;

async function synthesizeGeminiSpeech(text, options = {}) {
  const cleanText = normalizeText(text);
  if (!cleanText) {
    throw new Error("No text provided for speech synthesis.");
  }

  if (!isVoiceTtsEnabled()) {
    throw new Error("VOICE_TTS_ENABLED=false");
  }

  const apiKey = getGeminiApiKey();
  if (!apiKey) {
    throw new Error("GEMINI_API_KEY is missing.");
  }

  const fetchImpl = options.fetchImpl || globalThis.fetch;
  if (typeof fetchImpl !== "function") {
    throw new Error("fetch is not available in this Node runtime.");
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), Math.max(1000, Number(options.timeoutMs || DEFAULT_TIMEOUT_MS)));

  try {
    const result = await fetchImpl("https://generativelanguage.googleapis.com/v1beta/interactions", {
      method: "POST",
      signal: controller.signal,
      headers: {
        "Content-Type": "application/json",
        "x-goog-api-key": apiKey,
      },
      body: JSON.stringify({
        model: getVoiceTtsModel(),
        input: buildTtsInput(cleanText),
        response_format: {
          type: "audio",
        },
        generation_config: {
          speech_config: [
            {
              voice: getVoiceTtsVoice(),
            },
          ],
        },
      }),
    });

    if (!result.ok) {
      const body = await safeResponseText(result);
      throw new Error(`Gemini TTS failed (${result.status}): ${body.slice(0, 180)}`);
    }

    const payload = await result.json();
    const audio = findAudioBlock(payload);
    if (!audio?.data) {
      throw new Error("Gemini TTS did not return audio data.");
    }

    const pcm = Buffer.from(audio.data, "base64");
    const sampleRate = Number(audio.sample_rate || audio.sampleRate || DEFAULT_SAMPLE_RATE);
    const channels = Number(audio.channels || DEFAULT_CHANNELS);
    const sampleWidth = DEFAULT_SAMPLE_WIDTH;

    return {
      buffer: wrapPcmAsWav(pcm, { channels, sampleRate, sampleWidth }),
      mimeType: "audio/wav",
      metadata: {
        provider: "gemini",
        model: payload.model || getVoiceTtsModel(),
        voice: getVoiceTtsVoice(),
        sourceMimeType: audio.mime_type || audio.mimeType || "audio/l16",
        sampleRate,
        channels,
      },
    };
  } finally {
    clearTimeout(timeout);
  }
}

function buildTtsInput(text) {
  const style = process.env.VOICE_TTS_STYLE || "Lee en español mexicano, con voz natural, clara, deportiva e informativa, sin sonar exagerado.";
  return `${style}\n\nTexto: ${text}`;
}

function findAudioBlock(payload) {
  const candidates = [];

  if (payload?.output_audio) {
    candidates.push(payload.output_audio);
  }

  for (const step of payload?.steps || []) {
    for (const item of step?.content || []) {
      candidates.push(item);
    }
  }

  return candidates.find((item) => item?.data && (item.type === "audio" || String(item.mime_type || item.mimeType || "").startsWith("audio")));
}

function wrapPcmAsWav(pcm, { channels = DEFAULT_CHANNELS, sampleRate = DEFAULT_SAMPLE_RATE, sampleWidth = DEFAULT_SAMPLE_WIDTH } = {}) {
  const byteRate = sampleRate * channels * sampleWidth;
  const blockAlign = channels * sampleWidth;
  const header = Buffer.alloc(44);

  header.write("RIFF", 0);
  header.writeUInt32LE(36 + pcm.length, 4);
  header.write("WAVE", 8);
  header.write("fmt ", 12);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);
  header.writeUInt16LE(channels, 22);
  header.writeUInt32LE(sampleRate, 24);
  header.writeUInt32LE(byteRate, 28);
  header.writeUInt16LE(blockAlign, 32);
  header.writeUInt16LE(sampleWidth * 8, 34);
  header.write("data", 36);
  header.writeUInt32LE(pcm.length, 40);

  return Buffer.concat([header, pcm]);
}

function getGeminiApiKey() {
  return process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY || process.env.GOOGLE_GENERATIVE_AI_API_KEY || "";
}

function getVoiceTtsModel() {
  return process.env.VOICE_TTS_MODEL || DEFAULT_TTS_MODEL;
}

function getVoiceTtsVoice() {
  return process.env.VOICE_TTS_VOICE || DEFAULT_TTS_VOICE;
}

function isVoiceTtsEnabled() {
  return process.env.VOICE_TTS_ENABLED !== "false";
}

function normalizeText(text) {
  return String(text || "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, Number(process.env.VOICE_TTS_MAX_CHARS || 700));
}

async function safeResponseText(responseValue) {
  try {
    return await responseValue.text();
  } catch (error) {
    return "";
  }
}

module.exports = {
  synthesizeGeminiSpeech,
  wrapPcmAsWav,
};
