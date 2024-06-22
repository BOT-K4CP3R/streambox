const { spawn } = require('child_process');
const { broadcastError, broadcastBitrate } = require('./broadcastHandler');
const fs = require('fs');

let currentBitrate = {
  data: 0
};
let userStoppedStreaming = false;

const streamState = {
  isStreaming: false,
  ffmpegProcess: null
};

function startFFmpeg(config) {
  const { rtmpUrl, bitrate, videoSource, audioSource, pilotURL } = config;
  fs.writeFileSync('config/config.json', JSON.stringify({rtmpUrl, bitrate, videoSource, audioSource, pilotWebScoket: pilotURL}));
  console.log('Starting FFmpeg with config:', config);

  userStoppedStreaming = false;

  if (streamState.ffmpegProcess || userStoppedStreaming) {
    console.log('FFmpeg is already running or user stopped streaming');
    return;
  }

  console.log('Starting FFmpeg with URL:', rtmpUrl);

  let inputDevice;
  switch (videoSource) {
    case 'test_pattern':
      inputDevice = ['-f', 'lavfi', '-i', 'testsrc=duration=3600:size=1920x1080:rate=60'];
      break;
    case 'rtmp_localhost_live_streambox':
      inputDevice = ['-i', 'rtmp://localhost/live/streambox'];
      break;
    default:
      inputDevice = ['-i', videoSource];
      break;
  }
  
  let audioInput;
  switch (audioSource) {
    case 'test_tone':
      audioInput = ['-f', 'lavfi', '-i', 'sine=frequency=1000:sample_rate=48000:duration=3600'];
      break;
    case 'no_audio':
      audioInput = [];
      break;
    default:
      audioInput = ['-f', 'alsa', '-i', `plughw:${audioSource},0`, '-ac', '2'];
      break;
  }  
  
  const ffmpegArgs = [
    ...inputDevice,
    ...audioInput,
    '-c:v', 'libx264',
    '-preset', 'ultrafast',
    '-b:v', `${bitrate}k`,
    '-f', getStreamingOutput(rtmpUrl),
    rtmpUrl
  ];
  console.log('FFmpeg args:', ffmpegArgs);

  streamState.ffmpegProcess = spawn('ffmpeg', ffmpegArgs);
  streamState.isStreaming = true;

  streamState.ffmpegProcess.stdout.on('data', (data) => {
    console.log(`FFmpeg stdout: ${data}`);
  });

  streamState.ffmpegProcess.stderr.on('data', (data) => {
    const stderr = data.toString();
    console.error(`FFmpeg stderr: ${stderr}`);

    if (stderr.includes('Device or resource busy')) {
      console.error('Error: Device is busy. Cannot start FFmpeg.');
      broadcastError('Device is busy');
      stopFFmpeg();
    } else if (stderr.includes('Stream not found')) {
      console.error('Stream not found. Retrying in 3 seconds...');
      stopFFmpeg();
      setTimeout(() => {
        startFFmpeg(config);
      }, 3000);
    } else if (stderr.includes('Bad file descriptor')) {
      broadcastError('Device not found');
      stopFFmpeg();
    } else {
      const bitrateMatch = stderr.match(/bitrate=(\d+(\.\d+)?)kbits\/s/);
      if (bitrateMatch) {
        const bitrateValue = parseFloat(bitrateMatch[1]);
        if (!isNaN(bitrateValue)) {
          currentBitrate.data = bitrateValue.toFixed(0);
          broadcastBitrate(currentBitrate.data);
        }
      }
    }
  });

  streamState.ffmpegProcess.on('error', (err) => {
    console.error('Failed to start FFmpeg:', err);
    broadcastError('Failed to start FFmpeg');
    if (!userStoppedStreaming) {
      setTimeout(() => {
        startFFmpeg(config);
      }, 3000);
    } else {
      userStoppedStreaming = false;
    }
  });

  streamState.ffmpegProcess.on('exit', (code, signal) => {
    console.log(`FFmpeg process exited with code ${code} and signal ${signal}`);
    streamState.ffmpegProcess = null;
    streamState.isStreaming = false;
    if (!userStoppedStreaming) {
      console.log('FFmpeg exited unexpectedly. Restarting in 3 seconds...');
      setTimeout(() => {
        startFFmpeg(config);
      }, 3000);
    }
  });
}

function stopFFmpeg() {
  if (streamState.ffmpegProcess) {
    console.log('Stopping FFmpeg');
    userStoppedStreaming = true;
    streamState.ffmpegProcess.kill('SIGTERM');
    streamState.ffmpegProcess = null;
    streamState.isStreaming = false;
  }
}

function getStreamingOutput(rtmpUrl) {
  if (rtmpUrl.startsWith('rtmp://')) {
    return 'flv';
  } else if (rtmpUrl.startsWith('srt://')) {
    return 'mpegts';
  } else {
    broadcastError('Error reading protocol!');
    return 'flv';
  }
}

module.exports = { startFFmpeg, stopFFmpeg, userStoppedStreaming, streamState, broadcastError, currentBitrate };
