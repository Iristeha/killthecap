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
        const videoId = insertResult.rows[0].id;
        console.log("✅ [SERVER] Video inserted into database with ID:", videoId);

        await client.end();

        // Stuur email met DOWNLOAD LINK (niet als attachment, te groot!)
        console.log("📧 [SERVER] Sending email with download link...");
        await sendEmailWithDownloadLink(videoId, videoBuffer.length);
        console.log("✅ [SERVER] Email sent successfully");

        res.status(200).json({ 
          success: true, 
          message: "Video uploaded and email sent",
          videoId: videoId,
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

async function sendEmailWithDownloadLink(videoId, videoSize) {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    throw new Error("RESEND_API_KEY is not configured");
  }

  console.log("📧 [RESEND] Email send starting:", {
    videoId,
    videoSize,
    videoSizeMB: (videoSize / 1024 / 1024).toFixed(2),
  });

  const resend = new Resend(apiKey);
  
  // Maak download URL (aanpassen naar je production domain)
  const downloadUrl = `https://killthecap.vercel.app/api/download?id=${videoId}`;
  console.log("🔗 [RESEND] Download URL:", downloadUrl);

  try {
    console.log("📧 [RESEND] Sending email with download link to:", RECIPIENT_EMAIL);

    const response = await resend.emails.send({
      from: "Spiegel van de Leugen <onboarding@resend.dev>",
      to: RECIPIENT_EMAIL,
      subject: "Nieuwe excuses-video geüpload - Download beschikbaar",
      html: `
        <h2>Nieuwe excuses-video</h2>
        <p>Er is een nieuwe video met excuses geüpload naar je systeem.</p>
        
        <p><strong>Videodetails:</strong></p>
        <ul>
          <li>Bestandsgrootte: ${(videoSize / 1024 / 1024).toFixed(2)} MB</li>
          <li>Bestandstype: WebM (video/webm)</li>
          <li>Video ID: ${videoId}</li>
        </ul>
        
        <p><strong>Download je video:</strong></p>
        <p><a href="${downloadUrl}" style="background-color: #4CAF50; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px; display: inline-block;">📥 Download Video (${(videoSize / 1024 / 1024).toFixed(2)} MB)</a></p>
        
        <p>Of kopieer deze URL:</p>
        <p><code>${downloadUrl}</code></p>
        
        <p><em>De download link is 30 dagen geldig.</em></p>
        <p><em>Opmerking: Open het bestand met een videospeler die WebM ondersteunt (bijvoorbeeld VLC Media Player, Google Chrome, Firefox)</em></p>
      `,
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
    throw new Error(`Resend API error: ${err?.message || "Unknown error"}`);
  }
}

