import { NextResponse } from "next/server";
import { Resend } from "resend";
import pkg from "pg";

export const runtime = "nodejs"; // belangrijk!

const { Pool } = pkg;

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

export async function POST(req) {
  try {
    const formData = await req.formData();
    const file = formData.get("video");

    if (!file) {
      return NextResponse.json({ error: "No file received" }, { status: 400 });
    }

    const buffer = Buffer.from(await file.arrayBuffer());

    // Opslaan in Railway
    await pool.query(
      "INSERT INTO videos (file) VALUES ($1)",
      [buffer]
    );

    // Mail versturen
    const resend = new Resend(process.env.RESEND_API_KEY);

    await resend.emails.send({
      from: "Excuses Spiegel <noreply@excuses-spiegel.dev>",
      to: "iris.ter.harmsel@outlook.nl",
      subject: "Nieuwe excuses-opname",
      text: "Er is een nieuwe excuses-video opgenomen.",
      attachments: [
        {
          filename: "excuses.webm",
          content: buffer
        }
      ]
    });

    return NextResponse.json({ success: true });

  } catch (err) {
    console.error("Upload error:", err);
    return NextResponse.json({ error: "Upload failed" }, { status: 500 });
  }
}
