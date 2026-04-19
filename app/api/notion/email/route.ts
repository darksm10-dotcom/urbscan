import { NextRequest, NextResponse } from "next/server";

const NOTION_VERSION = "2022-06-28";

function notionHeaders(token: string) {
  return {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
    "Notion-Version": NOTION_VERSION,
  };
}

export async function POST(req: NextRequest) {
  const token = process.env.NOTION_TOKEN;
  const dbId = process.env.NOTION_EMAIL_DB_ID;
  if (!token || !dbId) {
    return NextResponse.json({ error: "Notion not configured" }, { status: 500 });
  }

  let body: {
    companyName: string;
    subject: string;
    url: string;
    emailType: string;
    language: string;
    emailBody: string;
    createdAt: string;
  };

  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }

  const emailTypeLabel: Record<string, string> = {
    cold: "Cold Outreach",
    followup: "Follow-up",
    proposal: "Proposal",
  };
  const languageLabel: Record<string, string> = {
    en: "English",
    zh: "Chinese",
  };

  const page = {
    parent: { database_id: dbId },
    properties: {
      Company: { title: [{ text: { content: body.companyName || "Unknown" } }] },
      Subject: { rich_text: [{ text: { content: body.subject } }] },
      URL: { url: body.url || null },
      "Email Type": { select: { name: emailTypeLabel[body.emailType] ?? "Cold Outreach" } },
      Language: { select: { name: languageLabel[body.language] ?? "English" } },
      Date: { date: { start: body.createdAt.slice(0, 10) } },
      Body: { rich_text: [{ text: { content: body.emailBody.slice(0, 2000) } }] },
    },
  };

  const res = await fetch("https://api.notion.com/v1/pages", {
    method: "POST",
    headers: notionHeaders(token),
    body: JSON.stringify(page),
  });

  if (!res.ok) {
    const err = await res.text();
    return NextResponse.json({ error: err }, { status: 500 });
  }

  const data = await res.json();
  return NextResponse.json({ id: data.id });
}
