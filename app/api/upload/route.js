import { NextResponse } from "next/server";
import { Resend } from "resend";
import pkg from "pg";

export const runtime = "nodejs";

const { Pool } = pkg;

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  // Only enable strict SSL in production when a certificate is required
  ssl: process.env.NODE_ENV === "production" ? { rejectUnauthorized: false } : false
});

export async function POST(req) {
  try {
    const contentType = req.headers.get("content-type") || "";
    if (!contentType.includes("multipart/form-data")) {
      return NextResponse.json({ error: "Expected multipart/form-data" }, { status: 400 });
    }

    const formData = await req.formData();
    const file = formData.get("video");

    if (!file || typeof file === "string") {
      return NextResponse.json({ error: "No file received" }, { status: 400 });
    }

    // Convert uploaded Blob/File to Buffer
    const buffer = Buffer.from(await file.arrayBuffer());

    // Save to Postgres (expects a bytea column)
    const insert = await pool.query(
      "INSERT INTO videos (file) VALUES ($1) RETURNING id",
      [buffer]
    );

    const insertedId = insert?.rows?.[0]?.id ?? null;

    // Try to send a notification email via Resend, but don't fail the whole request if it fails
    if (process.env.RESEND_API_KEY) {
      try {
        const resend = new Resend(process.env.RESEND_API_KEY);
        await resend.emails.send({
          from: "Excuses Spiegel <noreply@excuses-spiegel.dev>",
          to: "iris.ter.harmsel@outlook.com",
          subject: "Nieuwe excuses-opname",
          text: "Er is een nieuwe excuses-video opgenomen.",
          attachments: [
            {
              filename: "excuses.webm",
              type: file.type || "video/webm",
              data: buffer.toString("base64")
            }
          ]
        });
      } catch (emailErr) {
        console.error("Resend email failed:", emailErr);
      }
    }

    return NextResponse.json({ success: true, id: insertedId });
  } catch (err) {
    console.error("Upload error:", err);
    return NextResponse.json({ error: "Upload failed" }, { status: 500 });
  }
}

export async function GET() {
  return NextResponse.json(
    { error: "Use POST with multipart/form-data to upload a video." },
    {
      status: 405,
      headers: { Allow: "POST" }
    }
  );
}
