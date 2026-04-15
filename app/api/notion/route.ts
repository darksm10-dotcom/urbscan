import { NextRequest, NextResponse } from "next/server";

const NOTION_VERSION = "2022-06-28";

interface ContactPayload {
  buildingId: string;
  buildingName: string;
  buildingAddress?: string;
  buildingPhone?: string;
  method: string;
  note: string;
  contactedAt: string;
  followUpAt?: string;
  followUpDone: boolean;
  pipelineStatus: string;
}

function notionHeaders(token: string) {
  return {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
    "Notion-Version": NOTION_VERSION,
  };
}

const STATUS_LABELS: Record<string, string> = {
  new: "New",
  contacted: "Contacted",
  following: "Following Up",
  won: "Won",
  lost: "Lost",
};

const METHOD_LABELS: Record<string, string> = {
  whatsapp: "WhatsApp",
  call: "Call",
  email: "Email",
  visit: "Visit",
  other: "Other",
};

function buildProperties(contact: ContactPayload) {
  const props: Record<string, unknown> = {
    Name: {
      title: [{ text: { content: contact.buildingName } }],
    },
    Status: {
      select: { name: STATUS_LABELS[contact.pipelineStatus] ?? "New" },
    },
    "Contact Method": {
      select: { name: METHOD_LABELS[contact.method] ?? "Other" },
    },
    "Last Contacted": {
      date: { start: contact.contactedAt.slice(0, 10) },
    },
    "Follow-up Done": {
      checkbox: contact.followUpDone,
    },
  };

  if (contact.buildingAddress) {
    props["Address"] = {
      rich_text: [{ text: { content: contact.buildingAddress } }],
    };
  }

  if (contact.buildingPhone) {
    props["Phone"] = {
      phone_number: contact.buildingPhone,
    };
  }

  if (contact.note) {
    props["Notes"] = {
      rich_text: [{ text: { content: contact.note.slice(0, 2000) } }],
    };
  }

  if (contact.followUpAt) {
    props["Follow-up Date"] = {
      date: { start: contact.followUpAt },
    };
  }

  return props;
}

async function queryExisting(
  token: string,
  databaseId: string
): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  let cursor: string | undefined;

  do {
    const body: Record<string, unknown> = { page_size: 100 };
    if (cursor) body.start_cursor = cursor;

    const res = await fetch(
      `https://api.notion.com/v1/databases/${databaseId}/query`,
      {
        method: "POST",
        headers: notionHeaders(token),
        body: JSON.stringify(body),
      }
    );

    if (!res.ok) break;

    const data = (await res.json()) as {
      results: Array<{
        id: string;
        properties: { Name?: { title?: Array<{ plain_text: string }> } };
      }>;
      has_more: boolean;
      next_cursor?: string;
    };

    for (const page of data.results) {
      const name = page.properties.Name?.title?.[0]?.plain_text;
      if (name) map.set(name.toLowerCase(), page.id);
    }

    cursor = data.has_more ? data.next_cursor : undefined;
  } while (cursor);

  return map;
}

async function archivePage(token: string, pageId: string): Promise<boolean> {
  const res = await fetch(`https://api.notion.com/v1/pages/${pageId}`, {
    method: "PATCH",
    headers: notionHeaders(token),
    body: JSON.stringify({ archived: true }),
  });
  return res.ok;
}

export async function POST(req: NextRequest) {
  const token = process.env.NOTION_TOKEN;
  const databaseId = process.env.NOTION_DATABASE_ID;

  if (!token || !databaseId) {
    return NextResponse.json(
      { error: "NOTION_TOKEN or NOTION_DATABASE_ID not configured" },
      { status: 500 }
    );
  }

  const contacts = (await req.json()) as ContactPayload[];

  if (!Array.isArray(contacts) || contacts.length === 0) {
    return NextResponse.json({ error: "No contacts provided" }, { status: 400 });
  }

  const existing = await queryExisting(token, databaseId);
  let created = 0;
  let updated = 0;
  let deleted = 0;
  const errors: string[] = [];

  // Track which names are in the current payload
  const inPayload = new Set(contacts.map((c) => c.buildingName.toLowerCase()));

  for (const contact of contacts) {
    const properties = buildProperties(contact);
    const existingPageId = existing.get(contact.buildingName.toLowerCase());

    try {
      if (existingPageId) {
        const res = await fetch(
          `https://api.notion.com/v1/pages/${existingPageId}`,
          {
            method: "PATCH",
            headers: notionHeaders(token),
            body: JSON.stringify({ properties }),
          }
        );
        if (res.ok) updated++;
        else errors.push(`Update failed: ${contact.buildingName}`);
      } else {
        const res = await fetch("https://api.notion.com/v1/pages", {
          method: "POST",
          headers: notionHeaders(token),
          body: JSON.stringify({
            parent: { database_id: databaseId },
            properties,
          }),
        });
        if (res.ok) {
          created++;
          const page = (await res.json()) as { id: string };
          existing.set(contact.buildingName.toLowerCase(), page.id);
        } else {
          errors.push(`Create failed: ${contact.buildingName}`);
        }
      }
    } catch {
      errors.push(`Error syncing: ${contact.buildingName}`);
    }
  }

  // Archive Notion pages that are no longer in the app
  for (const [name, pageId] of existing) {
    if (!inPayload.has(name)) {
      const ok = await archivePage(token, pageId);
      if (ok) deleted++;
      else errors.push(`Delete failed: ${name}`);
    }
  }

  return NextResponse.json({ created, updated, deleted, errors });
}
