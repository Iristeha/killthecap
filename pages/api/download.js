import { Client } from "pg";

export const config = {
  api: {
    responseLimit: "50mb",
  },
};

export default async function handler(req, res) {
  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { id } = req.query;

  if (!id || isNaN(id)) {
    return res.status(400).json({ error: "Invalid video ID" });
  }

  if (!process.env.DATABASE_URL) {
    console.error("DATABASE_URL is not configured");
    return res.status(500).json({ error: "DATABASE_URL is not configured" });
  }

  let client;

  try {
    console.log("📥 [DOWNLOAD] Fetching video ID:", id);

    client = new Client({
      connectionString: process.env.DATABASE_URL,
      ssl: { rejectUnauthorized: false },
    });

    await client.connect();
    console.log("✅ [DOWNLOAD] Database connected");

    // Haal video op uit database
    const result = await client.query("SELECT file FROM videos WHERE id = $1", [id]);
    await client.end();

    if (!result.rows || result.rows.length === 0) {
      console.error("❌ [DOWNLOAD] Video not found");
      return res.status(404).json({ error: "Video not found" });
    }

    const videoBuffer = result.rows[0].file;
    console.log("📊 [DOWNLOAD] Video size:", videoBuffer.length, "bytes");

    if (!videoBuffer || videoBuffer.length === 0) {
      console.error("❌ [DOWNLOAD] Video buffer is empty");
      return res.status(500).json({ error: "Video file is empty" });
    }

    // Zet headers voor download
    res.setHeader("Content-Type", "video/webm");
    res.setHeader("Content-Length", videoBuffer.length);
    res.setHeader("Content-Disposition", `attachment; filename="excuses-${id}.webm"`);
    res.setHeader("Cache-Control", "no-cache, no-store, must-revalidate");

    console.log("✅ [DOWNLOAD] Sending video file...");
    res.send(videoBuffer);
  } catch (error) {
    console.error("❌ [DOWNLOAD] Error:", error);
    if (client) {
      try {
        await client.end();
      } catch (closeError) {
        console.error("Database close error:", closeError);
      }
    }
    res.status(500).json({ error: error.message || "Download failed" });
  }
}
