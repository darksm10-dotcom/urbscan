import { NextResponse } from "next/server";
import OpenAI from "openai";
import { z } from "zod";

const INJECTION_RE = /---|\n\s*system:/gi;
function sanitize(s: string): string {
  return s.replace(INJECTION_RE, " ").slice(0, 2000);
}

// Only allow same-origin requests (prevents unauthenticated external callers)
function checkOrigin(req: Request): boolean {
  const origin = req.headers.get("origin");
  if (!origin) return true; // same-origin browser requests or server-side calls
  const appUrl = process.env.NEXTAUTH_URL ?? process.env.APP_URL ?? "";
  if (!appUrl) return true; // not configured (local dev)
  try {
    return new URL(appUrl).host === new URL(origin).host;
  } catch {
    return false;
  }
}

// In-memory rate limiter: max 20 generations per IP per minute
const genRateMap = new Map<string, { count: number; resetAt: number }>();
function checkGenRateLimit(ip: string): boolean {
  const now = Date.now();
  const entry = genRateMap.get(ip);
  if (!entry || now > entry.resetAt) {
    genRateMap.set(ip, { count: 1, resetAt: now + 60_000 });
    return true;
  }
  if (entry.count >= 20) return false;
  entry.count++;
  return true;
}
// Prune stale rate limit entries every 5 minutes to prevent unbounded growth
setInterval(() => {
  const now = Date.now();
  for (const [ip, entry] of genRateMap) {
    if (now > entry.resetAt + 60_000) genRateMap.delete(ip);
  }
}, 300_000);

const Body = z.object({
  buildingName: z.string(),
  buildingAddress: z.string().optional(),
  recipientName: z.string().optional(),
  note: z.string().optional(),
  product: z.string().optional(),
  rolePrompt: z.string().optional(),
  websiteSummary: z.string().optional(),
  isFollowUp: z.boolean().optional(),
  previousSubject: z.string().optional(),
});

const apiKey = process.env.DEEPSEEK_API_KEY;
if (!apiKey) throw new Error("DEEPSEEK_API_KEY is not configured");

const client = new OpenAI({
  apiKey,
  baseURL: "https://api.deepseek.com",
});

const AiResponseSchema = z.object({
  subject: z.string(),
  bodyText: z.string(),
  bodyHtml: z.string(),
});

export async function POST(req: Request) {
  if (!checkOrigin(req)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const ip = (req.headers as Headers).get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  if (!checkGenRateLimit(ip)) {
    return NextResponse.json({ error: "Rate limit exceeded" }, { status: 429 });
  }

  const parsed = Body.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }

  const { buildingName, buildingAddress, recipientName, note, product, rolePrompt, websiteSummary, isFollowUp, previousSubject } = parsed.data;
  const productDesc = sanitize(product ?? process.env.NEXT_PUBLIC_DEFAULT_PRODUCT ?? "enterprise connectivity solutions");

  const systemContext = rolePrompt
    ? sanitize(rolePrompt)
    : `You are a B2B sales rep at Innet, a Malaysian ISP selling ${productDesc}.`;

  const websiteContext = websiteSummary
    ? `\nWebsite context about the company: ${sanitize(websiteSummary)}`
    : "";

  const followUpContext = isFollowUp && previousSubject
    ? `\nThis is a follow-up email. Our previous email had subject: "${sanitize(previousSubject)}". Reference the previous outreach naturally and provide a gentle nudge with fresh value.`
    : "";

  const emailType = isFollowUp ? "follow-up" : "cold outreach";

  const prompt = `${systemContext}

Write a ${emailType} email to ${recipientName ? `${sanitize(recipientName)} at ` : ""}${sanitize(buildingName)}${buildingAddress ? ` located at ${sanitize(buildingAddress)}` : ""}.${websiteContext}${followUpContext}
${note ? `Additional context: ${sanitize(note)}` : ""}

Requirements:
- Subject: concise and relevant${isFollowUp ? ' (prefix with "Re: " or "Following up: ")' : ""}
- Body: 3-4 short paragraphs max
- Clear CTA at the end

Respond ONLY in JSON: { "subject": "...", "bodyText": "...", "bodyHtml": "..." }
bodyHtml = bodyText wrapped in <p> tags per paragraph.`;

  try {
    const completion = await client.chat.completions.create({
      model: "deepseek-chat",
      messages: [{ role: "user", content: prompt }],
      response_format: { type: "json_object" },
    });

    const raw = completion.choices[0].message.content ?? "{}";
    const result = AiResponseSchema.parse(JSON.parse(raw));
    return NextResponse.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : "AI generation failed";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
