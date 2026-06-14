require("dotenv").config();

const http = require("http");

const port = Number(process.env.PORT || 3000);

const server = http.createServer((request, response) => {
  if (request.url === "/health") {
    response.writeHead(200, { "content-type": "application/json" });
    response.end(JSON.stringify({ ok: true, service: "mundial-2026-content-engine" }));
    return;
  }

  response.writeHead(200, { "content-type": "text/plain; charset=utf-8" });
  response.end("Mundial 2026 content engine is running.\n");
});

server.listen(port, () => {
  console.log(`Health server listening on ${port}`);
});

module.exports = {
  server,
};
