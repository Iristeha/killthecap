import Head from "next/head";
import { useState } from "react";

export default function Test() {
  const [file, setFile] = useState(null);
  const [preview, setPreview] = useState(null);
  const [status, setStatus] = useState(null);

  function handleFile(e) {
    const f = e.target.files[0];
    setFile(f || null);
    if (f) {
      setPreview(URL.createObjectURL(f));
    } else {
      setPreview(null);
    }
  }

  async function upload(e) {
    e.preventDefault();
    if (!file) return setStatus({ error: "Geen bestand gekozen" });

    setStatus({ loading: true });
    const form = new FormData();
    form.append("video", file, file.name);

    try {
      const res = await fetch("/api/upload", { method: "POST", body: form });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || JSON.stringify(json));
      setStatus({ success: true, result: json });
    } catch (err) {
      setStatus({ error: err.message });
    }
  }

  return (
    <>
      <Head>
        <title>Test Upload</title>
        <link rel="stylesheet" href="/style.css" />
      </Head>

      <main className="test-screen">
        <h1>Testscherm</h1>
        <p>Gebruik dit scherm om uploads en API-calls te testen.</p>

        <form onSubmit={upload} className="test-form">
          <label>
            Kies video (.webm aanbevolen)
            <input type="file" name="video" accept="video/*" onChange={handleFile} />
          </label>

          {preview && (
            <div className="preview">
              <video src={preview} controls style={{ maxWidth: "320px" }} />
            </div>
          )}

          <div className="form-actions">
            <button type="submit" className="btn primary">Upload</button>
          </div>
        </form>

        <div className="log">
          {status?.loading && <div>Uploading…</div>}
          {status?.success && <div>Success: {JSON.stringify(status.result)}</div>}
          {status?.error && <div style={{ color: "red" }}>Error: {status.error}</div>}
        </div>
      </main>
    </>
  );
}
