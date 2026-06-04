import { Client } from "pg";
import formidable from "formidable";
import fs from "fs";
import os from "os";
import path from "path";

const RECIPIENT_EMAIL = "iris.ter.harmsel@outlook.com";
const RESEND_API_URL = "https://api.resend.com/emails";

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
        // Lees de video in als buffer
        const videoBuffer = fs.readFileSync(videoPath);

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

  const attachmentBase64 = Buffer.from(videoBuffer).toString("base64");

  const body = {
    from: "Spiegel van de Leugen <no-reply@resend.dev>",
    to: RECIPIENT_EMAIL,
    subject: "Nieuwe excuses-video geüpload",
    html: `
      <h2>Nieuwe excuses-video</h2>
      <p>Er is een nieuwe video met excuses geüpload naar je systeem.</p>
      <p>De video is bijgesloten.</p>
    `,
attachments: [
  {
    filename: "excuses.webm",
    content: attachmentBase64,
    type: "video/webm",
  },
],

  };

  const response = await fetch(RESEND_API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Resend API error: ${response.status} ${errorText}`);
  }

  const result = await response.json();
  console.log("Email sent successfully:", result);
}

