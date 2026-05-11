import { Client } from "pg";
import formidable from "formidable";
import fs from "fs";

export const config = {
  api: {
    bodyParser: false,
  },
};

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const form = formidable();

  form.parse(req, async (err, fields, files) => {
    if (err) {
      console.error(err);
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
      await client.end();

      return res.status(200).json({ ok: true });
    } catch (e) {
      console.error(e);
      return res.status(500).json({ error: "DB error" });
    }
  });
}
