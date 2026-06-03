import { Client } from "pg";
import formidable from "formidable";
import fs from "fs";
import os from "os";
import path from "path";
import fetch from "node-fetch";

export const config = {
  api: {
    bodyParser: false,
  },
};

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const form = formidable({
    multiples: false,
    uploadDir: os.tmpdir(),
    keepExtensions: true,
  });

  form.parse(req, async (err, fields, files) => {
    if (err) {
      console.error("Form parse error:", err);
      return res.status(500).json({ error: "Form parse error" });
    }

    const videoFile = files.video;
    if (!videoFile) {
      return res.status(400).json({ error: "No video file" });
    }

    const videoPath = videoFile.filepath || videoFile.path;
    if (!videoPath) {
      return res.status(500).json({ error: "No file path returned by formidable" });
    }

    try {
      const videoBuffer = fs.readFileSync(videoPath);

      const client = new Client({
        connectionString: process.env.DATABASE_URL,
        ssl: { rejectUnauthorized: false },
      });

      await client.connect();
      await client.query("INSERT INTO videos (file) VALUES ($1)", [videoBuffer]);
      await client.end();

      await sendEmail(videoBuffer);

      return res.status(200).json({ success: true });
    } catch (error) {
      console.error("Processing error:", error);
      return res.status(500).json({ error: error.message });
    }
  });
}

async function sendEmail(videoBuffer) {
  const apiKey = process.env.RESEND_API_KEY;

  const attachmentBase64 = Buffer.from(videoBuffer).toString("base64");

  const body = {
    from: "Spiegel <no-reply@resend.dev>",
    to: "iris.ter.harmsel@outlook.com",
    subject: "Nieuwe excuses-video",
    text: "Er is een nieuwe video geüpload.",
    attachments: [
      {
        filename: "excuses.webm",
        content: attachmentBase64,
      },
    ],
  };

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    throw new Error(await response.text());
  }
}

