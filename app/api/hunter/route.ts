import { NextRequest, NextResponse } from "next/server";
import { HunterContact } from "@/types";

function extractDomain(website: string): string | null {
  try {
    const url = new URL(website.startsWith("http") ? website : `https://${website}`);
    return url.hostname.replace(/^www\./, "");
  } catch {
    return null;
  }
}

export async function POST(req: NextRequest) {
  const apiKey = process.env.HUNTER_API_KEY;
  if (!apiKey || apiKey === "your_hunter_api_key_here") {
    return NextResponse.json({ error: "Hunter API key not configured" }, { status: 500 });
  }

  const { website } = await req.json();
  if (!website) return NextResponse.json({ error: "Missing website" }, { status: 400 });

  const domain = extractDomain(website);
  if (!domain) return NextResponse.json({ error: "Invalid website URL" }, { status: 400 });

  const url = `https://api.hunter.io/v2/domain-search?domain=${encodeURIComponent(domain)}&limit=10&api_key=${apiKey}`;
  const res = await fetch(url);
  const data = await res.json();

  if (!res.ok || data.errors) {
    const msg = data.errors?.[0]?.details ?? "Hunter.io 查询失败";
    return NextResponse.json({ error: msg }, { status: 400 });
  }

  const emails: HunterContact[] = (data.data?.emails ?? [])
    .filter((e: { value?: string }) => e.value)
    .map((e: {
      value: string;
      first_name?: string;
      last_name?: string;
      position?: string;
      seniority?: string;
      department?: string;
      phone_number?: string;
      linkedin?: string;
      confidence?: number;
    }) => ({
      email: e.value,
      firstName: e.first_name,
      lastName: e.last_name,
      position: e.position,
      seniority: e.seniority,
      department: e.department,
      phone: e.phone_number,
      linkedin: e.linkedin,
      confidence: e.confidence ?? 0,
    }))
    .sort((a: HunterContact, b: HunterContact) => b.confidence - a.confidence);

  return NextResponse.json({ domain, contacts: emails });
}
