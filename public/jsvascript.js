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
  // Eerst alleen de listeners setup, camera nog NIET starten
  setupSpeechRecognition();
  setupKeyboardListener();
  showReadyState();
  console.log('App initialized (camera will start later)');
}

async function ensureCameraStarted() {
  if (!stream) {
    console.log('Starting camera on demand...');
    await startCamera();
  }
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
    
    // Debug: controleer of stream tracks actief zijn
    const videoTracks = stream.getVideoTracks();
    const audioTracks = stream.getAudioTracks();
    console.log('Stream initialized:', {
      videoTracks: videoTracks.length,
      audioTracks: audioTracks.length,
      videoEnabled: videoTracks[0]?.enabled,
      audioEnabled: audioTracks[0]?.enabled
    });
  } catch (err) {
    console.error('Camera/microfoon fout:', err);
    overlayText.textContent = 'Camera of microfoon niet beschikbaar';
    subText.textContent = 'Sta toegang toe in je browserinstellingen.';
  }
}

async function ensureStreamActive() {
  // Check of stream nog actief is, anders herstarten
  if (!stream) {
    console.warn('Stream is null, restarting camera...');
    await startCamera();
    return;
  }
  
  const videoTracks = stream.getVideoTracks();
  const audioTracks = stream.getAudioTracks();
  
  const videoActive = videoTracks.length > 0 && videoTracks[0].enabled && videoTracks[0].readyState === 'live';
  const audioActive = audioTracks.length > 0 && audioTracks[0].enabled && audioTracks[0].readyState === 'live';
  
  console.log('Stream check before recording:', {
    videoActive,
    audioActive,
    videoTracks: videoTracks.length,
    audioTracks: audioTracks.length
  });
  
  if (!videoActive || !audioActive) {
    console.error('Stream lost or inactive, restarting...');
    // Stop oude stream
    if (stream) {
      stream.getTracks().forEach(track => track.stop());
    }
    // Herstarten
    await startCamera();
    await new Promise(resolve => setTimeout(resolve, 500)); // Wacht op stream-stabilisering
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
  
  // Zorg dat camera actief is voordat we hem tonen
  ensureCameraStarted().then(() => {
    video.classList.remove('blurred');
    setTimeout(startCountdown, 2000);
  }).catch(err => {
    console.error('Failed to start camera:', err);
    overlayText.textContent = 'Camera kon niet starten.';
    subText.textContent = 'Controleer je instellingen en probeer opnieuw.';
  });
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
async function startRecording() {
  state = 'recording';
  recordedChunks = [];

  // KRITIEK: Check dat stream actief is voordat we recording starten
  await ensureStreamActive();

  const videoTracks = stream.getVideoTracks();
  const audioTracks = stream.getAudioTracks();
  
  console.log('🎥 Starting MediaRecorder with stream:', {
    streamActive: stream !== null,
    videoTracksCount: videoTracks.length,
    audioTracksCount: audioTracks.length,
    videoTrackState: videoTracks[0]?.readyState,
    audioTrackState: audioTracks[0]?.readyState
  });

  // Probeer verschiedene MIME types totdat er één werkt
  let mimeType = 'video/webm';
  const supportedMimeTypes = [
    'video/webm;codecs=vp8,opus',
    'video/webm;codecs=vp8',
    'video/webm;codecs=vp9,opus',
    'video/webm;codecs=h264',
    'video/webm'
  ];

  for (const type of supportedMimeTypes) {
    if (MediaRecorder.isTypeSupported(type)) {
      mimeType = type;
      console.log('✅ Using supported MIME type:', mimeType);
      break;
    }
  }
  console.log('📝 Final MIME type selected:', mimeType);

  mediaRecorder = new MediaRecorder(stream, {
    mimeType: mimeType
  });

  let chunkCount = 0;

  mediaRecorder.ondataavailable = (e) => {
    chunkCount++;
    console.log(`📦 Chunk ${chunkCount}: ${e.data.size} bytes, type: ${e.data.type}`);
    if (e.data.size > 0) {
      recordedChunks.push(e.data);
    } else {
      console.warn(`⚠️  Chunk ${chunkCount} is empty`);
    }
  };

  mediaRecorder.onstop = () => {
    console.log('\n=== 🛑 RECORDING STOPPED ===');
    console.log('Total chunks collected:', recordedChunks.length);
    const totalSize = recordedChunks.reduce((sum, chunk) => sum + chunk.size, 0);
    console.log('Total video size:', totalSize, 'bytes');
    
    // Detailleerde chunk info
    recordedChunks.forEach((chunk, idx) => {
      console.log(`  Chunk ${idx}: ${chunk.size} bytes, type: ${chunk.type}`);
    });
    
    if (totalSize === 0) {
      console.error('❌ KRITISCHE FOUT: Video blob is volledig leeg!');
      console.error('Dit duidt op:');
      console.error('  - Stream had geen audio/video data');
      console.error('  - MediaRecorder kon niet worden gestart');
      console.error('  - Tracks waren niet actief');
      showUploadError('Video opname was leeg. Zorg dat camera/microfoon actief zijn.');
      return;
    }
    
    if (recordedChunks.length === 0) {
      console.error('❌ KRITISCHE FOUT: Geen chunks ontvangen!');
      showUploadError('Video opname was beschadigd. Probeer opnieuw.');
      return;
    }
    
    // Waarschuwing als video te klein is (waarschijnlijk beschadigd)
    const MIN_VIDEO_SIZE = 50 * 1024; // 50KB minimum
    if (totalSize < MIN_VIDEO_SIZE) {
      console.warn(`⚠️ WAARSCHUWING: Video is zeer klein (${totalSize} bytes)`);
      console.warn('Dit kan betekenen dat de opname niet goed is gestart.');
      console.warn('De video wordt toch geüpload, maar controleer de kwaliteit.');
    }
    
    const blob = new Blob(recordedChunks, { type: mimeType });
    console.log('✅ Blob created successfully:', {
      blobSize: blob.size,
      blobType: blob.type,
      chunkCount: recordedChunks.length,
      blobSizeKB: (blob.size / 1024).toFixed(2),
      estimatedDurationSeconds: Math.round(blob.size / 128000) // Rough estimate
    });
    
    // Controleer WebM signature in blob (eerste 4 bytes moeten "1A 45 DF A3" zijn)
    const reader = new FileReader();
    reader.onload = (e) => {
      const uint8 = new Uint8Array(e.target.result);
      const headerHex = Array.from(uint8.slice(0, 4))
        .map(b => b.toString(16).padStart(2, '0'))
        .join('');
      console.log('📝 WebM blob header signature:', headerHex);
      
      if (headerHex !== '1a45dfa3') {
        console.warn('⚠️ WebM header may be invalid! Expected: 1a45dfa3, Got:', headerHex);
      } else {
        console.log('✅ WebM header is valid!');
      }
      
      uploadVideo(blob);
    };
    reader.onerror = () => {
      console.warn('Could not read blob header, proceeding with upload anyway');
      uploadVideo(blob);
    };
    reader.readAsArrayBuffer(blob.slice(0, 4));
  };

  mediaRecorder.onerror = (e) => {
    console.error('❌ MediaRecorder error:', e.error);
  };

  console.log('🎬 MediaRecorder state:', mediaRecorder.state);
  mediaRecorder.start(100); // Request dataavailable events every 100ms
  console.log('🎥 Recording started, will stop in 10 seconds...');
  setTimeout(stopRecording, 10000);
}

function stopRecording() {
  if (mediaRecorder && mediaRecorder.state === 'recording') {
    console.log('⏱️ Stopping recorder...');
    // Force one final dataavailable event to capture remaining data
    mediaRecorder.requestData();
    // Wait a tiny bit, then stop
    setTimeout(() => {
      mediaRecorder.stop();
      console.log('⏹️ Stop command sent');
    }, 50);
  }
}

// === STEP 6: UPLOAD VIDEO ===
async function uploadVideo(blob) {
  state = 'uploading';
  showThinking();
  
  console.log('\n📤 ===== UPLOAD STARTING =====');
  console.log('Blob details:', {
    size: blob.size,
    sizeKB: (blob.size / 1024).toFixed(2),
    type: blob.type,
    isEmpty: blob.size === 0
  });
  
  if (blob.size === 0) {
    console.error('❌ KRITIEKE FOUT: Cannot upload empty blob!');
    hideLoadingBar();
    showUploadError('Video is leeg. Dit mag niet voorkomen - check je camera.');
    return;
  }

  // Zorg dat het blob type correct is
  if (!blob.type || blob.type === '') {
    console.warn('⚠️ Blob type is empty, setting to video/webm');
    blob = blob.slice(0, blob.size, 'video/webm');
  }

  // DEBUG: Maak lokale preview link (alleen in dev mode)
  const blobUrl = URL.createObjectURL(blob);
  console.log('🔗 DEBUG: Local blob preview (can save to test):', blobUrl);
  console.log('   Kun je dit gebruiken om het bestand lokaal te testen met video elementen');

  const formData = new FormData();
  formData.append('video', blob, 'excuses.webm');
  
  console.log('FormData prepared with:', {
    field: 'video',
    filename: 'excuses.webm',
    blobSize: blob.size,
    blobType: blob.type
  });

  try {
    console.log('Sending POST request to /api/upload...');
    const startTime = Date.now();
    
    const response = await fetch('/api/upload', {
      method: 'POST',
      body: formData,
      // Headers worden automatisch gezet door browser met boundary
    });

    const uploadTime = Date.now() - startTime;
    console.log('📥 Response received:', {
      status: response.status,
      statusText: response.statusText,
      contentType: response.headers.get('content-type'),
      uploadTimeMs: uploadTime
    });

    let data;
    try {
      data = await response.json();
      console.log('Response parsed:', data);
    } catch (jsonError) {
      const text = await response.text();
      console.error('❌ Upload fout: response parse error', jsonError);
      console.error('Response text:', text.substring(0, 500));
      hideLoadingBar();
      showUploadError('Server fout: kon antwoord niet lezen');
      return;
    }

    hideLoadingBar();
    
    // Cleanup blob URL
    URL.revokeObjectURL(blobUrl);

    if (response.ok && data.success) {
      console.log('✅ Upload succeeded!');
      console.log('Server message:', data.message);
      console.log('Video ID:', data.videoId);
      console.log('Video size on server:', data.videoSize, 'bytes');
      
      // Sla video ID op voor debugging
      window.lastVideoId = data.videoId;
      console.log(`🔗 DEBUG: Download video met: /api/download?id=${data.videoId}`);
      
      showUploadComplete();
    } else {
      console.error('❌ Upload fout:', data);
      showUploadError(data.error || 'Serverfout');
    }
  } catch (err) {
    console.error('❌ Upload network error:', err);
    console.error('Error details:', err.message);
    hideLoadingBar();
    showUploadError('Netwerkfout: controleer je verbinding');
  }
}

function showUploadComplete() {
  state = 'completed';
  overlayText.textContent = 'Je wordt teruggestuurd.';
  subText.textContent = 'Je video is geüpload en verstuurd.';
  flowActive = false;
  
  // Log voor debugging
  console.log('✅ UPLOAD COMPLETED SUCCESSFULLY');
  console.log('Video ID:', window.lastVideoId || 'unknown');
  if (window.lastVideoId) {
    console.log(`Debug: Download via: /api/download?id=${window.lastVideoId}`);
  }
  
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
