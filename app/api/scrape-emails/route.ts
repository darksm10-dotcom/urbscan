import { NextRequest, NextResponse } from "next/server";

const EMAIL_RE = /[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}/g;

const IGNORE_PREFIXES = ["noreply", "no-reply", "donotreply", "mailer-daemon", "postmaster", "bounce", "support@example", "info@example"];
const IGNORE_DOMAINS = ["example.com", "domain.com", "yourdomain.com", "sentry.io", "email.com", "wixpress.com"];
const IGNORE_EXTENSIONS = [".png", ".jpg", ".gif", ".svg", ".webp", ".css", ".js", ".woff"];

const CONTACT_PATHS = ["/contact", "/contact-us", "/contacts", "/about", "/about-us", "/team", "/our-team", "/reach-us"];

function isValidEmail(email: string): boolean {
  const lower = email.toLowerCase();
  if (IGNORE_PREFIXES.some((p) => lower.startsWith(p))) return false;
  if (IGNORE_DOMAINS.some((d) => lower.endsWith(`@${d}`))) return false;
  if (IGNORE_EXTENSIONS.some((ext) => lower.includes(ext))) return false;
  // Filter out emails that look like CSS/image artifacts
  if (/\d+x\d+/.test(email)) return false;
  if (email.length > 80) return false;
  return true;
}

async function fetchPage(url: string): Promise<string> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 6000);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: { "User-Agent": "Mozilla/5.0 (compatible; Googlebot/2.1)" },
    });
    clearTimeout(timer);
    if (!res.ok) return "";
    const text = await res.text();
    // Strip script/style blocks before scanning
    return text.replace(/<(script|style)[^>]*>[\s\S]*?<\/\1>/gi, " ");
  } catch {
    clearTimeout(timer);
    return "";
  }
}

function extractEmails(html: string): string[] {
  const found = html.match(EMAIL_RE) ?? [];
  return [...new Set(found.filter(isValidEmail))];
}

function normalizeBase(website: string): string {
  const url = website.startsWith("http") ? website : `https://${website}`;
  return url.replace(/\/+$/, "");
}

const PRIVATE_HOST_RE = /^(localhost|127\.|0\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|::1$|fc|fd)/i;

export async function POST(req: NextRequest) {
  const { website } = await req.json();
  if (!website) return NextResponse.json({ error: "Missing website" }, { status: 400 });

  // SSRF guard: reject private/loopback hosts
  try {
    const parsed = new URL(website.startsWith("http") ? website : `https://${website}`);
    if (PRIVATE_HOST_RE.test(parsed.hostname)) {
      return NextResponse.json({ error: "Invalid host" }, { status: 400 });
    }
  } catch {
    return NextResponse.json({ error: "Invalid URL" }, { status: 400 });
  }

  const base = normalizeBase(website);
  const pagesToTry = [base, ...CONTACT_PATHS.map((p) => base + p)];

  const allEmails = new Set<string>();

  // Fetch pages in parallel, cap at first 5
  const htmls = await Promise.all(pagesToTry.slice(0, 5).map(fetchPage));
  htmls.forEach((html) => extractEmails(html).forEach((e) => allEmails.add(e)));

  // Sort: prefer shorter/simpler emails first (likely generic contact ones)
  const sorted = [...allEmails].sort((a, b) => a.length - b.length);

  return NextResponse.json({ emails: sorted });
}
