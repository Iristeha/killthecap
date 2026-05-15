const video = document.getElementById("mirror-video");
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

  mediaRecorder.ondataavailable = (e) => {
    chunks.push(e.data);
  };

  mediaRecorder.onstop = async () => {
    const blob = new Blob(chunks, { type: "video/webm" });
    chunks = [];

    await sendVideoToRailway(blob);
  };
}

async function sendVideoToRailway(blob) {
  const formData = new FormData();
  formData.append("video", blob, "opname.webm");

  await fetch("/api/upload", {
    method: "POST",
    body: formData,
  });
}

startBtn.addEventListener("click", () => {
  mediaRecorder.start();
  startBtn.disabled = true;
  stopBtn.disabled = false;
});

stopBtn.addEventListener("click", () => {
  mediaRecorder.stop();
  startBtn.disabled = false;
  stopBtn.disabled = true;
});

initCamera();
