import { Client } from "pg";
import formidable from "formidable";
import fs from "fs";

const RECIPIENT_EMAIL = "iris.ter.harmsel@outlook.nl";
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

  const form = formidable();

  form.parse(req, async (err, fields, files) => {
    if (err) {
      console.error("Form parse error:", err);
      return res.status(500).json({ error: "Form parse error" });
    }

    const videoFile = files.video;
    if (!videoFile) {
      return res.status(400).json({ error: "No video file" });
    }

    const videoBuffer = fs.readFileSync(videoFile.filepath);

    const client = new Client({
      connectionString: process.env.DATABASE_URL,
      ssl: { rejectUnauthorized: false },
    });

    try {
      await client.connect();
      await client.query(
        "INSERT INTO videos (file) VALUES ($1)",
        [videoBuffer]
      );
    } catch (error) {
      console.error("Database insert error:", error);
      return res.status(500).json({ error: "Database insert error" });
    } finally {
      try {
        await client.end();
      } catch (closeError) {
        console.error("Database close error:", closeError);
      }
    }

    try {
      await sendResendEmail(videoBuffer);
    } catch (emailError) {
      console.error("Resend email error:", emailError);
    }

    return res.status(200).json({ success: true });
  });
}

async function sendResendEmail(videoBuffer) {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    throw new Error("RESEND_API_KEY is not configured");
  }

  const attachmentBase64 = Buffer.from(videoBuffer).toString("base64");

  const body = {
    from: "Excuses <no-reply@resend.dev>",
    to: RECIPIENT_EMAIL,
    subject: "Nieuwe excuses-video binnen",
    text: "Er is een nieuwe video geüpload.",
    attachments: [
      {
        filename: "excuses.webm",
        type: "video/webm",
        content: attachmentBase64,
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
}

