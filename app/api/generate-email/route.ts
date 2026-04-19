import { NextRequest, NextResponse } from "next/server";
import { scrapeCompany } from "@/lib/scraper";
import { generateEmail, EmailType, Language } from "@/lib/email-writer";

export async function POST(req: NextRequest) {
  let url: string, emailType: EmailType, language: Language, productDescription: string;

  let sellerPersona: string | undefined;

  try {
    const body = await req.json();
    url = body.url;
    emailType = body.emailType ?? "cold";
    language = body.language ?? "en";
    productDescription = body.productDescription ?? "";
    sellerPersona = body.sellerPersona;
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  if (!url || typeof url !== "string") {
    return NextResponse.json({ error: "url is required" }, { status: 400 });
  }

  let parsedUrl: URL;
  try {
    parsedUrl = new URL(url.startsWith("http") ? url : `https://${url}`);
  } catch {
    return NextResponse.json({ error: "Invalid URL" }, { status: 400 });
  }

  const companyContent = await scrapeCompany(parsedUrl.href);

  if (!companyContent) {
    return NextResponse.json(
      { error: "Could not access this website. Check the URL and try again." },
      { status: 422 }
    );
  }

  try {
    const result = await generateEmail({ companyContent, emailType, language, productDescription, sellerPersona });
    return NextResponse.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Email generation failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
