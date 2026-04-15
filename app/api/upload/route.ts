import { put } from "@vercel/blob";
import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  const token = process.env.BLOB_READ_WRITE_TOKEN;
  if (!token) {
    return NextResponse.json({ error: "BLOB_READ_WRITE_TOKEN not configured" }, { status: 500 });
  }

  const { files } = (await req.json()) as {
    files: Array<{ id: string; name: string; type: string; data: string }>;
  };

  if (!Array.isArray(files) || files.length === 0) {
    return NextResponse.json({ error: "No files provided" }, { status: 400 });
  }

  const results: Array<{ id: string; url: string } | { id: string; error: string }> = [];

  for (const file of files) {
    try {
      // data is a base64 data URL like "data:application/pdf;base64,JVBERi0..."
      const base64 = file.data.split(",")[1];
      if (!base64) {
        results.push({ id: file.id, error: "Invalid base64 data" });
        continue;
      }
      const buffer = Buffer.from(base64, "base64");
      const blob = await put(`notes/${file.id}/${file.name}`, buffer, {
        access: "public",
        contentType: file.type || "application/octet-stream",
        token,
      });
      results.push({ id: file.id, url: blob.url });
    } catch (err) {
      results.push({ id: file.id, error: err instanceof Error ? err.message : "Upload failed" });
    }
  }

  return NextResponse.json({ results });
}
