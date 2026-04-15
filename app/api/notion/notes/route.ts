import { NextRequest, NextResponse } from "next/server";

const NOTION_VERSION = "2022-06-28";

interface NoteFile {
  id: string;
  name: string;
  type: string;
  size: number;
}

interface NotePayload {
  id: string;
  title: string;
  content: string;
  tags: string;
  files: NoteFile[];
  createdAt: string;
  updatedAt: string;
}

function notionHeaders(token: string) {
  return {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
    "Notion-Version": NOTION_VERSION,
  };
}

function formatSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function buildProperties(note: NotePayload) {
  const props: Record<string, unknown> = {
    Title: { title: [{ text: { content: note.title || "Untitled" } }] },
    Updated: { date: { start: note.updatedAt.slice(0, 10) } },
    Created: { date: { start: note.createdAt.slice(0, 10) } },
  };

  if (note.content) {
    props["Content"] = { rich_text: [{ text: { content: note.content.slice(0, 2000) } }] };
  } else {
    props["Content"] = { rich_text: [] };
  }

  if (note.tags) {
    props["Tags"] = { rich_text: [{ text: { content: note.tags } }] };
  }

  // Attachments as dedicated column — list each file with name, type, size
  if (note.files && note.files.length > 0) {
    const text = note.files
      .map((f) => `${f.name} (${f.type || "file"}, ${formatSize(f.size)})`)
      .join("\n");
    props["Attachments"] = { rich_text: [{ text: { content: text.slice(0, 2000) } }] };
  } else {
    props["Attachments"] = { rich_text: [] };
  }

  return props;
}

async function queryExisting(token: string, databaseId: string): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  let cursor: string | undefined;
  do {
    const body: Record<string, unknown> = { page_size: 100 };
    if (cursor) body.start_cursor = cursor;
    const res = await fetch(`https://api.notion.com/v1/databases/${databaseId}/query`, {
      method: "POST",
      headers: notionHeaders(token),
      body: JSON.stringify(body),
    });
    if (!res.ok) break;
    const data = (await res.json()) as {
      results: Array<{ id: string; properties: { Title?: { title?: Array<{ plain_text: string }> } } }>;
      has_more: boolean;
      next_cursor?: string;
    };
    for (const page of data.results) {
      const title = page.properties.Title?.title?.[0]?.plain_text;
      if (title) map.set(title.toLowerCase(), page.id);
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
  const databaseId = process.env.NOTION_NOTES_DB_ID;

  if (!token || !databaseId) {
    return NextResponse.json({ error: "NOTION_TOKEN or NOTION_NOTES_DB_ID not configured" }, { status: 500 });
  }

  const notes = (await req.json()) as NotePayload[];

  if (!Array.isArray(notes) || notes.length === 0) {
    return NextResponse.json({ error: "No notes provided" }, { status: 400 });
  }

  const existing = await queryExisting(token, databaseId);
  const inPayload = new Set(notes.map((n) => (n.title || "Untitled").toLowerCase()));
  let created = 0;
  let updated = 0;
  let deleted = 0;
  const errors: string[] = [];

  for (const note of notes) {
    const properties = buildProperties(note);
    const key = (note.title || "Untitled").toLowerCase();
    const existingPageId = existing.get(key);
    try {
      if (existingPageId) {
        const res = await fetch(`https://api.notion.com/v1/pages/${existingPageId}`, {
          method: "PATCH",
          headers: notionHeaders(token),
          body: JSON.stringify({ properties }),
        });
        if (res.ok) updated++;
        else {
          const err = (await res.json().catch(() => ({}))) as { message?: string };
          errors.push(`Update failed: ${note.title} — ${err.message ?? "unknown"}`);
        }
      } else {
        const res = await fetch("https://api.notion.com/v1/pages", {
          method: "POST",
          headers: notionHeaders(token),
          body: JSON.stringify({ parent: { database_id: databaseId }, properties }),
        });
        if (res.ok) {
          created++;
          const page = (await res.json()) as { id: string };
          existing.set(key, page.id);
        } else {
          const err = (await res.json().catch(() => ({}))) as { message?: string };
          errors.push(`Create failed: ${note.title} — ${err.message ?? "unknown"}`);
        }
      }
    } catch {
      errors.push(`Error syncing: ${note.title}`);
    }
  }

  for (const [title, pageId] of existing) {
    if (!inPayload.has(title)) {
      const ok = await archivePage(token, pageId);
      if (ok) deleted++;
      else errors.push(`Delete failed: ${title}`);
    }
  }

  return NextResponse.json({ created, updated, deleted, errors });
}
