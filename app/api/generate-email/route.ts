import { NextResponse } from "next/server";
import OpenAI from "openai";
import { z } from "zod";

// Basic in-memory rate limiter: max 20 generations per IP per minute
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

const Body = z.object({
  buildingName: z.string(),
  buildingAddress: z.string().optional(),
  recipientName: z.string().optional(),
  note: z.string().optional(),
  product: z.string().optional(),
  rolePrompt: z.string().optional(),
  websiteSummary: z.string().optional(),
});

const client = new OpenAI({
  apiKey: process.env.DEEPSEEK_API_KEY!,
  baseURL: "https://api.deepseek.com",
});

export async function POST(req: Request) {
  const ip = (req.headers as Headers).get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  if (!checkGenRateLimit(ip)) {
    return NextResponse.json({ error: "Rate limit exceeded" }, { status: 429 });
  }

  const parsed = Body.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }

  const { buildingName, buildingAddress, recipientName, note, product, rolePrompt, websiteSummary } = parsed.data;
  const productDesc = product ?? process.env.NEXT_PUBLIC_DEFAULT_PRODUCT ?? "enterprise connectivity solutions";

  const systemContext = rolePrompt
    ? rolePrompt
    : `You are a B2B sales rep at Innet, a Malaysian ISP selling ${productDesc}.`;

  const websiteContext = websiteSummary
    ? `\nWebsite context about the company: ${websiteSummary}`
    : "";

  const prompt = `${systemContext}

Write a cold outreach email to ${recipientName ? `${recipientName} at ` : ""}${buildingName}${buildingAddress ? ` located at ${buildingAddress}` : ""}.${websiteContext}
${note ? `Additional context: ${note}` : ""}

Requirements:
- Subject: concise and relevant
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
    const result = JSON.parse(raw) as { subject: string; bodyText: string; bodyHtml: string };
    return NextResponse.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : "AI generation failed";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
