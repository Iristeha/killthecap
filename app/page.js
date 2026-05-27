export default function Home() {
  return (
    <div
      dangerouslySetInnerHTML={{
        __html: `
          <div id="app">

            <h1 class="title">Excuses Spiegel</h1>

            <button id="debugButton" class="debug-btn">Debug modus</button>

            <div id="recordingSection" class="hidden">
              <video id="preview" autoplay muted></video>
              <button id="startRecording">Start opname</button>
              <button id="stopRecording" class="hidden">Stop opname</button>
            </div>

            <div id="uploadSection" class="hidden">
              <p>Opname voltooid! Klik hieronder om te versturen.</p>
              <button id="uploadButton">Verstuur video</button>
            </div>

            <div id="successMessage" class="hidden">
              <h2>Bedankt voor je excuses</h2>
              <p>Je video is succesvol verstuurd.</p>
            </div>

          </div>

          <script src="/javascript.js"></script>
        `
      }}
    />
  );
}
