const { wsClients } = require('./wsHandler');
const WebSocket = require('ws')
const { sendMessage } = require('./socketHandler');

function broadcastError(message) {
  wsClients.forEach(ws => {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ error: message }));
    }
  });
}

function broadcastBitrate(currentBitrate) {
  sendMessage('bitrateUpdate', { bitrate: currentBitrate })
  wsClients.forEach(ws => {
    ws.send(JSON.stringify({ bitrate: currentBitrate }));
  });
}

module.exports = { broadcastError, broadcastBitrate };
