// --- ELEMENTEN ---
const video = document.getElementById("video");
const startBtn = document.getElementById("startBtn");
const stopBtn = document.getElementById("stopBtn");
const uploadStatus = document.getElementById("uploadStatus");

let mediaRecorder;
let recordedChunks = [];

// --- CAMERA STARTEN ---
async function startCamera() {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      video: { width: 1280, height: 720 },
      audio: true
    });

    video.srcObject = stream;
    video.play();
  } catch (err) {
    console.error("Camera error:", err);
    alert("Kan camera niet openen. Controleer je browserrechten.");
  }
}

startCamera();

// --- OPNEMEN STARTEN ---
startBtn.addEventListener("click", () => {
  const stream = video.srcObject;

  recordedChunks = [];
  mediaRecorder = new MediaRecorder(stream, {
    mimeType: "video/webm; codecs=vp9"
  });

  mediaRecorder.ondataavailable = (e) => {
    if (e.data.size > 0) recordedChunks.push(e.data);
  };

  mediaRecorder.onstop = handleStop;

  mediaRecorder.start();
  startBtn.style.display = "none";
  stopBtn.style.display = "block";
});

// --- OPNEMEN STOPPEN ---
stopBtn.addEventListener("click", () => {
  mediaRecorder.stop();
  stopBtn.style.display = "none";
  uploadStatus.innerText = "Even nadenken…";
});

// --- VIDEO VERWERKEN EN UPLOADEN ---
async function handleStop() {
  const blob = new Blob(recordedChunks, { type: "video/webm" });
  const file = new File([blob], "excuses.webm", { type: "video/webm" });

  const formData = new FormData();
  formData.append("video", file);

  try {
    const response = await fetch("/api/upload", {
      method: "POST",
      body: formData
    });

    if (!response.ok) {
      throw new Error("Upload mislukt");
    }

    uploadStatus.innerText = "Verzonden!";
  } catch (err) {
    console.error(err);
    uploadStatus.innerText = "Er ging iets mis…";
  }
}

