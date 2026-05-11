const video = document.getElementById("preview");
const startBtn = document.getElementById("start");
const stopBtn = document.getElementById("stop");

let mediaRecorder;
let chunks = [];

// Camera starten
async function initCamera() {
  const stream = await navigator.mediaDevices.getUserMedia({
    video: true,
    audio: true,
  });

  video.srcObject = stream;

  mediaRecorder = new MediaRecorder(stream);

  // Chunks opslaan
  mediaRecorder.ondataavailable = (e) => {
    chunks.push(e.data);
  };

  // Wanneer opname stopt → uploaden
  mediaRecorder.onstop = async () => {
    const blob = new Blob(chunks, { type: "video/webm" });
    chunks = [];

    // Upload naar Railway
    await sendVideoToRailway(blob);

    alert("Video verstuurd naar Railway 🎥");
  };
}

// Upload functie
async function sendVideoToRailway(blob) {
  const formData = new FormData();
  formData.append("video", blob, "opname.webm");

  await fetch("/api/upload", {
    method: "POST",
    body: formData,
  });
}

// Start knop
startBtn.addEventListener("click", () => {
  mediaRecorder.start();
  startBtn.disabled = true;
  stopBtn.disabled = false;
});

// Stop knop
stopBtn.addEventListener("click", () => {
  mediaRecorder.stop();
  startBtn.disabled = false;
  stopBtn.disabled = true;
});

// Camera starten bij laden
initCamera();
