const { io } = require('socket.io-client');
const fs = require('fs');
const si = require('systeminformation');
const { broadcastBitrate } = require('./broadcastHandler');
const os = require('os');
const axios = require('axios');

let config = JSON.parse(fs.readFileSync('config/config.json', 'utf-8'));
const socket = io(`http://${config.pilotWebScoket}:80`);

socket.on('connect', () => {
  console.log('Connected to Socket.io server');
  socket.emit('identify', 'streambox');
});

socket.on('message', async (dataText) => {
  const data = JSON.parse(dataText);
  if (data.type !== 'message') return;
  console.log('Received:', data);

  switch (data.action) {
    case "start":
      Object.assign(config, data.data);
      axios.post('http://127.0.0.1/start', {
        ...config
      });
      fs.writeFileSync('config/config.json', JSON.stringify(config));
      break;
    case "stop":
      axios.post('http://127.0.0.1/stop');
      break;
    case "streamState":
      axios.get('http://127.0.0.1/streamState')
        .then(response => {
          sendMessage(data.action, { isStreaming: response.data.isStreaming });
        })
      break;
    case "cpuTemperature":
      const temperature = await si.cpuTemperature();
      const roundedTemperature = temperature.main.toFixed(0);
      sendMessage(data.action, { temperature: roundedTemperature });
      break;
    case "networkInfo":
      const response = await axios.get('http://127.0.0.1/networkInfo');
      sendMessage(data.action, { data: response.data });
      break;
    case "bitrateUpdate":
      broadcastBitrate(currentBitrate);
      break;
    case "loadConfig":
      sendMessage(data.action, config);
      break;
    case "CameraUpdate":
      const cameras = await axios.get('http://127.0.0.1/api/devices/cameras');
      sendMessage(data.action, { cameras: cameras.data });
      break;
    case "microphoneUpdate":
      const microphones = await axios.get('http://127.0.0.1/api/devices/microphones');
      sendMessage(data.action, { microphones: microphones.data });
      break;
    case "updateTraffic":
      const res = await axios.get(`http://127.0.0.1/networkTraffic?interface=${data.data.interfaceName}`);
      sendMessage(data.action, { response: res.data, interfaceName: data.data.interfaceName });
      break;
    case "chart":
      try {
        const response = await axios.get('http://127.0.0.1/api/bitrate');
        const response2 = await axios.get('http://127.0.0.1/api/temperature');

        const data = {
          bitrate: response.data,
          temperature: response2.data
        };

        sendMessage('chart', data);
      } catch (error) {
        console.error('Error fetching data:', error);
      }
      break;
  }
});

socket.on("connect_error", (err) => {
  console.log(`connect_error due to ${err.message}`);
});

function sendMessage(action, payload = {}) {
  const message = { 'type': 'reply', action, ...payload };
  socket.emit('message', JSON.stringify(message));
}

module.exports = { socket, sendMessage };