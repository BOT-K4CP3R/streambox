const rtmpUrlInput = document.getElementById("rtmpUrl");
const bitrateSliderInput = document.getElementById("bitrateSlider");
const encoderSelect = document.getElementById("videoSource");
const bitrateValueSpan = document.getElementById("bitrateValue");
const toggleButton = document.getElementById('toggleButton');
const audioValue = document.getElementById("audioSource");
const errorBox = document.getElementById('errorBox');
const pilotValue = document.getElementById('pilotUrl');
const serverDomain = window.location.hostname;
const ws = new WebSocket(`ws://${serverDomain}:8080`);
const passwordInput = document.getElementById('passwordInput');
const passwordButton = document.getElementById('passwordButton');
const mainContent = document.getElementById('mainContent');

console.log(`ws://${serverDomain}:8080`);

// passwordButton.addEventListener('click', async () => {
//   const password = passwordInput.value;
//   const isSuccess = await checkPasswd(password);
//   if (isSuccess) {
//     mainContent.style.display = 'block';
//     document.getElementById('passwordBox').style.display = 'none';
//   } else {
//     showError('Invalid password');
//   }
// });

// async function checkPasswd(passwd) {
//   const response = await fetch('/login', {
//     method: 'POST',
//     headers: {
//       'Content-Type': 'application/json'
//     },
//     body: JSON.stringify({ passwd })
//   });
//   const result = await response.json();
//   console.log(result);
//   if (result.success) {
//     document.cookie = `passwd=${passwd}; path=/;`;
//   }
//   return result.success;
// }

// function getCookie(name) {
//   const value = `; ${document.cookie}`;
//   const parts = value.split(`; ${name}=`);
//   if (parts.length === 2) return parts.pop().split(';').shift();
//   return null;
// }

document.addEventListener("DOMContentLoaded", async (event) => {
  const savedPassword = getCookie('passwd');
  if (savedPassword) {
    const isSuccess = await checkPasswd(savedPassword);
    if (isSuccess) {
      mainContent.style.display = 'block';
      document.getElementById('passwordBox').style.display = 'none';
    }
  }
  updateToggleButton();
  bitrateValueSpan.textContent = bitrateSliderInput.value;
});

async function startStreaming() {
  const rtmpUrl = rtmpUrlInput.value;
  const bitrate = bitrateSliderInput.value;
  const videoSource = encoderSelect.value;
  const audioSource = audioValue.value;
  const pilotURL = pilotValue.value;
  const response = await fetch('/start', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ rtmpUrl, bitrate, videoSource, audioSource, pilotURL })
  });
  const result = await response.text();
  console.log(result);
  updateToggleButton();
}

async function stopStreaming() {
  const response = await fetch('/stop', {
    method: 'POST'
  });
  const result = await response.text();
  console.log(result);
  updateToggleButton();
}

async function checkStreamState() {
  const response = await fetch('/streamState');
  const data = await response.json();
  return data.isStreaming;
}

async function updateToggleButton() {
  const isStreaming = await checkStreamState();
  toggleButton.textContent = isStreaming ? 'Stop' : 'Start';
  toggleButton.className = isStreaming ? 'stop' : 'start';
}

toggleButton.addEventListener('click', async () => {
  const isStreaming = await checkStreamState();
  if (isStreaming) {
    stopStreaming();
  } else {
    startStreaming();
  }
});

bitrateSliderInput.addEventListener('input', () => {
  bitrateValueSpan.textContent = `${bitrateSliderInput.value} kb/s`;
});

ws.onmessage = (event) => {
  const data = JSON.parse(event.data);
  if (data.bitrate !== undefined) {
    document.getElementById('currentBitrate').textContent = `${data.bitrate} kb/s`;
  }
  if (data.error !== undefined) {
    showError(data.error);
  }
};

function showError(message) {
  errorBox.textContent = message;
  errorBox.style.display = 'block';
  setTimeout(() => {
    errorBox.style.display = 'none';
  }, 3000);
}

async function fetchCPUInfo() {
  try {
    const response = await fetch('/cpuTemperature');
    const data = await response.json();
    document.getElementById('cpuTemperature').innerHTML = `<p><strong>CPU Temperature:</strong> ${data.temperature}°C</p>`;
  } catch (error) {
    console.error('Failed to fetch CPU temperature:', error);
  }
}

async function setConfig() {
  try {
    const response = await fetch('/config', {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json'
      },
    });
    const res = await response.json();

    document.getElementById('videoSource').value = res.videoSource;

    document.getElementById('audioSource').value = res.audioSource;
    console.log(res.audioSource);

    rtmpUrlInput.value = res.rtmpUrl;
    bitrateSliderInput.value = res.bitrate;
    bitrateValueSpan.textContent = `${res.bitrate} kb/s`;
    pilotValue.value = res.pilotWebScoket;

  } catch (error) {
    console.error('Failed to set config:', error);
  }
}

async function fetchSystemInfo() {
  await fetchCPUInfo();
}

fetchSystemInfo();

setInterval(fetchCPUInfo, 1000);
setInterval(updateTraffic, 1500);

async function fetchNetworkInfo() {
  try {
    const response = await fetch('/networkInfo');
    const data = await response.json();
    const interfaces = data.interfaces;

    let networkInfoHTML = '';
    for (const [name, interfaceInfo] of Object.entries(interfaces)) {
      if (interfaceInfo[0].address && name !== 'lo') {
        networkInfoHTML += `<div class="network-interface">`;
        networkInfoHTML += `<input type="checkbox" name="checkbox" id="${name}" ${checkAddress(interfaceInfo)}>`;
        networkInfoHTML += `<label for="${name}"><strong>${name}</strong>: ${interfaceInfo[0].address}</label>`;
        networkInfoHTML += `<div id="traffic-${name}">0 kb/s</div>`;
        networkInfoHTML += `</div>`;
      }
    }

    const container = document.getElementById('networkInterfacesContainer');
    if (container) {
      container.innerHTML = networkInfoHTML;

      const checkboxes = container.querySelectorAll('input[type="checkbox"]');
      checkboxes.forEach(function (checkbox) {
        checkbox.addEventListener('change', async function () {
          const atLeastOneChecked = Array.from(checkboxes).some(cb => cb.checked);
          if (!atLeastOneChecked) {
            showError("You can't disable all interfaces");
            this.checked = true;
          } else {
            await fetch(`/api/network/change?interface=${checkbox.id}&status=${this.checked}`);
            console.log(`${checkbox.id}: ${this.checked}`);
            updateNetworkInfo(checkbox.id, this.checked);
          }
        });
      });

      updateNetworkInfo();
    } else {
      console.error('Element with id "networkInterfacesContainer" not found.');
    }
  } catch (error) {
    console.error('Error fetching or processing network information:', error);
  }
}

function checkAddress(interfaceInfo) {
  if (Array.isArray(interfaceInfo) && interfaceInfo.length > 0) {
    if (interfaceInfo[0].address !== 'Disabled') {
      return 'checked';
    } else {
      return '';
    }
  } else {
    return '';
  }
}

function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function updateNetworkInfo(interfaceName, checked) {
  try {
    await delay(250);
    const response = await fetch('/networkInfo');
    const data = await response.json();
    const interfaces = data.interfaces;

    if (interfaceName) {
      const interfaceInfo = interfaces[interfaceName];
      if (interfaceInfo && interfaceInfo[0].address) {
        const trafficDiv = document.getElementById(`traffic-${interfaceName}`);
        const label = document.querySelector(`label[for="${interfaceName}"]`);
        if (trafficDiv && label) {
          label.innerHTML = `<strong>${interfaceName}</strong>: ${interfaceInfo[0].address}`;
        }
      }
    } else {
      for (const [name, interfaceInfo] of Object.entries(interfaces)) {
        if (interfaceInfo[0].address && name !== 'lo') {
          const trafficDiv = document.getElementById(`traffic-${name}`);
          const label = document.querySelector(`label[for="${name}"]`);
          if (trafficDiv && label) {
            trafficDiv.textContent = `${interfaceInfo[0].address}`;
            label.innerHTML = `<strong>${name}</strong>: ${interfaceInfo[0].address}`;
          }
        }
      }
    }
  } catch (error) {
    console.error('Error updating network information:', error);
  }
}

async function updateTraffic() {
  const interfaces = document.querySelectorAll('.network-interface');
  for (const interface of interfaces) {
    const interfaceNameElement = interface.querySelector('strong');
    if (interfaceNameElement) {
      const interfaceName = interfaceNameElement.textContent;
      const response = await fetch(`/networkTraffic?interface=${interfaceName}`);
      const data = await response.json();
      const traffic = data.traffic.tx;
      const trafficElement = document.getElementById(`traffic-${interfaceName}`);
      if (trafficElement) {
        trafficElement.textContent = `${traffic} kb/s`;
      } else {
        console.error(`Element with ID 'traffic-${interfaceName}' not found.`);
      }
    }
  }
}

async function checkDevices() {
  try {
    const responseCameras = await fetch('/api/devices/cameras');
    const responseMicrophones = await fetch('/api/devices/microphones');

    const cameras = await responseCameras.json();
    const microphones = await responseMicrophones.json();

    const videoSourceSelect = document.getElementById('videoSource');
    const audioSourceSelect = document.getElementById('audioSource');

    cameras.forEach(camera => {
      const option = document.createElement('option');
      option.value = camera.path;
      option.textContent = camera.name;
      videoSourceSelect.appendChild(option);
    });

    microphones.forEach(microphone => {
      const option = document.createElement('option');
      option.value = microphone.path;
      option.textContent = microphone.name;
      audioSourceSelect.appendChild(option);
    });
  } catch (error) {
    console.error('Błąd podczas pobierania danych:', error);
  }
}

document.addEventListener('DOMContentLoaded', async () => {
  await checkDevices();
  await setConfig();
  await fetchSystemInfo();
  await fetchNetworkInfo();
  mainContent.style.display = 'block';
  document.getElementById('passwordBox').style.display = 'none';
});
