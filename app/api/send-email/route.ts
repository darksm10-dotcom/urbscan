import { NextResponse } from "next/server";
import nodemailer from "nodemailer";
import { z } from "zod";

const Body = z.object({
  to: z.string().email(),
  cc: z.array(z.string().email()).optional(),
  subject: z.string().min(1),
  bodyHtml: z.string().min(1),
  bodyText: z.string().min(1),
});

// Basic in-memory rate limiter: max 10 sends per IP per minute
const sendRateMap = new Map<string, { count: number; resetAt: number }>();
function checkSendRateLimit(ip: string): boolean {
  const now = Date.now();
  const entry = sendRateMap.get(ip);
  if (!entry || now > entry.resetAt) {
    sendRateMap.set(ip, { count: 1, resetAt: now + 60_000 });
    return true;
  }
  if (entry.count >= 10) return false;
  entry.count++;
  return true;
}

export async function POST(req: Request) {
  const ip = (req.headers as Headers).get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  if (!checkSendRateLimit(ip)) {
    return NextResponse.json({ error: "Rate limit exceeded" }, { status: 429 });
  }

  const parsed = Body.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }

  const { to, cc, subject, bodyHtml, bodyText } = parsed.data;

  const smtpHost = process.env.SMTP_HOST;
  const smtpUser = process.env.SMTP_USER;
  const smtpPass = process.env.SMTP_PASS;
  if (!smtpHost || !smtpUser || !smtpPass) {
    return NextResponse.json({ error: "SMTP not configured" }, { status: 500 });
  }

  const transporter = nodemailer.createTransport({
    host: smtpHost,
    port: Number(process.env.SMTP_PORT ?? 587),
    secure: process.env.SMTP_SECURE === "true",
    auth: { user: smtpUser, pass: smtpPass },
    tls: process.env.NODE_ENV === "production" ? undefined : { rejectUnauthorized: false },
  });

  await transporter.sendMail({
    from: `${process.env.SMTP_FROM_NAME ?? ""} <${smtpUser}>`,
    to,
    cc: cc && cc.length > 0 ? cc.join(", ") : undefined,
    subject,
    text: bodyText,
    html: bodyHtml,
  });

  return NextResponse.json({ ok: true });
}
