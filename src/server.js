require("dotenv").config();

const http = require("http");
const fs = require("fs");
const path = require("path");
const { answerSportsVoiceQuery } = require("./voice/sports-voice-query");

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

  if (url.pathname === "/voice") {
    response.writeHead(200, { "content-type": "text/html; charset=utf-8" });
    response.end(fs.readFileSync(voiceDemoPath, "utf8"));
    return;
  }

  response.writeHead(200, { "content-type": "text/plain; charset=utf-8" });
  response.end("Mundial 2026 content engine is running. Open /voice for the voice data bot.\n");
}

server.listen(port, () => {
  console.log(`Health server listening on ${port}`);
});

module.exports = {
  server,
};
