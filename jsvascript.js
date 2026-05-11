const video = document.getElementById('mirror-video');
const overlayText = document.getElementById('overlay-text');
const subText = document.getElementById('sub-text');

let stream = null;
let mediaRecorder = null;
let recordedChunks = [];
let recognition = null;
let supportsSpeech = false;

let state = 'idle';

// CAMERA
async function startCamera() {
  try {
    stream = await navigator.mediaDevices.getUserMedia({
      video: true,
      audio: true
    });
    video.srcObject = stream;
    video.classList.add('blurred');
    setupSpeechRecognition();
    startExperience();
  } catch (err) {
    overlayText.textContent = 'Camera of microfoon niet beschikbaar';
    subText.textContent = 'Sta toegang toe in je browserinstellingen.';
  }
}

// SPEECH
function setupSpeechRecognition() {
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SR) {
    supportsSpeech = false;
    return;
  }

  recognition = new SR();
  recognition.lang = 'nl-NL';
  supportsSpeech = true;
}

function startListeningForLie() {
  const fallback = setTimeout(() => handleAnswer(null), 10000);

  if (!supportsSpeech) return;

  setTimeout(() => recognition.start(), 600);

  recognition.onresult = e => {
    clearTimeout(fallback);
    handleAnswer(e.results[0][0].transcript);
  };
}

// FLOW
function startExperience() {
  showIntro();
}

function showIntro() {
  state = 'intro';
  overlayText.textContent = 'Waarom loog je?';
  subText.textContent = 'Spreek je antwoord hardop uit.';
  startListeningForLie();
}

function handleAnswer(transcript) {
  if (state !== 'intro') return;
  showMotives(transcript);
}

function showMotives(transcript) {
  state = 'motives';
  overlayText.textContent = 'Dit waren je motieven:';
  subText.textContent = transcript && transcript.trim().length > 0
    ? `"${transcript}"`
    : 'Je hebt niet gesproken, maar diep vanbinnen weet je waarom je loog.';
  setTimeout(showApologyIntro, 6000);
}

function showApologyIntro() {
  state = 'apology_intro';
  overlayText.textContent = 'Tijd om je excuses aan te bieden.';
  subText.textContent = 'Kijk jezelf aan. De opname start zo.';
  video.classList.remove('blurred');

  setTimeout(startCountdown, 2000);
}

// COUNTDOWN 3–2–1
function startCountdown() {
  state = 'countdown';
  let count = 3;

  overlayText.textContent = count;
  subText.textContent = '';

  const interval = setInterval(() => {
    count--;
    if (count > 0) {
      overlayText.textContent = count;
    } else {
      clearInterval(interval);
      overlayText.textContent = 'Opname gestart';
      setTimeout(() => {
        overlayText.textContent = '';
        subText.textContent = '';
        startRecording();
      }, 500);
    }
  }, 1000);
}

// RECORDING
function startRecording() {
  if (!stream) return;

  recordedChunks = [];
  mediaRecorder = new MediaRecorder(stream, { mimeType: 'video/webm' });

  mediaRecorder.ondataavailable = e => {
    if (e.data.size > 0) recordedChunks.push(e.data);
  };

  mediaRecorder.onstop = () => {
    const blob = new Blob(recordedChunks, { type: 'video/webm' });

    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "excuses-opname.webm";
    a.click();
    URL.revokeObjectURL(url);
  };

  mediaRecorder.start();
  setTimeout(stopRecordingAndApprove, 10000);
}

function stopRecordingAndApprove() {
  if (mediaRecorder && mediaRecorder.state === 'recording') {
    mediaRecorder.stop();
  }
  showThinking();
}

// LAADBALK “EVEN NADENKEN…”
function showThinking() {
  state = 'thinking';
  overlayText.textContent = 'Even nadenken...';
  subText.textContent = '';

  const bar = document.getElementById('loading-bar');
  const fill = document.getElementById('loading-fill');

  bar.style.display = 'block';
  fill.style.animation = 'none';
  void fill.offsetWidth;
  fill.style.animation = 'loadingAnim 3s linear forwards';

  setTimeout(() => {
    bar.style.display = 'none';
    showApproved();
  }, 3000);
}

// APPROVED + RETURN
function showApproved() {
  state = 'approved';
  overlayText.textContent = 'Je excuses zijn goedgekeurd.';
  subText.textContent = '';
  setTimeout(showReturnScreen, 5000);
}

function showReturnScreen() {
  state = 'return';
  overlayText.textContent = 'Je wordt teruggestuurd.';
  subText.textContent = '';
}

startCamera();


