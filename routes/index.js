const express = require('express');
const router = express.Router();
const { startFFmpeg, stopFFmpeg, broadcastError, streamState, currentBitrate } = require('../handlers/ffmpegHandler');
const { wsClients } = require('../handlers/wsHandler');
const { exec } = require('child_process');
const WebSocket = require('ws');
const si = require('systeminformation');
const os = require('os');
const fs = require('fs');
const path = require('path');

let currentConfig = JSON.parse(fs.readFileSync('config/config.json', 'utf-8'));
let currentPassword = JSON.parse(fs.readFileSync('config/password.json', 'utf-8'));
let chartData = JSON.parse(fs.readFileSync('config/chart.json', 'utf-8'));

function saveChartData() {
    fs.writeFileSync('config/chart.json', JSON.stringify(chartData));
}

let saveChartDataInterval;

router.get('/chart', (req, res) => {
    res.sendFile(path.join(__dirname, '..', 'public', 'chart.html'));
});

router.post('/start', (req, res) => {
    const { rtmpUrl, bitrate, videoSource, audioSource, pilotURL } = req.body;
    console.log(req.body);
    currentConfig.rtmpUrl = rtmpUrl;
    currentConfig.bitrate = bitrate;
    currentConfig.videoSource = videoSource;
    currentConfig.audioSource = audioSource;
    currentConfig.pilotWebScoket = pilotURL;
    userStoppedStreaming = false;
    startFFmpeg({ rtmpUrl, bitrate, videoSource, audioSource, pilotURL });

    chartData = {
        bitrateData: [],
        temperatureData: []
    };
    saveChartData();

    saveChartDataInterval = setInterval(() => {
        si.cpuTemperature()
            .then(data => {
                const roundedTemperature = data.main.toFixed(0);
                chartData.temperatureData.push({
                    time: new Date().toLocaleTimeString(),
                    value: parseInt(roundedTemperature)
                });
                chartData.bitrateData.push({
                    time: new Date().toLocaleTimeString(),
                    value: parseInt(currentBitrate.data)
                });
                saveChartData();
            })
            .catch(error => {
                console.error('Failed to get CPU temperature:', error);
            });
    }, 5 * 60 * 1000);

    res.send('Stream started');
});

router.post('/stop', (req, res) => {
    stopFFmpeg();
    clearInterval(saveChartDataInterval);
    saveChartData();

    setTimeout(() => {
        wsClients.forEach(ws => {
            if (ws.readyState === WebSocket.OPEN) {
                ws.send(JSON.stringify({ bitrate: '0' }));
            }
        });
    }, 1000);
    res.send('Stream stopped');
});

router.get('/api/bitrate', (req, res) => {
    res.json(chartData.bitrateData);
});

router.get('/api/temperature', (req, res) => {
    res.json(chartData.temperatureData);
});

router.post('/login', (req, res) => {
    const { passwd } = req.body;

    if (!currentPassword.passwd) {
        currentPassword.passwd = passwd;
        fs.writeFileSync('config/password.json', JSON.stringify(currentPassword));
        res.cookie('passwd', passwd, { httpOnly: true });
        return res.send({ success: true });
    } else if (passwd === currentPassword.passwd) {
        res.cookie('passwd', passwd, { httpOnly: true });
        return res.send({ success: true });
    } else {
        res.json({ success: false });
    }
});

router.get('/streamState', (req, res) => {
    try {
        res.json({ isStreaming: streamState.isStreaming });
    } catch (error) {
        console.error(error);
        broadcastError('Failed to load stream state');
    }
});

router.get('/cpuTemperature', async (req, res) => {
    try {
        const temperature = await si.cpuTemperature();
        const roundedTemperature = temperature.main.toFixed(0);
        res.json({ temperature: roundedTemperature });
    } catch (error) {
        res.status(500).json({ error: 'Internal Server Error' });
        broadcastError('Failed to load temperature');
    }
});

router.get('/config', (req, res) => {
    try {
        res.json(currentConfig);
    } catch (error) {
        res.status(500).json({ error: 'Internal Server Error' });
        broadcastError('Failed to load config');
    }
});

router.get('/networkInfo', (req, res) => {
    try {
        exec('ip a', (error, stdout, stderr) => {
            if (error) {
                console.error('Failed to execute ip a:', error);
                res.status(500).json({ error: 'Internal Server Error' });
                return;
            }
            if (stderr) {
                console.error('ip a error:', stderr);
                res.status(500).json({ error: 'Internal Server Error' });
                return;
            }

            const interfaces = parseIpA(stdout);

            res.json({ interfaces });
        });
    } catch (error) {
        console.error('Failed to load network info:', error);
        res.status(500).json({ error: 'Internal Server Error' });
    }
});

function parseIpA(stdout) {
    const interfaces = {};

    let currentInterface = null;

    stdout.split('\n').forEach(line => {
        line = line.trim();

        const matchInterface = line.match(/^(\d+): (\w+):/);
        if (matchInterface) {
            const name = matchInterface[2];
            interfaces[name] = [];
            currentInterface = name;
        }

        if (currentInterface) {
            if (line.startsWith('inet ') || line.startsWith('inet6 ')) {
                const parts = line.split(' ');
                const address = parts[1];
                interfaces[currentInterface].push({ address });
            } else if (line.includes('DOWN')) {
                interfaces[currentInterface].push({ address: 'Disabled' });
            }
        }
    });

    return interfaces;
}

router.get('/networkTraffic', async (req, res) => {
    try {
        const interfaceName = req.query.interface;
        const traffic = await getNetworkTraffic(interfaceName);
        res.json({ traffic });
    } catch (error) {
        console.error('Failed to load network traffic:', error);
        res.status(500).json({ error: 'Internal Server Error' });
    }
});

router.get('/api/devices/cameras', async (req, res) => {
    try {
        const videoDevices = await getVideoDevices();
        res.json(videoDevices);
    } catch (error) {
        res.status(500).send('Error listing video devices');
        console.error(error);
    }
});

router.get('/api/network/change', async (req, res) => {
    try {
        const interfaceName = req.query.interface;
        const status = req.query.status;

        function checkStatus(status) {
            if (status === "true") {
                return true;
            } else {
                return false;
            }
        }

        res.json(changeNetworkInterface(interfaceName, checkStatus(status)));
    } catch (error) {
        console.error('Failed to load network traffic:', error);
        res.status(500).json({ error: 'Internal Server Error' });
    }
});

router.get('/api/devices/microphones', async (req, res) => {
    try {
        const audioDevices = await getAudioDevices();
        res.json(audioDevices);
    } catch (error) {
        res.status(500).send('Error listing audio devices');
    }
});

function changeNetworkInterface(interfaceName, status) {

    exec(`sudo ip link set ${interfaceName} ${status ? "up" : "down"}`, (error, stdout, stderr) => {
        if (error) {
            return { status: false, message: error }
        }
        if (stderr) {
            return { status: false, message: stdout }
        }
        return { status: true, message: `${interfaceName} is now ${status? "enabled" : "disabled"}` }
    });
}

async function getNetworkTraffic(interfaceName) {
    try {
        const data = await si.networkStats(interfaceName);
        if (data.length > 0) {
            const txBitsPerSec = data[0].tx_sec / 64;

            return {
                tx: txBitsPerSec.toFixed(0)
            };
        } else {
            console.warn('Brak danych dla podanego interfejsu.');
            return {
                tx: 0
            };
        }
    } catch (error) {
        console.error('Błąd podczas pobierania danych:', error);
        throw error;
    }
}

function getVideoDevices() {
    return new Promise((resolve, reject) => {
        exec('v4l2-ctl --list-devices', (error, stdout, stderr) => {
            if (error) {
                console.error(`Error listing video devices: ${stderr}`);
                return reject(error);
            }
            console.log('Raw output from v4l2-ctl --list-devices:', stdout);
            const devices = stdout.split('\n\n').map(deviceBlock => {
                const lines = deviceBlock.split('\n').filter(line => line.trim() !== '');
                const deviceNameLine = lines.find(line => line.includes(':'));
                if (deviceNameLine) {
                    const deviceName = deviceNameLine.split(':')[0].trim();
                    const devicePath = lines[1] ? lines[1].trim() : '';
                    return { name: deviceName, path: devicePath };
                }
                return null;
            }).filter(device => device && (device.name.toLowerCase().includes('camera') || device.name.toLowerCase().includes('usb')));
            resolve(devices);
        });
    });
}

function getAudioDevices() {
    return new Promise((resolve, reject) => {
      exec('arecord -l', (error, stdout, stderr) => {
        if (error) {
          console.error(`Error listing audio devices: ${stderr}`);
          return reject(error);
        }
        
        const devices = [];
    
        let lines = stdout.trim().split('\n');
        let currentDevice = null;
    
        lines.forEach(line => {
          if (line.startsWith('card')) {
            if (currentDevice) {
              devices.push({
                name: currentDevice.cardName,
                path: currentDevice.deviceIndex
              });
            }
            currentDevice = {};
            const parts = line.split(':');
            const cardInfo = parts[1].trim().split(',');
            currentDevice.cardName = cardInfo[0].trim();
            currentDevice.deviceIndex = parseInt(parts[0].match(/\d+/)[0]);
          } else if (currentDevice && line.includes('device')) {
            const deviceNameStartIndex = line.indexOf('[');
            const deviceNameEndIndex = line.indexOf(']');
            if (deviceNameStartIndex !== -1 && deviceNameEndIndex !== -1) {
              const deviceName = line.substring(deviceNameStartIndex + 1, deviceNameEndIndex);
              currentDevice.name = deviceName.trim();
            }
          }
        });
  
        if (currentDevice) {
          devices.push({
            name: currentDevice.cardName,
            path: currentDevice.deviceIndex
          });
        }
    
        resolve(devices);
      });
    });
  }

module.exports = router;
