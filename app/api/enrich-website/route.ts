import { NextResponse } from "next/server";
import { z } from "zod";

const Body = z.object({
  url: z.string().url(),
});

function extractSummary(html: string): string {
  const titleMatch = html.match(/<title[^>]*>([^<]{1,120})<\/title>/i);
  const title = titleMatch?.[1]?.trim() ?? "";

  const metaMatch = html.match(/<meta[^>]+name=["']description["'][^>]+content=["']([^"']{1,300})["']/i)
    ?? html.match(/<meta[^>]+content=["']([^"']{1,300})["'][^>]+name=["']description["']/i);
  const meta = metaMatch?.[1]?.trim() ?? "";

  const pMatches = [...html.matchAll(/<p[^>]*>([^<]{20,300})<\/p>/gi)];
  const firstP = pMatches[0]?.[1]?.replace(/\s+/g, " ").trim() ?? "";

  const parts = [title, meta, firstP].filter(Boolean);
  return parts.join(" | ").slice(0, 500);
}

export async function POST(req: Request) {
  const parsed = Body.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ summary: "" });
  }

  const { url } = parsed.data;

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);

    const res = await fetch(url, {
      signal: controller.signal,
      headers: { "User-Agent": "Mozilla/5.0 (compatible; BuildingFinder/1.0)" },
    });
    clearTimeout(timeout);

    if (!res.ok) return NextResponse.json({ summary: "" });

    const html = await res.text();
    const summary = extractSummary(html);
    return NextResponse.json({ summary });
  } catch {
    return NextResponse.json({ summary: "" });
  }
}
