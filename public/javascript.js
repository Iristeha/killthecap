let mediaRecorder;
let recordedChunks = [];

const debugButton = document.getElementById("debugButton");
const recordingSection = document.getElementById("recordingSection");
const uploadSection = document.getElementById("uploadSection");
const successMessage = document.getElementById("successMessage");

debugButton.addEventListener("click", () => {
  recordingSection.classList.remove("hidden");
});

document.getElementById("startRecording").addEventListener("click", async () => {
  const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
  document.getElementById("preview").srcObject = stream;

  mediaRecorder = new MediaRecorder(stream);
  recordedChunks = [];

  mediaRecorder.ondataavailable = (e) => recordedChunks.push(e.data);

  mediaRecorder.onstop = () => {
    uploadSection.classList.remove("hidden");
  };

  mediaRecorder.start();
  document.getElementById("startRecording").classList.add("hidden");
  document.getElementById("stopRecording").classList.remove("hidden");
});

document.getElementById("stopRecording").addEventListener("click", () => {
  mediaRecorder.stop();
  document.getElementById("stopRecording").classList.add("hidden");
});

document.getElementById("uploadButton").addEventListener("click", async () => {
  const blob = new Blob(recordedChunks, { type: "video/webm" });
  const formData = new FormData();
  formData.append("video", blob, "excuses.webm");

  const res = await fetch("/api/upload", {
    method: "POST",
    body: formData
  });

  if (res.ok) {
    uploadSection.classList.add("hidden");
    successMessage.classList.remove("hidden");
  } else {
    alert("Upload mislukt");
  }
});
