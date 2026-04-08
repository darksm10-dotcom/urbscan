import { NextRequest, NextResponse } from "next/server";
import { CompanyEnrichment } from "@/types";

function extractDomain(website: string): string | null {
  try {
    const url = new URL(website.startsWith("http") ? website : `https://${website}`);
    return url.hostname.replace(/^www\./, "");
  } catch {
    return null;
  }
}

export async function POST(req: NextRequest) {
  const apiKey = process.env.APOLLO_API_KEY;
  if (!apiKey) return NextResponse.json({ error: "APOLLO_API_KEY not configured" }, { status: 500 });

  const { website } = await req.json();
  if (!website) return NextResponse.json({ error: "Missing website" }, { status: 400 });

  const domain = extractDomain(website);
  if (!domain) return NextResponse.json({ error: "Invalid website URL" }, { status: 400 });

  const res = await fetch(
    `https://api.apollo.io/api/v1/organizations/enrich?domain=${encodeURIComponent(domain)}`,
    {
      headers: {
        "x-api-key": apiKey,
        "Content-Type": "application/json",
        "Cache-Control": "no-cache",
      },
    }
  );

  const data = await res.json();

  if (!res.ok || !data.organization) {
    const msg = data.message ?? "Apollo.io 查询失败";
    return NextResponse.json({ error: msg }, { status: 400 });
  }

  const org = data.organization;
  const enrichment: CompanyEnrichment = {
    employees: org.estimated_num_employees
      ? String(org.estimated_num_employees)
      : undefined,
    industry: org.industry ?? undefined,
    linkedinUrl: org.linkedin_url ?? undefined,
    description: org.short_description ?? undefined,
    annualRevenue: org.annual_revenue_printed ?? undefined,
    foundedYear: org.founded_year ?? undefined,
    source: "apollo",
  };

  return NextResponse.json({ enrichment });
}
