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

  const form = formidable({
    multiples: false,
    keepExtensions: true,
    uploadDir: os.tmpdir(),
    fileWriteStreamHandler: (file) => {
      const dest = path.join(os.tmpdir(), file.originalFilename || `upload-${Date.now()}.webm`);
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
        console.error("Form parse error:", err);
        res.status(500).json({ error: "Form parse error" });
        resolve();
        return;
      }

      const videoFile = Array.isArray(files.video) ? files.video[0] : files.video;
      if (!videoFile || typeof videoFile !== 'object') {
        console.error("Invalid upload shape", files.video);
        res.status(400).json({ error: "No video file" });
        resolve();
        return;
      }

      const videoPath = videoFile.filepath || videoFile.path || videoFile.filePath || videoFile._writeStream?.path || videoFile.file;
      if (!videoPath) {
        console.error("Unable to read uploaded file path", {
          videoFile,
        });
        res.status(500).json({ error: "Unable to read uploaded file path", details: Object.keys(videoFile) });
        resolve();
        return;
      }

      let client;

      try {
        // Controleer bestandsgrootte
        const fileStats = fs.statSync(videoPath);
        console.log("Upload file stats:", {
          path: videoPath,
          size: fileStats.size,
          isEmpty: fileStats.size === 0
        });
        
        if (fileStats.size === 0) {
          console.error("ERROR: Uploaded file is empty!");
          res.status(400).json({ error: "Uploaded video file is empty. Ensure the recording captured audio/video." });
          resolve();
          return;
        }
        
        // Lees de video in als buffer
        const videoBuffer = fs.readFileSync(videoPath);
        console.log("VideoBuffer size:", videoBuffer.length, "bytes");

        // Railway connectie
        client = new Client({
          connectionString: process.env.DATABASE_URL,
          ssl: { rejectUnauthorized: false },
        });

        await client.connect();

        // INSERT in jouw tabel "videos"
        await client.query(
          "INSERT INTO videos (file) VALUES ($1)",
          [videoBuffer]
        );

        await client.end();

        // Stuur email met video
        await sendEmailWithVideo(videoBuffer);

        res.status(200).json({ success: true, message: "Video uploaded and email sent" });
        resolve();
      } catch (error) {
        console.error("Processing error:", error);
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

  console.log("RESEND key available", {
    hasKey: Boolean(apiKey),
    prefix: apiKey.slice(0, 5),
    length: apiKey.length,
  });

  const resend = new Resend(apiKey);
  
  // Convert buffer to base64
  const attachmentBase64 = videoBuffer.toString("base64");
  console.log("Email attachment base64 length:", attachmentBase64.length, "characters");
  
  if (!attachmentBase64 || attachmentBase64.length === 0) {
    throw new Error("Base64 encoding failed: empty result");
  }

  try {
    const response = await resend.emails.send({
      from: "Spiegel van de Leugen <onboarding@resend.dev>",
      to: RECIPIENT_EMAIL,
      subject: "Nieuwe excuses-video geüpload",
      html: `
        <h2>Nieuwe excuses-video</h2>
        <p>Er is een nieuwe video met excuses geüpload naar je systeem.</p>
        <p>De video is bijgesloten als WebM-bestand.</p>
        <p><em>Opmerking: Open het bestand met een videospeler die WebM ondersteunt (bijvoorbeeld VLC Media Player)</em></p>
      `,
      attachments: [
        {
          filename: "excuses.webm",
          content: attachmentBase64,
          encoding: "base64",
        },
      ],
    });

    console.log("Email sent successfully:", response);
    return response;
  } catch (err) {
    console.error("Resend SDK error:", err?.message || err);
    if (err?.response) {
      console.error("Resend response body:", err.response);
    }
    throw new Error(`Resend API error: ${err?.message || "Unknown error"}`);
  }
}

