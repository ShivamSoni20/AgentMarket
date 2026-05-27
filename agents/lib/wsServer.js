const WebSocket = require('ws');

let wss;

function getWss() {
  if (!wss) {
    const port = process.env.WS_PORT || 3001;
    wss = new WebSocket.Server({ port });
    wss.on('connection', (ws) => {
      console.log('WebSocket client connected');
    });
    console.log(`WebSocket server listening on ws://localhost:${port}`);
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
