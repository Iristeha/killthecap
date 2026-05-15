import { Client } from "pg";
import formidable from "formidable";
import fs from "fs";

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

    // Lees de video in als buffer
    const videoBuffer = fs.readFileSync(videoFile.filepath);

    // Railway connectie
    const client = new Client({
      connectionString: process.env.DATABASE_URL,
      ssl: { rejectUnauthorized: false },
    });

    try {
      await client.connect();

      // INSERT in jouw tabel "videos"
      await client.query(
        "INSERT INTO videos (file) VALUES ($1)",
        [videoBuffer]
      );

      await client.end();

      return res.status(200).json({ success: true });
    } catch (error) {
      console.error("Database insert error:", error);
      return res.status(500).json({ error: "Database insert error" });
    }
  });
}

