import formidable from "formidable";
import fs from "fs";
import { Resend } from "resend";
import pkg from "pg";

export const config = {
  api: {
    bodyParser: false,
  },
};

const resend = new Resend(process.env.RESEND_API_KEY);
const { Pool } = pkg;

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const form = formidable({
    uploadDir: "/tmp",
    keepExtensions: true,
    multiples: false,
  });

  form.parse(req, async (err, fields, files) => {
    if (err) {
      console.error("Formidable error:", err);
      return res.status(500).json({ error: "Upload parsing failed" });
    }

    try {
      const filePath = files.video.filepath;
      const buffer = fs.readFileSync(filePath);

      // --- DATABASE OPSLAAN ---
      await pool.query(
        "INSERT INTO videos (file) VALUES ($1)",
        [buffer]
      );

      // --- MAIL VERSTUREN ---
      await resend.emails.send({
        from: "Excuses Spiegel <noreply@excuses-spiegel.dev>",
        to: "iris.ter.harmsel@outlook.com",
        subject: "Nieuwe excuses-opname",
        text: "Er is een nieuwe excuses-video opgenomen.",
        attachments: [
          {
            filename: "excuses.webm",
            content: buffer,
          },
        ],
      });

      return res.status(200).json({ success: true });

    } catch (error) {
      console.error("Upload error:", error);
      return res.status(500).json({ error: "Upload failed" });
    }
  });
}


