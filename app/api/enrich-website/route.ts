import { NextResponse } from "next/server";
import { z } from "zod";

const Body = z.object({
  url: z.string().url(),
});

const PRIVATE_HOST_RE = /^(localhost|127\.|0\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|::1$|fc|fd)/i;

// Only allow same-origin requests
function checkOrigin(req: Request): boolean {
  const origin = req.headers.get("origin");
  if (!origin) return true;
  const appUrl = process.env.NEXTAUTH_URL ?? process.env.APP_URL ?? "";
  if (!appUrl) return true;
  try {
    return new URL(appUrl).host === new URL(origin).host;
  } catch {
    return false;
  }
}

// In-memory rate limiter: max 30 enrichments per IP per minute
const enrichRateMap = new Map<string, { count: number; resetAt: number }>();
function checkEnrichRateLimit(ip: string): boolean {
  const now = Date.now();
  const entry = enrichRateMap.get(ip);
  if (!entry || now > entry.resetAt) {
    enrichRateMap.set(ip, { count: 1, resetAt: now + 60_000 });
    return true;
  }
  if (entry.count >= 30) return false;
  entry.count++;
  return true;
}
setInterval(() => {
  const now = Date.now();
  for (const [ip, entry] of enrichRateMap) {
    if (now > entry.resetAt + 60_000) enrichRateMap.delete(ip);
  }
}, 300_000);

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

const MAX_RESPONSE_BYTES = 512 * 1024; // 512 KB

export async function POST(req: Request) {
  if (!checkOrigin(req)) {
    return NextResponse.json({ summary: "" }, { status: 403 });
  }

  const ip = (req.headers as Headers).get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  if (!checkEnrichRateLimit(ip)) {
    return NextResponse.json({ summary: "" }, { status: 429 });
  }

  const parsed = Body.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ summary: "" });
  }

  const { url } = parsed.data;

  try {
    const parsedUrl = new URL(url);
    if (PRIVATE_HOST_RE.test(parsedUrl.hostname)) {
      return NextResponse.json({ summary: "" });
    }
  } catch {
    return NextResponse.json({ summary: "" });
  }

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);

    const res = await fetch(url, {
      signal: controller.signal,
      headers: { "User-Agent": "Mozilla/5.0 (compatible; BuildingFinder/1.0)" },
    });
    clearTimeout(timeout);

    if (!res.ok) return NextResponse.json({ summary: "" });

    // Stream with size cap to prevent reading multi-MB pages into memory
    const reader = res.body?.getReader();
    if (!reader) return NextResponse.json({ summary: "" });
    let bytes = 0;
    const chunks: Uint8Array[] = [];
    while (true) {
      const { done, value } = await reader.read();
      if (done || !value) break;
      bytes += value.length;
      chunks.push(value);
      if (bytes >= MAX_RESPONSE_BYTES) break;
    }
    reader.cancel().catch(() => {});
    const html = new TextDecoder().decode(
      chunks.reduce((acc, c) => { const m = new Uint8Array(acc.length + c.length); m.set(acc); m.set(c, acc.length); return m; }, new Uint8Array())
    );
    const summary = extractSummary(html);
    return NextResponse.json({ summary });
  } catch {
    return NextResponse.json({ summary: "" });
  }
}
