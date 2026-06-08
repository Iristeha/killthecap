import { Client } from "pg";
import formidable from "formidable";
import fs from "fs";
import os from "os";
import path from "path";
import { Resend } from "resend";

const RECIPIENT_EMAIL = "g.e.ter.harmsel@st.hanze.nl";

export const config = {
  api: {
    bodyParser: false, // belangrijk voor video uploads
  },
};

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  if (!process.env.DATABASE_URL) {
    console.error("DATABASE_URL is not configured");
    return res.status(500).json({ error: "DATABASE_URL is not configured" });
  }

  console.log('📤 [SERVER] POST /api/upload received');
  console.log('📤 [SERVER] Content-Type:', req.headers['content-type']);

  const form = formidable({
    multiples: false,
    keepExtensions: true,
    uploadDir: os.tmpdir(),
    fileWriteStreamHandler: (file) => {
      const dest = path.join(os.tmpdir(), file.originalFilename || `upload-${Date.now()}.webm`);
      console.log('📤 [SERVER] File upload to temp:', dest);
      // Ensure the file object has the final path so later code reads the correct file
      try {
        file.filepath = dest;
      } catch (e) {
        // ignore if property cannot be set
      }
      return fs.createWriteStream(dest);
    },
  });

  return await new Promise((resolve) => {
    form.parse(req, async (err, fields, files) => {
      if (err) {
        console.error("❌ [SERVER] Form parse error:", err);
        res.status(500).json({ error: "Form parse error" });
        resolve();
        return;
      }

      console.log('📥 [SERVER] Form parsed. Files:', Object.keys(files));
      const videoFile = Array.isArray(files.video) ? files.video[0] : files.video;
      if (!videoFile || typeof videoFile !== 'object') {
        console.error("❌ [SERVER] Invalid upload shape", { videoFile });
        res.status(400).json({ error: "No video file" });
        resolve();
        return;
      }

      const videoPath = videoFile.filepath || videoFile.path || videoFile.filePath || videoFile._writeStream?.path || videoFile.file;
      if (!videoPath) {
        console.error("❌ [SERVER] Unable to read uploaded file path", {
          videoFile: Object.keys(videoFile),
        });
        res.status(500).json({ error: "Unable to read uploaded file path", details: Object.keys(videoFile) });
        resolve();
        return;
      }

      let client;

      try {
        // Controleer bestandsgrootte EN integriteit
        const fileStats = fs.statSync(videoPath);
        console.log("📊 [SERVER] Upload file stats:", {
          path: videoPath,
          size: fileStats.size,
          sizeKB: (fileStats.size / 1024).toFixed(2),
          isEmpty: fileStats.size === 0
        });
        
        if (fileStats.size === 0) {
          console.error("❌ [SERVER] KRITIEKE FOUT: Uploaded file is empty!");
          res.status(400).json({ error: "Uploaded video file is empty. Ensure the recording captured audio/video." });
          resolve();
          return;
        }
        
        // Lees de video in als buffer
        const videoBuffer = fs.readFileSync(videoPath);
        console.log("📊 [SERVER] VideoBuffer size:", videoBuffer.length, "bytes");
        
        // Controleer WebM bestand signature (WebM files start with "1A 45 DF A3")
        const webmSignature = videoBuffer.slice(0, 4).toString('hex');
        console.log("📝 [SERVER] WebM file signature:", webmSignature);
        
        if (webmSignature !== '1a45dfa3') {
          console.warn("⚠️  [SERVER] WARNING: File may not be valid WebM format!");
          console.warn("Expected: 1a45dfa3, Got:", webmSignature);
        }
        
        if (videoBuffer.length === 0) {
          console.error("❌ [SERVER] KRITIEKE FOUT: VideoBuffer is empty!");
          res.status(400).json({ error: "VideoBuffer empty - file read failed" });
          resolve();
          return;
        }

        // Railway connectie
        console.log("📡 [SERVER] Connecting to Railway database...");
        client = new Client({
          connectionString: process.env.DATABASE_URL,
          ssl: { rejectUnauthorized: false },
        });

        await client.connect();
        console.log("✅ [SERVER] Database connected");

        // INSERT in jouw tabel "videos"
        console.log("💾 [SERVER] Inserting video into database...");
        const insertResult = await client.query(
          "INSERT INTO videos (file) VALUES ($1) RETURNING id",
          [videoBuffer]
        );
        console.log("✅ [SERVER] Video inserted into database with ID:", insertResult.rows[0].id);

        await client.end();

        // Stuur email met video
        console.log("📧 [SERVER] Sending email with video...");
        await sendEmailWithVideo(videoBuffer);
        console.log("✅ [SERVER] Email sent successfully");

        res.status(200).json({ 
          success: true, 
          message: "Video uploaded and email sent",
          videoId: insertResult.rows[0].id,
          videoSize: videoBuffer.length
        });
        resolve();
      } catch (error) {
        console.error("❌ [SERVER] Processing error:", error);
        if (client) {
          try {
            await client.end();
          } catch (closeError) {
            console.error("Database close error:", closeError);
          }
        }
        res.status(500).json({ error: error.message || "Processing failed" });
        resolve();
      }
    });
  });
}

async function sendEmailWithVideo(videoBuffer) {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    throw new Error("RESEND_API_KEY is not configured");
  }

  console.log("📧 [RESEND] Email send starting with:", {
    hasKey: Boolean(apiKey),
    bufferSize: videoBuffer.length,
    bufferSizeMB: (videoBuffer.length / 1024 / 1024).toFixed(2),
  });

  const resend = new Resend(apiKey);
  
  // Convert buffer to base64
  const attachmentBase64 = videoBuffer.toString("base64");
  console.log("📧 [RESEND] Base64 encoded:", {
    base64Length: attachmentBase64.length,
    originalSize: videoBuffer.length,
    compressionRatio: (attachmentBase64.length / videoBuffer.length).toFixed(2),
    isEmpty: attachmentBase64.length === 0,
  });
  
  if (!attachmentBase64 || attachmentBase64.length === 0) {
    throw new Error("Base64 encoding failed: empty result");
  }

  // Controleer dat base64 enkel geldige characters bevat
  const base64Regex = /^[A-Za-z0-9+/]*={0,2}$/;
  if (!base64Regex.test(attachmentBase64)) {
    console.error("❌ [RESEND] Invalid base64 encoding detected!");
    throw new Error("Base64 string contains invalid characters");
  }
  console.log("✅ [RESEND] Base64 string is valid");

  try {
    console.log("📧 [RESEND] Sending email to:", RECIPIENT_EMAIL);
    console.log("📧 [RESEND] Attachment details:", {
      filename: "excuses.webm",
      base64Length: attachmentBase64.length,
      encodingMethod: "base64",
    });

    const response = await resend.emails.send({
      from: "Spiegel van de Leugen <onboarding@resend.dev>",
      to: RECIPIENT_EMAIL,
      subject: "Nieuwe excuses-video geüpload",
      html: `
        <h2>Nieuwe excuses-video</h2>
        <p>Er is een nieuwe video met excuses geüpload naar je systeem.</p>
        <p><strong>Videodetails:</strong></p>
        <ul>
          <li>Bestandsgrootte: ${(videoBuffer.length / 1024 / 1024).toFixed(2)} MB</li>
          <li>Bestandstype: WebM (video/webm)</li>
          <li>Geïncludeerd als attachment</li>
        </ul>
        <p>De video is bijgesloten als WebM-bestand.</p>
        <p><em>Opmerking: Open het bestand met een videospeler die WebM ondersteunt (bijvoorbeeld VLC Media Player, Google Chrome, Firefox)</em></p>
      `,
      attachments: [
        {
          filename: "excuses.webm",
          content: attachmentBase64,
          encoding: "base64",
        },
      ],
    });

    console.log("✅ [RESEND] Email sent successfully!");
    console.log("📧 [RESEND] Response:", {
      id: response.id,
      from: response.from,
      to: response.to,
      created_at: response.created_at,
    });
    return response;
  } catch (err) {
    console.error("❌ [RESEND] Email send failed:", err?.message || err);
    if (err?.response) {
      console.error("❌ [RESEND] Response body:", err.response);
    }
    if (err?.message?.includes("413")) {
      console.error("❌ [RESEND] File too large for email attachment!");
      throw new Error(`Resend API error: Attachment too large (${(videoBuffer.length / 1024 / 1024).toFixed(2)} MB)`);
    }
    throw new Error(`Resend API error: ${err?.message || "Unknown error"}`);
  }
}

