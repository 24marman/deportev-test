require("dotenv").config();

const http = require("http");
const fs = require("fs");
const path = require("path");
const { answerSportsVoiceQuery } = require("./voice/sports-voice-query");
const { synthesizeGeminiSpeech } = require("./voice/gemini-tts");

const port = Number(process.env.PORT || 3000);
const voiceDemoPath = path.join(__dirname, "voice", "voice-demo.html");

const server = http.createServer((request, response) => {
  handleRequest(request, response).catch((error) => {
    response.writeHead(500, { "content-type": "application/json; charset=utf-8" });
    response.end(
      JSON.stringify({
        ok: false,
        error: error?.message || "Unexpected server error",
      }),
    );
  });
});

async function handleRequest(request, response) {
  const url = new URL(request.url, `http://${request.headers.host || "localhost"}`);

  if (url.pathname === "/health") {
    response.writeHead(200, { "content-type": "application/json" });
    response.end(JSON.stringify({ ok: true, service: "mundial-2026-content-engine" }));
    return;
  }

  if (url.pathname === "/api/voice/query") {
    const answer = await answerSportsVoiceQuery(url.searchParams.get("q") || "");
    response.writeHead(200, { "content-type": "application/json; charset=utf-8" });
    response.end(JSON.stringify(answer));
    return;
  }

  if (url.pathname === "/api/voice/speak" && request.method === "POST") {
    const body = await readJsonBody(request);
    const speech = await synthesizeGeminiSpeech(body.text || "");
    response.writeHead(200, {
      "content-type": speech.mimeType,
      "cache-control": "no-store",
      "x-voice-provider": speech.metadata.provider,
      "x-voice-model": speech.metadata.model,
      "x-voice-name": speech.metadata.voice,
    });
    response.end(speech.buffer);
    return;
  }

  if (url.pathname === "/voice") {
    response.writeHead(200, { "content-type": "text/html; charset=utf-8" });
    response.end(fs.readFileSync(voiceDemoPath, "utf8"));
    return;
  }

  response.writeHead(200, { "content-type": "text/plain; charset=utf-8" });
  response.end("Mundial 2026 content engine is running. Open /voice for the voice data bot.\n");
}

function readJsonBody(request) {
  return new Promise((resolve, reject) => {
    let body = "";
    request.setEncoding("utf8");
    request.on("data", (chunk) => {
      body += chunk;
      if (body.length > 20000) {
        reject(new Error("Request body is too large."));
        request.destroy();
      }
    });
    request.on("end", () => {
      if (!body.trim()) {
        resolve({});
        return;
      }

      try {
        resolve(JSON.parse(body));
      } catch (error) {
        reject(new Error("Invalid JSON body."));
      }
    });
    request.on("error", reject);
  });
}

server.listen(port, () => {
  console.log(`Health server listening on ${port}`);
});

module.exports = {
  server,
};
