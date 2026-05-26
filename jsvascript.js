// ELEMENTEN
const video = document.getElementById("mirror-video");
const phases = document.querySelectorAll(".phase");

const transcriptBox = document.getElementById("speech-transcript");
const motivesList = document.getElementById("motives-list");
const countdownEl = document.getElementById("countdown");
const uploadStatus = document.getElementById("uploadStatus");

// AUDIO / VIDEO
let stream = null;
let mediaRecorder = null;
let recordedChunks = [];
let silenceTimer = null;

// FASES WISSELEN
function showPhase(id) {
  phases.forEach(p => p.classList.remove("active"));
  document.getElementById(id).classList.add("active");
}

// CAMERA STARTEN
async function initCamera() {
  try {
    stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
    video.srcObject = stream;
    await video.play();
  } catch (err) {
    uploadStatus.innerText = "Kan camera niet openen.";
  }
}

// --- FASE 1: SPRAAKHERKENNING ---
function startSpeechRecognition() {
  const SpeechRecognition =
    window.SpeechRecognition || window.webkitSpeechRecognition;

  const recognition = new SpeechRecognition();
  recognition.lang = "nl-NL";
  recognition.continuous = true;
  recognition.interimResults = true;

  let finalTranscript = "";

  recognition.onresult = (event) => {
    let liveText = "";

    for (let i = event.resultIndex; i < event.results.length; i++) {
      const result = event.results[i][0].transcript;

      // Live tekst tonen
      liveText += result;

      // Definitieve tekst opslaan
      if (event.results[i].isFinal) {
        finalTranscript += result + " ";
      }
    }

    // Update transcript in UI
    transcriptBox.innerText = liveText;
  };

  recognition.onend = () => {
    // Gebruiker is klaar met praten → motieven bepalen
    determineMotives(finalTranscript.trim());
  };

  recognition.start();
}


// MOTIEVEN BEPALEN
function determineMotives(text) {
  const motives = [];

  if (text.includes("bang") || text.includes("angst")) motives.push("Angst");
  if (text.includes("status") || text.includes("stoer")) motives.push("Status");
  if (text.includes("schaamte")) motives.push("Schaamte");
  if (text.includes("gedoe") || text.includes("makkelijk")) motives.push("Gemak");
  if (motives.length === 0) motives.push("Onzekerheid");

  motivesList.innerHTML = motives.map(m => `<div class="motive">${m}</div>`).join("");

  showPhase("phase-motives");

  setTimeout(() => {
    startCountdown();
  }, 2500);
}

// --- COUNTDOWN ---
function startCountdown() {
  showPhase("phase-countdown");

  let count = 3;
  countdownEl.innerText = count;

  const interval = setInterval(() => {
    count--;
    countdownEl.innerText = count;

    if (count === 0) {
      clearInterval(interval);
      startRecording();
    }
  }, 1000);
}

// --- VIDEO OPNEMEN ---
function startRecording() {
  showPhase("phase-recording");

  recordedChunks = [];
  mediaRecorder = new MediaRecorder(stream, { mimeType: "video/webm" });

  mediaRecorder.ondataavailable = (e) => {
    if (e.data.size > 0) recordedChunks.push(e.data);
  };

  mediaRecorder.onstop = handleStop;

  mediaRecorder.start();

  // Stilte-detectie
  startSilenceDetection();
}

// STILTE-DETECTIE
function startSilenceDetection() {
  const audioContext = new AudioContext();
  const mic = audioContext.createMediaStreamSource(stream);
  const analyser = audioContext.createAnalyser();
  mic.connect(analyser);

  const data = new Uint8Array(analyser.frequencyBinCount);

  function checkSilence() {
    analyser.getByteFrequencyData(data);
    const volume = data.reduce((a, b) => a + b) / data.length;

    if (volume < 5) {
      if (!silenceTimer) {
        silenceTimer = setTimeout(() => {
          stopRecording();
        }, 1500);
      }
    } else {
      clearTimeout(silenceTimer);
      silenceTimer = null;
    }

    requestAnimationFrame(checkSilence);
  }

  checkSilence();
}

// STOP OPNEMEN
function stopRecording() {
  if (mediaRecorder && mediaRecorder.state !== "inactive") {
    mediaRecorder.stop();
  }
}

// --- UPLOAD ---
async function handleStop() {
  showPhase("phase-thinking");

  const blob = new Blob(recordedChunks, { type: "video/webm" });
  const file = new File([blob], "excuses.webm", { type: "video/webm" });

  const formData = new FormData();
  formData.append("video", file);

  try {
    const response = await fetch("/api/upload", {
      method: "POST",
      body: formData
    });

    await response.json();

    showPhase("phase-approved");

    setTimeout(() => {
      window.location.href = "/";
    }, 3000);

  } catch (err) {
    uploadStatus.innerText = "Upload mislukt.";
  }
}

// FLOW STARTEN
initCamera();
startSpeechRecognition();

