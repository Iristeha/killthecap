// === DOM ELEMENTS ===
const video = document.getElementById('mirror-video');
const overlayText = document.getElementById('overlay-text');
const subText = document.getElementById('sub-text');

// === STATE ===
let stream = null;
let mediaRecorder = null;
let recordedChunks = [];
let recognition = null;
let supportsSpeech = false;
let flowActive = false;
let state = 'idle';

// === INITIALIZATION ===
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}

async function init() {
  await startCamera();
  setupSpeechRecognition();
  setupKeyboardListener();
  showReadyState();
}

// === CAMERA ===
async function startCamera() {
  try {
    stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: 'user' },
      audio: true
    });
    video.srcObject = stream;
    video.classList.add('blurred');
  } catch (err) {
    console.error('Camera/microfoon fout:', err);
    overlayText.textContent = 'Camera of microfoon niet beschikbaar';
    subText.textContent = 'Sta toegang toe in je browserinstellingen.';
  }
}

// === SPEECH RECOGNITION ===
function setupSpeechRecognition() {
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SR) {
    supportsSpeech = false;
    console.warn('Speech Recognition niet ondersteund');
    return;
  }

  recognition = new SR();
  recognition.lang = 'nl-NL';
  recognition.continuous = false;
  recognition.interimResults = false;
  supportsSpeech = true;
}

// === KEYBOARD LISTENER ===
function setupKeyboardListener() {
  document.addEventListener('keydown', (e) => {
    if (e.code === 'Space' && !flowActive) {
      e.preventDefault();
      flowActive = true;
      startExperience();
    }
  });
}

// === READY STATE ===
function showReadyState() {
  state = 'ready';
  overlayText.textContent = 'Ga op de mat staan om te beginnen';
  subText.textContent = '';
}

// === FLOW START ===
function startExperience() {
  if (state !== 'ready') return;
  showIntro();
}

// === STEP 1: QUESTION ===
function showIntro() {
  state = 'intro';
  overlayText.textContent = 'Waarom loog je?';
  subText.textContent = 'Spreek je antwoord hardop uit.';
  startListeningForLie();
}

function startListeningForLie() {
  if (!supportsSpeech) {
    setTimeout(() => handleAnswer(null), 1000);
    return;
  }

  const fallback = setTimeout(() => handleAnswer(null), 10000);

  recognition.onresult = (e) => {
    clearTimeout(fallback);
    const transcript = e.results[0][0].transcript;
    handleAnswer(transcript);
  };

  recognition.onerror = () => {
    clearTimeout(fallback);
    handleAnswer(null);
  };

  recognition.start();
}

function handleAnswer(transcript) {
  if (state !== 'intro') return;
  recognition.abort();
  showMotives(transcript);
}

// === STEP 2: SHOW TRANSCRIPT ===
function showMotives(transcript) {
  state = 'motives';
  overlayText.textContent = 'Dit waren je motieven:';
  subText.textContent = transcript ? `"${transcript}"` : 'Je hebt niet gesproken.';
  setTimeout(showApologyIntro, 6000);
}

// === STEP 3: APOLOGY INTRO ===
function showApologyIntro() {
  state = 'apology_intro';
  overlayText.textContent = 'Tijd om je excuses aan te bieden.';
  subText.textContent = 'De opname start zo.';
  video.classList.remove('blurred');
  setTimeout(startCountdown, 2000);
}

// === STEP 4: COUNTDOWN ===
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
      subText.textContent = '';
      setTimeout(() => {
        overlayText.textContent = '';
        startRecording();
      }, 500);
    }
  }, 1000);
}

// === STEP 5: RECORDING ===
function startRecording() {
  state = 'recording';
  recordedChunks = [];

  mediaRecorder = new MediaRecorder(stream, {
    mimeType: 'video/webm;codecs=vp8,opus'
  });

  mediaRecorder.ondataavailable = (e) => {
    console.log('Data available:', e.data.size, 'bytes');
    if (e.data.size > 0) {
      recordedChunks.push(e.data);
    }
  };

  mediaRecorder.onstop = () => {
    console.log('MediaRecorder stopped. Total chunks:', recordedChunks.length);
    const totalSize = recordedChunks.reduce((sum, chunk) => sum + chunk.size, 0);
    console.log('Total video size:', totalSize, 'bytes');
    
    if (totalSize === 0) {
      console.error('ERROR: Video blob is empty!');
      showUploadError('Video opname was leeg. Controleer je camera en microfoon.');
      return;
    }
    
    const blob = new Blob(recordedChunks, { type: 'video/webm' });
    console.log('Created blob:', blob.size, 'bytes, type:', blob.type);
    uploadVideo(blob);
  };

  mediaRecorder.onerror = (e) => {
    console.error('MediaRecorder error:', e.error);
  };

  mediaRecorder.start(100); // Request dataavailable events every 100ms
  setTimeout(stopRecording, 10000);
}

function stopRecording() {
  if (mediaRecorder && mediaRecorder.state === 'recording') {
    // Force one final dataavailable event to capture remaining data
    mediaRecorder.requestData();
    // Then stop the recording
    mediaRecorder.stop();
  }
}

// === STEP 6: UPLOAD VIDEO ===
async function uploadVideo(blob) {
  state = 'uploading';
  showThinking();
  
  console.log('Uploading blob:', {
    size: blob.size,
    type: blob.type,
    isEmpty: blob.size === 0
  });
  
  if (blob.size === 0) {
    console.error('ERROR: Cannot upload empty blob!');
    hideLoadingBar();
    showUploadError('Video is leeg. Probeer opnieuw.');
    return;
  }

  const formData = new FormData();
  formData.append('video', blob, 'excuses.webm');

  try {
    const response = await fetch('/api/upload', {
      method: 'POST',
      body: formData,
    });

    let data;
    try {
      data = await response.json();
    } catch (jsonError) {
      const text = await response.text();
      console.error('Upload fout: response parse error', jsonError, text);
      hideLoadingBar();
      showUploadError();
      return;
    }

    hideLoadingBar();
    console.log('Upload response', response.status, data);

    if (response.ok && data.success) {
      showUploadComplete();
    } else {
      console.error('Upload fout:', data);
      showUploadError(data.error || 'Serverfout');
    }
  } catch (err) {
    console.error('Upload fout:', err);
    hideLoadingBar();
    showUploadError();
  }
}

function showUploadComplete() {
  state = 'completed';
  overlayText.textContent = 'Je wordt teruggestuurd.';
  subText.textContent = 'Je video is geüpload en verstuurd.';
  flowActive = false;
  setTimeout(showReadyState, 5000);
}

function showUploadError(message = 'Probeer het later nog eens.') {
  state = 'error';
  overlayText.textContent = 'Upload mislukt.';
  subText.textContent = message;
  flowActive = false;
  setTimeout(showReadyState, 5000);
}

// === STEP 7: LOADING BAR ===
function showThinking() {
  overlayText.textContent = 'Even nadenken...';
  subText.textContent = '';

  const bar = document.getElementById('loading-bar');
  const fill = document.getElementById('loading-fill');

  bar.style.display = 'block';
  fill.style.animation = 'none';
  void fill.offsetWidth;
  fill.style.animation = 'loadingAnim 3s linear forwards';
}

function hideLoadingBar() {
  const bar = document.getElementById('loading-bar');
  bar.style.display = 'none';
}

// === STEP 8: APPROVED ===
function showApproved() {
  state = 'approved';
  overlayText.textContent = 'Je excuses zijn goedgekeurd.';
  subText.textContent = '';
  setTimeout(showReturnScreen, 5000);
}

// === STEP 9: RETURN ===
function showReturnScreen() {
  state = 'return';
  overlayText.textContent = 'Je wordt teruggestuurd.';
  subText.textContent = '';
  flowActive = false;
  setTimeout(() => {
    flowActive = false;
    showReadyState();
  }, 3000);
}
