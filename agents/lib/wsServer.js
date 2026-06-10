const WebSocket = require('ws');
const http = require('http');

let wss;
let server;

function getWss() {
  if (!wss) {
    const port = process.env.WS_PORT || process.env.PORT || 3001;
    const host = process.env.WS_HOST || "0.0.0.0";
    server = http.createServer((req, res) => {
      if (req.url === "/" || req.url === "/health") {
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ ok: true, service: "agentmarket-runtime" }));
        return;
      }
      res.writeHead(404, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ ok: false, error: "not_found" }));
    });
    wss = new WebSocket.Server({ server });
    wss.on('connection', (ws) => {
      console.log('WebSocket client connected');
    });
    server.listen(port, host);
    console.log(`WebSocket server listening on ws://${host}:${port}`);
  }
  return wss;
}

function broadcast(event, payload) {
  const message = JSON.stringify({ event, payload });
  getWss().clients.forEach((client) => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(message);
    }
  });
}

module.exports = { broadcast, getWss };
