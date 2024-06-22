const WebSocket = require('ws');
let wsClients = [];

const wss = new WebSocket.Server({ port: 8080 });

wss.on('connection', (ws) => {
  console.log('new connection')
  wsClients.push(ws);
  ws.on('close', () => {
    wsClients = wsClients.filter(client => client !== ws);
  });
});

function broadcastError(message) {
  wsClients.forEach(ws => {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ error: message }));
    }
  });
}

function broadcastBitrate(currentBitrate) {
  wsClients.forEach(ws => {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ bitrate: currentBitrate }));
    }
  });
}

module.exports = { wss, wsClients, broadcastError, broadcastBitrate };
